"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Task } from "@/modules/recruitment/domain/tasks";
import { inputStyles } from "@/components/ui/styles";
import { buttonStyles } from "./styles";
import { isCalendarDate } from "@/modules/recruitment/domain/case-events";
import { useTaskMutation, useTaskRead } from "./hooks";
import { TaskMutationFeedback, TaskReadFeedback } from "./common";

type CaseOption = { id: string; title: string; status: string };
function CasePicker({
  userId,
  value,
  title,
  onChange,
  disabled,
  id,
}: {
  userId: string;
  value: string;
  title: string | null;
  onChange: (id: string, title: string | null) => void;
  disabled: boolean;
  id: string;
}) {
  const [page, setPage] = useState(1);
  const read = useTaskRead<{
    cases: CaseOption[];
    hasMore: boolean;
    page: number;
  }>(userId, { caseOptions: true, page });
  const cases = Array.isArray(read.data?.cases) ? read.data.cases : [];
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>
        Powiązanie ze sprawą
      </label>
      <select
        id={id}
        className={`${inputStyles} w-full min-w-0 max-w-full`}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value,
            cases.find((item) => item.id === event.target.value)?.title ?? null,
          )
        }
      >
        <option value="">Zadanie ogólne — bez sprawy</option>
        {value && !cases.some((item) => item.id === value) && (
          <option value={value}>{title ?? "Wybrana sprawa"}</option>
        )}
        {cases.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title} · {item.status}
          </option>
        ))}
      </select>
      <p className="text-[13px] leading-5 text-muted-foreground">
        Możesz wskazać także zakończoną sprawę. Zadanie nie wznowi jej procesu.
      </p>
      <TaskReadFeedback {...read} />
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        aria-label="Strony spraw do powiązania"
      >
        <button
          type="button"
          className={buttonStyles.ghost}
          disabled={disabled || read.loading || page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Poprzednie sprawy
        </button>
        <span>Strona spraw {page}</span>
        <button
          type="button"
          className={buttonStyles.ghost}
          disabled={disabled || read.loading || !read.data?.hasMore}
          onClick={() => setPage((value) => value + 1)}
        >
          Następne sprawy
        </button>
      </div>
    </div>
  );
}
export function TaskForm({
  userId,
  task,
  defaultCase,
  onSaved,
  onCancel,
  onReload,
}: {
  userId: string;
  task?: Task;
  defaultCase?: { id: string; title: string };
  onSaved: (task: Task) => void;
  onCancel: () => void;
  onReload: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueOn, setDueOn] = useState(task?.due_on ?? "");
  const [caseId, setCaseId] = useState(task?.case_id ?? defaultCase?.id ?? "");
  const [caseTitle, setCaseTitle] = useState(
    task?.case_title ?? defaultCase?.title ?? null,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState<"cancel" | "reload" | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const mutation = useTaskMutation(userId, onSaved);
  const dirty =
    title !== (task?.title ?? "") ||
    description !== (task?.description ?? "") ||
    dueOn !== (task?.due_on ?? "") ||
    caseId !== (task?.case_id ?? defaultCase?.id ?? "");
  useEffect(() => {
    titleInput.current?.focus();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.pending || mutation.uncertain || mutation.stale) return;
    const issues: Record<string, string> = {};
    if ([...title.trim()].length < 1 || [...title.trim()].length > 160)
      issues.title =
        "Podaj tytuł od 1 do 160 znaków po usunięciu skrajnych spacji.";
    if ([...description].length > 2000)
      issues.description = "Opis może mieć najwyżej 2000 znaków.";
    if (dueOn && !isCalendarDate(dueOn))
      issues.dueOn =
        "Podaj prawidłowy dzień kalendarzowy albo pozostaw pole puste.";
    setErrors(issues);
    if (Object.keys(issues).length) {
      requestAnimationFrame(() =>
        document.getElementById(`${id}-${Object.keys(issues)[0]}`)?.focus(),
      );
      return;
    }
    const values = {
      title: title.trim(),
      description: description || null,
      dueOn: dueOn || null,
      caseId: caseId || null,
    };
    void mutation.send(
      task
        ? {
            operation: "edit",
            taskId: task.id,
            expectedRevision: task.revision,
            requestId: crypto.randomUUID(),
            ...values,
          }
        : { operation: "create", requestId: crypto.randomUUID(), ...values },
    );
  }
  return (
    <form
      aria-label={task ? "Edycja zadania" : "Nowe zadanie"}
      aria-busy={mutation.pending}
      noValidate
      onSubmit={submit}
      className="min-w-0 space-y-5"
    >
      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          aria-label="Podsumowanie błędów zadania"
          className="space-y-2 rounded-md border border-destructive bg-card p-4 text-sm text-destructive"
        >
          <p className="font-semibold">Sprawdź dane zadania</p>
          <ul className="list-disc space-y-1 pl-5">
            {Object.entries(errors).map(([field, message]) => (
              <li key={field}>
                <a
                  href={`#${id}-${field}`}
                  className="ui-link inline-flex min-h-11 items-center [overflow-wrap:anywhere]"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(`${id}-${field}`)?.focus();
                  }}
                >
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <fieldset
        disabled={mutation.pending || mutation.uncertain || mutation.stale}
        className="min-w-0 space-y-5"
      >
        <legend className="sr-only">Dane zadania</legend>
        <div className="space-y-2">
          <label htmlFor={`${id}-title`} className="block text-sm font-medium">
            Tytuł zadania
          </label>
          <p
            id={`${id}-title-hint`}
            className="text-[13px] text-muted-foreground"
          >
            Od 1 do 160 znaków po usunięciu skrajnych spacji.{" "}
            {Array.from(title.trim()).length}/160
          </p>
          <input
            ref={titleInput}
            id={`${id}-title`}
            className={`${inputStyles} w-full`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={`${id}-title-hint${errors.title ? ` ${id}-title-error` : ""}`}
          />
          {errors.title && (
            <p id={`${id}-title-error`} className="text-sm text-destructive">
              {errors.title}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label
            htmlFor={`${id}-description`}
            className="block text-sm font-medium"
          >
            Opis (opcjonalnie)
          </label>
          <p
            id={`${id}-description-hint`}
            className="text-[13px] text-muted-foreground"
          >
            {Array.from(description).length}/2000 znaków
          </p>
          <textarea
            id={`${id}-description`}
            rows={4}
            className={`${inputStyles} w-full resize-y`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={`${id}-description-hint${errors.description ? ` ${id}-description-error` : ""}`}
          />
          {errors.description && (
            <p
              id={`${id}-description-error`}
              className="text-sm text-destructive"
            >
              {errors.description}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label htmlFor={`${id}-dueOn`} className="block text-sm font-medium">
            Termin (opcjonalnie)
          </label>
          <p
            id={`${id}-day-hint`}
            className="text-[13px] leading-5 text-muted-foreground"
          >
            Dzień kalendarzowy, także przyszły. Bez godziny i przypomnienia.
            Brak terminu jest prawidłowy.
          </p>
          <input
            id={`${id}-dueOn`}
            type="date"
            className={`${inputStyles} max-w-full sm:max-w-64`}
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
            aria-invalid={Boolean(errors.dueOn)}
            aria-describedby={`${id}-day-hint${errors.dueOn ? ` ${id}-day-error` : ""}`}
          />
          {errors.dueOn && (
            <p id={`${id}-day-error`} className="text-sm text-destructive">
              {errors.dueOn}
            </p>
          )}
        </div>
        <CasePicker
          userId={userId}
          id={`${id}-case`}
          value={caseId}
          title={caseTitle}
          disabled={mutation.pending || mutation.uncertain || mutation.stale}
          onChange={(id, title) => {
            setCaseId(id);
            setCaseTitle(title);
          }}
        />
        {!task && (
          <p className="text-sm text-muted-foreground">
            Nowe zadanie otrzyma status „Do zrobienia”.
          </p>
        )}
      </fieldset>
      <TaskMutationFeedback
        mutation={mutation}
        onReload={() => (dirty ? setDiscard("reload") : onReload())}
      />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={mutation.pending || mutation.uncertain || mutation.stale}
          className={buttonStyles.primary}
        >
          {mutation.pending
            ? "Zapisywanie…"
            : task
              ? "Zapisz zmiany"
              : "Zapisz zadanie"}
        </button>
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={mutation.pending || mutation.uncertain}
          onClick={() => (dirty ? setDiscard("cancel") : onCancel())}
        >
          Anuluj edycję
        </button>
      </div>
      {discard && (
        <section
          aria-label="Odrzucenie zmian zadania"
          className="space-y-3 rounded-md border border-warning bg-warning-surface p-4 text-sm"
        >
          <p>
            {discard === "reload"
              ? "Odrzucić niezapisane zmiany i pobrać aktualne dane zadania?"
              : "Odrzucić niezapisane zmiany zadania?"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => setDiscard(null)}
            >
              Wróć do edycji
            </button>
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={discard === "reload" ? onReload : onCancel}
            >
              {discard === "reload"
                ? "Odrzuć zmiany i odśwież dane"
                : "Odrzuć zmiany"}
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
