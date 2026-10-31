"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { getRecruitmentCase } from "@/modules/recruitment/application/cases";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";
import { getRecruitmentCaseEventByRequestId } from "@/modules/recruitment/application/case-events";
import {
  parseRecordCaseEventInput,
  warsawToday,
  type RecordCaseEventInput,
  type CaseEvent,
} from "@/modules/recruitment/domain/case-events";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import {
  eventIntentStorageKey,
  parsePendingEventIntent,
  eventMatchesIntent,
  confirmedStageRevision,
} from "./event-intent";
import { recoveryRequiresLogin } from "./recovery-session";

type Kind = RecordCaseEventInput["kind"];
type EventFormProps = {
  userId: string;
  caseId: string;
  status: RecruitmentCase["status"];
  stageVersion: number;
};
type Direction = "inbound" | "outbound" | "";
export function CaseEventForm({
  userId,
  caseId,
  status,
  stageVersion,
}: EventFormProps) {
  return (
    <EventSession
      key={`${userId}:${caseId}`}
      userId={userId}
      caseId={caseId}
      status={status}
      stageVersion={stageVersion}
    />
  );
}
function EventSession({
  userId,
  caseId,
  status,
  stageVersion,
}: EventFormProps) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [direction, setDirection] = useState<Direction>("");
  const [occurredOn, setOccurredOn] = useState("");
  const [stageName, setStageName] = useState("");
  const [stageConflict, setStageConflict] = useState(false);
  const [refreshedStage, setRefreshedStage] = useState<string | null>(null);
  const observedVersion = useRef(stageVersion);
  const confirmedVersion = useRef(stageVersion);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertainId, setUncertainId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<"direction" | "occurredOn" | "confirmed" | "stageName", string>
    >
  >({});
  const [canRetry, setCanRetry] = useState(false);
  const [success, setSuccess] = useState(false);
  const [discard, setDiscard] = useState(false);
  const frozen = useRef<RecordCaseEventInput | null>(null);
  const busy = useRef(false);
  const live = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const applicationTrigger = useRef<HTMLButtonElement>(null);
  const contactTrigger = useRef<HTMLButtonElement>(null);
  const invitationTrigger = useRef<HTMLButtonElement>(null);
  const stageTrigger = useRef<HTMLButtonElement>(null);
  const stageAction = kind === "invitation" || kind === "stage-change";
  const triggerKind = useRef<Kind>("application");
  function returnFocus() {
    const trigger = {
      application: applicationTrigger,
      contact: contactTrigger,
      invitation: invitationTrigger,
      "stage-change": stageTrigger,
    }[triggerKind.current];
    requestAnimationFrame(() => trigger.current?.focus());
  }
  const storageKey = `${eventIntentStorageKey}.${caseId}`;

  function clearStored() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Memory retry remains available. */
    }
  }
  function remember(requestId: string) {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ ownerId: userId, caseId, requestId }),
      );
    } catch {
      /* Reload recovery requires storage. */
    }
  }
  function focusFeedback() {
    requestAnimationFrame(() => feedback.current?.focus());
  }
  function requireLogin() {
    window.location.replace("/login");
  }
  function reset() {
    setKind(null);
    setDirection("");
    setOccurredOn("");
    setStageName("");
    setStageConflict(false);
    setRefreshedStage(null);
    setConfirmed(false);
    setUncertainId(null);
    setError(null);
    setFieldErrors({});
    setDiscard(false);
    frozen.current = null;
    setCanRetry(false);
  }
  function finish(event: CaseEvent) {
    confirmedVersion.current = confirmedStageRevision(
      confirmedVersion.current,
      event,
    );
    clearStored();
    reset();
    setSuccess(true);
    router.refresh();
    returnFocus();
  }
  async function recover(requestId: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const identity = await client.auth.getUser();
      if (!live.current) return;
      if (identity.error && !recoveryRequiresLogin(identity.error))
        throw new Error("unavailable");
      if (identity.error || identity.data.user?.id !== userId) {
        requireLogin();
        return;
      }
      const found = await getRecruitmentCaseEventByRequestId(
        client,
        caseId,
        requestId,
      );
      if (!live.current) return;
      if (found) {
        const original = frozen.current;
        if (original && !eventMatchesIntent(found, original)) {
          setCanRetry(false);
          setError(
            "Ten identyfikator dotyczy wcześniejszego zdarzenia z innymi danymi. Niczego nie nadpisano. Sprawdź historię; porzucenie formularza nie usuwa wcześniejszego wpisu.",
          );
          focusFeedback();
        } else finish(found);
      } else {
        setError(
          "Nie potwierdzono wyniku poprzedniego zapisu. Brak wpisu w odczycie nie oznacza cofnięcia operacji. Sprawdź ponownie lub ponów zapis tych samych danych, jeśli formularz nadal je przechowuje.",
        );
        focusFeedback();
      }
    } catch {
      if (live.current) {
        setError(
          "Nie można teraz sprawdzić wyniku. Zachowano identyfikator zapisu; spróbuj ponownie.",
        );
        focusFeedback();
      }
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  }
  useEffect(() => {
    live.current = true;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(storageKey);
    } catch {
      /* Optional recovery storage. */
    }
    const intent = parsePendingEventIntent(stored, userId, caseId);
    if (intent)
      void Promise.resolve().then(() => {
        if (!live.current) return;
        setUncertainId(intent.requestId);
        void recover(intent.requestId);
      });
    return () => {
      live.current = false;
    };
    // Recovery is bound to this keyed account/case lifetime, not render changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, caseId, storageKey]);

  function open(value: Kind) {
    if (busy.current || uncertainId) return;
    triggerKind.current = value;
    // Never regress a locally confirmed revision while the RSC refresh settles.
    // An already open draft retains its own observed revision until explicit refresh.
    observedVersion.current = Math.max(stageVersion, confirmedVersion.current);
    setStageConflict(false);
    setRefreshedStage(null);
    setKind(value);
    setSuccess(false);
    setError(null);
    setFieldErrors({});
    requestAnimationFrame(() => heading.current?.focus());
  }
  function cancel() {
    if (direction || occurredOn || stageName || confirmed || uncertainId) {
      setDiscard(true);
      return;
    }
    reset();
    returnFocus();
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current) return;
    let payload = frozen.current;
    if (!payload) {
      const errors: typeof fieldErrors = {};
      if (kind === "contact" && !direction)
        errors.direction = "Wybierz kierunek rzeczywistego kontaktu.";
      if (!confirmed)
        errors.confirmed =
          "Potwierdź, że zdarzenie rzeczywiście miało miejsce.";
      const parsed = parseRecordCaseEventInput({
        requestId: crypto.randomUUID(),
        caseId,
        kind,
        direction: kind === "contact" ? direction : null,
        occurredOn: occurredOn || null,
        ...(stageAction
          ? { stageName, expectedStageVersion: observedVersion.current }
          : {}),
      });
      if (!parsed.success) {
        if (parsed.errors.occurredOn)
          errors.occurredOn = parsed.errors.occurredOn;
        if (parsed.errors.stageName) errors.stageName = parsed.errors.stageName;
        if (!Object.keys(errors).length)
          setError("Sprawdź rodzaj zdarzenia i dane formularza.");
      }
      setFieldErrors(errors);
      if (!parsed.success || Object.keys(errors).length) {
        focusFeedback();
        return;
      }
      payload = parsed.data;
    }
    frozen.current = payload;
    setCanRetry(true);
    remember(payload.requestId);
    busy.current = true;
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch("/recruitments/commands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          action: "record-event",
          expectedUserId: userId,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!live.current) return;
      if (response.status === 401 || response.status === 403) {
        requireLogin();
        return;
      }
      if (response.status === 400) {
        frozen.current = null;
        setCanRetry(false);
        clearStored();
        setUncertainId(null);
        const body = await response.json().catch(() => null);
        setFieldErrors(body?.errors ?? {});
        setError(
          "Dane nie zostały przyjęte. Sprawdź formularz i spróbuj ponownie.",
        );
        focusFeedback();
        return;
      }
      if (response.status === 409) {
        const body = await response.json().catch(() => null);
        setStageConflict(
          body?.kind === "stale" &&
            (payload.kind === "invitation" || payload.kind === "stage-change"),
        );
        setUncertainId(payload.requestId);
        setCanRetry(false);
        setError(
          "Stan sprawy zmienił się lub identyfikator dotyczy wcześniejszego zapisu. Niczego nie nadpisano. Sprawdź wynik; przed nowym potwierdzeniem etapu odśwież stan sprawy.",
        );
        focusFeedback();
        return;
      }
      if (!response.ok) throw new Error("unconfirmed");
      const result = await response.json();
      if (
        (result.kind !== "created" && result.kind !== "replayed") ||
        !result.event?.id ||
        !eventMatchesIntent(result.event, payload)
      )
        throw new Error("unconfirmed");
      finish(result.event);
    } catch {
      if (live.current) {
        setUncertainId(payload.requestId);
        setError(
          "Wynik zapisu jest nieznany. Zdarzenie mogło już zostać zapisane. Sprawdź wynik lub ponów te same dane; nie twórz kolejnego wpisu dla tego samego faktu.",
        );
        focusFeedback();
      }
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  }
  async function refreshStage() {
    if (busy.current || !uncertainId || !stageConflict) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const identity = await client.auth.getUser();
      if (!live.current) return;
      if (identity.error && !recoveryRequiresLogin(identity.error))
        throw new Error("unavailable");
      if (identity.error || identity.data.user?.id !== userId) {
        requireLogin();
        return;
      }
      const found = await getRecruitmentCaseEventByRequestId(
        client,
        caseId,
        uncertainId,
      );
      if (!live.current) return;
      if (found) {
        if (frozen.current && eventMatchesIntent(found, frozen.current))
          finish(found);
        else
          setError(
            "Ten identyfikator dotyczy wcześniejszego zdarzenia z innymi danymi. Sprawdź historię; porzucenie formularza nie usuwa wcześniejszego wpisu.",
          );
        return;
      }
      const current = await getRecruitmentCase(client, caseId);
      if (!live.current) return;
      if (!current) throw new Error("unavailable");
      confirmedVersion.current = Math.max(
        confirmedVersion.current,
        current.stage_version,
      );
      observedVersion.current = current.stage_version;
      setRefreshedStage(current.current_stage);
      frozen.current = null;
      clearStored();
      setUncertainId(null);
      setStageConflict(false);
      setCanRetry(false);
      setConfirmed(false);
      setError(
        "Odświeżono stan sprawy. Sprawdź bieżący etap i ponownie potwierdź zamierzoną zmianę. Żaden nowy zapis nie został wykonany.",
      );
      router.refresh();
    } catch {
      if (live.current)
        setError(
          "Nie można teraz odświeżyć stanu sprawy. Zachowano dane i identyfikator zapisu.",
        );
    } finally {
      busy.current = false;
      if (live.current) {
        setPending(false);
        focusFeedback();
      }
    }
  }
  const locked = pending || Boolean(uncertainId);
  return (
    <section
      className="ui-panel mt-5 min-w-0 p-5 sm:p-6"
      aria-labelledby="case-actions-heading"
    >
      <h2 id="case-actions-heading" className="text-lg font-semibold">
        Działania w sprawie
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Odnotuj fakt, który już miał miejsce. Rejestracja nie wysyła wiadomości
        ani aplikacji.
      </p>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          success ? "mt-4 text-sm font-medium text-success" : undefined
        }
      >
        {success ? "Zdarzenie zostało zapisane." : ""}
      </div>
      {!kind && !uncertainId && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            ref={applicationTrigger}
            type="button"
            className={buttonStyles.secondary}
            onClick={() => open("application")}
          >
            Zarejestruj aplikowanie
          </button>
          <button
            ref={contactTrigger}
            type="button"
            className={buttonStyles.secondary}
            onClick={() => open("contact")}
          >
            Zarejestruj kontakt
          </button>
          <button
            ref={invitationTrigger}
            type="button"
            className={buttonStyles.secondary}
            onClick={() => open("invitation")}
          >
            Zarejestruj zaproszenie
          </button>
          {status === "W rekrutacji" && (
            <button
              ref={stageTrigger}
              type="button"
              className={buttonStyles.secondary}
              onClick={() => open("stage-change")}
            >
              Zmień etap
            </button>
          )}
        </div>
      )}
      {(kind || uncertainId) && (
        <form
          onSubmit={(event) => void save(event)}
          noValidate
          aria-labelledby="event-form-heading"
          aria-busy={pending}
          className="mt-5 max-w-xl space-y-5"
        >
          <h3
            id="event-form-heading"
            ref={heading}
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            {kind === "application"
              ? "Zarejestruj aplikowanie"
              : kind === "contact"
                ? "Zarejestruj kontakt"
                : kind === "invitation"
                  ? "Zarejestruj zaproszenie"
                  : kind === "stage-change"
                    ? "Zmień etap"
                    : "Sprawdź poprzedni zapis zdarzenia"}
          </h3>
          <p className="rounded-md border border-warning bg-warning-surface p-3 text-sm leading-6 text-warning">
            W tym przyroście zapisanych zdarzeń nie można edytować ani usuwać.
            Sprawdź dane przed potwierdzeniem.
          </p>
          {kind && (
            <>
              {kind === "contact" && (
                <fieldset
                  disabled={locked}
                  aria-describedby={
                    fieldErrors.direction ? "event-direction-error" : undefined
                  }
                  className="space-y-2"
                >
                  <legend className="mb-2 text-sm font-medium">
                    Kierunek kontaktu
                  </legend>
                  {(
                    [
                      ["inbound", "Kontakt przychodzący (inbound)"],
                      ["outbound", "Kontakt wychodzący (outbound)"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-11 items-center gap-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="event-direction"
                        value={value}
                        checked={direction === value}
                        onChange={() => setDirection(value)}
                        className="size-4 accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                  {fieldErrors.direction && (
                    <p
                      id="event-direction-error"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.direction}
                    </p>
                  )}
                </fieldset>
              )}
              {stageAction && (
                <div className="space-y-2">
                  <label
                    htmlFor="event-stage"
                    className="block text-sm font-medium"
                  >
                    Nazwa etapu
                  </label>
                  <p
                    id="event-stage-hint"
                    className="text-[13px] leading-5 text-muted-foreground"
                  >
                    {kind === "invitation"
                      ? "Zaproszenie musi dotyczyć oceny kwalifikacji, np. rozmowy lub zadania. Samo potwierdzenie otrzymania aplikacji nie wystarcza. "
                      : "Odnotuj rzeczywiste przejście do etapu; możesz pominąć etapy pośrednie. Nie tworzymy nowego zaproszenia. "}
                    Wskazany etap zostanie ustawiony jako bieżący. Data wsteczna
                    nie odtwarza wcześniejszego stanu.
                  </p>
                  <input
                    id="event-stage"
                    type="text"
                    value={stageName}
                    onChange={(event) => setStageName(event.target.value)}
                    disabled={locked}
                    aria-invalid={Boolean(fieldErrors.stageName)}
                    aria-describedby={`event-stage-hint event-stage-count${fieldErrors.stageName ? " event-stage-error" : ""}`}
                    className={inputStyles}
                  />
                  <p
                    id="event-stage-count"
                    className="text-[13px] text-muted-foreground"
                  >
                    {Array.from(stageName.trim()).length}/160 znaków po
                    usunięciu skrajnych odstępów
                  </p>
                  {refreshedStage !== null && (
                    <p className="text-sm text-muted-foreground">
                      Bieżący etap po odświeżeniu:{" "}
                      <span className="font-medium [overflow-wrap:anywhere]">
                        {refreshedStage}
                      </span>
                    </p>
                  )}
                  {fieldErrors.stageName && (
                    <p
                      id="event-stage-error"
                      className="text-sm text-destructive"
                    >
                      {fieldErrors.stageName}
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <label
                  htmlFor="event-date"
                  className="block text-sm font-medium"
                >
                  Data zdarzenia (opcjonalnie)
                </label>
                <p
                  id="event-date-hint"
                  className="text-[13px] leading-5 text-muted-foreground"
                >
                  {kind === "invitation"
                    ? "Podaj dzień otrzymania zaproszenia, a nie przyszły termin rozmowy. "
                    : kind === "stage-change"
                      ? "Podaj dzień rzeczywistego przejścia do etapu. "
                      : ""}
                  Jeśli nie znasz daty, pozostaw pole puste. Zapiszemy „Data
                  zdarzenia nieznana”, bez zastępowania jej dniem dodania do
                  CRM. Przyszła data nie jest dozwolona.
                </p>
                <input
                  id="event-date"
                  type="date"
                  value={occurredOn}
                  onChange={(event) => setOccurredOn(event.target.value)}
                  max={warsawToday()}
                  disabled={locked}
                  aria-invalid={Boolean(fieldErrors.occurredOn)}
                  aria-describedby={`event-date-hint${fieldErrors.occurredOn ? " event-date-error" : ""}`}
                  className={`${inputStyles} max-w-full sm:max-w-64`}
                />
                {fieldErrors.occurredOn && (
                  <p id="event-date-error" className="text-sm text-destructive">
                    {fieldErrors.occurredOn}
                  </p>
                )}
              </div>
              <div>
                <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    disabled={locked}
                    aria-invalid={Boolean(fieldErrors.confirmed)}
                    aria-describedby={
                      fieldErrors.confirmed
                        ? "event-confirmed-error"
                        : undefined
                    }
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    {kind === "invitation"
                      ? "Potwierdzam otrzymanie zaproszenia do etapu kwalifikacyjnego i ustawienie wskazanego etapu jako bieżącego."
                      : kind === "stage-change"
                        ? "Potwierdzam rzeczywiste przejście do wskazanego etapu i ustawienie go jako bieżącego."
                        : "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce."}
                  </span>
                </label>
                {fieldErrors.confirmed && (
                  <p
                    id="event-confirmed-error"
                    className="mt-1 text-sm text-destructive"
                  >
                    {fieldErrors.confirmed}
                  </p>
                )}
              </div>
            </>
          )}
          {(error || Object.keys(fieldErrors).length > 0) && (
            <p
              ref={feedback}
              role="alert"
              tabIndex={-1}
              className="rounded-md border border-destructive bg-destructive-surface p-3 text-sm leading-6 text-destructive outline-none focus:ring-2 focus:ring-ring"
            >
              {error ?? "Sprawdź oznaczone pola formularza."}
            </p>
          )}
          {uncertainId && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void recover(uncertainId)}
              className={buttonStyles.secondary}
            >
              Sprawdź wynik zapisu
            </button>
          )}
          {stageConflict && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void refreshStage()}
              className={buttonStyles.secondary}
            >
              Odśwież stan sprawy
            </button>
          )}
          <div className="flex flex-wrap gap-3">
            {kind && (!uncertainId || canRetry) && (
              <button
                type="submit"
                disabled={pending}
                className={buttonStyles.primary}
              >
                {pending
                  ? "Zapisywanie…"
                  : uncertainId
                    ? "Ponów ten sam zapis"
                    : "Zapisz zdarzenie"}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={cancel}
              className={buttonStyles.secondary}
            >
              {uncertainId ? "Porzuć ten zapis" : "Anuluj"}
            </button>
          </div>
          {discard && (
            <div
              className="space-y-3 rounded-md border border-warning bg-warning-surface p-4 text-sm leading-6 text-warning"
              role="group"
              aria-label="Potwierdzenie porzucenia formularza"
            >
              <p>
                {uncertainId
                  ? "Porzucenie formularza nie cofa zapisu. Zdarzenie mogło zostać zapisane. Sprawdź historię przed ponownym rejestrowaniem tego samego faktu."
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
                    clearStored();
                    reset();
                    returnFocus();
                  }}
                >
                  Potwierdź porzucenie
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
