"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import {
  validOffsets,
  scheduleInstant,
  type CalendarSchedule,
} from "@/modules/recruitment/domain/calendar-time";
import {
  parseCalendarCommand,
  type CalendarEvent,
  type CalendarValues,
  type CalendarCommandInput,
} from "@/modules/recruitment/domain/calendar";
import { calendarSection, formatOffset, formatSchedule } from "./time";
import { calendarInvalidationEvent, invalidateCalendarReads } from "./events";
import {
  actualLabel,
  calendarOperation,
  preserveRejectedIntent,
  setStartTime,
} from "./form-logic";

type Person = { id: string; name: string };
type Case = { id: string; title: string; status: string };
type Values = CalendarValues;
type Command = CalendarCommandInput;
const statusLabel: Record<string, string> = {
  planned: "Zaplanowane",
  occurred: "Odbyte",
  not_occurred: "Nieodbyte",
  cancelled: "Anulowane",
};
const storageKey = (owner: string) => `jobs-crm.calendar.pending.${owner}`;
const draftKey = (owner: string) => `jobs-crm.calendar.rejected-draft.${owner}`;

async function request(
  userId: string,
  query: Record<string, unknown>,
  write = false,
) {
  const params = new URLSearchParams({ expectedUserId: userId });
  if (!write)
    Object.entries(query).forEach(([key, value]) =>
      params.set(key, String(value)),
    );
  const response = await fetch(
    write ? "/calendar/commands" : `/calendar/commands?${params}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(20000),
      ...(write
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...query, expectedUserId: userId }),
          }
        : {}),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    window.location.replace("/login");
    throw new Error("unauthenticated");
  }
  if (!response.ok)
    throw Object.assign(new Error("request failed"), {
      definite: response.status < 500,
      kind: (body as { kind?: string } | null)?.kind,
    });
  if (!body || typeof body !== "object") throw new Error("invalid response");
  return body as Record<string, unknown>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function exactReceipt(
  value: Record<string, unknown>,
  command: Command,
): boolean {
  const parsed = parseCalendarCommand(value.intent);
  const event = value.event as CalendarEvent | null;
  return (
    parsed.success &&
    sameValue(parsed.data, command) &&
    !!event &&
    sameValue(eventValues(event), command.values) &&
    (command.operation === "create" ||
      (event.id === command.eventId &&
        event.revision === command.expectedRevision! + 1))
  );
}
function pendingCommand(userId: string): Command | null | "invalid" {
  const raw = sessionStorage.getItem(storageKey(userId));
  if (raw === null) return null;
  try {
    const parsed = parseCalendarCommand(JSON.parse(raw));
    return parsed.success && JSON.stringify(parsed.data) === raw
      ? parsed.data
      : "invalid";
  } catch {
    return "invalid";
  }
}
function defaultSchedule(): CalendarSchedule {
  return {
    startDate: "",
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: false,
    timeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw",
    startOffset: null,
    endOffset: null,
  };
}
function emptyValues(caseId?: string, occurred = false): Values {
  return {
    title: "",
    description: null,
    caseId: caseId ?? null,
    schedule: occurred ? null : defaultSchedule(),
    timeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw",
    actual: null,
    participants: [],
    status: occurred ? "occurred" : "planned",
  };
}
function eventValues(event: CalendarEvent): Values {
  return {
    title: event.title,
    description: event.description,
    caseId: event.case_id,
    schedule: event.schedule,
    timeZone: event.timeZone,
    actual: event.actual,
    participants: event.participants,
    status: event.status,
  };
}

function OffsetField({
  day,
  time,
  zone,
  value,
  onChange,
  label,
}: {
  day: string;
  time: string | null;
  zone: string;
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
}) {
  const offsets = time ? validOffsets(day, time, zone) : [];
  useEffect(() => {
    if (!time) {
      if (value !== null) onChange(null);
      return;
    }
    if (offsets.length === 1 && value !== offsets[0]) onChange(offsets[0]);
    if (offsets.length !== 1 && value !== null && !offsets.includes(value))
      onChange(null);
    // The callback is a state setter; use actual inputs to avoid resetting a user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, time, zone, offsets.join(","), value]);
  if (!time) return null;
  if (offsets.length === 0)
    return (
      <p role="alert" className="text-sm text-destructive">
        Ta godzina nie istnieje w wybranej strefie albo strefa jest
        nieprawidłowa.
      </p>
    );
  if (offsets.length === 1)
    return (
      <p className="text-sm text-muted-foreground">
        {label}: {formatOffset(offsets[0])}
      </p>
    );
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold">
        {label}: ta godzina występuje dwukrotnie. Wybierz wystąpienie.
      </legend>
      {offsets.map((offset, index) => (
        <label
          key={offset}
          className="mr-4 inline-flex min-h-11 items-center gap-2 text-sm"
        >
          <input
            type="radio"
            name={label}
            checked={value === offset}
            onChange={() => onChange(offset)}
            required
          />{" "}
          {index === 0 ? "Pierwsze" : "Drugie"} ({formatOffset(offset)})
        </label>
      ))}
    </fieldset>
  );
}

function EventForm({
  userId,
  initial,
  draft,
  caseId,
  cases,
  contacts,
  mode,
  onDone,
  onCancel,
}: {
  userId: string;
  initial?: CalendarEvent;
  draft?: Command;
  caseId?: string;
  cases: Case[];
  contacts: Person[];
  mode: "create" | "occurred" | "edit" | "resolve";
  onDone: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Values>(
    () =>
      draft?.values ??
      (initial
        ? eventValues(initial)
        : emptyValues(caseId, mode === "occurred")),
  );
  const [base, setBase] = useState(initial);
  const [stale, setStale] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [initialValues] = useState(values);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState(false);
  const pending = useRef<Command | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleInput.current?.focus();
  }, []);
  const [zoneDraft, setZoneDraft] = useState(values.timeZone);
  const [zoneMode, setZoneMode] = useState<"wall" | "instant" | "">("");
  const [appliedZoneMode, setAppliedZoneMode] = useState<
    "keep-local" | "keep-instant" | undefined
  >(draft?.zoneChangeMode);
  const dirty =
    !sameValue(initialValues, values) || zoneDraft !== initialValues.timeZone;
  useEffect(() => {
    if (!dirty && !uncertain) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const followLink = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        target &&
        !window.confirm(
          "Masz niezapisane dane wydarzenia. Czy chcesz opuścić formularz?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty, uncertain]);
  const schedule = values.schedule;
  const patchSchedule = (patch: Partial<CalendarSchedule>) =>
    setValues((current) =>
      current.schedule
        ? { ...current, schedule: { ...current.schedule, ...patch } }
        : current,
    );
  async function send(command: Command) {
    if (busy) return;
    if (
      draft &&
      sessionStorage.getItem(draftKey(userId)) !== JSON.stringify(draft)
    ) {
      setError("Zachowany szkic zmienił się. Odśwież dane przed zapisem.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stored = sessionStorage.getItem(storageKey(userId));
      if (stored && stored !== JSON.stringify(command)) {
        setError(
          "Istnieje inny oczekujący zapis wydarzenia. Nie nadpisano go.",
        );
        return;
      }
      sessionStorage.setItem(storageKey(userId), JSON.stringify(command));
      if (
        sessionStorage.getItem(storageKey(userId)) !== JSON.stringify(command)
      )
        throw new Error("storage");
      pending.current = command;
      const result = await request(userId, command, true);
      if (
        !result.event ||
        !["created", "replayed"].includes(String(result.kind))
      )
        throw new Error("receipt");
      const receipt = await request(userId, { requestId: command.requestId });
      if (
        !exactReceipt(receipt, command) ||
        sessionStorage.getItem(storageKey(userId)) !== JSON.stringify(command)
      )
        throw new Error("receipt mismatch");
      sessionStorage.removeItem(storageKey(userId));
      pending.current = null;
      setUncertain(false);
      invalidateCalendarReads(userId);
      onDone();
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "kind" in cause &&
        cause.kind === "stale" &&
        command.eventId
      ) {
        try {
          const raw = JSON.stringify(command);
          const receipt = await request(userId, {
            requestId: command.requestId,
          });
          if (sessionStorage.getItem(storageKey(userId)) !== raw)
            throw new Error("changed");
          if (exactReceipt(receipt, command)) {
            sessionStorage.removeItem(storageKey(userId));
            pending.current = null;
            invalidateCalendarReads(userId);
            onDone();
            return;
          }
          if (receipt.event === null && receipt.intent === null) {
            sessionStorage.removeItem(storageKey(userId));
            pending.current = null;
            setUncertain(false);
            setStale(true);
            setPreview(false);
            setError(
              "Wydarzenie zmieniło się. Zachowano dane formularza. Odśwież podgląd przed potwierdzeniem.",
            );
            return;
          }
        } catch {
          /* Preserve uncertain command if receipt cannot be verified. */
        }
        setUncertain(true);
        setError("Nie potwierdzono wyniku. Zachowano ten sam zamiar zapisu.");
        return;
      }
      const definite =
        typeof cause === "object" &&
        cause !== null &&
        "definite" in cause &&
        Boolean(cause.definite);
      if (
        definite &&
        sessionStorage.getItem(storageKey(userId)) === JSON.stringify(command)
      ) {
        sessionStorage.removeItem(storageKey(userId));
        pending.current = null;
      }
      setUncertain(!definite);
      setError(
        definite
          ? "Nie zapisano wydarzenia. Sprawdź dane lub odśwież zmienione wydarzenie."
          : "Nie potwierdzono wyniku. Możesz ponowić dokładnie ten sam zapis; nie twórz nowego.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || uncertain || stale) return;
    if (zoneDraft !== values.timeZone) {
      setError("Zastosuj zmianę strefy przed zapisem.");
      return;
    }
    if (mode === "resolve" && values.status === "planned") {
      setError("Wybierz wynik rozliczenia.");
      return;
    }
    if (base && (base.status !== "planned" || needsConfirm) && !preview) {
      setPreview(true);
      return;
    }
    const candidate = {
      requestId: crypto.randomUUID(),
      operation: calendarOperation(mode, base?.status, values.status),
      ...(base ? { eventId: base.id, expectedRevision: base.revision } : {}),
      ...(base?.schedule?.startTime &&
      base.timeZone !== values.timeZone &&
      appliedZoneMode
        ? { zoneChangeMode: appliedZoneMode }
        : {}),
      values,
    };
    const parsed = parseCalendarCommand(candidate);
    if (!parsed.success) {
      setError(Object.values(parsed.errors).join(" "));
      return;
    }
    void send(parsed.data);
  }
  return (
    <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <fieldset
        disabled={busy || uncertain || stale}
        onChange={() => {
          if (preview) setPreview(false);
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-medium">
          Tytuł wydarzenia
          <input
            ref={titleInput}
            className={`${inputStyles} mt-1`}
            required
            maxLength={160}
            value={values.title}
            onChange={(e) =>
              setValues((v) => ({ ...v, title: e.target.value }))
            }
          />
        </label>
        <label className="block text-sm font-medium">
          Opis
          <textarea
            className={`${inputStyles} mt-1`}
            maxLength={2000}
            value={values.description ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, description: e.target.value || null }))
            }
          />
        </label>
        <label className="block text-sm font-medium">
          Sprawa
          <select
            className={`${inputStyles} mt-1`}
            value={values.caseId ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, caseId: e.target.value || null }))
            }
          >
            <option value="">Wydarzenie ogólne</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.status})
              </option>
            ))}
          </select>
        </label>
        {schedule && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 font-semibold">Planowany termin</legend>
            <label className="block text-sm font-medium">
              Data
              <input
                className={`${inputStyles} mt-1`}
                type="date"
                required
                value={schedule.startDate}
                onChange={(e) =>
                  patchSchedule({
                    startDate: e.target.value,
                    startOffset: null,
                  })
                }
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={schedule.allDay}
                onChange={(e) =>
                  patchSchedule({
                    allDay: e.target.checked,
                    ...(e.target.checked
                      ? {
                          startTime: null,
                          endTime: null,
                          startOffset: null,
                          endOffset: null,
                        }
                      : {}),
                  })
                }
              />
              Cały dzień
            </label>
            {!schedule.allDay && (
              <>
                <label className="block text-sm font-medium">
                  Godzina{" "}
                  <span className="font-normal">
                    (opcjonalna, pozostaw puste jeśli nieznana)
                  </span>
                  <input
                    className={`${inputStyles} mt-1`}
                    type="time"
                    value={schedule.startTime ?? ""}
                    onChange={(e) =>
                      setValues((v) =>
                        v.schedule
                          ? {
                              ...v,
                              schedule: setStartTime(
                                v.schedule,
                                e.target.value,
                              ),
                            }
                          : v,
                      )
                    }
                  />
                </label>
                <OffsetField
                  day={schedule.startDate}
                  time={schedule.startTime}
                  zone={schedule.timeZone}
                  value={schedule.startOffset}
                  label="Godzina początku"
                  onChange={(startOffset) => patchSchedule({ startOffset })}
                />
              </>
            )}
            <label className="block text-sm font-medium">
              Data końca <span className="font-normal">(opcjonalna)</span>
              <input
                className={`${inputStyles} mt-1`}
                type="date"
                value={schedule.endDate ?? ""}
                onChange={(e) =>
                  patchSchedule({
                    endDate: e.target.value || null,
                    endOffset: null,
                  })
                }
              />
            </label>
            {!schedule.allDay && schedule.startTime && (
              <>
                <label className="block text-sm font-medium">
                  Godzina końca{" "}
                  <span className="font-normal">(opcjonalna)</span>
                  <input
                    className={`${inputStyles} mt-1`}
                    type="time"
                    value={schedule.endTime ?? ""}
                    onChange={(e) =>
                      patchSchedule({
                        endTime: e.target.value || null,
                        endOffset: null,
                      })
                    }
                  />
                </label>
                <OffsetField
                  day={schedule.endDate ?? schedule.startDate}
                  time={schedule.endTime}
                  zone={schedule.timeZone}
                  value={schedule.endOffset}
                  label="Godzina końca"
                  onChange={(endOffset) => patchSchedule({ endOffset })}
                />
              </>
            )}
          </fieldset>
        )}
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 font-semibold">Strefa wydarzenia</legend>
          <label className="block text-sm font-medium">
            Strefa czasowa
            <input
              className={`${inputStyles} mt-1`}
              required
              value={zoneDraft}
              onChange={(e) => {
                setZoneDraft(e.target.value);
                setZoneMode("");
              }}
            />
          </label>
          {zoneDraft !== values.timeZone && (
            <>
              <p className="text-sm">
                Obecna strefa: {values.timeZone}. Zastosuj zmianę przed zapisem.
              </p>
              {schedule?.startTime && (
                <fieldset>
                  <legend className="text-sm font-semibold">
                    Co zachować po zmianie strefy?
                  </legend>
                  <label className="mr-4 inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="zoneMode"
                      checked={zoneMode === "wall"}
                      onChange={() => setZoneMode("wall")}
                    />
                    Datę i godzinę
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="zoneMode"
                      checked={zoneMode === "instant"}
                      onChange={() => setZoneMode("instant")}
                    />
                    Ten sam moment
                  </label>
                </fieldset>
              )}
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => {
                  try {
                    new Intl.DateTimeFormat("en", {
                      timeZone: zoneDraft,
                    }).format();
                    if (schedule?.startTime && !zoneMode) {
                      setError("Wybierz sposób zmiany strefy.");
                      return;
                    }
                    let next: CalendarSchedule | null = schedule
                      ? {
                          ...schedule,
                          timeZone: zoneDraft,
                          startOffset: null,
                          endOffset: null,
                        }
                      : null;
                    if (
                      schedule &&
                      next &&
                      schedule.startTime &&
                      zoneMode === "instant"
                    ) {
                      const convert = (
                        date: string,
                        time: string,
                        offset: number | null,
                      ) => {
                        const instant = scheduleInstant(
                          date,
                          time,
                          schedule.timeZone,
                          offset,
                        );
                        if (instant === null) throw new Error("invalid");
                        const p = Object.fromEntries(
                          new Intl.DateTimeFormat("en-CA", {
                            timeZone: zoneDraft,
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hourCycle: "h23",
                          })
                            .formatToParts(instant)
                            .map((x) => [x.type, x.value]),
                        );
                        const d = `${p.year}-${p.month}-${p.day}`,
                          t = `${p.hour}:${p.minute}`;
                        const o =
                          (Date.parse(`${d}T${t}:00Z`) - instant) / 60000;
                        return { d, t, o };
                      };
                      const start = convert(
                        schedule.startDate,
                        schedule.startTime,
                        schedule.startOffset,
                      );
                      next = {
                        ...next,
                        startDate: start.d,
                        startTime: start.t,
                        startOffset: start.o,
                      };
                      if (schedule.endTime) {
                        const end = convert(
                          schedule.endDate ?? schedule.startDate,
                          schedule.endTime,
                          schedule.endOffset,
                        );
                        next = {
                          ...next,
                          endDate: end.d,
                          endTime: end.t,
                          endOffset: end.o,
                        };
                      }
                    }
                    setValues((v) => ({
                      ...v,
                      timeZone: zoneDraft,
                      schedule: next,
                    }));
                    setAppliedZoneMode(
                      zoneMode === "instant" ? "keep-instant" : "keep-local",
                    );
                    setError(null);
                    setZoneMode("");
                  } catch {
                    setError(
                      "Nie można zastosować strefy. Sprawdź nazwę IANA i wcześniejszy termin.",
                    );
                  }
                }}
              >
                Zastosuj strefę
              </button>
            </>
          )}
        </fieldset>
        {(mode === "resolve" ||
          mode === "occurred" ||
          (base && base.status !== "planned")) && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 font-semibold">Rzeczywisty wynik</legend>
            <label className="block text-sm font-medium">
              Wynik
              <select
                className={`${inputStyles} mt-1`}
                required
                value={values.status}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    status: e.target.value as CalendarEvent["status"],
                    actual: null,
                    participants: v.participants.map((p) => ({
                      ...p,
                      attendance: "unknown",
                    })),
                  }))
                }
              >
                <option value="planned" disabled>
                  Wybierz wynik
                </option>
                <option value="occurred">Odbyte</option>
                <option value="not_occurred">Nieodbyte</option>
                <option value="cancelled">Anulowane</option>
              </select>
            </label>
            {values.status === "occurred" && (
              <>
                <p className="text-sm">
                  Pozostaw datę pustą, jeśli rzeczywisty czas jest nieznany.
                  Termin planowany nie jest automatycznie datą odbycia.
                </p>
                <label className="block text-sm font-medium">
                  Rzeczywista data
                  <input
                    className={`${inputStyles} mt-1`}
                    type="date"
                    value={values.actual?.date ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        actual: e.target.value
                          ? {
                              date: e.target.value,
                              time: null,
                              offset: null,
                              timeZone: v.timeZone,
                            }
                          : null,
                      }))
                    }
                  />
                </label>
                {values.actual?.date && (
                  <>
                    <label className="block text-sm font-medium">
                      Strefa rzeczywistego czasu
                      <input
                        className={`${inputStyles} mt-1`}
                        required
                        value={values.actual.timeZone}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            actual: v.actual
                              ? {
                                  ...v.actual,
                                  timeZone: e.target.value,
                                  offset: null,
                                }
                              : null,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Rzeczywista godzina
                      <input
                        className={`${inputStyles} mt-1`}
                        type="time"
                        value={values.actual.time ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            actual: v.actual
                              ? {
                                  ...v.actual,
                                  time: e.target.value || null,
                                  offset: null,
                                }
                              : null,
                          }))
                        }
                      />
                    </label>
                    <OffsetField
                      day={values.actual.date}
                      time={values.actual.time}
                      zone={values.actual.timeZone}
                      value={values.actual.offset}
                      label="Rzeczywista godzina"
                      onChange={(offset) =>
                        setValues((v) => ({
                          ...v,
                          actual: v.actual ? { ...v.actual, offset } : null,
                        }))
                      }
                    />
                  </>
                )}
              </>
            )}
          </fieldset>
        )}
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 font-semibold">Uczestnicy</legend>
          <p className="text-sm">
            Dodanie osoby do planu nie potwierdza jej obecności.
          </p>
          {contacts.map((person) => {
            const p = values.participants.find(
              (item) => item.contactId === person.id,
            );
            return (
              <div key={person.id} className="space-y-1">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(p)}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        participants: e.target.checked
                          ? [
                              ...v.participants,
                              { contactId: person.id, attendance: "unknown" },
                            ]
                          : v.participants.filter(
                              (x) => x.contactId !== person.id,
                            ),
                      }))
                    }
                  />
                  {person.name}
                </label>
                {p && values.status === "occurred" && (
                  <label className="block text-sm">
                    Faktyczny udział: {person.name}
                    <select
                      className={`${inputStyles} mt-1`}
                      value={p.attendance}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          participants: v.participants.map((x) =>
                            x.contactId === person.id
                              ? {
                                  ...x,
                                  attendance: e.target
                                    .value as typeof p.attendance,
                                }
                              : x,
                          ),
                        }))
                      }
                    >
                      <option value="unknown">Nieznany</option>
                      <option value="attended">Potwierdzony</option>
                      <option value="absent">Nie uczestniczył(a)</option>
                    </select>
                  </label>
                )}
              </div>
            );
          })}
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak dostępnych kontaktów.
            </p>
          )}
        </fieldset>
        {preview && base && (
          <div className="rounded-md border border-border p-3 text-sm">
            <h4 className="font-semibold">Podgląd korekty</h4>
            <h5 className="mt-2 font-semibold">Przed zmianą</h5>
            <EventSnapshot event={base} contacts={contacts} cases={cases} />
            <h5 className="mt-2 font-semibold">Po zmianie</h5>
            <EventSnapshot
              event={{
                ...base,
                title: values.title,
                description: values.description,
                case_id: values.caseId,
                case_title:
                  cases.find((c) => c.id === values.caseId)?.title ?? null,
                status: values.status,
                schedule: values.schedule,
                timeZone: values.timeZone,
                actual: values.actual,
                participants: values.participants,
              }}
              contacts={contacts}
              cases={cases}
            />
            <p>Oryginał i audyt pozostaną zachowane.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className={buttonStyles.primary} type="submit">
            {preview ? "Potwierdź korektę" : "Zapisz wydarzenie"}
          </button>
          <button
            className={buttonStyles.secondary}
            type="button"
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Masz niezapisane dane wydarzenia. Czy chcesz je odrzucić?",
                )
              )
                onCancel();
            }}
          >
            Anuluj
          </button>
        </div>
      </fieldset>
      {stale && base && (
        <div className="space-y-2">
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  const result = await request(userId, { eventId: base.id });
                  const current = result.event as CalendarEvent | null;
                  if (!current || current.id !== base.id) throw new Error();
                  setBase(current);
                  setStale(false);
                  setNeedsConfirm(true);
                  setPreview(false);
                  setError(
                    "Odświeżono wydarzenie. Sprawdź zachowany szkic i potwierdź podgląd przed zapisem.",
                  );
                } catch {
                  setError(
                    "Nie udało się odświeżyć wydarzenia. Dane formularza pozostają zachowane.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Odśwież podgląd
          </button>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              if (
                !dirty ||
                window.confirm(
                  "Masz niezapisane dane wydarzenia. Czy chcesz je odrzucić?",
                )
              )
                onCancel();
            }}
          >
            Anuluj
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {uncertain && (
        <button
          type="button"
          className={buttonStyles.secondary}
          disabled={busy}
          onClick={() => {
            if (pending.current) void send(pending.current);
          }}
        >
          Ponów ten sam zapis
        </button>
      )}
    </form>
  );
}

type Audit = {
  id: string;
  operation: string;
  before: CalendarEvent | null;
  after: CalendarEvent;
  recorded_at: string;
};
function EventSnapshot({
  event,
  contacts,
  cases,
}: {
  event: CalendarEvent;
  contacts: Person[];
  cases: Case[];
}) {
  return (
    <dl className="space-y-1">
      <div>
        <dt className="inline font-medium">Tytuł: </dt>
        <dd className="inline">{event.title}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Opis: </dt>
        <dd className="inline whitespace-pre-wrap">
          {event.description ?? "Nie podano"}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Status i plan: </dt>
        <dd className="inline">
          {statusLabel[event.status]}, {formatSchedule(event.schedule)}
        </dd>
      </div>
      {!event.schedule && (
        <div>
          <dt className="inline font-medium">Strefa wydarzenia: </dt>
          <dd className="inline">{event.timeZone}</dd>
        </div>
      )}
      <div>
        <dt className="inline font-medium">Rzeczywisty czas: </dt>
        <dd className="inline">{actualLabel(event.actual)}</dd>
      </div>
      <div>
        <dt className="inline font-medium">Sprawa: </dt>
        <dd className="inline">
          {event.case_id
            ? (cases.find((c) => c.id === event.case_id)?.title ??
              event.case_title ??
              "Sprawa")
            : "Wydarzenie ogólne"}
        </dd>
      </div>
      <div>
        <dt className="inline font-medium">Uczestnicy: </dt>
        <dd className="inline">
          {event.participants.length
            ? event.participants
                .map(
                  (p) =>
                    `${contacts.find((c) => c.id === p.contactId)?.name ?? p.contactId} (${p.attendance === "attended" ? "potwierdzony" : p.attendance === "absent" ? "nieobecny" : "nieznany"})`,
                )
                .join(", ")
            : "Brak"}
        </dd>
      </div>
    </dl>
  );
}
function EventRow({
  event,
  userId,
  cases,
  contacts,
  onSaved,
  onActivity,
  now,
}: {
  event: CalendarEvent;
  now: Date;
  userId: string;
  cases: Case[];
  contacts: Person[];
  onSaved: () => void;
  onActivity: (id: string, active: boolean) => void;
}) {
  const [mode, setMode] = useState<"edit" | "resolve" | null>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const resolveTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    onActivity(event.id, mode !== null);
    return () => onActivity(event.id, false);
  }, [event.id, mode, onActivity]);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [auditError, setAuditError] = useState(false);
  const expired = calendarSection(event.status, event.schedule, now) === "past";
  const eventCase = cases.find((c) => c.id === event.case_id);
  async function loadAudit() {
    if (audit) {
      setAudit(null);
      return;
    }
    try {
      setAuditError(false);
      const data = await request(userId, { eventId: event.id, audit: true });
      if (!Array.isArray(data.entries)) throw new Error();
      setAudit(data.entries as Audit[]);
    } catch {
      setAuditError(true);
    }
  }
  return (
    <article
      aria-label={event.title}
      className="min-w-0 space-y-2 py-5 [overflow-wrap:anywhere]"
    >
      <h3 className="font-semibold">{event.title}</h3>
      <p className="text-sm">
        {statusLabel[event.status]}
        {expired && <strong> — wymaga rozliczenia</strong>}
      </p>
      <p className="text-sm text-muted-foreground">
        {formatSchedule(event.schedule)}
      </p>
      {!event.schedule && (
        <p className="text-sm text-muted-foreground">
          Strefa wydarzenia: {event.timeZone}
        </p>
      )}
      {event.actual && (
        <p className="text-sm">
          Rzeczywisty termin: {actualLabel(event.actual)}
        </p>
      )}
      {event.status === "occurred" && !event.actual && (
        <p className="text-sm">Rzeczywisty czas nieznany.</p>
      )}
      {event.description && (
        <p className="whitespace-pre-wrap text-sm">{event.description}</p>
      )}
      {event.case_id ? (
        <p className="text-sm">
          <Link className="ui-link" href={`/recruitments/${event.case_id}`}>
            {event.case_title ?? "Otwórz sprawę"}
          </Link>
          {eventCase && ` (${eventCase.status})`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Wydarzenie ogólne</p>
      )}
      {event.participants.length > 0 && (
        <p className="text-sm">
          Uczestnicy:{" "}
          {event.participants
            .map(
              (p) =>
                `${contacts.find((c) => c.id === p.contactId)?.name ?? "Kontakt"} (${p.attendance === "attended" ? "udział potwierdzony" : p.attendance === "absent" ? "nie uczestniczył(a)" : "udział nieznany"})`,
            )
            .join(", ")}
        </p>
      )}
      {!mode && (
        <div className="flex flex-wrap gap-2">
          <button
            ref={editTrigger}
            type="button"
            className={buttonStyles.secondary}
            onClick={() => setMode("edit")}
          >
            {event.status === "planned"
              ? "Edytuj wydarzenie"
              : "Skoryguj wydarzenie"}
          </button>
          {event.status === "planned" && (
            <>
              <button
                type="button"
                className={buttonStyles.secondary}
                onClick={() => setMode("edit")}
              >
                Przełóż termin
              </button>
              <button
                ref={resolveTrigger}
                type="button"
                className={buttonStyles.secondary}
                onClick={() => setMode("resolve")}
              >
                Rozlicz wydarzenie
              </button>
            </>
          )}
          <button
            type="button"
            className={buttonStyles.ghost}
            aria-expanded={!!audit}
            onClick={() => void loadAudit()}
          >
            {audit ? "Ukryj historię wydarzenia" : "Pokaż historię wydarzenia"}
          </button>
        </div>
      )}
      {mode && (
        <section className="rounded-md border border-border p-4">
          <h4 className="mb-3 font-semibold">
            {mode === "resolve"
              ? "Rozlicz wydarzenie"
              : event.status === "planned"
                ? "Edytuj wydarzenie"
                : "Skoryguj wydarzenie"}
          </h4>
          <EventForm
            userId={userId}
            initial={event}
            cases={cases}
            contacts={contacts}
            mode={mode}
            onDone={() => {
              setMode(null);
              onSaved();
            }}
            onCancel={() => {
              const target = mode === "resolve" ? resolveTrigger : editTrigger;
              setMode(null);
              requestAnimationFrame(() => target.current?.focus());
            }}
          />
        </section>
      )}
      {auditError && (
        <p role="alert">Nie udało się pobrać historii wydarzenia.</p>
      )}
      {audit && (
        <section
          aria-label="Historia wydarzenia"
          className="space-y-3 rounded-md border border-border p-3"
        >
          <h4 className="font-semibold">Historia wydarzenia</h4>
          {audit.length === 0 ? (
            <p className="text-sm">Brak wpisów.</p>
          ) : (
            <ol className="space-y-3">
              {audit.map((a) => (
                <li key={a.id} className="border-t border-border pt-3 text-sm">
                  <p>
                    Data zapisu:{" "}
                    {new Date(a.recorded_at).toLocaleString("pl-PL")}
                  </p>
                  <div className="mt-2">
                    <h5 className="font-semibold">Przed zmianą</h5>
                    {a.before ? (
                      <EventSnapshot
                        event={a.before}
                        contacts={contacts}
                        cases={cases}
                      />
                    ) : (
                      <p>Nie istniało.</p>
                    )}
                  </div>
                  <div className="mt-2">
                    <h5 className="font-semibold">Po zmianie</h5>
                    <EventSnapshot
                      event={a.after}
                      contacts={contacts}
                      cases={cases}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </article>
  );
}

export function CalendarPanel({
  userId,
  caseId,
  caseTitle,
  contactId,
  compact = false,
}: {
  userId: string;
  caseId?: string;
  caseTitle?: string;
  contactId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cases, setCases] = useState<Case[]>(
    caseId ? [{ id: caseId, title: caseTitle ?? "Sprawa", status: "" }] : [],
  );
  const [contacts, setContacts] = useState<Person[]>([]);
  const [mode, setMode] = useState<
    "create" | "occurred" | "edit" | "resolve" | null
  >(null);
  const [rejected, setRejected] = useState(false);
  const [draft, setDraft] = useState<Command | null>(null);
  const [draftInitial, setDraftInitial] = useState<CalendarEvent | undefined>();
  const [restoringDraft, setRestoringDraft] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const occurredTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [pendingState, setPendingState] = useState<Command | null | "invalid">(
    null,
  );
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [activeRows, setActiveRows] = useState<string[]>([]);
  const onActivity = useCallback(
    (id: string, active: boolean) =>
      setActiveRows((current) =>
        active
          ? current.includes(id)
            ? current
            : [...current, id]
          : current.filter((item) => item !== id),
      ),
    [],
  );
  const title = contactId
    ? "Rzeczywisty udział w wydarzeniach"
    : caseId
      ? "Wydarzenia sprawy"
      : compact
        ? "Wydarzenia"
        : "Kalendarz";
  const reload = useCallback(() => {
    setVersion((v) => v + 1);
    router.refresh();
    try {
      setPendingState(pendingCommand(userId));
    } catch {
      setPendingState("invalid");
    }
  }, [userId, router]);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ ownerId: string; caseId?: string }>
      ).detail;
      if (
        detail?.ownerId === userId &&
        (!caseId || !detail.caseId || caseId === detail.caseId)
      )
        setVersion((v) => v + 1);
    };
    window.addEventListener(calendarInvalidationEvent, onChange);
    return () =>
      window.removeEventListener(calendarInvalidationEvent, onChange);
  }, [userId, caseId]);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setPendingState(pendingCommand(userId));
        const rawDraft = sessionStorage.getItem(draftKey(userId));
        if (rawDraft) {
          const parsed = parseCalendarCommand(JSON.parse(rawDraft));
          if (parsed.success && JSON.stringify(parsed.data) === rawDraft)
            setDraft(parsed.data);
        }
      } catch {
        setPendingState("invalid");
      }
    });
  }, [userId]);
  async function recover(retry: boolean) {
    if (!pendingState || pendingState === "invalid" || recovering) return;
    const command = pendingState;
    const raw = JSON.stringify(command);
    setRecovering(true);
    setRecoveryMessage(null);
    try {
      if (sessionStorage.getItem(storageKey(userId)) !== raw)
        throw new Error("changed");
      if (retry) await request(userId, command, true);
      const receipt = await request(userId, { requestId: command.requestId });
      if (
        !exactReceipt(receipt, command) ||
        sessionStorage.getItem(storageKey(userId)) !== raw
      )
        throw new Error("unknown");
      sessionStorage.removeItem(storageKey(userId));
      setPendingState(null);
      reload();
      invalidateCalendarReads(userId);
      setRecoveryMessage("Potwierdzono zapis wydarzenia.");
    } catch (cause) {
      if (
        retry &&
        cause &&
        typeof cause === "object" &&
        "kind" in cause &&
        cause.kind === "stale" &&
        "definite" in cause &&
        cause.definite
      ) {
        try {
          const receipt = await request(userId, {
            requestId: command.requestId,
          });
          if (
            exactReceipt(receipt, command) &&
            sessionStorage.getItem(storageKey(userId)) === raw
          ) {
            sessionStorage.removeItem(storageKey(userId));
            setPendingState(null);
            reload();
            setRecoveryMessage("Potwierdzono zapis wydarzenia.");
            return;
          }
          if (
            receipt.event === null &&
            receipt.intent === null &&
            sessionStorage.getItem(storageKey(userId)) === raw
          ) {
            setRejected(true);
            setRecoveryMessage(
              "Zapis odrzucono, ponieważ wydarzenie zmieniło się. Zachowaj szkic i odśwież dane.",
            );
            return;
          }
        } catch {
          /* Unknown receipt must remain pending. */
        }
      }
      setRecoveryMessage(
        "Nie potwierdzono wyniku. Zachowano dokładnie ten sam zamiar; sprawdź ponownie lub ponów go.",
      );
    } finally {
      setRecovering(false);
    }
  }
  function saveRejectedDraft() {
    if (!rejected || !pendingState || pendingState === "invalid") return;
    const raw = JSON.stringify(pendingState);
    if (
      !preserveRejectedIntent(
        sessionStorage,
        storageKey(userId),
        draftKey(userId),
        raw,
      )
    ) {
      setRecoveryMessage(
        "Nie można bezpiecznie zachować szkicu. Nie usunięto oczekującego zamiaru.",
      );
      return;
    }
    setDraft(pendingState);
    setPendingState(null);
    setRejected(false);
    setRecoveryMessage(
      "Szkic zachowano. Przed ponownym zapisem odświeżono dane wydarzenia.",
    );
    reload();
  }
  async function restoreDraft() {
    if (!draft || pendingState) return;
    try {
      const raw = JSON.stringify(draft);
      if (sessionStorage.getItem(draftKey(userId)) !== raw) throw new Error();
      let current: CalendarEvent | undefined;
      if (draft.operation !== "create") {
        const result = await request(userId, { eventId: draft.eventId });
        if (
          !result.event ||
          typeof result.event !== "object" ||
          (result.event as CalendarEvent).id !== draft.eventId
        )
          throw new Error();
        current = result.event as CalendarEvent;
      }
      if (sessionStorage.getItem(draftKey(userId)) !== raw) throw new Error();
      setDraftInitial(current);
      setRestoringDraft(true);
      setMode(
        draft.operation === "create"
          ? draft.values.schedule
            ? "create"
            : "occurred"
          : draft.operation,
      );
    } catch {
      setRecoveryMessage(
        "Nie można wczytać aktualnego wydarzenia. Szkic pozostaje zachowany.",
      );
    }
  }
  useEffect(() => {
    if (activeRows.length > 0 || mode) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let data = await request(userId, {
          ...(caseId ? { caseId } : {}),
          ...(contactId ? { contactId } : {}),
          page: compact || contactId ? 1 : page,
        });
        if (!Array.isArray(data.events)) throw new Error();
        let allEvents = data.events as CalendarEvent[];
        if (compact || contactId) {
          let nextPage = 1;
          while (data.hasMore === true) {
            if (++nextPage > 1000) throw new Error();
            data = await request(userId, {
              ...(contactId ? { contactId } : {}),
              page: nextPage,
            });
            if (!Array.isArray(data.events)) throw new Error();
            allEvents = allEvents.concat(data.events as CalendarEvent[]);
          }
        }
        const readOptions = async (url: string, key: string) => {
          let page = 1,
            all: unknown[] = [];
          while (true) {
            const r = await fetch(
              `${url}${url.includes("?") ? "&" : "?"}expectedUserId=${encodeURIComponent(userId)}&page=${page}`,
              { cache: "no-store", credentials: "same-origin" },
            );
            if (!r.ok) throw new Error();
            const body = await r.json();
            if (!Array.isArray(body[key])) throw new Error();
            all = [...all, ...body[key]];
            if (!body.hasMore) break;
            if (++page > 1000) throw new Error();
          }
          return all;
        };
        const [caseRows, peopleRows] = await Promise.all([
          readOptions("/tasks/commands?caseOptions=true", "cases"),
          readOptions("/catalog/commands?type=contact", "profiles"),
        ]);
        if (active) {
          setEvents(allEvents);
          setHasMore(!compact && !contactId && data.hasMore === true);
          setCases(caseRows as Case[]);
          setContacts(peopleRows as Person[]);
        }
      } catch {
        if (active)
          setError(
            "Nie udało się pobrać wydarzeń lub danych formularza. Spróbuj ponownie.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [
    userId,
    caseId,
    contactId,
    compact,
    page,
    version,
    activeRows.length,
    mode,
  ]);
  const list = compact
    ? events.filter((e) => e.status === "planned")
    : contactId
      ? events.filter(
          (e) =>
            e.status === "occurred" &&
            e.participants.some(
              (p) => p.contactId === contactId && p.attendance === "attended",
            ),
        )
      : events;
  const groups: [string, CalendarEvent[]][] = compact
    ? [
        [
          "Wymaga rozliczenia",
          list.filter(
            (e) => calendarSection(e.status, e.schedule, now) === "past",
          ),
        ],
        [
          "Nadchodzące wydarzenia",
          list.filter(
            (e) => calendarSection(e.status, e.schedule, now) === "upcoming",
          ),
        ],
      ]
    : [[title, list]];
  return (
    <section
      className="ui-panel min-w-0 space-y-4 p-5 sm:p-6"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {title}
        </h2>
        {!contactId && !compact && !pendingState && !mode && (
          <div className="flex flex-wrap gap-2">
            <button
              ref={createTrigger}
              type="button"
              className={buttonStyles.primary}
              onClick={() => setMode("create")}
            >
              Dodaj wydarzenie
            </button>
            <button
              ref={occurredTrigger}
              type="button"
              className={buttonStyles.secondary}
              onClick={() => setMode("occurred")}
            >
              Zapisz odbytą rozmowę
            </button>
          </div>
        )}
      </div>
      {pendingState && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-border p-3"
        >
          <p>
            {pendingState === "invalid"
              ? "Zachowany zamiar jest nieprawidłowy. Nie można go bezpiecznie ponowić."
              : "Poprzedni wynik zapisu wydarzenia jest nieznany. Potwierdź go przed kolejną zmianą."}
          </p>
          {pendingState !== "invalid" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={recovering}
                onClick={() => void recover(false)}
              >
                Sprawdź wynik
              </button>
              <button
                type="button"
                className={buttonStyles.secondary}
                disabled={recovering}
                onClick={() => void recover(true)}
              >
                Ponów ten sam zapis
              </button>
            </div>
          )}
        </div>
      )}
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      {rejected && (
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={saveRejectedDraft}
        >
          Zachowaj szkic i odblokuj
        </button>
      )}
      {draft && !mode && !pendingState && (
        <div className="rounded-md border border-border p-3">
          <p className="text-sm">Zachowany szkic: {draft.values.title}</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => void restoreDraft()}
          >
            Wczytaj zachowany szkic
          </button>
        </div>
      )}
      {mode && (
        <section className="rounded-md border border-border p-4">
          <h3 className="mb-3 font-semibold">
            {mode === "create"
              ? "Nowe wydarzenie"
              : mode === "occurred"
                ? "Zapisz odbytą rozmowę"
                : "Zachowany szkic zmiany wydarzenia"}
          </h3>
          <EventForm
            userId={userId}
            caseId={caseId}
            initial={draftInitial}
            draft={restoringDraft ? (draft ?? undefined) : undefined}
            cases={cases}
            contacts={contacts}
            mode={mode}
            onDone={() => {
              if (
                restoringDraft &&
                draft &&
                sessionStorage.getItem(draftKey(userId)) ===
                  JSON.stringify(draft)
              ) {
                sessionStorage.removeItem(draftKey(userId));
                setDraft(null);
              }
              setDraftInitial(undefined);
              setRestoringDraft(false);
              setMode(null);
              reload();
              requestAnimationFrame(() => heading.current?.focus());
            }}
            onCancel={() => {
              const target =
                mode === "occurred" ? occurredTrigger : createTrigger;
              setMode(null);
              setDraftInitial(undefined);
              setRestoringDraft(false);
              requestAnimationFrame(() => target.current?.focus());
            }}
          />
        </section>
      )}
      {loading && <p role="status">Ładowanie wydarzeń…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={reload}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      {!loading &&
        !error &&
        groups.map(([label, items]) => (
          <section key={label} aria-label={label}>
            <h3 className="font-semibold">{label}</h3>
            {items.length ? (
              <div className="divide-y divide-border">
                {items.map((event) => (
                  <EventRow
                    key={`${event.id}:${event.revision}`}
                    event={event}
                    userId={userId}
                    cases={cases}
                    contacts={contacts}
                    onSaved={reload}
                    onActivity={onActivity}
                    now={now}
                  />
                ))}
              </div>
            ) : (
              <p className="py-3 text-sm text-muted-foreground">
                Brak wydarzeń w tym widoku.
              </p>
            )}
          </section>
        ))}
      {!compact && (
        <nav aria-label="Strony wydarzeń" className="flex items-center gap-3">
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={page <= 1 || loading}
            onClick={() => setPage((n) => n - 1)}
          >
            Poprzednia strona
          </button>
          <span>Strona {page}</span>
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={!hasMore || loading}
            onClick={() => setPage((n) => n + 1)}
          >
            Następna strona
          </button>
        </nav>
      )}
      {compact && (
        <Link
          href="/calendar"
          className="ui-link inline-flex min-h-11 items-center text-sm"
        >
          Otwórz kalendarz
        </Link>
      )}
    </section>
  );
}
