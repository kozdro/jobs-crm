import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "./cases";
import { isCalendarDate } from "../domain/case-events";
import {
  storableText,
  unicodeLength,
  uuidPattern,
} from "../domain/recruitment-case";
import {
  parseTaskInput,
  taskStatuses,
  type Task,
  type TaskAudit,
  type TaskCommandInput,
} from "../domain/tasks";
const unavailable = (): never => {
  throw new CaseRepositoryError("unavailable");
};
const isUuid = (v: unknown): v is string =>
  typeof v === "string" && uuidPattern.test(v);
export function readTask(value: unknown): Task {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return unavailable();
  const r = value as Record<string, unknown>;
  if (
    !isUuid(r.id) ||
    typeof r.title !== "string" ||
    !r.title.trim() ||
    unicodeLength(r.title) > 160 ||
    !storableText(r.title) ||
    !(
      r.description === null ||
      (typeof r.description === "string" &&
        unicodeLength(r.description) <= 2000 &&
        storableText(r.description))
    ) ||
    !(
      r.due_on === null ||
      (typeof r.due_on === "string" && isCalendarDate(r.due_on))
    ) ||
    !taskStatuses.includes(r.status as Task["status"]) ||
    !(r.case_id === null || isUuid(r.case_id)) ||
    !(r.case_title === null || typeof r.case_title === "string") ||
    (r.case_id === null
      ? r.case_title !== null
      : typeof r.case_title !== "string" || !r.case_title.trim()) ||
    !Number.isSafeInteger(r.revision) ||
    (r.revision as number) < 0 ||
    (r.revision as number) >= 2147483647 ||
    typeof r.created_at !== "string" ||
    !Number.isFinite(Date.parse(r.created_at)) ||
    typeof r.updated_at !== "string" ||
    !Number.isFinite(Date.parse(r.updated_at))
  )
    return unavailable();
  return {
    id: r.id,
    title: r.title,
    description: r.description as string | null,
    due_on: r.due_on as string | null,
    status: r.status as Task["status"],
    case_id: r.case_id as string | null,
    case_title: r.case_title as string | null,
    revision: r.revision as number,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
const columns =
  "id,title,description,due_on,status,case_id,revision,created_at,updated_at,case_title";
function offset(page: number) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > Math.floor(2147483647 / 25)
  )
    throw new CaseRepositoryError("invalid");
  return (page - 1) * 25;
}
export async function listTasks(
  client: SupabaseClient,
  options: { caseId?: string; openOnly?: boolean; page?: number } = {},
) {
  const page = options.page ?? 1;
  const start = offset(page);
  if (options.caseId !== undefined && !isUuid(options.caseId))
    throw new CaseRepositoryError("invalid");
  let query = client.from("recruitment_task_current").select(columns);
  if (options.caseId) query = query.eq("case_id", options.caseId.toLowerCase());
  if (options.openOnly) query = query.eq("status", "Do zrobienia");
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + 25);
  if (error || !Array.isArray(data)) return unavailable();
  const tasks = data.slice(0, 25).map(readTask);
  if (
    tasks.some(
      (t) =>
        (options.caseId && t.case_id !== options.caseId.toLowerCase()) ||
        (options.openOnly && t.status !== "Do zrobienia"),
    )
  )
    return unavailable();
  return { tasks, hasMore: data.length > 25, page };
}
export async function getTask(client: SupabaseClient, taskId: string) {
  if (!isUuid(taskId)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client
    .from("recruitment_task_current")
    .select(columns)
    .eq("id", taskId)
    .maybeSingle();
  if (error) return unavailable();
  const task = data ? readTask(data) : null;
  if (task && task.id !== taskId.toLowerCase()) return unavailable();
  return task;
}
function rpcError(code?: string): never {
  throw new CaseRepositoryError(
    code === "PT412"
      ? "stale"
      : code === "PT409"
        ? "conflict"
        : code === "22023" || code === "PT422"
          ? "invalid"
          : "unavailable",
  );
}
export async function executeTaskCommand(
  client: SupabaseClient,
  input: TaskCommandInput,
): Promise<{ kind: "created" | "replayed"; task: Task }> {
  const { requestId, ...payload } = input;
  const parsed = parseTaskInput(payload);
  if (!isUuid(requestId) || !parsed.success)
    throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc("execute_recruitment_task_command", {
    p_request_id: requestId,
    p_payload: parsed.data,
  });
  if (error) rpcError(error.code);
  if (data?.kind !== "created" && data?.kind !== "replayed")
    return unavailable();
  const task = readTask(data.task);
  if (
    parsed.data.operation === "create"
      ? task.revision !== 0 || task.status !== "Do zrobienia"
      : task.revision !== parsed.data.expectedRevision + 1
  )
    return unavailable();
  if (parsed.data.operation !== "create" && task.id !== parsed.data.taskId)
    return unavailable();
  if (
    parsed.data.operation === "set-status"
      ? task.status !== parsed.data.status
      : task.title !== parsed.data.title ||
        task.description !== parsed.data.description ||
        task.due_on !== parsed.data.dueOn ||
        task.case_id !== parsed.data.caseId
  )
    return unavailable();
  return { kind: data.kind, task };
}
export async function getTaskByRequestId(
  client: SupabaseClient,
  requestId: string,
) {
  if (!isUuid(requestId)) throw new CaseRepositoryError("invalid");
  const { data, error } = await client
    .from("recruitment_task_command")
    .select("request_id,after_values")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) return unavailable();
  if (data && data.request_id !== requestId.toLowerCase()) return unavailable();
  return { task: data ? readTask(data.after_values) : null };
}
export async function listTaskAudit(
  client: SupabaseClient,
  taskId: string,
): Promise<TaskAudit[]> {
  if (!isUuid(taskId)) throw new CaseRepositoryError("invalid");
  taskId = taskId.toLowerCase();
  const entries: TaskAudit[] = [];
  for (let start = 0; ; start += 100) {
    const { data, error } = await client
      .from("recruitment_task_command")
      .select(
        "id,request_id,task_id,operation,before_values,after_values,recorded_at,closure_id",
      )
      .eq("task_id", taskId)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + 99);
    if (error || !Array.isArray(data)) return unavailable();
    for (const r of data) {
      if (
        !isUuid(r.id) ||
        !isUuid(r.request_id) ||
        r.task_id !== taskId ||
        typeof r.operation !== "string" ||
        typeof r.recorded_at !== "string" ||
        !Number.isFinite(Date.parse(r.recorded_at)) ||
        !(r.closure_id === null || isUuid(r.closure_id))
      )
        return unavailable();
      const before =
        r.before_values === null ? null : readTask(r.before_values);
      const after = readTask(r.after_values);
      if (after.id !== taskId || (before && before.id !== taskId))
        return unavailable();
      entries.push({
        id: r.id,
        request_id: r.request_id,
        task_id: taskId,
        operation: r.operation,
        before,
        after,
        recorded_at: r.recorded_at,
        closure_id: r.closure_id,
      });
    }
    if (data.length < 100) return entries;
  }
}
