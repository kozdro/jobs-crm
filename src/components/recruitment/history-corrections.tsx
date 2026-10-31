"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CaseEvent } from "@/modules/recruitment/domain/case-events";
import {
  isCalendarDate,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { CaseCreatedTime } from "./case-content";
import {
  historyIntentStorageKey,
  clearMatchingHistoryIntent,
  parseHistoryIntent,
  isHistoryPreview,
  isHistoryRevision,
  revisionMatchesIntent,
  type HistoryValues,
  type HistoryPreview,
  type HistoryRevision,
  type HistoryIntentIds,
} from "./history-intent";

type Draft = {
  caseId: string;
  eventId: string;
  operation: "correct" | "void";
  occurredOn: string | null;
  direction: "inbound" | "outbound" | null;
  stageName: string | null;
};
type ConfirmIntent = Draft & {
  requestId: string;
  expectedCaseRevision: number;
  expectedEventRevision: number;
};
const endpoint = "/recruitments/history-commands";

function DisplayValues({ value }: { value: HistoryValues }) {
  return (
    <dl className="space-y-1 text-sm [overflow-wrap:anywhere]">
      <div>
        <dt className="inline text-muted-foreground">Data: </dt>
        <dd className="inline">
          {value.occurredOn ?? "Data zdarzenia nieznana"}
        </dd>
      </div>
      {value.direction && (
        <div>
          <dt className="inline text-muted-foreground">Kierunek: </dt>
          <dd className="inline">
            {value.direction === "inbound"
              ? "Kontakt przychodzący"
              : "Kontakt wychodzący"}
          </dd>
        </div>
      )}
      {value.stageName !== null && (
        <div>
          <dt className="inline text-muted-foreground">Etap: </dt>
          <dd className="inline">{value.stageName}</dd>
        </div>
      )}
      <div>
        <dt className="inline text-muted-foreground">Wpis: </dt>
        <dd className="inline">{value.voided ? "Unieważniony" : "Ważny"}</dd>
      </div>
    </dl>
  );
}

export function HistoryCorrections({
  userId,
  caseId,
  event,
  initialOperation,
  onClose,
}: {
  userId: string;
  caseId: string;
  event: CaseEvent;
  initialOperation: "correct" | "void";
  onClose: () => void;
}) {
  const router = useRouter();
  const [operation, setOperation] = useState<"correct" | "void">(
    initialOperation,
  );
  const [occurredOn, setOccurredOn] = useState(event.occurred_on ?? "");
  const [direction, setDirection] = useState(event.direction);
  const [stageName, setStageName] = useState(event.stage_name ?? "");
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const frozen = useRef<ConfirmIntent | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const storageKey = `${historyIntentStorageKey}.${caseId}`;
  const stageAction =
    event.kind === "invitation" || event.kind === "stage-change";
  const id = `history-edit-${event.id}`;
  useEffect(() => {
    epoch.current += 1;
    alive.current = true;
    heading.current?.focus();
    return () => {
      epoch.current += 1;
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  function report(message: string) {
    setError(message);
    const reportingEpoch = epoch.current;
    requestAnimationFrame(() => {
      if (alive.current && epoch.current === reportingEpoch)
        feedback.current?.focus();
    });
  }
  function login() {
    window.location.replace("/login");
  }
  function clearStored(payload: ConfirmIntent): boolean {
    try {
      return clearMatchingHistoryIntent(sessionStorage, storageKey, {
        ownerId: userId,
        caseId,
        eventId: event.id,
        requestId: payload.requestId,
      });
    } catch {
      /* No usable tab storage: the confirmed in-memory result remains authoritative. */
      return true;
    }
  }
  function finish(payload: ConfirmIntent) {
    if (!alive.current || !clearStored(payload)) return;
    router.refresh();
    onClose();
    window.dispatchEvent(
      new CustomEvent("jobs-crm:history-corrected", { detail: { caseId } }),
    );
    const finishingEpoch = epoch.current;
    requestAnimationFrame(() => {
      if (alive.current && epoch.current === finishingEpoch)
        document.getElementById("case-history-heading")?.focus();
    });
  }
  async function request(body: unknown) {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(body as object), expectedUserId: userId }),
      signal: AbortSignal.timeout(20000),
    });
    if (!current()) throw new Error("expired");
    if (response.status === 401 || response.status === 403) {
      login();
      throw new Error("auth");
    }
    const result: unknown = await response.json().catch(() => null);
    if (!current()) throw new Error("expired");
    return { response, result: result as Record<string, unknown> | null };
  }
  function draft(): Draft | null {
    if (operation === "correct") {
      if (
        occurredOn &&
        (!isCalendarDate(occurredOn) || occurredOn > warsawToday())
      ) {
        report("Podaj poprawny nieprzyszły dzień albo pozostaw datę nieznaną.");
        return null;
      }
      if (
        stageAction &&
        (!stageName.trim() || Array.from(stageName.trim()).length > 160)
      ) {
        report(
          "Podaj nazwę etapu od 1 do 160 znaków po usunięciu skrajnych odstępów.",
        );
        return null;
      }
    }
    return {
      caseId,
      eventId: event.id,
      operation,
      occurredOn: operation === "void" ? null : occurredOn || null,
      direction: operation === "void" ? null : direction,
      stageName:
        operation === "correct" && stageAction ? stageName.trim() : null,
    };
  }
  async function showPreview(formEvent?: FormEvent) {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    formEvent?.preventDefault();
    if (busy.current || uncertain) return;
    const value = draft();
    if (!value) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setConfirmed(false);
    try {
      const { response, result } = await request({
        ...value,
        action: "preview",
      });
      if (!current()) return;
      if (!response.ok || !isHistoryPreview(result?.preview)) {
        report(
          "Nie udało się pobrać podglądu. Nie wykonano nowej korekty. Sprawdź dane i spróbuj ponownie.",
        );
        return;
      }
      setPreview(result.preview);
    } catch {
      if (current())
        report(
          "Nie udało się pobrać podglądu. Zachowano dane formularza; spróbuj ponownie.",
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function save() {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    if (busy.current) return;
    let payload = frozen.current;
    if (!payload) {
      const value = draft();
      if (!value || !preview || preview.blockedBy.length) return;
      if (!confirmed) {
        report("Potwierdź zmianę oraz jej wpływ na bieżący status i etap.");
        return;
      }
      payload = {
        ...value,
        requestId: crypto.randomUUID(),
        expectedCaseRevision: preview.caseRevision,
        expectedEventRevision: preview.eventRevision,
      };
    }
    frozen.current = payload;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          ownerId: userId,
          caseId,
          eventId: event.id,
          requestId: payload.requestId,
          command: payload,
        }),
      );
    } catch {
      /* The frozen command remains in memory if tab storage is unavailable. */
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const { response, result } = await request({
        ...payload,
        action: "confirm",
      });
      if (!current()) return;
      if (response.status === 409 || response.status === 400) {
        // These statuses guarantee no mutation for this intention. A new preview requires fresh consent.
        if (!clearStored(payload)) return;
        frozen.current = null;
        setUncertain(false);
        setPreview(null);
        setConfirmed(false);
        report(
          response.status === 409
            ? "Sprawa lub wpis zmieniły się. Zachowano dane. Pobierz nowy podgląd i ponownie potwierdź zmiany."
            : "Nie przyjęto zmiany. Zachowano dane; sprawdź formularz i pobierz nowy podgląd.",
        );
        return;
      }
      if (
        !response.ok ||
        !isHistoryRevision(result?.revision) ||
        !revisionMatchesIntent(result.revision, payload)
      )
        throw new Error("unconfirmed");
      finish(payload);
    } catch {
      if (current()) {
        setUncertain(true);
        report(
          "Wynik korekty jest nieznany. Zapis mógł się powieść. Sprawdź wynik lub ponów ten sam zapis; nie rozpoczynaj drugiej korekty dla tego samego zamiaru.",
        );
      }
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function recover() {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    if (busy.current || !frozen.current) return;
    const payload = frozen.current;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(
        `${endpoint}?caseId=${caseId}&requestId=${payload.requestId}&expectedUserId=${userId}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!current()) return;
      if (response.status === 401 || response.status === 403) {
        login();
        return;
      }
      const result = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error("unavailable");
      if (
        isHistoryRevision(result.revision) &&
        revisionMatchesIntent(result.revision, payload)
      )
        finish(payload);
      else
        report(
          "Nie potwierdzono wyniku. Brak wyniku odczytu nie oznacza cofnięcia zapisu. Sprawdź ponownie lub ponów ten sam zapis.",
        );
    } catch {
      if (current())
        report(
          "Nie można teraz sprawdzić wyniku korekty. Zachowano identyfikator zapisu.",
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  const dirty =
    operation === "void" ||
    occurredOn !== (event.occurred_on ?? "") ||
    direction !== event.direction ||
    stageName !== (event.stage_name ?? "") ||
    Boolean(preview) ||
    uncertain;
  return (
    <form
      onSubmit={showPreview}
      noValidate
      aria-labelledby={`${id}-heading`}
      aria-busy={pending}
      className="mt-4 space-y-4 rounded-md border border-border bg-background p-4 sm:p-5"
    >
      <h3
        id={`${id}-heading`}
        ref={heading}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        {operation === "void"
          ? "Unieważnienie wpisu historii"
          : "Korekta wpisu historii"}
      </h3>
      <p className="text-sm leading-6 text-muted-foreground">
        Oryginalny wpis i wcześniejsze wartości pozostają w audycie. Korekta nie
        rejestruje nowego aplikowania, kontaktu ani zaproszenia. Unieważnienie
        jest trwałe i nie anuluje rzeczywistego zdarzenia.
      </p>
      {!preview && !uncertain && (
        <fieldset disabled={pending} className="space-y-4">
          <legend className="sr-only">Rodzaj zmiany</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-operation`}
                checked={operation === "correct"}
                onChange={() => setOperation("correct")}
                className="size-4 accent-primary"
              />
              Skoryguj dane
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-operation`}
                checked={operation === "void"}
                onChange={() => setOperation("void")}
                className="size-4 accent-primary"
              />
              Unieważnij wpis
            </label>
          </div>
          {operation === "correct" && (
            <>
              <div className="space-y-2">
                <label
                  htmlFor={`${id}-day`}
                  className="block text-sm font-medium"
                >
                  Data zdarzenia (opcjonalnie)
                </label>
                <p
                  id={`${id}-day-hint`}
                  className="text-[13px] text-muted-foreground"
                >
                  Puste pole oznacza datę nieznaną. Sama zmiana dnia nie zmienia
                  bieżącego stanu sprawy.
                </p>
                <input
                  id={`${id}-day`}
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  max={warsawToday()}
                  aria-describedby={`${id}-day-hint`}
                  className={`${inputStyles} max-w-full sm:max-w-64`}
                />
              </div>
              {event.kind === "contact" && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">
                    Kierunek kontaktu
                  </legend>
                  {(
                    [
                      ["inbound", "Kontakt przychodzący"],
                      ["outbound", "Kontakt wychodzący"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-11 items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={`${id}-direction`}
                        checked={direction === value}
                        onChange={() => setDirection(value)}
                        className="size-4 accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
              {stageAction && (
                <div className="space-y-2">
                  <label
                    htmlFor={`${id}-stage`}
                    className="block text-sm font-medium"
                  >
                    Nazwa etapu
                  </label>
                  <input
                    id={`${id}-stage`}
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    className={inputStyles}
                  />
                  <p className="text-[13px] text-muted-foreground">
                    {Array.from(stageName.trim()).length}/160 znaków po
                    usunięciu skrajnych odstępów
                  </p>
                </div>
              )}
            </>
          )}
        </fieldset>
      )}
      {preview && (
        <section
          aria-labelledby={`${id}-preview-heading`}
          className="space-y-4"
        >
          <h4
            id={`${id}-preview-heading`}
            ref={previewHeading}
            tabIndex={-1}
            className="font-semibold outline-none"
          >
            Podgląd zmian
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h5 className="mb-2 text-sm font-semibold">Przed zmianą</h5>
              <DisplayValues value={preview.before} />
            </div>
            <div>
              <h5 className="mb-2 text-sm font-semibold">Po zmianie</h5>
              <DisplayValues value={preview.after} />
            </div>
          </div>
          {preview.blockedBy.length ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>
                Nie można unieważnić wpisu: późniejsze przejścia utraciłyby
                wcześniejsze ważne zaproszenie. Nie wykonano zmiany ani kaskady.
              </p>
              <p>
                Najpierw wyjaśnij zależne wpisy. Unieważnij je osobno tylko
                wtedy, gdy również były błędne:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                {preview.blockedBy.map((value) => (
                  <li key={value} className="[overflow-wrap:anywhere]">
                    Wpis {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 [overflow-wrap:anywhere]">
                Bieżący status po zmianie: <strong>{preview.status}</strong>.
                Bieżący etap po zmianie:{" "}
                <strong>{preview.currentStage ?? "Nie ustawiono etapu"}</strong>
                .
              </p>
              <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  disabled={pending || uncertain}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span>
                  {operation === "void"
                    ? "Potwierdzam unieważnienie i jego wpływ na bieżący status oraz etap."
                    : "Potwierdzam korektę i jej wpływ na bieżący status oraz etap."}
                </span>
              </label>
            </>
          )}
        </section>
      )}
      {error && (
        <p
          ref={feedback}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-destructive bg-destructive-surface p-3 text-sm leading-6 text-destructive outline-none focus:ring-2 focus:ring-ring"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {!preview && !uncertain && (
          <button
            type="submit"
            disabled={pending}
            className={buttonStyles.primary}
          >
            {pending ? "Pobieranie podglądu…" : "Pokaż podgląd zmian"}
          </button>
        )}
        {preview && !preview.blockedBy.length && !uncertain && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={pending}
            className={buttonStyles.primary}
          >
            {pending
              ? "Zapisywanie…"
              : operation === "void"
                ? "Zatwierdź unieważnienie"
                : "Zatwierdź korektę"}
          </button>
        )}
        {preview && !uncertain && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPreview(null);
              setConfirmed(false);
              setError(null);
              requestAnimationFrame(() => heading.current?.focus());
            }}
            className={buttonStyles.secondary}
          >
            Wróć do danych
          </button>
        )}
        {uncertain && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => void recover()}
              className={buttonStyles.secondary}
            >
              Sprawdź wynik korekty
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void save()}
              className={buttonStyles.secondary}
            >
              Ponów ten sam zapis
            </button>
          </>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => (dirty ? setDiscard(true) : onClose())}
          className={buttonStyles.secondary}
        >
          Anuluj
        </button>
      </div>
      {discard && (
        <div
          role="group"
          aria-label="Potwierdzenie porzucenia korekty"
          className="space-y-3 rounded-md border border-warning bg-warning-surface p-3 text-sm leading-6"
        >
          <p>
            {uncertain
              ? "Porzucenie formularza nie cofa zapisu. Zachowamy identyfikator do sprawdzenia wyniku; sprawdź historię przed nową korektą."
              : "Odrzucić niezapisane zmiany?"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => {
                setDiscard(false);
                requestAnimationFrame(() => heading.current?.focus());
              }}
            >
              Wróć do formularza
            </button>
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={onClose}
            >
              Potwierdź porzucenie
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function HistoryAudit({
  userId,
  caseId,
  eventId,
}: {
  userId: string;
  caseId: string;
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [revisions, setRevisions] = useState<HistoryRevision[] | null>(null);
  const [error, setError] = useState(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    epoch.current += 1;
    alive.current = true;
    return () => {
      epoch.current += 1;
      alive.current = false;
    };
  }, []);
  async function load() {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    if (busy.current) return;
    busy.current = true;
    setOpen(true);
    setPending(true);
    setError(false);
    try {
      const response = await fetch(
        `${endpoint}?caseId=${caseId}&eventId=${eventId}&expectedUserId=${userId}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!current()) return;
      if (response.status === 401 || response.status === 403) {
        window.location.replace("/login");
        return;
      }
      const result = await response.json();
      if (!current()) return;
      if (
        !response.ok ||
        !Array.isArray(result.revisions) ||
        !result.revisions.every(
          (row: unknown) =>
            isHistoryRevision(row) &&
            row.case_id === caseId &&
            row.event_id === eventId,
        )
      )
        throw new Error("unavailable");
      setRevisions(result.revisions);
    } catch {
      if (current()) setError(true);
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        className="ui-link min-h-11 py-2 text-sm"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : void load())}
      >
        {" "}
        {open ? "Ukryj audyt" : "Pokaż audyt"}
      </button>
      {open && (
        <section
          aria-label="Audyt wpisu"
          className="mt-2 space-y-3 rounded-md border border-border p-4"
        >
          <h3 className="font-semibold">Audyt wpisu</h3>
          {pending ? (
            <p role="status" className="text-sm">
              Pobieranie audytu…
            </p>
          ) : error ? (
            <>
              <p role="alert" className="text-sm text-destructive">
                Nie udało się pobrać audytu. To nie oznacza braku zmian.
              </p>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => void load()}
              >
                Ponów odczyt audytu
              </button>
            </>
          ) : !revisions?.length ? (
            <p className="text-sm text-muted-foreground">
              Nie zarejestrowano korekt ani unieważnień tego wpisu.
            </p>
          ) : (
            <ol className="space-y-4">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="space-y-3 border-t border-border pt-3"
                >
                  <p className="text-sm font-semibold">
                    {revision.operation === "void"
                      ? "Unieważnienie"
                      : "Korekta"}{" "}
                    · wersja {revision.revision}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Właściciel tej sprawy ·{" "}
                    <CaseCreatedTime value={revision.recorded_at} />
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h4 className="mb-1 text-sm font-medium">
                        Poprzednie wartości
                      </h4>
                      <DisplayValues value={revision.before} />
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-medium">
                        Zapisane wartości
                      </h4>
                      <DisplayValues value={revision.after} />
                    </div>
                  </div>
                  <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                    Stan w chwili korekty: {revision.status}; etap:{" "}
                    {revision.current_stage ?? "Nie ustawiono etapu"}. To wynik
                    historyczny, a nie potwierdzenie bieżącego stanu.
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}

/** Case-level recovery survives correction moving the entry to another timeline page. */
export function HistoryRecovery({
  userId,
  caseId,
}: {
  userId: string;
  caseId: string;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<HistoryIntentIds | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const epoch = useRef(0);
  const busy = useRef(false);
  const key = `${historyIntentStorageKey}.${caseId}`;
  useEffect(() => {
    epoch.current += 1;
    alive.current = true;
    const mountedEpoch = epoch.current;
    try {
      const found = parseHistoryIntent(
        sessionStorage.getItem(key),
        userId,
        caseId,
      );
      if (found)
        queueMicrotask(() => {
          if (alive.current && epoch.current === mountedEpoch) setIds(found);
        });
    } catch {
      /* Optional identifier storage. */
    }
    function refreshIds() {
      try {
        setIds(parseHistoryIntent(sessionStorage.getItem(key), userId, caseId));
      } catch {
        /* Optional storage. */
      }
    }
    function finished() {
      setMessage(
        "Potwierdzono zapis korekty. Pobieranie aktualnego stanu historii…",
      );
      setIds(null);
    }
    window.addEventListener("jobs-crm:history-corrected", finished);
    window.addEventListener("jobs-crm:history-recovery", refreshIds);
    return () => {
      epoch.current += 1;
      alive.current = false;
      window.removeEventListener("jobs-crm:history-corrected", finished);
      window.removeEventListener("jobs-crm:history-recovery", refreshIds);
    };
  }, [key, userId, caseId]);
  function completeRecovery(message: string, expected: HistoryIntentIds) {
    if (!alive.current) return;
    try {
      if (!clearMatchingHistoryIntent(sessionStorage, key, expected)) return;
    } catch {
      /* An in-memory confirmed result is still valid when tab storage is unavailable. */
    }
    setIds(null);
    setMessage(message);
    router.refresh();
  }
  async function retry() {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    if (busy.current || !ids?.command) return;
    const command = ids.command;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...command,
          action: "confirm",
          expectedUserId: userId,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) {
        window.location.replace("/login");
        return;
      }
      const result = await response.json();
      if (!current()) return;
      if (
        response.ok &&
        isHistoryRevision(result.revision) &&
        revisionMatchesIntent(result.revision, command)
      ) {
        completeRecovery(
          "Potwierdzono wcześniejszy zapis korekty. Pobieranie aktualnego stanu historii…",
          ids,
        );
      } else if (response.status === 409 && result?.kind === "stale") {
        // Same command was resolved server-side: replay is checked before stale.
        // A stale rejection therefore confirms this intention did not mutate data.
        completeRecovery(
          "Poprzedni zamiar nie został zastosowany: stan zmienił się. Pobierz nowy podgląd i ponownie potwierdź korektę.",
          ids,
        );
      } else {
        setMessage(
          "Nie potwierdzono wyniku korekty. Zachowano ten sam zamiar; sprawdź wynik lub ponów ten sam zapis.",
        );
      }
    } catch {
      if (current())
        setMessage(
          "Wynik ponowienia jest nieznany. Zachowano te same dane i identyfikator; sprawdź wynik albo ponów ten sam zapis.",
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function recover() {
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    if (busy.current || !ids) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch(
        `${endpoint}?caseId=${caseId}&requestId=${ids.requestId}&expectedUserId=${userId}`,
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!current()) return;
      if (response.status === 401 || response.status === 403) {
        window.location.replace("/login");
        return;
      }
      const result = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error("unavailable");
      if (
        isHistoryRevision(result.revision) &&
        result.revision.case_id === caseId &&
        result.revision.event_id === ids.eventId &&
        (!ids.command || revisionMatchesIntent(result.revision, ids.command))
      ) {
        completeRecovery(
          "Potwierdzono wcześniejszy zapis korekty. Pobieranie aktualnego stanu historii…",
          ids,
        );
      } else
        setMessage(
          "Nie potwierdzono wyniku korekty. Brak wyniku odczytu nie oznacza cofnięcia zapisu. Sprawdź ponownie przed nową korektą.",
        );
    } catch {
      if (current())
        setMessage(
          "Nie można teraz sprawdzić wyniku korekty. Zachowano identyfikator zapisu.",
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <p role="status" className="text-sm leading-6 text-muted-foreground">
        {message ??
          (ids
            ? "Zachowano identyfikator poprzedniej korekty. Sprawdź jej wynik przed nową zmianą."
            : "")}
      </p>
      {ids && !ids.command && (
        <p className="text-sm leading-6 text-warning">
          Zachowano tylko identyfikatory lub dane ponowienia są nieprawidłowe.
          Możliwy jest wyłącznie odczyt wyniku; nie ponowimy zmienionych danych
          ani nie odblokujemy sprawy na podstawie pustego odczytu.
        </p>
      )}
      {ids && (
        <button
          type="button"
          disabled={pending}
          className={buttonStyles.secondary}
          onClick={() => void recover()}
        >
          {pending ? "Sprawdzanie wyniku…" : "Sprawdź wynik korekty"}
        </button>
      )}
      {ids?.command && (
        <button
          type="button"
          disabled={pending}
          className={buttonStyles.secondary}
          onClick={() => void retry()}
        >
          Ponów ten sam zapis
        </button>
      )}
    </div>
  );
}
