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
import { contentChangedEvent, matchesContentChanged } from "./content-events";
import { linkFormError, noteFormErrors } from "./content-form-validation";
import { findActiveLinkPage } from "./content-link-navigation";
import { noteTargetFailure, noteTargetResult } from "./content-target";

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
function useContentCommand(owner: string, caseId: string, changed: () => void) {
  return useContentRecovery(owner, caseId, changed);
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
          <nav aria-label="Strony historii zmian" className="flex gap-2">
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={page <= 1}
              onClick={() => load(page - 1)}
            >
              Poprzednia
            </button>
            <span>Strona {page}</span>
            <button
              type="button"
              className={buttonStyles.secondary}
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
  const command = useContentCommand(owner, caseId, changed);
  const [body, setBody] = useState(note?.body ?? "");
  const [dateChoice, setDateChoice] = useState(
    note?.date_kind === "historical"
      ? note.occurred_on
        ? "known"
        : "unknown"
      : "ordinary",
  );
  const [occurredOn, setOccurredOn] = useState(note?.occurred_on ?? "");
  const [errors, setErrors] = useState<{ body?: string; date?: string }>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const dirty =
    body !== (note?.body ?? "") ||
    dateChoice !==
      (note?.date_kind === "historical"
        ? note.occurred_on
          ? "known"
          : "unknown"
        : "ordinary") ||
    occurredOn !== (note?.occurred_on ?? "");
  useUnsavedWarning(dirty || command.unknown || command.busy);
  const formId = useId();
  function cancel() {
    if (
      (dirty || command.unknown) &&
      !window.confirm("Odrzucić niezapisane zmiany?")
    )
      return;
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
        operation: note ? "correct-note" : "create-note",
        caseId,
        ...(note ? { id: note.id, expectedRevision: note.revision } : {}),
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
export function NoteEntry({ owner, note }: { owner: string; note: Note }) {
  const router = useRouter();
  const changed = useCallback(() => router.refresh(), [router]);
  const command = useContentCommand(owner, note.case_id, changed);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const longBody = Array.from(note.body).length > 400;
  const displayed =
    longBody && !expanded
      ? `${Array.from(note.body).slice(0, 400).join("")}…`
      : note.body;
  return (
    <li
      id={`note-${note.id}`}
      tabIndex={-1}
      className="scroll-mt-6 py-4 outline-none"
    >
      <p className="font-semibold">
        {note.voided ? "Unieważniona notatka" : "Notatka"}
      </p>
      {note.revision > 0 && !note.voided && (
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
        {note.date_kind === "historical"
          ? note.occurred_on
            ? `Data zdarzenia: ${note.occurred_on}`
            : "Data zdarzenia nieznana"
          : `Data utworzenia: ${new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(new Date(note.created_at))}`}
      </p>
      {note.date_kind === "historical" &&
        note.occurred_on &&
        note.occurred_on < warsawToday(new Date(note.created_at)) && (
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
          <time dateTime={note.created_at}>
            {new Intl.DateTimeFormat("pl-PL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Warsaw",
            }).format(new Date(note.created_at))}
          </time>
        </p>
      </details>
      {!note.voided && !editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonStyles.ghost}
            id={`edit-note-${note.id}`}
            onClick={() => setEditing(true)}
          >
            Popraw notatkę
          </button>
          <button
            type="button"
            className={buttonStyles.ghost}
            disabled={command.busy || command.unknown || command.recovery}
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
                    caseId: note.case_id,
                    id: note.id,
                    expectedRevision: note.revision,
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
          caseId={note.case_id}
          note={note}
          onCancel={() => {
            setEditing(false);
            requestAnimationFrame(() =>
              document.getElementById(`edit-note-${note.id}`)?.focus(),
            );
          }}
        />
      )}
      <Feedback />
      <AuditHistory owner={owner} caseId={note.case_id} targetId={note.id} />
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
  const command = useContentCommand(owner, caseId, done);
  const [url, setUrl] = useState(existing?.url ?? "");
  const [role, setRole] = useState(existing?.role ?? "unspecified");
  const [error, setError] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const dirty =
    url !== (existing?.url ?? "") || role !== (existing?.role ?? "unspecified");
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
    setError("");
    void command.execute({
      requestId: crypto.randomUUID(),
      payload: {
        operation: existing ? "correct-link" : "add-link",
        caseId,
        ...(existing
          ? {
              id: existing.id,
              source: existing.source,
              expectedRevision: existing.revision,
            }
          : {}),
        url: url.trim(),
        role,
        ...(existing ? { position: existing.position } : {}),
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
            value !== (existing?.url ?? "") ||
              role !== (existing?.role ?? "unspecified"),
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
            url !== (existing?.url ?? "") ||
              value !== (existing?.role ?? "unspecified"),
          );
        }}
      >
        {roles.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
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
            if (!dirty || window.confirm("Odrzucić niezapisane zmiany?"))
              onClose();
          }}
        >
          Anuluj
        </button>
      </div>
    </form>
  );
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
  }, [owner, caseId, version, page, targetId, targetSource]);
  useEffect(() => {
    if (!targetId || !links) return;
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
  }, [caseId, links, targetId, targetSource, targetLink]);
  const combined = [...(links ?? [])];
  if (
    targetLink &&
    !combined.some(
      (x) => x.id === targetLink.id && x.source === targetLink.source,
    )
  )
    combined.unshift(targetLink);
  const active = combined
    .filter((link) => !link.voided)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const voided = combined.filter((link) => link.voided);
  const targetMissing =
    targetId &&
    links &&
    !active.some((x) => x.id === targetId && x.source === targetSource);
  function leaveEditor() {
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
      {moveMessage && (
        <p role="status" className="mt-2 text-sm">
          {moveMessage}
        </p>
      )}
      {targetMissing && (
        <p role="alert">Nie można otworzyć wskazanego linku.</p>
      )}
      {error && <p role="alert">Nie udało się pobrać linków.</p>}
      {!links && !error && <p role="status">Ładowanie linków…</p>}
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
                  editing !== null &&
                  editing !== "new" &&
                  editing.id === link.id &&
                  editing.source === link.source
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
                  (index === active.length - 1 && !hasMore && !targetLink) ||
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
            <AuditHistory owner={owner} caseId={caseId} targetId={link.id} />
            {editing &&
              editing !== "new" &&
              editing.id === link.id &&
              editing.source === link.source && (
                <LinkEditor
                  owner={owner}
                  caseId={caseId}
                  existing={link}
                  onClose={() => {
                    setLinkDirty(false);
                    setEditing(null);
                    requestAnimationFrame(() =>
                      document
                        .getElementById(`edit-link-${link.source}-${link.id}`)
                        ?.focus(),
                    );
                  }}
                  onChanged={changed}
                  onDirtyChange={setLinkDirty}
                />
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
          className="mt-3 flex items-center gap-2"
        >
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={page <= 1}
            onClick={() => switchPage(page - 1)}
          >
            Poprzednia strona linków
          </button>
          <span>Strona {page}</span>
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={!hasMore}
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
          disabled={Boolean(editing)}
          onClick={() => setEditing("new")}
        >
          Dodaj link
        </button>
      )}
    </section>
  );
}

export function NoteTarget({
  owner,
  caseId,
  noteId,
  currentPage,
}: {
  owner: string;
  caseId: string;
  noteId: string;
  currentPage: number;
}) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [outcome, setOutcome] = useState<{
    scope: string;
    status: "found" | "missing" | "error";
  } | null>(null);
  const scope = `${owner}:${caseId}:${noteId}:${currentPage}:${retry}`;
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
        setOutcome({ scope, status: "found" });
        if (page !== currentPage) {
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
  }, [owner, caseId, noteId, currentPage, router, scope]);
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
          onClick={() => setRetry((value) => value + 1)}
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  return null;
}
