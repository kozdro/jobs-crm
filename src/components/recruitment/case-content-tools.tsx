"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { useUnsavedWarning } from "@/components/reminders/use-unsaved-warning";
import {
  isCalendarDate,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";
import { claimContentIntent, clearContentIntent } from "./content-intent";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

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
type Command = { requestId: string; payload: Record<string, unknown> };
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
function marker(owner: string, caseId: string) {
  return `jobs-crm.content.pending.${owner}.${caseId}`;
}
async function readContent(owner: string, query: Record<string, string>) {
  const params = new URLSearchParams({ expectedUserId: owner, ...query });
  const response = await fetch(`/recruitments/content?${params}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("read failed");
  return (await response.json()) as Record<string, unknown>;
}
function useContentCommand(owner: string, caseId: string, changed: () => void) {
  const [pending, setPending] = useState<Command | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    id: string;
    source: string;
  } | null>(null);
  const [recovery, setRecovery] = useState(false);
  const key = marker(owner, caseId);
  useEffect(() => {
    if (!unknown && !busy) return;
    const blockNavigation = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("a[href]")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMessage(
          "Najpierw sprawdź wynik zapisu lub ponów identyczny zamiar.",
        );
      }
    };
    document.addEventListener("click", blockNavigation, true);
    return () => document.removeEventListener("click", blockNavigation, true);
  }, [unknown, busy]);
  useEffect(() => {
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(key);
    } catch {
      /* no stored payload */
    }
    if (!id) return;
    let active = true;
    void readContent(owner, { requestId: id })
      .then((receipt) => {
        if (!active) return;
        if (
          receipt.kind === "saved" ||
          receipt.kind === "replayed" ||
          receipt.kind === "found"
        ) {
          try {
            if (!clearContentIntent(sessionStorage, key, id)) {
              setRecovery(true);
              setMessage(
                "Stan zamiaru zmienił się. Sprawdź wynik nowszego zapisu.",
              );
              return;
            }
          } catch {
            setRecovery(true);
            return;
          }
          setRecovery(false);
          setMessage("Poprzedni zapis został potwierdzony.");
          changed();
        } else {
          setRecovery(true);
          setMessage(
            "Nie udało się ustalić wyniku poprzedniego zapisu. Odśwież i sprawdź dane przed kolejną zmianą.",
          );
        }
      })
      .catch(() => {
        if (active) {
          setRecovery(true);
          setMessage("Nie udało się sprawdzić wyniku poprzedniego zapisu.");
        }
      });
    return () => {
      active = false;
    };
    // Only check persisted intent on mount/identity change. `changed` may change after a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, caseId, key]);
  const execute = useCallback(
    async (command: Command) => {
      setBusy(true);
      setMessage(null);
      setDuplicate(null);
      try {
        if (!claimContentIntent(sessionStorage, key, command.requestId)) {
          setRecovery(true);
          setMessage("Najpierw sprawdź wynik poprzedniego zapisu.");
          setBusy(false);
          return;
        }
      } catch {
        setMessage(
          "Nie można bezpiecznie przygotować zapisu. Sprawdź ustawienia przeglądarki.",
        );
        setBusy(false);
        return;
      }
      setPending(command);
      try {
        const response = await fetch("/recruitments/content", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedUserId: owner, ...command }),
          signal: AbortSignal.timeout(20000),
        });
        const result = (await response.json().catch(() => null)) as {
          kind?: string;
          match?: { id?: unknown; source?: unknown };
        } | null;
        if (
          response.ok &&
          (result?.kind === "saved" || result?.kind === "replayed")
        ) {
          try {
            if (!clearContentIntent(sessionStorage, key, command.requestId))
              throw new Error("intent not cleared");
          } catch {
            setUnknown(true);
            setMessage(
              "Odpowiedź zapisu otrzymano, ale nie można zweryfikować stanu zamiaru.",
            );
            return;
          }
          setPending(null);
          setUnknown(false);
          setMessage("Zapisano.");
          changed();
          return;
        }
        if (response.status < 500 && response.status !== 408) {
          try {
            if (!clearContentIntent(sessionStorage, key, command.requestId))
              throw new Error("intent not cleared");
          } catch {
            setRecovery(true);
            setMessage("Nie można zweryfikować stanu poprzedniego zamiaru.");
            return;
          }
          setPending(null);
          setUnknown(false);
          if (
            result?.kind === "duplicate" &&
            typeof result.match?.id === "string" &&
            uuidPattern.test(result.match.id) &&
            (result.match.source === "legacy" ||
              result.match.source === "additional")
          ) {
            setDuplicate({ id: result.match.id, source: result.match.source });
          }
          setMessage(
            result?.kind === "stale"
              ? "Dane zmieniły się. Odśwież i potwierdź zmianę ponownie."
              : result?.kind === "duplicate"
                ? "Ten link już istnieje w tej sprawie."
                : result?.kind === "conflict"
                  ? "Zamiar jest nieaktualny. Odśwież dane i spróbuj ponownie."
                  : "Nie udało się zapisać. Sprawdź dane.",
          );
          return;
        }
        throw new Error("uncertain");
      } catch {
        setUnknown(true);
        setMessage(
          "Wynik zapisu jest niepewny. Sprawdź wynik lub ponów identyczny zapis.",
        );
      } finally {
        setBusy(false);
      }
    },
    [changed, key, owner],
  );
  return {
    execute,
    pending,
    unknown,
    busy,
    message,
    recovery,
    duplicate,
    caseId,
  };
}
function Feedback({
  command,
}: {
  command: ReturnType<typeof useContentCommand>;
}) {
  return (
    <>
      {command.message && (
        <p
          role={command.unknown || command.recovery ? "alert" : "status"}
          className="text-sm"
        >
          {command.message}
        </p>
      )}
      {command.duplicate && (
        <Link
          className="ui-link block min-h-11 py-2 text-sm"
          href={`/recruitments/${encodeURIComponent(command.caseId)}?linkId=${encodeURIComponent(command.duplicate.id)}&linkSource=${encodeURIComponent(command.duplicate.source)}#case-links`}
        >
          Otwórz istniejący link
        </Link>
      )}
      {command.unknown && command.pending && (
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={command.busy}
          onClick={() => void command.execute(command.pending!)}
        >
          Ponów identyczny zapis
        </button>
      )}
    </>
  );
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
  const [error, setError] = useState("");
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
    const count = Array.from(body.trim()).length;
    if (
      count < 1 ||
      count > 10000 ||
      !body.isWellFormed() ||
      body.includes("\0") ||
      (dateChoice === "known" &&
        (!isCalendarDate(occurredOn) || occurredOn > warsawToday(new Date())))
    ) {
      setError("Wpisz treść do 10 000 znaków i poprawną datę.");
      return;
    }
    setError("");
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
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-md border border-border p-4"
    >
      <label htmlFor={`${formId}-body`} className="block font-medium">
        Treść notatki
      </label>
      <textarea
        id={`${formId}-body`}
        autoFocus
        className={`${inputStyles} min-h-32 w-full`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={command.busy || command.unknown}
        aria-describedby={`${formId}-count`}
      />
      <p id={`${formId}-count`} className="text-sm">
        {Array.from(body.trim()).length}/10000 znaków
      </p>
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
            aria-label="Data zdarzenia"
            type="date"
            max={warsawToday(new Date())}
            className={inputStyles}
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            disabled={command.busy || command.unknown}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <Feedback command={command} />
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
        {note.body}
      </p>
      <p className="text-sm text-muted-foreground">
        {note.date_kind === "historical"
          ? note.occurred_on
            ? `Data zdarzenia: ${note.occurred_on}`
            : "Data zdarzenia nieznana"
          : `Data utworzenia: ${new Date(note.created_at).toLocaleDateString("pl-PL")}`}
      </p>
      {!note.voided && !editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonStyles.ghost}
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
          onCancel={() => setEditing(false)}
        />
      )}
      <Feedback command={command} />
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
}: {
  owner: string;
  caseId: string;
  existing?: CaseLink;
  onClose: () => void;
  onChanged: () => void;
}) {
  const done = useCallback(() => {
    onChanged();
    onClose();
  }, [onChanged, onClose]);
  const command = useContentCommand(owner, caseId, done);
  const [url, setUrl] = useState(existing?.url ?? "");
  const [role, setRole] = useState(existing?.role ?? "unspecified");
  const [error, setError] = useState("");
  const dirty =
    url !== (existing?.url ?? "") || role !== (existing?.role ?? "unspecified");
  useUnsavedWarning(dirty || command.unknown || command.busy);
  const formId = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (command.pending || command.recovery) return;
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
        throw new Error();
    } catch {
      setError("Podaj poprawny adres HTTP lub HTTPS.");
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
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-md border border-border p-4"
    >
      <label htmlFor={`${formId}-url`} className="block font-medium">
        Adres URL
      </label>
      <input
        id={`${formId}-url`}
        type="url"
        className={`${inputStyles} w-full`}
        value={url}
        disabled={command.busy || command.unknown}
        onChange={(e) => setUrl(e.target.value)}
      />
      <label htmlFor={`${formId}-role`} className="block font-medium">
        Rola linku
      </label>
      <select
        id={`${formId}-role`}
        className={inputStyles}
        value={role}
        disabled={command.busy || command.unknown}
        onChange={(e) => setRole(e.target.value)}
      >
        {roles.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <p role="alert">{error}</p>}
      <Feedback command={command} />
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
  const [moving, setMoving] = useState(false);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const command = useContentCommand(owner, caseId, changed);
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
    const item = [...links, ...(targetLink ? [targetLink] : [])].find(
      (x) => x.id === targetId && x.source === targetSource && !x.voided,
    );
    if (item)
      requestAnimationFrame(() =>
        document.getElementById(`case-link-${item.source}-${item.id}`)?.focus(),
      );
  }, [links, targetId, targetSource, targetLink]);
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
  const targetMissing =
    targetId &&
    links &&
    !active.some((x) => x.id === targetId && x.source === targetSource);
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
    void command.execute({
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
      {targetMissing && (
        <p role="alert">Nie można otworzyć wskazanego linku.</p>
      )}
      {error && <p role="alert">Nie udało się pobrać linków.</p>}
      {!links && !error && <p role="status">Ładowanie linków…</p>}
      <Feedback command={command} />
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
                type="button"
                className={buttonStyles.ghost}
                aria-label={`Popraw link ${link.url}`}
                onClick={() => setEditing(link)}
              >
                Popraw link
              </button>
              <button
                type="button"
                className={buttonStyles.ghost}
                disabled={
                  link.position === 0 ||
                  moving ||
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
                disabled={command.busy || command.unknown || command.recovery}
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
                  onClose={() => setEditing(null)}
                  onChanged={changed}
                />
              )}
          </li>
        ))}
      </ol>
      {links && (
        <nav
          aria-label="Strony linków"
          className="mt-3 flex items-center gap-2"
        >
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Poprzednia strona linków
          </button>
          <span>Strona {page}</span>
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={!hasMore}
            onClick={() => setPage((n) => n + 1)}
          >
            Następna strona linków
          </button>
        </nav>
      )}
      {editing === "new" ? (
        <LinkEditor
          owner={owner}
          caseId={caseId}
          onClose={() => setEditing(null)}
          onChanged={changed}
        />
      ) : (
        <button
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
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void readContent(owner, { caseId, noteId })
      .then((data) => {
        if (!active) return;
        const target = data.targetNote as Note | null;
        const page = data.timelinePage;
        if (
          !target ||
          target.id !== noteId ||
          typeof page !== "number" ||
          !Number.isSafeInteger(page) ||
          page < 1
        ) {
          setError(true);
          return;
        }
        if (page !== currentPage) {
          const params = new URLSearchParams({
            noteId,
            historyPage: String(page),
          });
          router.replace(`/recruitments/${caseId}?${params}#case-history`);
          return;
        }
        requestAnimationFrame(() => {
          const node = document.getElementById(`note-${noteId}`);
          if (node) {
            node.focus();
            node.scrollIntoView({ block: "center" });
          } else setError(true);
        });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [owner, caseId, noteId, currentPage, router]);
  return error ? (
    <p role="alert">Nie można otworzyć wskazanej notatki.</p>
  ) : null;
}
