"use client";
import { useEffect, useId, useState } from "react";
import { validOffsets } from "@/modules/recruitment/domain/calendar-time";
import type { Task } from "@/modules/recruitment/domain/tasks";
import { formatOffset } from "@/components/calendar/time";
import { buttonStyles } from "@/components/tasks/styles";
import { inputStyles } from "@/components/ui/styles";
import { useReminderMutation, useReminders } from "./hooks";
import { useReminderDrafts, type ReminderDraft } from "./memory-drafts";
import { useUnsavedWarning } from "./use-unsaved-warning";
import { EmailReminderControls } from "./email-reminder-controls";

export function ReminderFeedback({
  mutation,
}: {
  mutation: ReturnType<typeof useReminderMutation>;
}) {
  return (
    <div aria-live="polite">
      {mutation.pending && (
        <p role="status" className="mt-3 text-sm">
          Zapisywanie…
        </p>
      )}
      {mutation.success && (
        <p role="status" className="mt-3 text-sm text-success">
          Zapisano.
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {mutation.error}
        </p>
      )}
      {mutation.uncertain && (
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={mutation.pending}
          onClick={mutation.retry}
        >
          Ponów ten sam zapis
        </button>
      )}
    </div>
  );
}
export function ReminderControls({
  userId,
  task,
  onActivityChange,
  read,
}: {
  userId: string;
  task: Task;
  onActivityChange: (active: boolean) => void;
  read: ReturnType<typeof useReminders>;
}) {
  const id = useId();
  const drafts = useReminderDrafts();
  const key = `task:${task.id}`;
  const stored =
    drafts?.store.owner === userId ? drafts.store.entries[key] : undefined;
  const draft: ReminderDraft =
    stored?.kind === "reminder"
      ? stored
      : { kind: "reminder", date: "", time: "", zone: "", offset: null };
  const { date, time, zone, offset: chosenOffset } = draft;
  const [open, setOpen] = useState(Boolean(stored));
  const [invalid, setInvalid] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const save = (patch: Partial<ReminderDraft>) =>
    drafts?.save(userId, key, { ...draft, ...patch });
  const mutation = useReminderMutation(userId, (command, live) => {
    if (command.operation !== "set-reminder") return;
    drafts?.clear(userId, key, draft);
    if (live) {
      setOpen(false);
      setInvalid(false);
    }
  });
  useEffect(() => {
    onActivityChange(
      open || mutation.pending || mutation.uncertain || emailBusy,
    );
  }, [open, mutation.pending, mutation.uncertain, emailBusy, onActivityChange]);
  const reminder = read.data?.reminders.find((item) => item.taskId === task.id);
  const offsets = validOffsets(date, time, zone);
  const offset = offsets.length === 1 ? offsets[0] : chosenOffset;
  const disabled = mutation.pending || mutation.uncertain || emailBusy;
  const dirty = open && Boolean(date || time || zone || chosenOffset !== null);
  useUnsavedWarning(dirty && !mutation.pending && !mutation.uncertain);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (offset === null || !offsets.includes(offset)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    void mutation.send({
      operation: "set-reminder",
      requestId: crypto.randomUUID(),
      taskId: task.id,
      expectedRevision: task.revision,
      date,
      time,
      timeZone: zone,
      offset,
    });
  }
  return (
    <section
      className="mt-4 rounded-md border border-border p-4"
      aria-label={`Przypomnienie: ${task.title}`}
    >
      <h4 className="font-semibold">Przypomnienie in-app</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Niezależne od terminu zadania. Widoczne w aplikacji; e-mail można
        włączyć osobno dla ustawionego przypomnienia.
      </p>
      {read.loading && (
        <p role="status" className="mt-2 text-sm">
          Wczytywanie przypomnienia…
        </p>
      )}
      {read.error && (
        <div role="alert" className="mt-2 text-sm">
          Nie udało się pobrać przypomnienia.{" "}
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
          {reminder ? (
            <p className="mt-2 text-sm">
              {reminder.date}, {reminder.time} ({reminder.timeZone},{" "}
              {formatOffset(reminder.offset)}). Stan:{" "}
              {reminder.state === "due" ? "do potwierdzenia" : "zaplanowane"}.
            </p>
          ) : (
            <p className="mt-2 text-sm">
              Przypomnienie wyłączone lub nieustawione.
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Po zmianie terminu lub powiązania i po przywróceniu zadania trzeba
            ponownie potwierdzić konfigurację.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {task.status === "Do zrobienia" && (
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={disabled}
                aria-expanded={open}
                onClick={() => {
                  if (
                    open &&
                    dirty &&
                    !window.confirm(
                      "Masz niezapisane ustawienia. Czy chcesz zamknąć formularz?",
                    )
                  )
                    return;
                  setOpen(!open);
                  if (open) {
                    if (stored) drafts?.clear(userId, key, stored);
                  }
                }}
              >
                {open
                  ? "Zamknij konfigurację"
                  : reminder
                    ? "Ustaw ponownie przypomnienie"
                    : "Ustaw przypomnienie"}
              </button>
            )}
            {reminder && (
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={disabled}
                onClick={() =>
                  void mutation.send({
                    operation: "disable",
                    requestId: crypto.randomUUID(),
                    taskId: task.id,
                    configurationId: reminder.id,
                  })
                }
              >
                Wyłącz przypomnienie
              </button>
            )}
          </div>
          {open && (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor={`${id}-date`}
                  className="block text-sm font-medium"
                >
                  Data przypomnienia
                </label>
                <input
                  id={`${id}-date`}
                  type="date"
                  required
                  disabled={disabled}
                  value={date}
                  className={inputStyles}
                  onChange={(e) => {
                    save({ date: e.target.value, offset: null });
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor={`${id}-time`}
                  className="block text-sm font-medium"
                >
                  Godzina przypomnienia
                </label>
                <input
                  id={`${id}-time`}
                  type="time"
                  required
                  disabled={disabled}
                  value={time}
                  className={inputStyles}
                  onChange={(e) => {
                    save({ time: e.target.value, offset: null });
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor={`${id}-zone`}
                  className="block text-sm font-medium"
                >
                  Strefa IANA
                </label>
                <input
                  id={`${id}-zone`}
                  required
                  disabled={disabled}
                  value={zone}
                  placeholder="np. Europe/Warsaw"
                  className={inputStyles}
                  onChange={(e) => {
                    save({ zone: e.target.value, offset: null });
                  }}
                />
              </div>
              {date && time && zone && offsets.length === 0 && (
                <p className="text-sm text-destructive">
                  Sprawdź strefę i godzinę. Taki czas lokalny może nie istnieć.
                </p>
              )}
              {offsets.length > 1 && (
                <fieldset>
                  <legend className="text-sm font-medium">
                    Ta godzina występuje dwukrotnie. Wybierz moment:
                  </legend>
                  {offsets.map((value, i) => (
                    <label
                      key={value}
                      className="mr-4 inline-flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={`${id}-offset`}
                        disabled={disabled}
                        checked={chosenOffset === value}
                        onChange={() => save({ offset: value })}
                      />
                      {i === 0 ? "Pierwszy" : "Drugi"} ({formatOffset(value)})
                    </label>
                  ))}
                </fieldset>
              )}
              {offsets.length === 1 && (
                <p className="text-sm">{formatOffset(offsets[0])}</p>
              )}
              {invalid && (
                <p role="alert" className="text-sm text-destructive">
                  Podaj poprawną datę, godzinę, strefę i wybierz moment.
                </p>
              )}
              <button
                type="submit"
                className={buttonStyles.primary}
                disabled={disabled}
              >
                Potwierdź przypomnienie
              </button>
            </form>
          )}
          {reminder && !open && (
            <EmailReminderControls
              key={`${userId}:${task.id}:${reminder.id}`}
              userId={userId}
              taskId={task.id}
              configurationId={reminder.id}
              onActivityChange={setEmailBusy}
            />
          )}
        </>
      )}
    </section>
  );
}
