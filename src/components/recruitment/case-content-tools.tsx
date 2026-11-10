"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { useUnsavedWarning } from "@/components/reminders/use-unsaved-warning";
import { warsawToday } from "@/modules/recruitment/domain/case-events";
import { useContentRecovery } from "./content-recovery";
import { canDiscardContentDraft } from "./content-intent";
import {
  contentChangedEvent,
  isCurrentContentProjection,
  matchesContentChanged,
} from "./content-events";
import {
  canonicalCaseLink,
  linkFormError,
  noteFormErrors,
} from "./content-form-validation";
import { findActiveLinkPage } from "./content-link-navigation";
import {
  readConflictSnapshot,
  sameConflictSnapshot,
  type ConflictSnapshot,
} from "./content-conflict";
import {
  noteTargetFailure,
  noteTargetNextStep,
  noteTargetResult,
} from "./content-target";

export type Note = {
  id: string;
  case_id: string;
  body: string;
  date_kind: "ordinary" | "historical";
  occurred_on: string | null;
  voided: boolean;
  revision: number;
  created_at: string;
};
type CaseLink = {
  id: string;
  case_id: string;
  source: "legacy" | "additional";
  url: string;
  role: string;
  position: number;
  voided: boolean;
  revision: number;
  created_at: string;
};
type Audit = {
  id: string;
  case_id: string;
  target_id: string;
  before_values: unknown;
  after_values: unknown;
  recorded_at: string;
};
const roles = [
  ["primary_offer", "Główne ogłoszenie"],
  ["additional_offer", "Dodatkowe ogłoszenie"],
  ["application_form", "Formularz aplikacji"],
  ["company_site", "Strona firmy"],
  ["profile", "Profil"],
  ["correspondence", "Korespondencja"],
  ["other", "Inne"],
  ["unspecified", "Nieokreślona"],
] as const;
async function readContent(owner: string, query: Record<string, string>) {
  const params = new URLSearchParams({ expectedUserId: owner, ...query });
  const response = await fetch(`/recruitments/content?${params}`, {
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Object.assign(new Error("read failed"), { status: response.status });
  return (await response.json()) as Record<string, unknown>;
}
function useContentCommand(
  owner: string,
  caseId: string,
  changed: () => void,
  discarded?: () => void,
) {
  return useContentRecovery(owner, caseId, changed, discarded);
}
function Feedback() {
  return null;
}
function AuditHistory({
  owner,
  caseId,
  targetId,
}: {
  owner: string;
  caseId: string;
  targetId: string;
}) {
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  function load(next: number) {
    void readContent(owner, {
      caseId,
      auditTarget: targetId,
      auditPage: String(next),
    })
      .then((data) => {
        setAudit(data.audit as Audit[]);
        setHasMore(data.hasMoreAudit === true);
        setPage(next);
        setError(false);
      })
      .catch(() => setError(true));
  }
  return (
    <details
      className="mt-2"
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        load(1);
      }}
    >
      <summary className="ui-link cursor-pointer py-2 text-sm">
        Historia zmian
      </summary>
      {error && <p role="alert">Nie udało się pobrać historii zmian.</p>}
      {audit && (
        <>
          <ol className="space-y-2">
            {audit.map((row) => (
              <li key={row.id} className="break-words text-sm">
                <p>{new Date(row.recorded_at).toLocaleString("pl-PL")}</p>
                <p>Przed zmianą</p>
                <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {row.before_values == null
                    ? "Brak"
                    : JSON.stringify(row.before_values, null, 2)}
                </pre>
                <p>Po zmianie</p>
                <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {row.after_values == null
                    ? "Brak"
                    : JSON.stringify(row.after_values, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
          <nav
            aria-label="Strony historii zmian"
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            <button
              type="button"
              className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
              disabled={page <= 1}
              onClick={() => load(page - 1)}
            >
              Poprzednia
            </button>
            <span>Strona {page}</span>
            <button
              type="button"
              className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
              disabled={!hasMore}
              onClick={() => load(page + 1)}
            >
              Następna
            </button>
          </nav>
        </>
      )}
    </details>
  );
}
function ConflictReview({
  owner,
  caseId,
  targetId,
  source,
  onAccept,
}: {
  owner: string;
  caseId: string;
  targetId: string;
  source?: "legacy" | "additional";
  onAccept: (snapshot: ConflictSnapshot) => void;
}) {
  const command = useContentRecovery(owner, caseId, () => {});
  const conflict = command.conflict;
  const [preview, setPreview] = useState<ConflictSnapshot | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "changed" | "missing" | "error"
  >("idle");
  if (!conflict || conflict.id !== targetId || conflict.source !== source)
    return null;
  const currentConflict = conflict;
  async function readSnapshot(): Promise<
    ConflictSnapshot | "missing" | "error"
  > {
    try {
      const isNote = currentConflict.operation.endsWith("note");
      const data = await readContent(
        owner,
        isNote
          ? { caseId, noteId: targetId }
          : { caseId, linkId: targetId, linkSource: source ?? "" },
      );
      const row = isNote ? data.targetNote : data.targetLink;
      if (row === null) return "missing";
      const snapshot = readConflictSnapshot(row, currentConflict, caseId);
      if (!snapshot) return "error";
      return snapshot.voided ? "missing" : snapshot;
    } catch (error) {
      return error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 404
        ? "missing"
        : "error";
    }
  }
  async function load(accept: boolean) {
    setStatus("loading");
    const current = await readSnapshot();
    if (current === "missing" || current === "error") {
      setStatus(current);
      return;
    }
    if (accept && preview && sameConflictSnapshot(preview, current)) {
      if (!command.clearConflict(currentConflict.requestId)) {
        setStatus("error");
        return;
      }
      onAccept(current);
      return;
    }
    setPreview(current);
    setStatus(accept ? "changed" : "ready");
  }
  return (
    <section
      className="mt-3 space-y-2 rounded-md border border-border p-3"
      aria-label="Konflikt wersji"
    >
      <p role="alert">
        Dane zmieniły się od rozpoczęcia edycji. Twój szkic pozostał bez zmian.
      </p>
      <button
        type="button"
        className={buttonStyles.secondary}
        disabled={status === "loading"}
        onClick={() => void load(false)}
      >
        Pobierz aktualną wersję
      </button>
      {status === "loading" && (
        <p role="status">Pobieranie aktualnej wersji…</p>
      )}
      {status === "error" && (
        <p role="alert">Nie udało się pobrać aktualnej wersji.</p>
      )}
      {status === "missing" && (
        <p role="alert">
          Rekord jest niedostępny lub został unieważniony. Zachowaj lub skopiuj
          szkic.
        </p>
      )}
      {status === "changed" && (
        <p role="alert">
          Wersja ponownie się zmieniła. Sprawdź nowe dane przed potwierdzeniem.
        </p>
      )}
      {preview && (status === "ready" || status === "changed") && (
        <div className="space-y-2 text-sm [overflow-wrap:anywhere]">
          <p className="font-semibold">
            Aktualna wersja, rewizja {preview.revision}
          </p>
          {preview.body !== undefined ? (
            <>
              <p className="whitespace-pre-wrap">{preview.body}</p>
              <p>
                {preview.date_kind === "ordinary"
                  ? "Data utworzenia"
                  : preview.occurred_on
                    ? `Data zdarzenia: ${preview.occurred_on}`
                    : "Data zdarzenia nieznana"}
              </p>
            </>
          ) : (
            <>
              <p>{preview.url}</p>
              <p>
                {roles.find(([role]) => role === preview.role)?.[1] ??
                  "Nieokreślona"}{" "}
                · Pozycja {preview.position}
              </p>
            </>
          )}
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => void load(true)}
          >
            Użyj aktualnej wersji jako podstawy
          </button>
        </div>
      )}
    </section>
  );
}

export function NoteEditor({
  owner,
  caseId,
  note,
  onCancel,
}: {
  owner: string;
  caseId: string;
  note?: Note;
  onCancel: () => void;
}) {
  const router = useRouter();
  const changed = useCallback(() => {
    router.refresh();
    onCancel();
  }, [router, onCancel]);
  const command = useContentCommand(owner, caseId, changed, onCancel);
  const [base, setBase] = useState(note);
  const [body, setBody] = useState(base?.body ?? "");
  const [dateChoice, setDateChoice] = useState(
    base?.date_kind === "historical"
      ? base.occurred_on
        ? "known"
        : "unknown"
      : "ordinary",
  );
  const [occurredOn, setOccurredOn] = useState(base?.occurred_on ?? "");
  const [errors, setErrors] = useState<{ body?: string; date?: string }>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const dirty =
    body !== (base?.body ?? "") ||
    dateChoice !==
      (base?.date_kind === "historical"
        ? base.occurred_on
          ? "known"
          : "unknown"
        : "ordinary") ||
    occurredOn !== (base?.occurred_on ?? "");
  useUnsavedWarning(dirty || command.unknown || command.busy);
  const formId = useId();
  function cancel() {
    if (
      (dirty || command.unknown) &&
      !window.confirm("Odrzucić niezapisane zmiany?")
    )
      return;
    if (command.conflict && base?.id === command.conflict.id) {
      command.clearConflict(command.conflict.requestId, true);
      return;
    }
    if (!command.unknown && !command.busy) onCancel();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending || command.recovery) return;
    const validation = noteFormErrors(body, dateChoice, occurredOn);
    if (validation.body || validation.date) {
      setErrors(validation);
      (validation.body ? bodyRef : dateRef).current?.focus();
      return;
    }
    setErrors({});
    void command.execute({
      requestId: crypto.randomUUID(),
      payload: {
        operation: base ? "correct-note" : "create-note",
        caseId,
        ...(base ? { id: base.id, expectedRevision: base.revision } : {}),
        body: body.trim(),
        dateKind: dateChoice === "ordinary" ? "ordinary" : "historical",
        occurredOn: dateChoice === "known" ? occurredOn : null,
      },
    });
  }
  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-md border border-border p-4"
    >
      <label htmlFor={`${formId}-body`} className="block font-medium">
        Treść notatki
      </label>
      <textarea
        id={`${formId}-body`}
        ref={bodyRef}
        autoFocus
        className={`${inputStyles} min-h-32 w-full`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={command.busy || command.unknown}
        aria-invalid={Boolean(errors.body)}
        aria-describedby={`${formId}-count${errors.body ? ` ${formId}-body-error` : ""}`}
      />
      <p id={`${formId}-count`} className="text-sm">
        {Array.from(body.trim()).length}/10000 znaków
      </p>
      {errors.body && (
        <p
          id={`${formId}-body-error`}
          role="alert"
          className="text-sm text-destructive"
        >
          {errors.body}
        </p>
      )}
      <label htmlFor={`${formId}-date`} className="block font-medium">
        Data notatki
      </label>
      <select
        id={`${formId}-date`}
        className={inputStyles}
        value={dateChoice}
        disabled={command.busy || command.unknown}
        onChange={(e) => setDateChoice(e.target.value)}
      >
        <option value="ordinary">Data utworzenia</option>
        <option value="known">Znana data zdarzenia</option>
        <option value="unknown">Data zdarzenia nieznana</option>
      </select>
      {dateChoice === "known" && (
        <label className="block">
          Data zdarzenia
          <input
            id={`${formId}-occurred`}
            ref={dateRef}
            aria-label="Data zdarzenia"
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? `${formId}-date-error` : undefined}
            type="date"
            max={warsawToday(new Date())}
            className={inputStyles}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            disabled={command.busy || command.unknown}
          />
          {errors.date && (
            <span
              id={`${formId}-date-error`}
              role="alert"
              className="block text-sm text-destructive"
            >
              {errors.date}
            </span>
          )}
        </label>
      )}
      {base && command.conflict?.id === base.id && (
        <ConflictReview
          key={command.conflict.requestId}
          owner={owner}
          caseId={caseId}
          targetId={base.id}
          onAccept={(snapshot) => setBase(snapshot as unknown as Note)}
        />
      )}
      <Feedback />
      <div className="flex gap-2">
        <button
          className={buttonStyles.primary}
          type="submit"
          disabled={command.busy || command.unknown || command.recovery}
        >
          Zapisz notatkę
        </button>
        <button
          className={buttonStyles.secondary}
          type="button"
          onClick={cancel}
          disabled={command.busy || command.unknown}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
export function NoteEntry({
  owner,
  note,
  editing,
  blocked,
  onEdit,
  onClose,
}: {
  owner: string;
  note: Note;
  editing: boolean;
  blocked: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState<Note | null>(null);
  const current =
    accepted && accepted.revision > note.revision ? accepted : note;
  const changed = useCallback(() => router.refresh(), [router]);
  const command = useContentCommand(owner, current.case_id, changed);
  const [expanded, setExpanded] = useState(false);
  const longBody = Array.from(current.body).length > 400;
  const displayed =
    longBody && !expanded
      ? `${Array.from(current.body).slice(0, 400).join("")}…`
      : current.body;
  return (
    <li
      id={`note-${current.id}`}
      tabIndex={-1}
      className="scroll-mt-6 py-4 outline-none"
    >
      <p className="font-semibold">
        {current.voided ? "Unieważniona notatka" : "Notatka"}
      </p>
      {current.revision > 0 && !current.voided && (
        <p className="text-sm">Skorygowano</p>
      )}
      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
        {displayed}
      </p>
      {longBody && (
        <button
          type="button"
          className={buttonStyles.ghost}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Zwiń notatkę" : "Rozwiń notatkę"}
        </button>
      )}
      <p className="text-sm text-muted-foreground">
        {current.date_kind === "historical"
          ? current.occurred_on
            ? `Data zdarzenia: ${current.occurred_on}`
            : "Data zdarzenia nieznana"
          : `Data utworzenia: ${new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(current.created_at))}`}
      </p>
      {current.date_kind === "historical" &&
        current.occurred_on &&
        current.occurred_on < warsawToday(new Date(current.created_at)) && (
          <p className="text-sm text-muted-foreground">
            Dodano do CRM później.
          </p>
        )}
      <details>
        <summary className="ui-link cursor-pointer py-2 text-sm">
          Szczegóły notatki
        </summary>
        <p className="text-sm">
          Dodano do CRM:{" "}
          <time dateTime={current.created_at}>
            {new Intl.DateTimeFormat("pl-PL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Warsaw",
            }).format(new Date(current.created_at))}
          </time>
        </p>
      </details>
      {!current.voided && !editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonStyles.ghost}
            id={`edit-note-${current.id}`}
            disabled={blocked}
            onClick={onEdit}
          >
            Popraw notatkę
          </button>
          <button
            type="button"
            className={buttonStyles.ghost}
            disabled={
              blocked || command.busy || command.unknown || command.recovery
            }
            onClick={() => {
              if (
                window.confirm(
                  "Unieważnić tę notatkę? Pozostanie widoczna w historii.",
                )
              )
                void command.execute({
                  requestId: crypto.randomUUID(),
                  payload: {
                    operation: "void-note",
                    caseId: current.case_id,
                    id: current.id,
                    expectedRevision: current.revision,
                  },
                });
            }}
          >
            Unieważnij notatkę
          </button>
        </div>
      )}
      {editing && (
        <NoteEditor
          owner={owner}
          caseId={current.case_id}
          note={current}
          onCancel={() => {
            onClose();
            requestAnimationFrame(() =>
              document.getElementById(`edit-note-${current.id}`)?.focus(),
            );
          }}
        />
      )}
      {!editing &&
        command.conflict?.operation.endsWith("note") &&
        command.conflict.id === current.id && (
          <ConflictReview
            key={command.conflict.requestId}
            owner={owner}
            caseId={current.case_id}
            targetId={current.id}
            onAccept={(snapshot) => {
              setAccepted(snapshot as unknown as Note);
              router.refresh();
            }}
          />
        )}
      <Feedback />
      <AuditHistory
        owner={owner}
        caseId={current.case_id}
        targetId={current.id}
      />
    </li>
  );
}

function LinkEditor({
  owner,
  caseId,
  existing,
  onClose,
  onChanged,
  onDirtyChange,
}: {
  owner: string;
  caseId: string;
  existing?: CaseLink;
  onClose: () => void;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const done = useCallback(() => {
    onChanged();
    onClose();
  }, [onChanged, onClose]);
  const command = useContentCommand(owner, caseId, done, onClose);
  const [base, setBase] = useState(existing);
  const [url, setUrl] = useState(base?.url ?? "");
  const [role, setRole] = useState(base?.role ?? "unspecified");
  const [error, setError] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const dirty =
    url !== (base?.url ?? "") || role !== (base?.role ?? "unspecified");
  useUnsavedWarning(dirty || command.unknown || command.busy);
  const formId = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending || command.recovery) return;
    const validation = linkFormError(url);
    if (validation) {
      setError(validation);
      urlRef.current?.focus();
      return;
    }
    const canonicalUrl = canonicalCaseLink(url);
    if (canonicalUrl === null) return;
    setError("");
    void command.execute({
      requestId: crypto.randomUUID(),
      payload: {
        operation: base ? "correct-link" : "add-link",
        caseId,
        ...(base
          ? {
              id: base.id,
              source: base.source,
              expectedRevision: base.revision,
            }
          : {}),
        url: canonicalUrl,
        role,
        ...(base ? { position: base.position } : {}),
      },
    });
  }
  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-md border border-border p-4"
    >
      <label htmlFor={`${formId}-url`} className="block font-medium">
        Adres URL
      </label>
      <input
        id={`${formId}-url`}
        ref={urlRef}
        type="url"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${formId}-url-error` : undefined}
        className={`${inputStyles} w-full`}
        value={url}
        disabled={command.busy || command.unknown}
        onChange={(e) => {
          const value = e.target.value;
          setUrl(value);
          onDirtyChange(
            value !== (base?.url ?? "") ||
              role !== (base?.role ?? "unspecified"),
          );
        }}
      />
      {error && (
        <p
          id={`${formId}-url-error`}
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <label htmlFor={`${formId}-role`} className="block font-medium">
        Rola linku
      </label>
      <select
        id={`${formId}-role`}
        className={inputStyles}
        value={role}
        disabled={command.busy || command.unknown}
        onChange={(e) => {
          const value = e.target.value;
          setRole(value);
          onDirtyChange(
            url !== (base?.url ?? "") ||
              value !== (base?.role ?? "unspecified"),
          );
        }}
      >
        {roles.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {base &&
        command.conflict?.id === base.id &&
        command.conflict.source === base.source && (
          <ConflictReview
            key={command.conflict.requestId}
            owner={owner}
            caseId={caseId}
            targetId={base.id}
            source={base.source}
            onAccept={(snapshot) => {
              const next = snapshot as unknown as CaseLink;
              setBase(next);
              onDirtyChange(url !== next.url || role !== next.role);
            }}
          />
        )}
      <Feedback />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={command.busy || command.unknown || command.recovery}
          className={buttonStyles.primary}
        >
          Zapisz link
        </button>
        <button
          type="button"
          disabled={command.busy || command.unknown}
          className={buttonStyles.secondary}
          onClick={() => {
            if (!dirty || window.confirm("Odrzucić niezapisane zmiany?")) {
              if (
                command.conflict &&
                base?.id === command.conflict.id &&
                base.source === command.conflict.source
              ) {
                command.clearConflict(command.conflict.requestId, true);
                return;
              }
              onClose();
            }
          }}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
export function retainEditingLink<
  T extends { id: string; source: string; voided: boolean },
>(rows: T[], editing: T | "new" | null): { rows: T[]; missing: boolean } {
  const active = rows.filter((row) => !row.voided);
  const missing =
    editing !== null &&
    editing !== "new" &&
    !active.some(
      (row) => row.id === editing.id && row.source === editing.source,
    );
  return { rows: missing ? [...active, editing] : active, missing };
}
export function CaseLinks({
  owner,
  caseId,
  targetId,
  targetSource,
}: {
  owner: string;
  caseId: string;
  targetId?: string;
  targetSource?: string;
}) {
  const [links, setLinks] = useState<CaseLink[] | null>(null);
  const [targetLink, setTargetLink] = useState<CaseLink | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<CaseLink | "new" | null>(null);
  const [linkDirty, setLinkDirty] = useState(false);
  const [moving, setMoving] = useState(false);
  const [version, setVersion] = useState(0);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const readScope = JSON.stringify([
    owner,
    caseId,
    page,
    version,
    targetId ?? null,
    targetSource ?? null,
  ]);
  const fresh = isCurrentContentProjection(loadedScope, readScope, error);
  const [moveMessage, setMoveMessage] = useState("");
  const movedTarget = useRef<{ id: string; source: string } | null>(null);
  const focusAfterMove = useRef<{
    id: string;
    source: string;
    page: number;
  } | null>(null);
  const lastFocusedTarget = useRef<string | null>(null);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const command = useContentCommand(owner, caseId, changed);
  const moveDone = useCallback(() => {
    const target = movedTarget.current;
    movedTarget.current = null;
    if (!target) return;
    void (async () => {
      const targetPage = await findActiveLinkPage(async (page) => {
        const data = await readContent(owner, {
          caseId,
          linksPage: String(page),
        });
        return {
          links: data.links as CaseLink[],
          hasMoreLinks: data.hasMoreLinks === true,
        };
      }, target);
      if (targetPage === null) throw new Error("moved link unavailable");
      focusAfterMove.current = { ...target, page: targetPage };
      setPage(targetPage);
      setVersion((value) => value + 1);
    })().catch(() =>
      setMoveMessage(
        "Zapisano zmianę kolejności, ale nie udało się odnaleźć linku. Odśwież widok.",
      ),
    );
  }, [owner, caseId]);
  const moveCommand = useContentCommand(owner, caseId, moveDone);
  useEffect(() => {
    const invalidate = (event: Event) => {
      if (
        matchesContentChanged(
          (event as CustomEvent<unknown>).detail,
          owner,
          caseId,
        )
      )
        changed();
    };
    window.addEventListener(contentChangedEvent, invalidate);
    return () => window.removeEventListener(contentChangedEvent, invalidate);
  }, [owner, caseId, changed]);
  useEffect(() => {
    let active = true;
    void readContent(owner, {
      caseId,
      linksPage: String(page),
      ...(targetId && targetSource
        ? { linkId: targetId, linkSource: targetSource }
        : {}),
    })
      .then((data) => {
        if (active) {
          setLinks(data.links as CaseLink[]);
          setTargetLink((data.targetLink as CaseLink | null) ?? null);
          setHasMore(data.hasMoreLinks === true);
          setError(false);
          setLoadedScope(readScope);
          const target = focusAfterMove.current;
          if (
            target &&
            target.page === page &&
            (data.links as CaseLink[]).some(
              (row) =>
                row.id === target.id &&
                row.source === target.source &&
                !row.voided,
            )
          ) {
            focusAfterMove.current = null;
            setMoveMessage(`Przeniesiono link. Strona ${page}.`);
            requestAnimationFrame(() =>
              document
                .getElementById(`case-link-${target.source}-${target.id}`)
                ?.focus(),
            );
          }
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [owner, caseId, version, page, targetId, targetSource, readScope]);
  useEffect(() => {
    if (!fresh || !targetId || !links) return;
    const focusKey = `${caseId}:${targetSource}:${targetId}`;
    if (lastFocusedTarget.current === focusKey || focusAfterMove.current)
      return;
    const item = [...links, ...(targetLink ? [targetLink] : [])].find(
      (x) => x.id === targetId && x.source === targetSource && !x.voided,
    );
    if (item)
      requestAnimationFrame(() => {
        const element = document.getElementById(
          `case-link-${item.source}-${item.id}`,
        );
        if (element) {
          element.focus();
          lastFocusedTarget.current = focusKey;
        }
      });
  }, [caseId, fresh, links, targetId, targetSource, targetLink]);
  const combined = [...(links ?? [])];
  if (
    targetLink &&
    !combined.some(
      (x) => x.id === targetLink.id && x.source === targetLink.source,
    )
  )
    combined.unshift(targetLink);
  // Keep the same keyed editor mounted even when a refresh moves or voids its row.
  const { rows: active, missing: editingMissing } = retainEditingLink(
    combined.toSorted(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    ),
    editing,
  );
  const voided = combined.filter((link) => link.voided);
  const targetMissing =
    targetId &&
    links &&
    !combined.some(
      (x) => !x.voided && x.id === targetId && x.source === targetSource,
    );
  function leaveEditor() {
    // Resolve or explicitly discard the conflict before replacing its editor.
    if (command.conflict) return false;
    if (
      !canDiscardContentDraft(linkDirty, () =>
        window.confirm("Odrzucić niezapisane zmiany linku?"),
      )
    )
      return false;
    setLinkDirty(false);
    return true;
  }
  function switchPage(next: number) {
    if (!leaveEditor()) return;
    setEditing(null);
    setPage(next);
  }
  function mutate(
    link: CaseLink,
    operation: "correct-link" | "void-link",
    position = link.position,
  ) {
    if (
      operation === "void-link" &&
      !window.confirm(
        "Unieważnić ten link? Pozostanie dostępna historia zmian.",
      )
    )
      return;
    if (operation === "correct-link")
      movedTarget.current = { id: link.id, source: link.source };
    void (operation === "correct-link" ? moveCommand : command).execute({
      requestId: crypto.randomUUID(),
      payload: {
        operation,
        caseId,
        id: link.id,
        source: link.source,
        expectedRevision: link.revision,
        ...(operation === "correct-link"
          ? { url: link.url, role: link.role, position }
          : {}),
      },
    });
  }
  async function move(link: CaseLink, direction: -1 | 1) {
    setMoving(true);
    try {
      let scanPage = 1;
      let previous: CaseLink | null = null;
      let found = false;
      let candidate: CaseLink | null = null;
      let more = true;
      while (more && !candidate) {
        const data = await readContent(owner, {
          caseId,
          linksPage: String(scanPage),
        });
        const rows = (data.links as CaseLink[]).filter((row) => !row.voided);
        for (const row of rows) {
          if (found && direction === 1) {
            candidate = row;
            break;
          }
          if (row.id === link.id && row.source === link.source) {
            if (row.revision !== link.revision) throw new Error("stale");
            found = true;
            if (direction === -1) candidate = previous;
            if (direction === -1) break;
          }
          previous = row;
        }
        if (found && direction === -1) break;
        more = data.hasMoreLinks === true;
        scanPage += 1;
      }
      if (candidate) mutate(link, "correct-link", candidate.position);
    } catch {
      setError(true);
    } finally {
      setMoving(false);
    }
  }
  return (
    <section
      id="case-links"
      className="ui-panel mt-5 min-w-0 p-5 sm:p-6"
      aria-labelledby="case-links-title"
    >
      <h2 id="case-links-title" className="text-lg font-semibold">
        Linki
      </h2>
      {command.conflict?.operation.endsWith("link") &&
        command.conflict.source &&
        !(
          editing &&
          editing !== "new" &&
          editing.id === command.conflict.id &&
          editing.source === command.conflict.source
        ) && (
          <ConflictReview
            key={command.conflict.requestId}
            owner={owner}
            caseId={caseId}
            targetId={command.conflict.id}
            source={command.conflict.source}
            onAccept={() => changed()}
          />
        )}

      {moveMessage && (
        <p role="status" className="mt-2 text-sm">
          {moveMessage}
        </p>
      )}
      {error && (
        <div role="alert">
          <p>Nie udało się pobrać linków.</p>
          {links && (
            <p>Poprzednie dane są ukryte do czasu ponownego odczytu.</p>
          )}
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              setError(false);
              setVersion((value) => value + 1);
            }}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      {!fresh && !error && <p role="status">Ładowanie linków…</p>}
      <div hidden={!fresh}>
        {targetMissing && (
          <p role="alert">Nie można otworzyć wskazanego linku.</p>
        )}
        <Feedback />
        {active.length === 0 && links && (
          <p className="mt-2 text-sm">Brak linków.</p>
        )}
        <ol className="divide-y divide-border">
          {active.map((link, index) => (
            <li
              key={`${link.source}:${link.id}`}
              id={`case-link-${link.source}-${link.id}`}
              tabIndex={-1}
              className="scroll-mt-6 py-3 outline-none"
            >
              <div
                hidden={
                  editingMissing &&
                  editing !== "new" &&
                  editing?.id === link.id &&
                  editing.source === link.source
                }
              >
                <p className="text-sm font-semibold">
                  {roles.find(([value]) => value === link.role)?.[1] ??
                    "Nieokreślona"}
                </p>
                <p className="break-words text-sm [overflow-wrap:anywhere]">
                  {link.url}
                </p>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-link inline-flex min-h-11 items-center"
                >
                  Otwórz link
                </a>
                <div className="flex flex-wrap gap-2">
                  <button
                    id={`edit-link-${link.source}-${link.id}`}
                    type="button"
                    className={buttonStyles.ghost}
                    aria-label={`Popraw link ${link.url}`}
                    disabled={
                      Boolean(command.conflict) ||
                      (editing !== null &&
                        editing !== "new" &&
                        editing.id === link.id &&
                        editing.source === link.source)
                    }
                    onClick={() => {
                      if (leaveEditor()) setEditing(link);
                    }}
                  >
                    Popraw link
                  </button>
                  <button
                    type="button"
                    className={buttonStyles.ghost}
                    disabled={
                      link.position === 0 ||
                      moving ||
                      Boolean(editing) ||
                      command.busy ||
                      command.unknown ||
                      command.recovery
                    }
                    onClick={() => void move(link, -1)}
                    aria-label={`Przenieś wyżej ${link.url}`}
                  >
                    Przenieś wyżej
                  </button>
                  <button
                    type="button"
                    className={buttonStyles.ghost}
                    disabled={
                      (index === active.length - 1 &&
                        !hasMore &&
                        !targetLink) ||
                      moving ||
                      Boolean(editing) ||
                      command.busy ||
                      command.unknown ||
                      command.recovery
                    }
                    onClick={() => void move(link, 1)}
                    aria-label={`Przenieś niżej ${link.url}`}
                  >
                    Przenieś niżej
                  </button>
                  <button
                    type="button"
                    className={buttonStyles.ghost}
                    aria-label={`Unieważnij link ${link.url}`}
                    disabled={
                      Boolean(editing) ||
                      command.busy ||
                      command.unknown ||
                      command.recovery
                    }
                    onClick={() => mutate(link, "void-link")}
                  >
                    Unieważnij link
                  </button>
                </div>
                <AuditHistory
                  owner={owner}
                  caseId={caseId}
                  targetId={link.id}
                />
              </div>
              {editing &&
                editing !== "new" &&
                editing.id === link.id &&
                editing.source === link.source && (
                  <>
                    {editingMissing && fresh && (
                      <p role="alert">
                        Link zmienił się lub nie jest na tej stronie. Szkic
                        pozostaje zachowany.
                      </p>
                    )}
                    <LinkEditor
                      owner={owner}
                      caseId={caseId}
                      existing={link}
                      onClose={() => {
                        setLinkDirty(false);
                        setEditing(null);
                        requestAnimationFrame(() =>
                          document
                            .getElementById(
                              `edit-link-${link.source}-${link.id}`,
                            )
                            ?.focus(),
                        );
                      }}
                      onChanged={changed}
                      onDirtyChange={setLinkDirty}
                    />
                  </>
                )}
            </li>
          ))}
        </ol>
        {voided.length > 0 && (
          <details className="mt-4">
            <summary className="ui-link cursor-pointer py-2 text-sm">
              Unieważnione linki
            </summary>
            <ul>
              {voided.map((link) => (
                <li
                  key={`${link.source}:${link.id}`}
                  className="break-words border-t border-border py-3 text-sm [overflow-wrap:anywhere]"
                >
                  <p>Unieważniony link: {link.url}</p>
                  <p>
                    {roles.find(([value]) => value === link.role)?.[1] ??
                      "Nieokreślona"}
                  </p>
                  <AuditHistory
                    owner={owner}
                    caseId={caseId}
                    targetId={link.id}
                  />
                </li>
              ))}
            </ul>
          </details>
        )}
        {links && (
          <nav
            aria-label="Strony linków"
            className="mt-3 flex min-w-0 flex-wrap items-center gap-2"
          >
            <button
              type="button"
              className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
              disabled={page <= 1 || Boolean(command.conflict)}
              onClick={() => switchPage(page - 1)}
            >
              Poprzednia strona linków
            </button>
            <span>Strona {page}</span>
            <button
              type="button"
              className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
              disabled={!hasMore || Boolean(command.conflict)}
              onClick={() => switchPage(page + 1)}
            >
              Następna strona linków
            </button>
          </nav>
        )}
        {editing === "new" ? (
          <LinkEditor
            owner={owner}
            caseId={caseId}
            onClose={() => {
              setLinkDirty(false);
              setEditing(null);
              requestAnimationFrame(() =>
                document.getElementById("add-case-link")?.focus(),
              );
            }}
            onChanged={changed}
            onDirtyChange={setLinkDirty}
          />
        ) : (
          <button
            id="add-case-link"
            type="button"
            className={`${buttonStyles.secondary} mt-3`}
            disabled={Boolean(editing) || Boolean(command.conflict)}
            onClick={() => setEditing("new")}
          >
            Dodaj link
          </button>
        )}
      </div>
    </section>
  );
}

export function NoteTarget({
  owner,
  caseId,
  noteId,
  currentPage,
  historyAvailable,
}: {
  owner: string;
  caseId: string;
  noteId: string;
  currentPage: number;
  historyAvailable: boolean;
}) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<{
    scope: string;
    status: "found" | "missing" | "error";
  } | null>(null);
  const scope = `${owner}:${caseId}:${noteId}:${currentPage}:${historyAvailable}:${retry}`;
  useEffect(() => {
    let active = true;
    void readContent(owner, { caseId, noteId })
      .then((data) => {
        if (!active) return;
        const status = noteTargetResult(data, caseId, noteId);
        if (status !== "found") {
          setOutcome({ scope, status });
          return;
        }
        const page = data.timelinePage as number;
        const next = noteTargetNextStep(page, currentPage, historyAvailable);
        if (next === "retry") {
          setOutcome({ scope, status: "error" });
          return;
        }
        setOutcome({ scope, status: "found" });
        if (next === "navigate") {
          const params = new URLSearchParams({
            noteId,
            historyPage: String(page),
          });
          router.replace(`/recruitments/${caseId}?${params}#case-history`);
          return;
        }
        requestAnimationFrame(() => {
          if (!active) return;
          const node = document.getElementById(`note-${noteId}`);
          if (node) {
            node.focus();
            node.scrollIntoView({ block: "center" });
          } else setOutcome({ scope, status: "error" });
        });
      })
      .catch((error: unknown) => {
        if (active) setOutcome({ scope, status: noteTargetFailure(error) });
      });
    return () => {
      active = false;
    };
  }, [owner, caseId, noteId, currentPage, historyAvailable, router, scope]);
  if (!outcome || outcome.scope !== scope)
    return <p role="status">Ładowanie wskazanej notatki…</p>;
  if (outcome.status === "missing")
    return <p role="alert">Nie można otworzyć wskazanej notatki.</p>;
  if (outcome.status === "error")
    return (
      <div role="alert">
        <p>Nie udało się pobrać wskazanej notatki.</p>
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={() => {
            router.refresh();
            setRetry((value) => value + 1);
          }}
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  return null;
}
