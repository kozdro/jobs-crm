import {
  recruitmentStatuses,
  uuidPattern,
  type RecruitmentCase,
} from "./recruitment-case";
import type { CaseEvent } from "./case-events";
import type { LifecycleEntry } from "./lifecycle";

export type WorkspaceStatus = RecruitmentCase["status"];
export type WorkspaceQuery = {
  view: "kanban" | "list";
  statuses: WorkspaceStatus[];
  organizationId: string | null;
  contactId: string | null;
  sort: "newest" | "oldest";
  page: number;
  columnPages: Record<WorkspaceStatus, number>;
  closedOpen: boolean;
};
export type WorkspaceOrganization = {
  id: string;
  name: string;
  role: "employer" | "agency";
};
export type WorkspaceCase = RecruitmentCase & {
  organizations: WorkspaceOrganization[];
  organizationsHasMore: boolean;
};
export type WorkspacePage = {
  cases: WorkspaceCase[];
  hasMore: boolean;
  page: number;
};
export type WorkspaceData = {
  query: WorkspaceQuery;
  list: WorkspacePage | null;
  columns: Partial<Record<WorkspaceStatus, WorkspacePage>>;
};
export type WorkspaceTimelineItem =
  | { type: "fact"; fact: CaseEvent }
  | { type: "lifecycle"; entry: LifecycleEntry };
export type WorkspacePreview = {
  case: WorkspaceCase;
  contacts: { id: string; name: string }[];
  history: WorkspaceTimelineItem[];
  hasMoreHistory: boolean;
  organizationsHasMore: boolean;
  contactsHasMore: boolean;
};
export type WorkspaceProfilePage = {
  profiles: { id: string; name: string }[];
  page: number;
  hasMore: boolean;
};
export const workspacePageSize = 25;
export const workspaceColumnKeys = {
  Zapisane: "savedPage",
  "Kontakt rozpoczęty": "contactPage",
  "W rekrutacji": "recruitingPage",
  Zakończone: "closedPage",
} as const;
export function defaultWorkspaceQuery(): WorkspaceQuery {
  return {
    view: "kanban",
    statuses: [...recruitmentStatuses],
    organizationId: null,
    contactId: null,
    sort: "newest",
    page: 1,
    columnPages: {
      Zapisane: 1,
      "Kontakt rozpoczęty": 1,
      "W rekrutacji": 1,
      Zakończone: 1,
    },
    closedOpen: false,
  };
}
/** Bounded valid database offsets; not a product limit on the number of cases. */
export function workspacePage(value: string | null): number {
  if (value === null) return 1;
  if (!/^[1-9][0-9]{0,7}$/.test(value))
    throw new Error("Invalid workspace query");
  const page = Number(value);
  if (page > Math.floor(2_147_483_647 / workspacePageSize))
    throw new Error("Invalid workspace query");
  return page;
}
export function parseWorkspaceQuery(params: URLSearchParams): WorkspaceQuery {
  const q = defaultWorkspaceQuery();
  for (const [key] of params) {
    if (key !== "status" && params.getAll(key).length > 1)
      throw new Error("Invalid workspace query");
  }
  const view = params.get("view");
  if (view !== null && view !== "kanban" && view !== "list")
    throw new Error("Invalid workspace query");
  q.view = view ?? q.view;
  const statuses = params.getAll("status");
  const none = statuses.length === 1 && statuses[0] === "none";
  if (
    (!none &&
      statuses.some(
        (s) => !recruitmentStatuses.includes(s as WorkspaceStatus),
      )) ||
    new Set(statuses).size !== statuses.length
  )
    throw new Error("Invalid workspace query");
  if (statuses.length)
    q.statuses = none
      ? []
      : recruitmentStatuses.filter((s) => statuses.includes(s));
  const sort = params.get("sort");
  if (sort !== null && sort !== "newest" && sort !== "oldest")
    throw new Error("Invalid workspace query");
  q.sort = sort ?? q.sort;
  for (const [key, field] of [
    ["organization", "organizationId"],
    ["contact", "contactId"],
  ] as const) {
    const value = params.get(key);
    if (value !== null && !uuidPattern.test(value))
      throw new Error("Invalid workspace query");
    q[field] = value;
  }
  q.page = workspacePage(params.get("page"));
  for (const status of recruitmentStatuses)
    q.columnPages[status] = workspacePage(
      params.get(workspaceColumnKeys[status]),
    );
  const closed = params.get("closedOpen");
  if (closed !== null && closed !== "0" && closed !== "1")
    throw new Error("Invalid workspace query");
  q.closedOpen = closed === "1";
  return q;
}
export function workspaceSearchParams(q: WorkspaceQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("view", q.view);
  for (const status of q.statuses) params.append("status", status);
  if (!q.statuses.length) params.set("status", "none");
  if (q.organizationId) params.set("organization", q.organizationId);
  if (q.contactId) params.set("contact", q.contactId);
  params.set("sort", q.sort);
  if (q.page !== 1) params.set("page", String(q.page));
  for (const status of recruitmentStatuses)
    if (q.columnPages[status] !== 1)
      params.set(workspaceColumnKeys[status], String(q.columnPages[status]));
  if (q.closedOpen) params.set("closedOpen", "1");
  return params;
}
