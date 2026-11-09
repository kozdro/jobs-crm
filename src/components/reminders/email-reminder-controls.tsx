"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonStyles } from "@/components/tasks/styles";

const emailStates = [
  "off",
  "pending",
  "queued",
  "dispatching",
  "accepted",
  "unknown",
  "cancelled",
  "expired",
  "failed",
] as const;
type EmailState = (typeof emailStates)[number];
type View = {
  enabled: boolean;
  email: string | null;
  verified: boolean;
  consentVersion: string;
  state: EmailState;
};
type Intent = {
  expectedUserId: string;
  requestId: string;
  taskId: string;
  configurationId: string;
  operation: "enable" | "disable";
  consentVersion?: string;
};

const stateLabels: Record<EmailState, string> = {
  off: "wyłączony",
  pending: "oczekuje na wysyłkę",
  queued: "oczekuje na wysyłkę",
  dispatching: "przekazywanie do dostawcy",
  accepted: "przyjęty przez dostawcę",
  unknown: "wynik wysyłki nieustalony",
  cancelled: "wyłączony",
  expired: "pominięty z powodu opóźnienia",
  failed: "wysyłka nie powiodła się",
};

export function emailReminderAction(view: View): "enable" | "disable" | null {
  if ((view.state === "off" || view.state === "cancelled") && view.verified)
    return "enable";
  if (view.state === "pending" || view.state === "queued") return "disable";
  return null;
}

export function createEmailReminderIntent(
  view: View,
  base: Omit<Intent, "consentVersion" | "operation">,
  operation: Intent["operation"],
): Intent | null {
  if (emailReminderAction(view) !== operation) return null;
  return Object.freeze({
    ...base,
    operation,
    ...(operation === "enable" ? { consentVersion: view.consentVersion } : {}),
  });
}

export function isEmailReminderView(value: unknown): value is View {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === "boolean" &&
    typeof v.verified === "boolean" &&
    typeof v.consentVersion === "string" &&
    v.consentVersion.length > 0 &&
    typeof v.state === "string" &&
    emailStates.includes(v.state as EmailState) &&
    (v.email === null || typeof v.email === "string") &&
    (v.verified
      ? typeof v.email === "string" && v.email.length > 0
      : v.email === null)
  );
}

export function handleEmailRetryFailure(
  reason: unknown,
  onUnauthenticated: () => void,
  onUncertain: () => void,
) {
  if (reason instanceof Error && reason.message === "auth") {
    onUnauthenticated();
  } else {
    onUncertain();
  }
}

