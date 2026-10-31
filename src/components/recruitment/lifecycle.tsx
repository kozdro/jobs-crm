"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import {
  closureOutcomes,
  isOfferOutcome,
  parseLifecycleInput,
  type ClosureOutcome,
  type ClosureValues,
  type ClosureRevision,
  type ConfirmLifecycleInput,
  type LifecycleEntry,
  type LifecycleInput,
  type LifecyclePreview,
  type LifecycleStatus,
} from "@/modules/recruitment/domain/lifecycle";
import { warsawToday } from "@/modules/recruitment/domain/case-events";
import { CaseCreatedTime } from "./case-content";
function formatEventDay(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}
import {
  clearMatchingLifecycleIntent,
  isClosureRevision,
  isLifecycleEntry,
  isLifecyclePreview,
  lifecycleIntentStorageKey,
  lifecycleResultMatches,
  parseLifecycleIntent,
  type LifecycleIntent,
} from "./lifecycle-intent";

const endpoint = "/recruitments/lifecycle-commands";
const notification = "jobs-crm:lifecycle-intent-changed";
const storageKey = (caseId: string) => `${lifecycleIntentStorageKey}.${caseId}`;
function announce(caseId: string) {
  window.dispatchEvent(new CustomEvent(notification, { detail: { caseId } }));
}
function readPending(userId: string, caseId: string) {
  try {
    return parseLifecycleIntent(
      sessionStorage.getItem(storageKey(caseId)),
      userId,
      caseId,
    );
  } catch {
    return null;
  }
}
function clearPending(userId: string, caseId: string, requestId: string) {
  try {
    return clearMatchingLifecycleIntent(sessionStorage, storageKey(caseId), {
      ownerId: userId,
      caseId,
      requestId,
    });
  } catch {
    return true;
  }
}
async function request(userId: string, query: string | object) {
  const response = await fetch(
    typeof query === "string"
      ? `${endpoint}?${query}&expectedUserId=${userId}`
      : endpoint,
    {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(20000),
      ...(typeof query === "string"
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...query, expectedUserId: userId }),
          }),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  return {
    response,
    body:
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null,
  };
}
function login(response: Response) {
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/login");
    return true;
  }
  return false;
}
export function ClosureDisplay({ value }: { value: ClosureValues }) {
  return (
    <dl className="space-y-1 text-sm [overflow-wrap:anywhere]">
      <div>
        <dt className="inline text-muted-foreground">Wynik: </dt>
        <dd className="inline">{value.outcome}</dd>
      </div>
      <div>
        <dt className="inline text-muted-foreground">Data: </dt>
        <dd className="inline">
          {value.occurredOn
            ? formatEventDay(value.occurredOn)
            : "Data zdarzenia nieznana"}
        </dd>
      </div>
      {isOfferOutcome(value.outcome) && (
        <div>
          <dt className="inline text-muted-foreground">Oferta: </dt>
          <dd className="inline">Użytkownik potwierdził rzeczywistą ofertę</dd>
        </div>
      )}
    </dl>
  );
}

