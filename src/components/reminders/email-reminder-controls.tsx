"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonStyles } from "@/components/tasks/styles";

type View = { enabled: boolean; email: string | null; verified: boolean };
type Intent = {
  expectedUserId: string;
  requestId: string;
  taskId: string;
  configurationId: string;
  operation: "enable" | "disable";
};

export function isEmailReminderView(value: unknown): value is View {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.enabled === "boolean" &&
    typeof v.verified === "boolean" &&
    (v.email === null || typeof v.email === "string") &&
    (v.verified
      ? typeof v.email === "string" && v.email.length > 0
      : v.email === null)
  );
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
  const read = useCallback(async () => {
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
  }, [userId, taskId, configurationId]);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await read();
      if (mounted.current) {
        setView(data);
        setError(null);
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
  }, [read]);
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
        if (current.enabled === (intent.operation === "enable")) {
          frozen.current = null;
          setUncertain(false);
          return;
        }
      }
      const response = await fetch("/reminders/email", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
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
        await reload();
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
    } catch {
      if (mounted.current) {
        setUncertain(true);
        setError(
          "Wynik zapisu jest nieznany. Sprawdź stan i ponów ten sam zapis. Po zamknięciu widoku zamiar nie zostanie zachowany.",
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const start = (operation: Intent["operation"]) => {
    if (busy || uncertain || frozen.current) return;
    const intent: Intent = Object.freeze({
      expectedUserId: userId,
      requestId: crypto.randomUUID(),
      taskId,
      configurationId,
      operation,
    });
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
            Kanał e-mail: {view.enabled ? "włączony" : "wyłączony"}.
          </p>
          {view.enabled ? (
            <button
              type="button"
              className={`${buttonStyles.secondary} mt-3`}
              disabled={busy || uncertain}
              onClick={() => start("disable")}
            >
              Wyłącz e-mail dla przypomnienia
            </button>
          ) : (
            <button
              type="button"
              className={`${buttonStyles.secondary} mt-3`}
              disabled={busy || uncertain || !view.verified}
              onClick={() => start("enable")}
            >
              Włącz e-mail dla przypomnienia
            </button>
          )}
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
