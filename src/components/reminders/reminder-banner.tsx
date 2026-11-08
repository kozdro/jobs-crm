"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useReminderDrafts } from "./memory-drafts";
import { useReminderMemory } from "./memory-commands";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { buttonStyles } from "@/components/tasks/styles";
import { useReminderMutation, useReminders } from "./hooks";
import { ReminderFeedback } from "./reminder-controls";

/** Refresh while the application is visible, including after a tab is revisited. */
export function ReminderBanner({ userId }: { userId: string }) {
  const read = useReminders(userId, true);
  const activateDrafts = useReminderDrafts()?.activate;
  useEffect(() => {
    activateDrafts?.(userId);
  }, [activateDrafts, userId]);
  const resetDrafts = useReminderDrafts()?.reset;
  const resetCommands = useReminderMemory()?.reset;
  useEffect(() => {
    const client = getBrowserClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) {
        resetDrafts?.();
        resetCommands?.();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [userId, resetDrafts, resetCommands]);
  const mutation = useReminderMutation(userId);
  const due = read.data?.reminders.filter((item) => item.state === "due") ?? [];
  const visible = Boolean(
    due.length ||
    read.error ||
    mutation.error ||
    mutation.pending ||
    mutation.success,
  );
  return (
    <div aria-live="polite">
      {visible && (
        <section
          aria-label="Aktywne przypomnienia"
          className="ui-panel mb-6 space-y-3 p-4"
        >
          <h2 className="font-semibold">Przypomnienia</h2>
          {read.error && (
            <div role="alert" className="text-sm">
              <p>Nie udało się sprawdzić przypomnień.</p>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={read.reload}
              >
                Ponów odczyt przypomnień
              </button>
            </div>
          )}
          {due.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span>
                {item.taskTitle} — {item.date}, {item.time} ({item.timeZone})
              </span>
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={mutation.pending || mutation.uncertain}
                onClick={() =>
                  void mutation.send({
                    operation: "acknowledge",
                    requestId: crypto.randomUUID(),
                    taskId: item.taskId,
                    configurationId: item.id,
                  })
                }
              >
                Potwierdź przypomnienie
              </button>
              <Link className="ui-link" href="/tasks">
                Otwórz zadania
              </Link>
            </div>
          ))}
          <ReminderFeedback mutation={mutation} />
        </section>
      )}
    </div>
  );
}