export function LifecycleForm({
  userId,
  caseId,
  operation,
  closure,
  onClose,
}: {
  userId: string;
  caseId: string;
  operation: LifecycleInput["operation"];
  closure?: LifecycleEntry;
  onClose: () => void;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<ClosureOutcome | "">(
    closure?.outcome ?? "",
  );
  const [occurredOn, setOccurredOn] = useState(closure?.occurred_on ?? "");
  const [offerConfirmed, setOfferConfirmed] = useState(false);
  const [preview, setPreview] = useState<LifecyclePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const busy = useRef(false);
  const frozen = useRef<ConfirmLifecycleInput | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const id = `lifecycle-${operation}-${closure?.id ?? caseId}`;
  const isCorrection = operation === "correct-closure";
  const isReopen = operation === "reopen";
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
    const currentEpoch = epoch.current;
    requestAnimationFrame(() => {
      if (alive.current && epoch.current === currentEpoch)
        feedback.current?.focus();
    });
  }
  function draft(): LifecycleInput | null {
    const parsed = parseLifecycleInput({
      operation,
      caseId,
      closureId: isCorrection ? (closure?.id ?? null) : null,
      outcome: isReopen ? null : outcome || null,
      occurredOn: occurredOn || null,
      offerConfirmed:
        !isReopen && isOfferOutcome(outcome) ? offerConfirmed : false,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.errors);
      report("Sprawdź oznaczone pola formularza.");
      return null;
    }
    setFieldErrors({});
    return parsed.data;
  }
  function complete(command: ConfirmLifecycleInput) {
    if (!alive.current || !clearPending(userId, caseId, command.requestId))
      return;
    announce(caseId);
    router.refresh();
    onClose();
    requestAnimationFrame(() =>
      document.getElementById("case-history-heading")?.focus(),
    );
  }
  async function showPreview(event: FormEvent) {
    event.preventDefault();
    if (busy.current || uncertain) return;
    if (readPending(userId, caseId)) {
      report(
        "Najpierw sprawdź wynik wcześniejszej zmiany cyklu. Nie rozpoczęto nowego zapisu.",
      );
      return;
    }
    const value = draft();
    if (!value) return;
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    busy.current = true;
    setPending(true);
    setError(null);
    setConfirmed(false);
    try {
      const { response, body } = await request(userId, {
        ...value,
        action: "preview",
      });
      if (!current()) return;
      if (login(response)) return;
      if (!response.ok || !isLifecyclePreview(body?.preview)) {
        report(
          response.status === 400
            ? "Nie przyjęto danych. Sprawdź wynik i potwierdzenie oferty. Wynik „Nie aplikowano” wymaga braku ważnej aplikacji w cyklu tego zakończenia."
            : "Nie udało się pobrać podglądu. Nie wykonano nowej zmiany; zachowano dane formularza.",
        );
        return;
      }
      setPreview(body.preview);
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
    if (busy.current) return;
    let command = frozen.current;
    if (!command) {
      const value = draft();
      if (!value || !preview) return;
      if (!confirmed) {
        report("Potwierdź operację oraz pokazany stan sprawy.");
        return;
      }
      if (readPending(userId, caseId)) {
        report("Najpierw sprawdź wynik wcześniejszej zmiany cyklu.");
        return;
      }
      command = {
        ...value,
        requestId: crypto.randomUUID(),
        expectedCaseRevision: preview.caseRevision,
        expectedClosureRevision: preview.closureRevision,
      };
    }
    frozen.current = command;
    try {
      sessionStorage.setItem(
        storageKey(caseId),
        JSON.stringify({
          ownerId: userId,
          caseId,
          requestId: command.requestId,
          command,
        }),
      );
    } catch {
      /* Exact in-memory retry remains available. */
    }
    announce(caseId);
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const { response, body } = await request(userId, {
        ...command,
        action: "confirm",
      });
      if (!current()) return;
      if (login(response)) return;
      if (
        response.status === 400 ||
        (response.status === 409 && body?.kind === "stale")
      ) {
        if (!clearPending(userId, caseId, command.requestId)) return;
        frozen.current = null;
        setUncertain(false);
        setPreview(null);
        setConfirmed(false);
        announce(caseId);
        report(
          response.status === 409
            ? "Sprawa lub zakończenie zmieniły się. Zachowano dane. Pobierz nowy podgląd i ponownie potwierdź zmianę."
            : "Nie przyjęto zmiany. Zachowano dane; sprawdź wynik i pobierz nowy podgląd.",
        );
        return;
      }
      if (!response.ok || !body || !lifecycleResultMatches(body, command))
        throw new Error("unconfirmed");
      complete(command);
    } catch {
      if (current()) {
        setUncertain(true);
        report(
          "Wynik zapisu jest nieznany. Zapis mógł się powieść. Sprawdź wynik lub ponów ten sam zapis; nie rozpoczynaj drugiej operacji dla tego zamiaru.",
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
    const command = frozen.current;
    if (busy.current || !command) return;
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    busy.current = true;
    setPending(true);
    try {
      const { response, body } = await request(
        userId,
        `caseId=${caseId}&requestId=${command.requestId}`,
      );
      if (!current()) return;
      if (login(response)) return;
      if (response.ok && body && lifecycleResultMatches(body, command))
        complete(command);
      else
        report(
          "Nie potwierdzono wyniku. Pusty odczyt nie oznacza cofnięcia zapisu. Sprawdź ponownie lub ponów ten sam zapis.",
        );
    } catch {
      if (current())
        report(
          "Nie można teraz sprawdzić wyniku. Zachowano ten sam zamiar zapisu.",
        );
    } finally {
      if (current()) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  const dirty = Boolean(
    outcome || occurredOn || preview || uncertain || offerConfirmed,
  );
  return (
    <form
      onSubmit={showPreview}
      noValidate
      aria-labelledby={`${id}-heading`}
      aria-busy={pending}
      className="mt-4 min-w-0 space-y-4 rounded-md border border-border bg-background p-4 sm:p-5"
    >
      <h3
        id={`${id}-heading`}
        ref={heading}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        {isCorrection
          ? "Korekta zakończenia"
          : isReopen
            ? "Wznowienie sprawy"
            : "Zakończenie sprawy"}
      </h3>
      <p className="text-sm leading-6 text-muted-foreground">
        {isCorrection
          ? "Zmienisz wynik lub dzień tego zakończenia. Oryginał i rewizje pozostaną w audycie; nie zmieni to późniejszych zakończeń ani bieżącego stanu sprawy."
          : isReopen
            ? "Kontynuujesz tę samą sprawę. Poprzednie zakończenia pozostaną w historii. Wznowienie nie rejestruje nowego aplikowania, kontaktu ani zaproszenia."
            : "Zapiszesz nowe zakończenie z wybranym wynikiem. Wcześniejsze zakończenia pozostaną w historii."}
      </p>
      {!preview && !uncertain && (
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <legend className="sr-only">Dane operacji</legend>
          {!isReopen && (
            <div className="space-y-2">
              <label
                htmlFor={`${id}-outcome`}
                className="block text-sm font-medium"
              >
                Wynik zakończenia
              </label>
              <select
                id={`${id}-outcome`}
                value={outcome}
                onChange={(event) => {
                  setOutcome(event.target.value as ClosureOutcome | "");
                  setOfferConfirmed(false);
                }}
                aria-invalid={Boolean(fieldErrors.outcome)}
                aria-describedby={`${id}-outcome-hint${fieldErrors.outcome ? ` ${id}-outcome-error` : ""}`}
                className={inputStyles}
              >
                <option value="">Wybierz wynik</option>
                {closureOutcomes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <p
                id={`${id}-outcome-hint`}
                className="text-[13px] leading-5 text-muted-foreground"
              >
                „Nie aplikowano” dotyczy cyklu tego zakończenia. Brak wpisu o
                odpowiedzi w CRM nie dowodzi, że odpowiedź nie przyszła.
              </p>
              {fieldErrors.outcome && (
                <p
                  id={`${id}-outcome-error`}
                  className="text-sm text-destructive"
                >
                  {fieldErrors.outcome}
                </p>
              )}
              {isOfferOutcome(outcome) && (
                <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={offerConfirmed}
                    onChange={(event) =>
                      setOfferConfirmed(event.target.checked)
                    }
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span>Potwierdzam, że oferta rzeczywiście była.</span>
                </label>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor={`${id}-day`} className="block text-sm font-medium">
              Data zdarzenia (opcjonalnie)
            </label>
            <p
              id={`${id}-day-hint`}
              className="text-[13px] leading-5 text-muted-foreground"
            >
              Jeśli nie znasz dnia, pozostaw pole puste. Data nieznana nie
              zostanie zastąpiona dniem dodania do CRM. Przyszły dzień nie jest
              dozwolony.
            </p>
            <input
              id={`${id}-day`}
              type="date"
              value={occurredOn}
              max={warsawToday()}
              onChange={(event) => setOccurredOn(event.target.value)}
              aria-invalid={Boolean(fieldErrors.occurredOn)}
              aria-describedby={`${id}-day-hint${fieldErrors.occurredOn ? ` ${id}-day-error` : ""}`}
              className={`${inputStyles} max-w-full sm:max-w-64`}
            />
            {fieldErrors.occurredOn && (
              <p id={`${id}-day-error`} className="text-sm text-destructive">
                {fieldErrors.occurredOn}
              </p>
            )}
          </div>
        </fieldset>
      )}
      {preview && (
        <section
          className="space-y-4"
          aria-labelledby={`${id}-preview-heading`}
        >
          <h4
            ref={previewHeading}
            id={`${id}-preview-heading`}
            tabIndex={-1}
            className="font-semibold outline-none"
          >
            Podgląd zmian
          </h4>
          {preview.before && (
            <div>
              <h5 className="mb-2 text-sm font-semibold">Przed zmianą</h5>
              <ClosureDisplay value={preview.before} />
            </div>
          )}
          {preview.after && (
            <div>
              <h5 className="mb-2 text-sm font-semibold">
                {isCorrection ? "Po zmianie" : "Nowe zakończenie"}
              </h5>
              <ClosureDisplay value={preview.after} />
            </div>
          )}
          {isReopen && (
            <p className="text-sm">
              Data wznowienia:{" "}
              {occurredOn
                ? formatEventDay(occurredOn)
                : "Data zdarzenia nieznana"}
            </p>
          )}
          <p className="text-sm leading-6 [overflow-wrap:anywhere]">
            Bieżący status po zmianie: <strong>{preview.status}</strong>.
            Bieżący etap po zmianie:{" "}
            <strong>{preview.currentStage ?? "Nie ustawiono etapu"}</strong>.
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={pending || uncertain}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>
              {isCorrection
                ? "Potwierdzam korektę zakończenia i zachowanie jego oryginału w audycie."
                : isReopen
                  ? "Potwierdzam wznowienie tej samej sprawy i pokazany stan."
                  : "Potwierdzam zakończenie sprawy i wskazany wynik."}
            </span>
          </label>
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
        {preview && !uncertain && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => void save()}
              className={buttonStyles.primary}
            >
              {pending
                ? "Zapisywanie…"
                : isCorrection
                  ? "Zatwierdź korektę zakończenia"
                  : isReopen
                    ? "Zatwierdź wznowienie"
                    : "Zatwierdź zakończenie"}
            </button>
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
          </>
        )}
        {uncertain && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => void recover()}
              className={buttonStyles.secondary}
            >
              Sprawdź wynik zapisu
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
          aria-label="Potwierdzenie porzucenia operacji"
          className="space-y-3 rounded-md border border-warning bg-warning-surface p-3 text-sm leading-6"
        >
          <p>
            {uncertain
              ? "Zamknięcie formularza nie cofa zapisu. Zachowamy dane do sprawdzenia wyniku; nie rejestruj tego samego zamiaru ponownie."
              : "Odrzucić niezapisane dane formularza?"}
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
              onClick={() => {
                announce(caseId);
                onClose();
              }}
            >
              Potwierdź porzucenie
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function LifecycleRecovery({
  userId,
  caseId,
}: {
  userId: string;
  caseId: string;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<LifecycleIntent | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const epoch = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    epoch.current += 1;
    alive.current = true;
    const mountedEpoch = epoch.current;
    const update = () => {
      if (alive.current && epoch.current === mountedEpoch)
        setIntent(readPending(userId, caseId));
    };
    queueMicrotask(update);
    window.addEventListener(notification, update);
    return () => {
      epoch.current += 1;
      alive.current = false;
      window.removeEventListener(notification, update);
    };
  }, [userId, caseId]);
  function complete(expected: LifecycleIntent, text: string) {
    if (!clearPending(userId, caseId, expected.requestId)) return;
    setIntent(null);
    setMessage(text);
    announce(caseId);
    router.refresh();
  }
  async function resolve(retry: boolean) {
    if (busy.current || !intent || (retry && !intent.command)) return;
    const saved = intent;
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    busy.current = true;
    setPending(true);
    try {
      const { response, body } = await request(
        userId,
        retry
          ? { ...saved.command, action: "confirm" }
          : `caseId=${caseId}&requestId=${saved.requestId}`,
      );
      if (!current()) return;
      if (login(response)) return;
      const matched =
        body &&
        (saved.command
          ? lifecycleResultMatches(body, saved.command)
          : (isLifecycleEntry(body.entry) &&
              body.entry.case_id === caseId &&
              body.entry.request_id === saved.requestId) ||
            (isClosureRevision(body.revision) &&
              body.revision.case_id === caseId &&
              body.revision.request_id === saved.requestId));
      if (response.ok && matched)
        complete(
          saved,
          "Potwierdzono wcześniejszy zapis. Pobieranie aktualnego stanu sprawy…",
        );
      else if (retry && response.status === 409 && body?.kind === "stale")
        complete(
          saved,
          "Poprzedni zamiar nie został zastosowany, ponieważ stan się zmienił. Pobierz nowy podgląd i potwierdź operację.",
        );
      else
        setMessage(
          "Nie potwierdzono wyniku. Pusty odczyt nie oznacza cofnięcia zapisu. Zachowano ten sam zamiar.",
        );
    } catch {
      if (current())
        setMessage(
          "Nie można teraz ustalić wyniku zapisu. Zachowano te same dane do sprawdzenia lub ponowienia.",
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
      {(intent || message) && (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {message ??
            "Zachowano poprzedni zamiar zmiany cyklu. Sprawdź jego wynik przed nową operacją."}
        </p>
      )}
      {intent && !intent.command && (
        <p className="text-sm leading-6 text-warning">
          Dostępny jest wyłącznie odczyt wyniku. Nie ponowimy nieprawidłowego
          ani zmienionego payloadu.
        </p>
      )}
      {intent && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void resolve(false)}
            className={buttonStyles.secondary}
          >
            Sprawdź wcześniejszy zapis cyklu
          </button>
          {intent.command && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void resolve(true)}
              className={buttonStyles.secondary}
            >
              Ponów wcześniejszy zapis cyklu
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LifecycleActions({
  userId,
  caseId,
  status,
}: {
  userId: string;
  caseId: string;
  status: LifecycleStatus;
}) {
  const [active, setActive] = useState<"close" | "reopen" | null>(null);
  const [error, setError] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setActive(null);
    requestAnimationFrame(() => trigger.current?.focus());
    announce(caseId);
  }
  return (
    <section
      className="ui-panel mt-5 min-w-0 p-5 sm:p-6"
      aria-labelledby="case-lifecycle-heading"
    >
      <h2 id="case-lifecycle-heading" className="text-lg font-semibold">
        Zakończenie i kontynuacja
      </h2>
      {!active && (
        <>
          <LifecycleRecovery
            key={`${userId}:${caseId}`}
            userId={userId}
            caseId={caseId}
          />
          <button
            ref={trigger}
            type="button"
            className={`${buttonStyles.secondary} mt-4`}
            onClick={() => {
              if (readPending(userId, caseId)) {
                setError(true);
                return;
              }
              setError(false);
              setActive(status === "Zakończone" ? "reopen" : "close");
            }}
          >
            {status === "Zakończone" ? "Wznów sprawę" : "Zakończ sprawę"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          Najpierw sprawdź wynik wcześniejszej zmiany cyklu. Nie rozpoczęto
          nowej operacji.
        </p>
      )}
      {active && (
        <LifecycleForm
          key={`${userId}:${caseId}:${active}`}
          userId={userId}
          caseId={caseId}
          operation={active}
          onClose={close}
        />
      )}
    </section>
  );
}

function ClosureAudit({
  userId,
  caseId,
  entry,
}: {
  userId: string;
  caseId: string;
  entry: LifecycleEntry;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [revisions, setRevisions] = useState<ClosureRevision[] | null>(null);
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
    if (busy.current) return;
    const requestEpoch = epoch.current;
    const current = () => alive.current && epoch.current === requestEpoch;
    busy.current = true;
    setOpen(true);
    setPending(true);
    setError(false);
    try {
      const { response, body } = await request(
        userId,
        `caseId=${caseId}&closureId=${entry.id}`,
      );
      if (!current()) return;
      if (login(response)) return;
      if (
        !response.ok ||
        !Array.isArray(body?.revisions) ||
        !body.revisions.every(
          (value) =>
            isClosureRevision(value) &&
            value.case_id === caseId &&
            value.closure_id === entry.id,
        )
      )
        throw new Error("unavailable");
      setRevisions(body.revisions as ClosureRevision[]);
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
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : void load())}
        className="ui-link min-h-11 py-2 text-sm"
      >
        {open ? "Ukryj audyt zakończenia" : "Pokaż audyt zakończenia"}
      </button>
      {open && (
        <section
          aria-label="Audyt zakończenia"
          className="mt-2 min-w-0 space-y-4 rounded-md border border-border p-4"
        >
          <h4 className="font-semibold">Audyt zakończenia</h4>
          {entry.original && (
            <div>
              <h5 className="mb-2 text-sm font-semibold">
                Oryginalne zakończenie
              </h5>
              <ClosureDisplay value={entry.original} />
              <p className="mt-2 text-[13px] text-muted-foreground">
                Właściciel tej sprawy ·{" "}
                <CaseCreatedTime value={entry.recorded_at} />
              </p>
            </div>
          )}
          {pending ? (
            <p role="status" className="text-sm">
              Pobieranie audytu…
            </p>
          ) : error ? (
            <>
              <p role="alert" className="text-sm text-destructive">
                Nie udało się pobrać audytu. To nie oznacza braku korekt.
              </p>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => void load()}
              >
                Ponów odczyt audytu zakończenia
              </button>
            </>
          ) : !revisions?.length ? (
            <p className="text-sm text-muted-foreground">
              Nie zarejestrowano korekt tego zakończenia.
            </p>
          ) : (
            <ol className="space-y-4">
              {revisions.map((value) => (
                <li
                  key={value.id}
                  className="space-y-3 border-t border-border pt-3"
                >
                  <p className="text-sm font-semibold">
                    Korekta · wersja {value.revision}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Właściciel tej sprawy ·{" "}
                    <CaseCreatedTime value={value.recorded_at} />
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h5 className="mb-2 text-sm font-semibold">
                        Poprzednie wartości
                      </h5>
                      <ClosureDisplay value={value.before} />
                    </div>
                    <div>
                      <h5 className="mb-2 text-sm font-semibold">
                        Zapisane wartości
                      </h5>
                      <ClosureDisplay value={value.after} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
export function LifecycleHistoryEntry({
  entry,
  userId,
  caseId,
  editing,
  disabled,
  onEdit,
  onClose,
}: {
  entry: LifecycleEntry;
  userId?: string;
  caseId: string;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <li id={`history-entry-${entry.id}`} className="min-w-0 py-4 first:pt-0">
      <p className="text-sm font-semibold">
        {entry.kind === "close" ? "Zakończono sprawę" : "Wznowiono sprawę"}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Cykl {entry.cycle + 1}
      </p>
      {entry.kind === "close" && entry.outcome && (
        <p className="mt-2 text-sm [overflow-wrap:anywhere]">
          Wynik: <strong>{entry.outcome}</strong>
        </p>
      )}
      {entry.revision > 0 && (
        <p className="mt-1 text-[13px] text-muted-foreground">
          Skorygowano — oryginalne zakończenie i wcześniejsze wartości pozostają
          w audycie.
        </p>
      )}
      {entry.occurred_on && (
        <p className="mt-1 text-sm text-muted-foreground">
          Data zdarzenia:{" "}
          <time dateTime={entry.occurred_on}>
            {formatEventDay(entry.occurred_on)}
          </time>
        </p>
      )}
      <details className="mt-1">
        <summary className="ui-link min-h-11 cursor-pointer py-3 text-[13px]">
          Szczegóły rejestracji
        </summary>
        <p className="text-[13px] text-muted-foreground">
          Dodano do CRM: <CaseCreatedTime value={entry.recorded_at} />
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
          Stan przed operacją: {entry.previous_status}; etap:{" "}
          {entry.previous_stage ?? "Nie ustawiono etapu"}. Stan po operacji:{" "}
          {entry.resulting_status}; etap:{" "}
          {entry.resulting_stage ?? "Nie ustawiono etapu"}. To oryginalny
          kontekst operacji, nie potwierdzenie bieżącego stanu.
        </p>
      </details>
      {userId && entry.kind === "close" && (
        <>
          {!editing && (
            <button
              ref={trigger}
              type="button"
              disabled={disabled}
              onClick={onEdit}
              className="ui-link min-h-11 py-2 text-sm"
            >
              Skoryguj zakończenie
            </button>
          )}
          {editing && (
            <LifecycleForm
              key={`${userId}:${entry.id}:correction`}
              userId={userId}
              caseId={caseId}
              operation="correct-closure"
              closure={entry}
              onClose={() => {
                onClose();
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            />
          )}
          <ClosureAudit
            key={`${userId}:${entry.id}:${entry.revision}`}
            userId={userId}
            caseId={caseId}
            entry={entry}
          />
        </>
      )}
    </li>
  );
}
