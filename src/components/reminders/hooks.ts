"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { taskInvalidationEvent } from "@/components/tasks/events";
import {
  isReminderData,
  reminderRequest,
  ReminderError,
  type Command,
  type ReminderData,
} from "./client";

import { reminderChangedEvent, useReminderMemory } from "./memory-commands";
export function useReminders(userId: string, poll = false) {
  const [data, setData] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((v) => v + 1), []);
  useEffect(() => {
    const listener = () => reload();
    window.addEventListener(reminderChangedEvent, listener);
    window.addEventListener(taskInvalidationEvent, listener);
    const visible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = poll ? window.setInterval(visible, 30000) : undefined;
    return () => {
      window.removeEventListener(reminderChangedEvent, listener);
      window.removeEventListener(taskInvalidationEvent, listener);
      document.removeEventListener("visibilitychange", visible);
      if (timer) window.clearInterval(timer);
    };
  }, [poll, reload]);
  useEffect(() => {
    let live = true;
    void reminderRequest(userId)
      .then((value) => {
        if (!live) return;
        if (!isReminderData(value)) throw new ReminderError("invalid");
        setData(value);
        setError(false);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        if (
          reason instanceof ReminderError &&
          reason.kind === "unauthenticated"
        )
          window.location.replace("/login");
        setData(null);
        setError(true);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId, tick]);
  return { data, loading, error, reload };
}
export function useReminderMutation(
  userId: string,
  onSuccess?: (command: Command, live: boolean) => void,
) {
  const memory = useReminderMemory();
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const activate = memory?.activate;
  useEffect(() => {
    activate?.(userId);
  }, [activate, userId]);
  const active = memory?.status.ownerId === userId;
  return {
    pending: Boolean(active && memory?.status.pending),
    uncertain: Boolean(active && memory?.status.uncertain),
    error: active ? (memory?.status.error ?? null) : null,
    success: Boolean(active && memory?.status.success),
    send: (command: Command) =>
      memory?.send(userId, command, () => {
        onSuccess?.(command, live.current);
      }),
    retry: () => memory?.retry(userId),
  };
}
