"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { reminderRequest, ReminderError, type Command } from "./client";

export const reminderChangedEvent = "jobs-crm:reminders-invalidated";
export type FrozenAttempt = { ownerId: string; command: Command };
export function matchingAttempt(
  current: FrozenAttempt | null,
  expected: FrozenAttempt,
) {
  return (
    current === expected &&
    current.ownerId === expected.ownerId &&
    current.command === expected.command
  );
}
type Status = {
  ownerId: string | null;
  success: boolean;
  attempt: FrozenAttempt | null;
  pending: boolean;
  uncertain: boolean;
  error: string | null;
};
type Context = {
  status: Status;
  activate: (owner: string) => void;
  reset: () => void;
  send: (owner: string, command: Command, complete?: () => void) => void;
  retry: (owner: string) => void;
};
const MemoryContext = createContext<Context | null>(null);
const empty: Status = {
  ownerId: null,
  success: false,
  attempt: null,
  pending: false,
  uncertain: false,
  error: null,
};

/** A frozen command lives only in this root-layout memory, never browser storage. */
export function ReminderMemoryProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(empty);
  const owner = useRef<string | null>(null);
  const attempt = useRef<FrozenAttempt | null>(null);
  const inFlight = useRef<FrozenAttempt | null>(null);
  const completeRef = useRef<(() => void) | undefined>(undefined);
  const reset = useCallback(() => {
    owner.current = null;
    attempt.current = null;
    inFlight.current = null;
    completeRef.current = undefined;
    setStatus(empty);
  }, []);
  const activate = useCallback((id: string) => {
    if (owner.current === id) return;
    owner.current = id;
    attempt.current = null;
    inFlight.current = null;
    completeRef.current = undefined;
    setStatus(empty);
  }, []);
  useEffect(() => {
    if (!status.attempt) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [status.attempt]);
  const execute = useCallback(async (snapshot: FrozenAttempt) => {
    if (!matchingAttempt(attempt.current, snapshot) || inFlight.current) return;
    inFlight.current = snapshot;
    setStatus({
      ownerId: snapshot.ownerId,
      success: false,
      attempt: snapshot,
      pending: true,
      uncertain: false,
      error: null,
    });
    try {
      await reminderRequest(snapshot.ownerId, snapshot.command);
      if (!matchingAttempt(attempt.current, snapshot)) return;
      attempt.current = null;
      setStatus({ ...empty, ownerId: snapshot.ownerId, success: true });
      completeRef.current?.();
      completeRef.current = undefined;
      window.dispatchEvent(new Event(reminderChangedEvent));
    } catch (reason) {
      if (!matchingAttempt(attempt.current, snapshot)) return;
      if (
        reason instanceof ReminderError &&
        reason.kind === "unauthenticated"
      ) {
        window.location.replace("/login");
        return;
      }
      const uncertain = !(reason instanceof ReminderError) || reason.uncertain;
      if (!uncertain) {
        attempt.current = null;
        completeRef.current = undefined;
      }
      setStatus({
        ownerId: snapshot.ownerId,
        success: false,
        attempt: uncertain ? snapshot : null,
        pending: false,
        uncertain,
        error: uncertain
          ? "Wynik zapisu jest nieznany. Zapis mógł się powieść. Ponów ten sam zapis. Zamiar pozostaje tylko w pamięci aplikacji i zniknie po pełnym odświeżeniu lub zamknięciu strony; później nie będzie można go odzyskać."
          : "Nie udało się zapisać. Dane mogły się zmienić; odśwież widok i spróbuj ponownie.",
      });
    } finally {
      if (inFlight.current === snapshot) inFlight.current = null;
    }
  }, []);
  const send = useCallback(
    (id: string, command: Command, complete?: () => void) => {
      if (owner.current !== id || attempt.current || inFlight.current) return;
      const snapshot = {
        ownerId: id,
        command: Object.freeze({ ...command }) as Command,
      };
      attempt.current = snapshot;
      completeRef.current = complete;
      void execute(snapshot);
    },
    [execute],
  );
  const retry = useCallback(
    (id: string) => {
      const snapshot = attempt.current;
      if (snapshot && snapshot.ownerId === id && owner.current === id)
        void execute(snapshot);
    },
    [execute],
  );
  const value = useMemo(
    () => ({ status, activate, reset, send, retry }),
    [status, activate, reset, send, retry],
  );
  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}
export function useReminderMemory() {
  return useContext(MemoryContext);
}
