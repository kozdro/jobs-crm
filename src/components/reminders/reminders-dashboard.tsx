"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { isIanaTimeZone } from "@/modules/recruitment/domain/calendar-time";
import { buttonStyles } from "@/components/tasks/styles";
import { inputStyles } from "@/components/ui/styles";
import { useReminderMutation, useReminders } from "./hooks";
import { useReminderDrafts, type RuleDraft } from "./memory-drafts";
import { useUnsavedWarning } from "./use-unsaved-warning";

export function RemindersDashboard({ userId }: { userId: string }) {
  const id = useId();
  const read = useReminders(userId, true);
  const drafts = useReminderDrafts();
  const key = "follow-up-rule";
  const stored =
    drafts?.store.owner === userId ? drafts.store.entries[key] : undefined;
  const draft: RuleDraft =
    stored?.kind === "rule" ? stored : { kind: "rule", days: "", zone: "" };
  const { days, zone } = draft;
  const save = (patch: Partial<RuleDraft>) =>
    drafts?.save(userId, key, { ...draft, ...patch });
  const [editing, setEditing] = useState(Boolean(stored));
  const [invalid, setInvalid] = useState(false);
  const mutation = useReminderMutation(userId, (command, live) => {
    if (command.operation !== "set-rule") return;
    drafts?.clear(userId, key, draft);
    if (live) {
      setEditing(false);
      setInvalid(false);
    }
  });
  const disabled = mutation.pending || mutation.uncertain;
  const dirty = editing && Boolean(days || zone);
  useUnsavedWarning(dirty && !mutation.pending && !mutation.uncertain);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const intervalDays = Number(days);
    if (
      !Number.isSafeInteger(intervalDays) ||
      intervalDays <= 0 ||
      intervalDays >= 2147483647 ||
      !isIanaTimeZone(zone)
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void mutation.send({
      operation: "set-rule",
      requestId: crypto.randomUUID(),
      intervalDays,
      timeZone: zone,
    });
  }
  return (
    <section
      className="ui-panel min-w-0 space-y-5 p-5 sm:p-6"
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        Przypomnienia i sugestie
      </h2>
      <p className="text-sm text-muted-foreground">
        Przypomnienia są widoczne w aplikacji. Sugestia nie jest zadaniem ani
        wysłaną wiadomością.
      </p>
      {read.loading && (
        <p role="status" className="text-sm">
          Wczytywanie przypomnień i sugestii…
        </p>
      )}
      {read.error && (
        <div role="alert" className="text-sm">
          <p>Nie udało się pobrać danych. To nie oznacza pustej listy.</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={read.reload}
          >
            Ponów odczyt
          </button>
        </div>
      )}
      {read.data && (
        <>
          <section aria-labelledby={`${id}-suggestions`}>
            <h3 id={`${id}-suggestions`} className="font-semibold">
              Sugestie follow-up
            </h3>
            {read.data.suggestions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Brak sugestii w tym widoku.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {read.data.suggestions.map((item) => (
                  <li
                    key={`${item.caseId}:${item.eventId}:${item.eventRevision}`}
                    className="space-y-2 py-3"
                  >
                    <p className="text-sm font-medium">{item.caseTitle}</p>
                    <p className="text-sm">
                      Kontakt wychodzący: {item.occurredOn}; sugestia od:{" "}
                      {item.dueOn}.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/recruitments/${item.caseId}`}
                        className="ui-link text-sm font-semibold"
                      >
                        Otwórz sprawę
                      </Link>
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        disabled={disabled}
                        onClick={() =>
                          void mutation.send({
                            operation: "dismiss-suggestion",
                            requestId: crypto.randomUUID(),
                            caseId: item.caseId,
                            eventId: item.eventId,
                            eventRevision: item.eventRevision,
                          })
                        }
                      >
                        Odrzuć sugestię
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby={`${id}-rule`}>
            <h3 id={`${id}-rule`} className="font-semibold">
              Reguła follow-up
            </h3>
            <p className="mt-2 text-sm">
              {read.data.rule
                ? `Włączona: ${read.data.rule.intervalDays} dni, ${read.data.rule.timeZone}.`
                : "Reguła nie jest ustawiona."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={disabled}
                aria-expanded={editing}
                onClick={() => {
                  if (
                    editing &&
                    dirty &&
                    !window.confirm(
                      "Masz niezapisane ustawienia. Czy chcesz zamknąć formularz?",
                    )
                  )
                    return;
                  setEditing(!editing);
                  if (editing) {
                    if (stored) drafts?.clear(userId, key, stored);
                  }
                }}
              >
                {editing
                  ? "Zamknij ustawienia reguły"
                  : read.data.rule
                    ? "Zmień regułę"
                    : "Ustaw regułę"}
              </button>
              {read.data.rule && (
                <button
                  type="button"
                  className={buttonStyles.secondary}
                  disabled={disabled}
                  onClick={() =>
                    void mutation.send({
                      operation: "disable-rule",
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  Wyłącz regułę
                </button>
              )}
            </div>
            {editing && (
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor={`${id}-days`}
                    className="block text-sm font-medium"
                  >
                    Odstęp w dniach
                  </label>
                  <input
                    id={`${id}-days`}
                    type="number"
                    min="1"
                    step="1"
                    required
                    disabled={disabled}
                    value={days}
                    className={inputStyles}
                    onChange={(e) => save({ days: e.target.value })}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-zone`}
                    className="block text-sm font-medium"
                  >
                    Strefa odniesienia IANA
                  </label>
                  <input
                    id={`${id}-zone`}
                    required
                    disabled={disabled}
                    value={zone}
                    placeholder="np. Europe/Warsaw"
                    className={inputStyles}
                    onChange={(e) => save({ zone: e.target.value })}
                  />
                </div>
                {invalid && (
                  <p role="alert" className="text-sm text-destructive">
                    Podaj dodatnią liczbę dni i poprawną strefę IANA.
                  </p>
                )}
                <button
                  type="submit"
                  disabled={disabled}
                  className={buttonStyles.primary}
                >
                  Zapisz regułę
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </section>
  );
}
