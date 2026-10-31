"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CatalogCommand,
  CatalogResult,
} from "@/modules/companies-contacts/domain/catalog";
import {
  catalogRead,
  catalogWrite,
  CatalogClientError,
  resultMatchesCommand,
} from "./client";

import {
  acknowledgedCatalogCommand,
  catalogReadTransition,
  mayDispatchCatalogCommand,
  type CatalogReadState,
} from "./intent";

export function useCatalogRead<T>(
  userId: string,
  query: Record<string, string | number>,
  revision = 0,
  retainConfirmed = false,
) {
  const key = JSON.stringify(query);
  const scope = `${userId}:${key}`;
  const [state, setState] = useState<CatalogReadState<T>>({
    scope,
    data: null,
    error: false,
    loading: true,
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState((previous) =>
        catalogReadTransition(previous, scope, retainConfirmed),
      );
      try {
        const data = await catalogRead<T>(
          userId,
          JSON.parse(key),
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState({ scope, data, error: false, loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (
          error instanceof CatalogClientError &&
          error.kind === "unauthenticated"
        )
          window.location.replace("/login");
        setState((previous) =>
          catalogReadTransition(previous, scope, retainConfirmed, true),
        );
      }
    });
    return () => controller.abort();
  }, [userId, key, scope, revision, retry, retainConfirmed]);
  return {
    ...state,
    data: state.scope === scope ? state.data : null,
    reload: () => setRetry((value) => value + 1),
  };
}
export function useCatalogMutation(
  userId: string,
  onSaved: (result: Exclude<CatalogResult, { kind: "duplicates" }>) => void,
) {
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Extract<
    CatalogResult,
    { kind: "duplicates" }
  > | null>(null);
  const [saved, setSaved] = useState(false);
  const attempt = useRef<CatalogCommand | null>(null);
  const busy = useRef(false);
  const ambiguousAttempt = useRef(false);
  const live = useRef(true);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!uncertain) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [uncertain]);
  function focus() {
    requestAnimationFrame(() => feedback.current?.focus());
  }
  function reset() {
    if (busy.current) return;
    attempt.current = null;
    ambiguousAttempt.current = false;
    setUncertain(false);
    setError(null);
    setDuplicates(null);
    setSaved(false);
  }
  async function send(command: CatalogCommand) {
    if (
      !mayDispatchCatalogCommand(
        attempt.current,
        command,
        busy.current,
        ambiguousAttempt.current,
      )
    )
      return;
    busy.current = true;
    attempt.current = command;
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await catalogWrite(userId, command);
      if (!live.current) return;
      if (result.kind === "duplicates") {
        setDuplicates(result);
        ambiguousAttempt.current = false;
        setUncertain(false);
        focus();
        return;
      }
      ambiguousAttempt.current = false;
      setUncertain(false);
      setDuplicates(null);
      attempt.current = null;
      setSaved(true);
      onSaved(result);
      focus();
    } catch (error) {
      if (!live.current) return;
      if (
        error instanceof CatalogClientError &&
        error.kind === "unauthenticated"
      ) {
        window.location.replace("/login");
        return;
      }
      const ambiguous =
        !(error instanceof CatalogClientError) || error.uncertain;
      ambiguousAttempt.current = ambiguous;
      setUncertain(ambiguous);
      if (!ambiguous) attempt.current = null;
      setError(
        ambiguous
          ? "Wynik zapisu jest nieznany. Operacja mogła zostać zapisana. Sprawdź wynik lub ponów dokładnie ten sam zapis. Dane pozostają tylko w pamięci tej strony."
          : error.kind === "stale"
            ? "Dane zmieniły się w międzyczasie. Niczego nie nadpisano. Odśwież dane i sprawdź je przed kolejnym zapisem."
            : error.kind === "conflict"
              ? "Operacja jest sprzeczna z aktualnym stanem lub kluczem wcześniejszego zapisu. Odśwież dane przed kolejną próbą."
              : "Nie przyjęto danych. Sprawdź formularz i spróbuj ponownie.",
      );
      focus();
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  }
  async function recover() {
    if (busy.current || !attempt.current) return;
    busy.current = true;
    setPending(true);
    try {
      const command = attempt.current;
      const response = await catalogRead<{ result: CatalogResult | null }>(
        userId,
        { requestId: command.requestId },
      );
      if (!live.current) return;
      const result = response.result;
      if (
        result &&
        result.kind !== "duplicates" &&
        resultMatchesCommand(result, command)
      ) {
        attempt.current = null;
        ambiguousAttempt.current = false;
        setUncertain(false);
        setError(null);
        setSaved(true);
        onSaved(result);
      } else
        setError(
          "Nie potwierdzono wyniku. Brak wyniku w odczycie nie oznacza cofnięcia operacji. Sprawdź ponownie lub ponów ten sam zapis.",
        );
      focus();
    } catch (error) {
      if (live.current) {
        if (
          error instanceof CatalogClientError &&
          error.kind === "unauthenticated"
        )
          window.location.replace("/login");
        else
          setError(
            "Nie można teraz sprawdzić wyniku. Zachowano ten sam zamiar w pamięci strony.",
          );
        focus();
      }
    } finally {
      busy.current = false;
      if (live.current) setPending(false);
    }
  }
  return {
    pending,
    uncertain,
    error,
    duplicates,
    saved,
    feedbackRef: (element: HTMLDivElement | null) => {
      feedback.current = element;
    },
    send,
    recover,
    reset,
    clearDraftFeedback: () => {
      if (!ambiguousAttempt.current && !busy.current) {
        attempt.current = null;
        setDuplicates(null);
        setError(null);
        setSaved(false);
      }
    },
    acknowledge: () => {
      const command = acknowledgedCatalogCommand(
        attempt.current,
        duplicates?.matchToken ?? null,
        busy.current || ambiguousAttempt.current,
        () => crypto.randomUUID(),
      );
      if (command) void send(command);
    },
    retry: () => {
      if (attempt.current) void send(attempt.current);
    },
  };
}
export type CatalogMutation = ReturnType<typeof useCatalogMutation>;
