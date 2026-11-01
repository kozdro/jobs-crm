"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskAudit } from "@/modules/recruitment/domain/tasks";
import { buttonStyles } from "@/components/ui/styles";
import { formatTaskDay, isTask } from "./client";
import { useTaskMutation, useTaskRead } from "./hooks";
import { TaskMutationFeedback, TaskReadFeedback } from "./common";
import { TaskForm } from "./task-form";

export function TaskValues({ task }: { task: Task }) {
  return (
    <dl className="space-y-2 text-sm leading-6 [overflow-wrap:anywhere]">
      <div>
        <dt className="inline text-muted-foreground">Tytuł: </dt>
        <dd className="inline">{task.title}</dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Opis: </dt>
        <dd className="inline whitespace-pre-wrap">
          {task.description ?? "Nie podano"}
        </dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Status: </dt>
        <dd className="inline">{task.status}</dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Termin: </dt>
        <dd className="inline">
          {task.due_on ? formatTaskDay(task.due_on) : "Bez terminu"}
        </dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Powiązanie: </dt>
        <dd className="inline">
          {task.case_id ? (
            <Link href={`/recruitments/${task.case_id}`} className="ui-link">
              {task.case_title ?? "Otwórz sprawę"}
            </Link>
          ) : (
            "Zadanie ogólne"
          )}
        </dd>
      </div>
    </dl>
  );
}
function TaskAuditPanel({
  userId,
  taskId,
}: {
  userId: string;
  taskId: string;
}) {
  const read = useTaskRead<{ entries: TaskAudit[] }>(userId, {
    taskId,
    audit: true,
  });
  const valid =
    read.data &&
    Array.isArray(read.data.entries) &&
    read.data.entries.every(
      (item) =>
        isTask(item.after) && (item.before === null || isTask(item.before)),
    );
  const operations: Record<string, string> = {
    create: "Utworzenie zadania",
    edit: "Edycja zadania",
    "set-status": "Jawna zmiana statusu",
    "closure-cancel": "Anulowanie przy zakończeniu sprawy",
    "closure-keep": "Zachowanie przy zakończeniu sprawy",
    "closure-detach": "Odłączenie przy zakończeniu sprawy",
    cancel: "Anulowanie przy zakończeniu sprawy",
    keep: "Zachowanie przy zakończeniu sprawy",
    detach: "Odłączenie przy zakończeniu sprawy",
  };
  return (
    <section
      aria-label="Audyt zadania"
      className="mt-4 space-y-3 rounded-md border border-border bg-background p-4"
    >
      <h4 className="font-semibold">Audyt zadania</h4>
      <TaskReadFeedback
        loading={read.loading}
        error={read.error || Boolean(read.data && !valid)}
        reload={read.reload}
      />
      {valid &&
        read.data &&
        (read.data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak wpisów audytu.</p>
        ) : (
          <ol className="space-y-5">
            {read.data.entries.map((entry) => (
              <li
                key={entry.id}
                className="space-y-3 border-t border-border pt-4"
              >
                <p className="text-sm font-semibold">
                  {operations[entry.operation] ?? "Zmiana zadania"}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Zarejestrowano:{" "}
                  <time dateTime={entry.recorded_at}>
                    {new Date(entry.recorded_at).toLocaleString("pl-PL")}
                  </time>
                </p>
                {entry.closure_id && (
                  <p className="text-sm">
                    Rozstrzygnięcie zapisane razem z zakończeniem sprawy.
                  </p>
                )}
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <div className="min-w-0">
                    <h5 className="mb-2 text-sm font-semibold">Przed zmianą</h5>
                    {entry.before ? (
                      <TaskValues task={entry.before} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Zadanie jeszcze nie istniało.
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h5 className="mb-2 text-sm font-semibold">Po zmianie</h5>
                    <TaskValues task={entry.after} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
function TaskRow({
  userId,
  task,
  onSaved,
  onEditingChange,
}: {
  userId: string;
  task: Task;
  onSaved: () => void;
  onEditingChange: (taskId: string, editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [audit, setAudit] = useState(false);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const mutation = useTaskMutation(userId, () => {
    setEditing(false);
    onEditingChange(task.id, false);
    onSaved();
  });
  const disabled = mutation.pending || mutation.uncertain || mutation.stale;
  const statusChange = (status: Task["status"]) =>
    void mutation.send({
      operation: "set-status",
      taskId: task.id,
      expectedRevision: task.revision,
      status,
      requestId: crypto.randomUUID(),
    });
  return (
    <article
      aria-label={task.title}
      className="min-w-0 py-5 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-base font-semibold">{task.title}</h3>
        <span className="rounded-sm bg-secondary px-2 py-1 text-[13px] font-medium">
          {task.status}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {task.due_on ? `Termin: ${formatTaskDay(task.due_on)}` : "Bez terminu"}
      </p>
      {task.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {task.description}
        </p>
      )}
      <p className="mt-2 text-sm">
        {task.case_id ? (
          <Link
            className="ui-link inline-flex min-h-11 items-center"
            href={`/recruitments/${task.case_id}`}
          >
            {task.case_title ?? "Otwórz sprawę"}
          </Link>
        ) : (
          <span className="text-muted-foreground">Zadanie ogólne</span>
        )}
      </p>
      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            ref={editTrigger}
            type="button"
            className={buttonStyles.secondary}
            disabled={disabled}
            aria-expanded={editing}
            onClick={() => {
              setEditing(true);
              onEditingChange(task.id, true);
            }}
          >
            Edytuj zadanie
          </button>
          {task.status === "Do zrobienia" ? (
            <>
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={disabled}
                onClick={() => statusChange("Wykonane")}
              >
                Oznacz jako wykonane
              </button>
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={disabled}
                onClick={() => statusChange("Anulowane")}
              >
                Anuluj zadanie
              </button>
            </>
          ) : (
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={disabled}
              onClick={() => statusChange("Do zrobienia")}
            >
              Przywróć do zrobienia
            </button>
          )}
          <button
            type="button"
            className={buttonStyles.ghost}
            aria-expanded={audit}
            onClick={() => setAudit((value) => !value)}
          >
            {audit ? "Ukryj audyt zadania" : "Pokaż audyt zadania"}
          </button>
        </div>
      )}
      <TaskMutationFeedback mutation={mutation} onReload={onSaved} />
      {editing && (
        <section className="mt-4 rounded-md border border-border bg-background p-4 sm:p-5">
          <h4 className="mb-4 font-semibold">Edycja zadania</h4>
          <TaskForm
            key={`${task.id}:${task.revision}`}
            userId={userId}
            task={task}
            onSaved={() => {
              setEditing(false);
              onEditingChange(task.id, false);
              onSaved();
            }}
            onCancel={() => {
              setEditing(false);
              onEditingChange(task.id, false);
              requestAnimationFrame(() => editTrigger.current?.focus());
            }}
            onReload={() => {
              setEditing(false);
              onEditingChange(task.id, false);
              onSaved();
            }}
          />
        </section>
      )}
      {audit && (
        <TaskAuditPanel
          key={`${task.id}:${task.revision}`}
          userId={userId}
          taskId={task.id}
        />
      )}
    </article>
  );
}
export function TasksPanel({
  userId,
  caseId,
  caseTitle,
  compact = false,
}: {
  userId: string;
  caseId?: string;
  caseTitle?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const read = useTaskRead<{ tasks: Task[]; hasMore: boolean; page: number }>(
    userId,
    {
      ...(caseId ? { caseId } : {}),
      ...(compact ? { openOnly: true } : {}),
      page,
    },
    revision,
  );
  const valid =
    read.data &&
    Array.isArray(read.data.tasks) &&
    read.data.tasks.every(isTask);
  const label = caseId
    ? "Zadania sprawy"
    : compact
      ? "Otwarte zadania"
      : "Lista zadań";
  function reload() {
    setRevision((value) => value + 1);
    router.refresh();
  }
  function complete() {
    setAdding(false);
    setSaved(true);
    reload();
    requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <section
      className="ui-panel min-w-0 space-y-4 p-5 sm:p-6"
      aria-label={label}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {label}
        </h2>
        <button
          ref={trigger}
          type="button"
          className={buttonStyles.primary}
          aria-expanded={adding}
          onClick={() => {
            setSaved(false);
            setAdding(true);
          }}
        >
          Dodaj zadanie
        </button>
      </div>
      {compact && (
        <p className="text-sm leading-6 text-muted-foreground">
          Zadania ze statusem „Do zrobienia”. Brak terminu nie oznacza
          zaległości.
        </p>
      )}
      {adding && (
        <section className="min-w-0 rounded-md border border-border bg-background p-4 sm:p-5">
          <h3 className="mb-4 font-semibold">Nowe zadanie</h3>
          <TaskForm
            userId={userId}
            defaultCase={
              caseId
                ? { id: caseId, title: caseTitle ?? "Wybrana sprawa" }
                : undefined
            }
            onSaved={complete}
            onCancel={() => {
              setAdding(false);
              requestAnimationFrame(() => trigger.current?.focus());
            }}
            onReload={reload}
          />
        </section>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Zapisano zadanie.
        </p>
      )}
      <TaskReadFeedback
        loading={read.loading}
        error={read.error || Boolean(read.data && !valid)}
        reload={read.reload}
      />
      {valid && read.data && (
        <>
          {read.data.tasks.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              {page > 1
                ? "Brak zadań na tej stronie."
                : compact
                  ? "Nie masz otwartych zadań."
                  : "Nie ma jeszcze zadań w tym widoku."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {read.data.tasks.map((task) => (
                <TaskRow
                  key={`${userId}:${task.id}:${task.revision}`}
                  userId={userId}
                  task={task}
                  onSaved={complete}
                  onEditingChange={(id, editing) =>
                    setEditingIds((current) =>
                      editing
                        ? [...new Set([...current, id])]
                        : current.filter((item) => item !== id),
                    )
                  }
                />
              ))}
            </div>
          )}
          <nav
            aria-label={`Strony: ${label}`}
            className="flex flex-wrap items-center gap-3 text-sm"
          >
            <button
              type="button"
              disabled={page === 1 || read.loading || editingIds.length > 0}
              className={buttonStyles.secondary}
              onClick={() => {
                setPage((value) => value - 1);
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Poprzednia strona
            </button>
            <span>Strona {page}</span>
            <button
              type="button"
              disabled={
                !read.data.hasMore || read.loading || editingIds.length > 0
              }
              className={buttonStyles.secondary}
              onClick={() => {
                setPage((value) => value + 1);
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Następna strona
            </button>
          </nav>
        </>
      )}
      {compact && (
        <Link
          href="/tasks"
          className="ui-link inline-flex min-h-11 items-center text-sm font-semibold"
        >
          Wszystkie zadania
        </Link>
      )}
    </section>
  );
}