export async function readEmailReminder(
  userId: string,
  taskId: string,
  configurationId: string,
): Promise<View> {
  const params = new URLSearchParams({
    expectedUserId: userId,
    taskId,
    configurationId,
  });
  const response = await fetch(`/reminders/email?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("auth");
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok || !isEmailReminderView(value))
    throw new Error("unavailable");
  return value;
}

export function EmailReminderControls({
  userId,
  taskId,
  configurationId,
  onActivityChange,
}: {
  userId: string;
  taskId: string;
  configurationId: string;
  onActivityChange: (active: boolean) => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(false);
  const frozen = useRef<Intent | null>(null);
  const inFlight = useRef(false);
  const read = useCallback(
    () => readEmailReminder(userId, taskId, configurationId),
    [userId, taskId, configurationId],
  );
  const reload = useCallback(
    async (preserveError = false) => {
      setLoading(true);
      try {
        const data = await read();
        if (mounted.current) {
          setView(data);
          if (!preserveError) setError(null);
        }
      } catch (reason) {
        if (mounted.current) {
          if (reason instanceof Error && reason.message === "auth")
            window.location.replace("/login");
          setView(null);
          setError("Nie udało się pobrać ustawienia e-maila.");
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [read],
  );
  useEffect(() => {
    mounted.current = true;
    void read()
      .then((data) => {
        if (!mounted.current) return;
        setView(data);
        setError(null);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!mounted.current) return;
        if (reason instanceof Error && reason.message === "auth")
          window.location.replace("/login");
        setView(null);
        setError("Nie udało się pobrać ustawienia e-maila.");
        setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [read]);
  useEffect(() => {
    onActivityChange(busy || uncertain);
    return () => onActivityChange(false);
  }, [busy, uncertain, onActivityChange]);
  const execute = async (intent: Intent, reconcile: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (reconcile) {
        const current = await read();
        if (!mounted.current) return;
        setView(current);
      }
      const response = await fetch("/reminders/email", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      if (!mounted.current) return;
      if (response.status === 401 || response.status === 403) {
        window.location.replace("/login");
        return;
      }
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok && response.status < 500) {
        frozen.current = null;
        setUncertain(false);
        setError(
          "Nie udało się zapisać. Dane mogły się zmienić; odśwież widok i spróbuj ponownie.",
        );
        await reload(true);
        return;
      }
      if (
        !response.ok ||
        !value ||
        typeof value !== "object" ||
        !("kind" in value) ||
        (value.kind !== "created" && value.kind !== "replayed")
      )
        throw new Error("uncertain");
      frozen.current = null;
      setUncertain(false);
      await reload();
    } catch (reason) {
      if (mounted.current) {
        handleEmailRetryFailure(
          reason,
          () => window.location.replace("/login"),
          () => {
            setUncertain(true);
            setError(
              "Wynik zapisu jest nieznany. Sprawdź stan i ponów ten sam zapis. Po zamknięciu widoku zamiar nie zostanie zachowany.",
            );
          },
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const start = (operation: Intent["operation"]) => {
    if (busy || uncertain || frozen.current || !view) return;
    const intent = createEmailReminderIntent(
      view,
      {
        expectedUserId: userId,
        requestId: crypto.randomUUID(),
        taskId,
        configurationId,
      },
      operation,
    );
    if (!intent) return;
    frozen.current = intent;
    void execute(intent, false);
  };
  return (
    <section
      aria-label="Przypomnienie e-mail"
      className="mt-4 border-t border-border pt-4"
    >
      <h5 className="text-sm font-semibold">Przypomnienie e-mail</h5>
      <p className="mt-1 text-sm text-muted-foreground">
        Opcjonalna wiadomość nie zawiera danych rekrutacyjnych. Zmiana lub
        utrata weryfikacji adresu wstrzymuje wysyłkę i wymaga ponownego
        włączenia.
      </p>
      {loading && (
        <p role="status" className="mt-2 text-sm">
          Wczytywanie ustawienia e-maila…
        </p>
      )}
      {view && !loading && (
        <>
          {view.verified && view.email ? (
            <p className="mt-2 text-sm">Zweryfikowany adres: {view.email}</p>
          ) : (
            <p className="mt-2 text-sm" role="status">
              Brak zweryfikowanego adresu konta. Włączanie e-maila jest
              niedostępne.
            </p>
          )}
          <p className="mt-2 text-sm">
            Kanał e-mail: {stateLabels[view.state]}.
          </p>
          {emailReminderAction(view) === "disable" ? (
            <button
              type="button"
              className={`${buttonStyles.secondary} mt-3`}
              disabled={busy || uncertain}
              onClick={() => start("disable")}
            >
              Wyłącz e-mail dla przypomnienia
            </button>
          ) : emailReminderAction(view) === "enable" ? (
            <button
              type="button"
              className={`${buttonStyles.secondary} mt-3`}
              disabled={busy || uncertain || !view.verified}
              onClick={() => start("enable")}
            >
              Włącz e-mail dla przypomnienia
            </button>
          ) : null}
        </>
      )}
      {busy && (
        <p role="status" className="mt-2 text-sm">
          Zapisywanie…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {uncertain && (
        <button
          type="button"
          className={`${buttonStyles.secondary} mt-3`}
          disabled={busy}
          onClick={() => {
            if (frozen.current) void execute(frozen.current, true);
          }}
        >
          Sprawdź stan i ponów ten sam zapis
        </button>
      )}
      {!view && !loading && !uncertain && (
        <button
          type="button"
          className={`${buttonStyles.secondary} mt-3`}
          onClick={() => void reload()}
        >
          Ponów odczyt
        </button>
      )}
    </section>
  );
}
