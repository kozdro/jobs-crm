"use client";
import { useEffect, useRef, useState } from "react";
import { matchesTaskInvalidation, taskInvalidationEvent } from "./events";
import type { Task } from "@/modules/recruitment/domain/tasks";
import {
  taskRequest,
  TaskClientError,
  taskResultMatches,
  type TaskCommand,
} from "./client";

export function useTaskRead<T>(
  userId: string,
  query: Record<string, string | number | boolean>,
  revision = 0,
  paused = false,
) {
  const key = JSON.stringify(query);
  const scope = `${userId}:${key}`;
  const [state, setState] = useState<{
    scope: string;
    data: T | null;
    loading: boolean;
    error: boolean;
  }>({ scope, data: null, loading: true, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const invalidate = (event: Event) => {
      if (
        matchesTaskInvalidation(
          (event as CustomEvent<unknown>).detail,
          userId,
          JSON.parse(key),
        )
      )
        setRetry((value) => value + 1);
    };
    window.addEventListener(taskInvalidationEvent, invalidate);
    return () => window.removeEventListener(taskInvalidationEvent, invalidate);
  }, [userId, key]);
  useEffect(() => {
    if (paused) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        scope,
        data: previous.scope === scope ? previous.data : null,
        loading: true,
        error: false,
      }));
      try {
        const data = await taskRequest(
          userId,
          JSON.parse(key),
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState({ scope, data: data as T, loading: false, error: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (
          error instanceof TaskClientError &&
          error.kind === "unauthenticated"
        )
          window.location.replace("/login");
        setState((previous) => ({
          scope,
          data: previous.scope === scope ? previous.data : null,
          loading: false,
          error: true,
        }));
      }
    });
    return () => controller.abort();
  }, [userId, key, scope, revision, retry, paused]);
  return {
    ...state,
    data: state.scope === scope ? state.data : null,
    loading: !paused && (state.scope !== scope || state.loading),
    reload: () => setRetry((value) => value + 1),
  };
}
export function useTaskMutation(userId: string, onSaved: (task: Task) => void) {
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const attempt = useRef<TaskCommand | null>(null);
  const busy = useRef(false);
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
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [uncertain]);
  const focus = () => requestAnimationFrame(() => feedback.current?.focus());
  function complete(task: Task) {
    attempt.current = null;
    setUncertain(false);
    setError(null);
    setStale(false);
    onSaved(task);
  }
  async function send(command: TaskCommand) {
    if (busy.current || (attempt.current && attempt.current !== command))
      return;
    busy.current = true;
    attempt.current = command;
    setPending(true);
    setError(null);
    try {
      const body = await taskRequest(userId, command);
      if (!live.current) return;
      if (!taskResultMatches(body.task, command))
        throw new TaskClientError("unavailable", true);
      complete(body.task);
    } catch (error) {
      if (!live.current) return;
      if (
        error instanceof TaskClientError &&
        error.kind === "unauthenticated"
      ) {
        window.location.replace("/login");
        return;
      }
      const unknown = !(error instanceof TaskClientError) || error.uncertain;
      setUncertain(unknown);
      if (!unknown) attempt.current = null;
      const conflict =
        error instanceof TaskClientError &&
        ["stale", "conflict"].includes(error.kind);
      setStale(conflict);
      setError(
        unknown
          ? "Wynik zapisu jest nieznany. Zapis mógł się powieść. Sprawdź wynik lub ponów ten sam zapis. Dane pozostają w pamięci tej strony."
          : conflict
            ? "Zadanie zmieniło się w międzyczasie. Niczego nie nadpisano. Odśwież dane przed kolejną zmianą."
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
    const command = attempt.current;
    busy.current = true;
    setPending(true);
    try {
      const body = await taskRequest(userId, { requestId: command.requestId });
      if (!live.current) return;
      if (taskResultMatches(body.task, command)) complete(body.task);
      else {
        setError(
          "Nie potwierdzono wyniku. Pusty odczyt nie oznacza cofnięcia zapisu. Sprawdź ponownie lub ponów ten sam zapis.",
        );
        focus();
      }
    } catch (error) {
      if (live.current) {
        if (
          error instanceof TaskClientError &&
          error.kind === "unauthenticated"
        )
          window.location.replace("/login");
        else
          setError(
            "Nie można teraz sprawdzić wyniku. Zachowano ten sam zamiar zapisu.",
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
    stale,
    feedbackRef: (element: HTMLDivElement | null) => {
      feedback.current = element;
    },
    send,
    recover,
    retry: () => {
      if (attempt.current) void send(attempt.current);
    },
  };
}
export type TaskMutation = ReturnType<typeof useTaskMutation>;
