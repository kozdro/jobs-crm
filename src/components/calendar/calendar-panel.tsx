"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { unicodeLength } from "@/modules/recruitment/domain/recruitment-case";
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
import {
  calendarSection,
  formatOffset,
  formatSchedule,
  sectionDuringEdit,
} from "./time";
import { calendarInvalidationEvent, invalidateCalendarReads } from "./events";
import {
  useCalendarMemoryDrafts,
  revertedDraftCandidate,
  type MemoryDraft,
} from "./memory-drafts";
import {
  actualLabel,
  calendarOperation,
  setStartTime,
  canDismissCalendarForm,
  showCalendarRows,
  calendarDismissFocus,
  eventDialogName,
  panelDialogName,
  calendarDialogA11y,
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
type Pending = { ownerId: string; requestId: string };
function pendingCommand(userId: string): Pending | null | "invalid" {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return "invalid";
    const record = v as Record<string, unknown>;
    return Object.keys(record).sort().join(",") === "ownerId,requestId" &&
      record.ownerId === userId &&
      typeof record.requestId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        record.requestId,
      )
      ? { ownerId: userId, requestId: record.requestId }
      : "invalid";
  } catch {
    return "invalid";
  }
}
function pendingRaw(userId: string, requestId: string) {
  return JSON.stringify({ ownerId: userId, requestId });
}
function samePending(userId: string, requestId: string) {
  const value = pendingCommand(userId);
  return !!value && value !== "invalid" && value.requestId === requestId;
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

export function CalendarStatusField({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: CalendarEvent["status"];
  error?: string;
  onChange: (status: CalendarEvent["status"]) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="block text-sm font-medium">
        Wynik
      </label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputStyles} mt-1`}
        required
        value={value}
        onChange={(event) =>
          onChange(event.target.value as CalendarEvent["status"])
        }
      >
        <option value="planned" disabled>
          Wybierz wynik
        </option>
        <option value="occurred">Odbyte</option>
        <option value="not_occurred">Nieodbyte</option>
        <option value="cancelled">Anulowane</option>
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

export function EventForm({
  userId,
  initial,
  restored,
  caseId,
  cases,
  contacts,
  mode,
  onDone,
  onCancel,
  dismissRef,
}: {
  userId: string;
  initial?: CalendarEvent;
  restored?: MemoryDraft;
  caseId?: string;
  cases: Case[];
  contacts: Person[];
  mode: "create" | "occurred" | "edit" | "resolve";
  onDone: () => void;
  onCancel: () => void;
  dismissRef?: RefObject<(() => void) | null>;
}) {
  const [values, setValues] = useState<Values>(
    () =>
      restored?.values ??
      (initial
        ? eventValues(initial)
        : emptyValues(caseId, mode === "occurred")),
  );
  const [base, setBase] = useState(initial);
  const [stale, setStale] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(
    Boolean(restored && initial),
  );
  const [initialValues] = useState(() =>
    initial ? eventValues(initial) : emptyValues(caseId, mode === "occurred"),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldPrefix = useId();
  const fieldId = (field: string) => `${fieldPrefix}-${field}`;
  const [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState(false);
  const pending = useRef<Command | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleInput.current?.focus();
  }, []);
  const [zoneDraft, setZoneDraft] = useState(
    restored?.zoneDraft ?? values.timeZone,
  );
  const [zoneMode, setZoneMode] = useState<"wall" | "instant" | "">(
    restored?.zoneMode ?? "",
  );
  const [appliedZoneMode, setAppliedZoneMode] = useState<
    "keep-local" | "keep-instant" | undefined
  >(restored?.zoneChangeMode);
  const dirty =
    Boolean(restored) ||
    !sameValue(initialValues, values) ||
    zoneDraft !== initialValues.timeZone;
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
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const onNavigate = (event: Event) => {
      const traversal = event as Event & { navigationType?: string };
      if (
        traversal.navigationType === "traverse" &&
        event.cancelable &&
        !window.confirm(
          "Masz niezapisane dane wydarzenia. Czy chcesz opuścić formularz?",
        )
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
      navigation?.removeEventListener("navigate", onNavigate);
    };
  }, [dirty, uncertain]);
  const memory = useCalendarMemoryDrafts();
  const [memoryId] = useState(() => restored?.id ?? crypto.randomUUID());
  const lastDraft = useRef<MemoryDraft | null>(restored ?? null);
  const saveMemory = memory?.save;
  const removeMemory = memory?.remove;
  useEffect(() => {
    if (!dirty && !restored) {
      const candidate = revertedDraftCandidate(
        dirty,
        Boolean(restored),
        Boolean(pending.current),
        lastDraft.current,
      );
      if (candidate) {
        removeMemory?.(userId, memoryId, candidate);
        if (lastDraft.current === candidate) lastDraft.current = null;
      }
      return;
    }
    const entry: MemoryDraft = {
      id: memoryId,
      ownerId: userId,
      eventId: base?.id ?? null,
      mode,
      values,
      zoneDraft,
      zoneMode,
      ...(appliedZoneMode ? { zoneChangeMode: appliedZoneMode } : {}),
    };
    lastDraft.current = entry;
    saveMemory?.(entry);
  }, [
    dirty,
    restored,
    memoryId,
    userId,
    base?.id,
    mode,
    values,
    zoneDraft,
    zoneMode,
    appliedZoneMode,
    saveMemory,
    removeMemory,
  ]);
  function clearMemory() {
    if (lastDraft.current) removeMemory?.(userId, memoryId, lastDraft.current);
  }
  const requestDismiss = useCallback(() => {
    if (
      !canDismissCalendarForm(busy, uncertain, dirty, (message) =>
        window.confirm(message),
      )
    )
      return;
    if (!uncertain) {
      if (lastDraft.current)
        removeMemory?.(userId, memoryId, lastDraft.current);
    }
    onCancel();
  }, [busy, uncertain, dirty, removeMemory, userId, memoryId, onCancel]);
  useEffect(() => {
    if (!dismissRef) return;
    dismissRef.current = requestDismiss;
    return () => {
      dismissRef.current = null;
    };
  }, [dismissRef, requestDismiss]);
  const schedule = values.schedule;
  const titleLength = unicodeLength(values.title.trim());
  const descriptionLength = unicodeLength(values.description ?? "");
  const titleError =
    fieldErrors.title ??
    (titleLength > 160 ? "Podaj tytuł od 1 do 160 znaków." : undefined);
  const descriptionError =
    fieldErrors.description ??
    (descriptionLength > 2000 ? "Opis może mieć do 2000 znaków." : undefined);
  const patchSchedule = (patch: Partial<CalendarSchedule>) =>
    setValues((current) =>
      current.schedule
        ? { ...current, schedule: { ...current.schedule, ...patch } }
        : current,
    );
  async function send(command: Command) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const stored = sessionStorage.getItem(storageKey(userId));
      if (stored && !samePending(userId, command.requestId)) {
        setError(
          "Istnieje inny oczekujący zapis wydarzenia. Nie nadpisano go.",
        );
        return;
      }
      sessionStorage.setItem(
        storageKey(userId),
        pendingRaw(userId, command.requestId),
      );
      if (!samePending(userId, command.requestId)) throw new Error("storage");
      if (lastDraft.current) {
        const frozen = {
          ...lastDraft.current,
          pendingRequestId: command.requestId,
          pendingCommand: command,
        };
        lastDraft.current = frozen;
        saveMemory?.(frozen);
      }
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
        !samePending(userId, command.requestId)
      )
        throw new Error("receipt mismatch");
      sessionStorage.removeItem(storageKey(userId));
      pending.current = null;
      setUncertain(false);
      invalidateCalendarReads(userId);
      clearMemory();
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
          const raw = pendingRaw(userId, command.requestId);
          const receipt = await request(userId, {
            requestId: command.requestId,
          });
          if (sessionStorage.getItem(storageKey(userId)) !== raw)
            throw new Error("changed");
          if (exactReceipt(receipt, command)) {
            sessionStorage.removeItem(storageKey(userId));
            pending.current = null;
            invalidateCalendarReads(userId);
            clearMemory();
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
      if (definite && samePending(userId, command.requestId)) {
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
      setFieldErrors({ timeZone: "Zastosuj zmianę strefy przed zapisem." });
      return;
    }
    if (mode === "resolve" && values.status === "planned") {
      setFieldErrors({ status: "Wybierz wynik rozliczenia." });
      setError("Sprawdź oznaczone pola formularza.");
      requestAnimationFrame(() =>
        document.getElementById(fieldId("status"))?.focus(),
      );
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
      setFieldErrors(parsed.errors);
      setError("Sprawdź oznaczone pola formularza.");
      const first = Object.keys(parsed.errors)[0];
      requestAnimationFrame(() =>
        document.getElementById(fieldId(first))?.focus(),
      );
      return;
    }
    setFieldErrors({});
    if (base && (base.status !== "planned" || needsConfirm) && !preview) {
      setPreview(true);
      return;
    }
    void send(parsed.data);
  }
  return (
    <form noValidate onSubmit={submit} className="space-y-4" aria-busy={busy}>
      <fieldset
        disabled={busy || uncertain || stale}
        onChange={() => {
          if (preview) setPreview(false);
          if (Object.keys(fieldErrors).length) setFieldErrors({});
        }}
        className="space-y-4"
      >
        <label className="block text-sm font-medium">
          Tytuł wydarzenia
          <input
            ref={titleInput}
            id={fieldId("title")}
            aria-invalid={Boolean(titleError)}
            aria-describedby={`${fieldId("title")}-count${titleError ? ` ${fieldId("title")}-error` : ""}`}
            className={`${inputStyles} mt-1`}
            required
            value={values.title}
            onChange={(e) =>
              setValues((v) => ({ ...v, title: e.target.value }))
            }
          />
        </label>
        <p
          id={`${fieldId("title")}-count`}
          className="text-sm text-muted-foreground"
        >
          {titleLength}/160 znaków
        </p>
        {titleError && (
          <p
            id={`${fieldId("title")}-error`}
            className="text-sm text-destructive"
          >
            {titleError}
          </p>
        )}
        <label
          htmlFor={fieldId("description")}
          className="block text-sm font-medium"
        >
          Opis
        </label>
        <textarea
          id={fieldId("description")}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={`${fieldId("description")}-count${descriptionError ? ` ${fieldId("description")}-error` : ""}`}
          className={`${inputStyles} mt-1`}
          value={values.description ?? ""}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value || null }))
          }
        />
        <p
          id={`${fieldId("description")}-count`}
          className="text-sm text-muted-foreground"
        >
          {descriptionLength}/2000 znaków
        </p>
        {descriptionError && (
          <p
            id={`${fieldId("description")}-error`}
            className="text-sm text-destructive"
          >
            {descriptionError}
          </p>
        )}
        <label className="block text-sm font-medium">
          Sprawa
          <select
            id={fieldId("caseId")}
            aria-invalid={Boolean(fieldErrors.caseId)}
            aria-describedby={
              fieldErrors.caseId ? `${fieldId("caseId")}-error` : undefined
            }
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
        {fieldErrors.caseId && (
          <p
            id={`${fieldId("caseId")}-error`}
            className="text-sm text-destructive"
          >
            {fieldErrors.caseId}
          </p>
        )}
        {schedule && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 font-semibold">Planowany termin</legend>
            <label className="block text-sm font-medium">
              Data
              <input
                id={fieldId("schedule")}
                aria-invalid={Boolean(fieldErrors.schedule)}
                aria-describedby={
                  fieldErrors.schedule
                    ? `${fieldId("schedule")}-error`
                    : undefined
                }
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
            {fieldErrors.schedule && (
              <p
                id={`${fieldId("schedule")}-error`}
                className="text-sm text-destructive"
              >
                {fieldErrors.schedule}
              </p>
            )}
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
              id={fieldId("timeZone")}
              aria-invalid={Boolean(fieldErrors.timeZone)}
              aria-describedby={
                fieldErrors.timeZone
                  ? `${fieldId("timeZone")}-error`
                  : undefined
              }
              className={`${inputStyles} mt-1`}
              required
              value={zoneDraft}
              onChange={(e) => {
                setZoneDraft(e.target.value);
                setZoneMode("");
              }}
            />
          </label>
          {fieldErrors.timeZone && (
            <p
              id={`${fieldId("timeZone")}-error`}
              className="text-sm text-destructive"
            >
              {fieldErrors.timeZone}
            </p>
          )}
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
            <CalendarStatusField
              id={fieldId("status")}
              value={values.status}
              error={fieldErrors.status}
              onChange={(status) => {
                setError(null);
                setValues((v) => ({
                  ...v,
                  status,
                  actual: null,
                  participants: v.participants.map((p) => ({
                    ...p,
                    attendance: "unknown",
                  })),
                }));
              }}
            />
            {values.status === "occurred" && (
              <>
                <p className="text-sm">
                  Pozostaw datę pustą, jeśli rzeczywisty czas jest nieznany.
                  Termin planowany nie jest automatycznie datą odbycia.
                </p>
                <label className="block text-sm font-medium">
                  Rzeczywista data
                  <input
                    id={fieldId("actual")}
                    aria-invalid={Boolean(fieldErrors.actual)}
                    aria-describedby={
                      fieldErrors.actual
                        ? `${fieldId("actual")}-error`
                        : undefined
                    }
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
                {fieldErrors.actual && (
                  <p
                    id={`${fieldId("actual")}-error`}
                    className="text-sm text-destructive"
                  >
                    {fieldErrors.actual}
                  </p>
                )}
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
        <fieldset
          className="space-y-2 rounded-md border border-border p-3"
          aria-describedby={
            fieldErrors.participants
              ? `${fieldId("participants")}-error`
              : undefined
          }
        >
          <legend className="px-1 font-semibold">Uczestnicy</legend>
          {fieldErrors.participants && (
            <p
              id={`${fieldId("participants")}-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {fieldErrors.participants}
            </p>
          )}
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
            onClick={requestDismiss}
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
            onClick={requestDismiss}
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
        <div className="flex flex-wrap gap-2">
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
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={busy}
            onClick={requestDismiss}
          >
            Zamknij formularz
          </button>
        </div>
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
export function EventRow({
  event,
  userId,
  cases,
  contacts,
  onSaved,
  onActivity,
  onDismiss,
  onFocusMissing,
  onFocusRecovery,
  mutationBlocked,
  now,
}: {
  event: CalendarEvent;
  now: Date;
  userId: string;
  cases: Case[];
  contacts: Person[];
  onSaved: () => void;
  onActivity: (event: CalendarEvent, active: boolean, now: Date) => void;
  onDismiss: () => boolean;
  onFocusMissing: () => void;
  onFocusRecovery: () => void;
  mutationBlocked: boolean;
}) {
  const [mode, setMode] = useState<"edit" | "resolve" | null>(null);
  const dialogTitleId = useId();
  const editTrigger = useRef<HTMLButtonElement>(null);
  const resolveTrigger = useRef<HTMLButtonElement>(null);
  const rescheduleTrigger = useRef<HTMLButtonElement>(null);
  const triggerKind = useRef<"edit" | "resolve" | "reschedule">("edit");
  const dismissRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => onActivity(event, false, new Date()),
    [event, onActivity],
  );
  function begin(
    next: "edit" | "resolve",
    trigger: "edit" | "resolve" | "reschedule" = next,
  ) {
    if (mutationBlocked) return;
    triggerKind.current = trigger;
    onActivity(event, true, now);
    setMode(next);
  }
  function end() {
    onActivity(event, false, now);
    setMode(null);
  }
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
        <>
          {mutationBlocked && (
            <p className="text-sm text-muted-foreground">
              Najpierw sprawdź wynik poprzedniego zapisu wydarzenia.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              ref={editTrigger}
              type="button"
              className={buttonStyles.secondary}
              disabled={mutationBlocked}
              onClick={() => begin("edit")}
            >
              {event.status === "planned"
                ? "Edytuj wydarzenie"
                : "Skoryguj wydarzenie"}
            </button>
            {event.status === "planned" && (
              <>
                <button
                  ref={rescheduleTrigger}
                  type="button"
                  className={buttonStyles.secondary}
                  disabled={mutationBlocked}
                  onClick={() => begin("edit", "reschedule")}
                >
                  Przełóż termin
                </button>
                <button
                  ref={resolveTrigger}
                  type="button"
                  className={buttonStyles.secondary}
                  disabled={mutationBlocked}
                  onClick={() => begin("resolve")}
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
              {audit
                ? "Ukryj historię wydarzenia"
                : "Pokaż historię wydarzenia"}
            </button>
          </div>
        </>
      )}
      {mode && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) dismissRef.current?.();
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay" />
            <Dialog.Popup
              {...calendarDialogA11y(
                eventDialogName(mode, event.status),
                dialogTitleId,
              ).popup}
              finalFocus={false}
              className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-card p-4 shadow-xl sm:p-6"
            >
              <Dialog.Title
                {...calendarDialogA11y(
                  eventDialogName(mode, event.status),
                  dialogTitleId,
                ).title}
                className="mb-2 text-lg font-semibold"
              >
                {eventDialogName(mode, event.status)}
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-sm text-muted-foreground">
                Sprawdź dane przed zapisem. Anulowanie nie zmienia wydarzenia.
              </Dialog.Description>
              <EventForm
                userId={userId}
                initial={event}
                cases={cases}
                contacts={contacts}
                mode={mode}
                dismissRef={dismissRef}
                onDone={() => {
                  end();
                  onSaved();
                }}
                onCancel={() => {
                  const target =
                    triggerKind.current === "resolve"
                      ? resolveTrigger
                      : triggerKind.current === "reschedule"
                        ? rescheduleTrigger
                        : editTrigger;
                  end();
                  const pending = onDismiss();
                  requestAnimationFrame(() => {
                    if (pending) {
                      onFocusRecovery();
                      return;
                    }
                    if (target.current?.isConnected) target.current.focus();
                    else onFocusMissing();
                  });
                }}
              />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
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
  const dialogTitleId = useId();
  const memory = useCalendarMemoryDrafts();
  const activateMemory = memory?.activate;
  useEffect(() => {
    activateMemory?.(userId);
  }, [activateMemory, userId]);
  const [restoreMemory, setRestoreMemory] = useState<MemoryDraft | null>(null);
  const [memoryInitial, setMemoryInitial] = useState<
    CalendarEvent | undefined
  >();
  const memoryDrafts =
    memory?.store.ownerId === userId ? memory.store.drafts : [];
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cases, setCases] = useState<Case[]>(
    caseId ? [{ id: caseId, title: caseTitle ?? "Sprawa", status: "" }] : [],
  );
  const [contacts, setContacts] = useState<Person[]>([]);
  const [mode, setMode] = useState<
    "create" | "occurred" | "edit" | "resolve" | null
  >(null);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const occurredTrigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const recoveryTrigger = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dismissRef = useRef<(() => void) | null>(null);
  const [pendingState, setPendingState] = useState<Pending | null | "invalid">(
    null,
  );
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [version, setVersion] = useState(0);
  const readScope = `${userId}:${caseId ?? ""}:${contactId ?? ""}:${compact}:${page}`;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [activeRows, setActiveRows] = useState<string[]>([]);
  const [activeSections, setActiveSections] = useState<
    Record<string, "past" | "upcoming" | "settled">
  >({});
  const onActivity = useCallback(
    (event: CalendarEvent, active: boolean, when: Date) => {
      setActiveRows((current) =>
        active
          ? current.includes(event.id)
            ? current
            : [...current, event.id]
          : current.filter((id) => id !== event.id),
      );
      setActiveSections((current) => {
        if (active)
          return {
            ...current,
            [event.id]: calendarSection(event.status, event.schedule, when),
          };
        const next = { ...current };
        delete next[event.id];
        return next;
      });
    },
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
  function savedRow() {
    reload();
    requestAnimationFrame(() => heading.current?.focus());
  }
  const syncPending = useCallback(() => {
    const current = pendingCommand(userId);
    setPendingState(current);
    return Boolean(current);
  }, [userId]);
  const focusRecovery = useCallback(() => {
    if (recoveryTrigger.current?.isConnected) recoveryTrigger.current.focus();
    else heading.current?.focus();
  }, []);
  function closePanelForm() {
    const currentPending = pendingCommand(userId);
    const target =
      mode === "occurred"
        ? occurredTrigger
        : mode === "create"
          ? createTrigger
          : heading;
    setMemoryInitial(undefined);
    setRestoreMemory(null);
    setMode(null);
    syncPending();
    requestAnimationFrame(() => {
      const focus = calendarDismissFocus(
        currentPending === "invalid"
          ? "invalid"
          : currentPending
            ? "valid"
            : "none",
      );
      const destination =
        focus === "recovery"
          ? recoveryTrigger.current
          : focus === "heading"
            ? heading.current
            : target.current;
      if (destination?.isConnected) destination.focus();
      else heading.current?.focus();
    });
  }
  const focusPanel = useCallback(() => heading.current?.focus(), []);
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
      } catch {
        setPendingState("invalid");
      }
    });
  }, [userId]);
  const [recovered, setRecovered] = useState<CalendarEvent | null>(null);
  const [recoveredReceipt, setRecoveredReceipt] = useState<Record<
    string,
    unknown
  > | null>(null);
  async function recover() {
    if (!pendingState || pendingState === "invalid" || recovering) return;
    const intent = pendingState;
    setRecovering(true);
    setRecoveryMessage(null);
    try {
      if (!samePending(userId, intent.requestId)) throw new Error();
      const receipt = await request(userId, { requestId: intent.requestId });
      if (!samePending(userId, intent.requestId)) throw new Error();
      if (receipt.event && typeof receipt.event === "object") {
        setRecovered(receipt.event as CalendarEvent);
        setRecoveredReceipt(receipt);
        setRecoveryMessage(
          "Odnaleziono zapis. Porównanie z pierwotną treścią po odświeżeniu strony nie jest możliwe; sprawdź wynik i potwierdź.",
        );
      } else {
        setRecovered(null);
        setRecoveredReceipt(null);
        setRecoveryMessage(
          "Nie odnaleziono potwierdzenia. Wynik pozostaje nieznany. Możesz sprawdzić ponownie lub świadomie porzucić oczekiwanie.",
        );
      }
    } catch {
      setRecoveryMessage(
        "Nie można sprawdzić wyniku. Oczekiwanie pozostaje zachowane.",
      );
    } finally {
      setRecovering(false);
    }
  }
  function acknowledge(discard: boolean) {
    if (
      !pendingState ||
      pendingState === "invalid" ||
      !samePending(userId, pendingState.requestId)
    ) {
      setRecoveryMessage("Zachowane oczekiwanie zmieniło się. Odśwież dane.");
      return;
    }
    if (
      discard &&
      !window.confirm(
        "Wynik może być nieznany. Czy na pewno chcesz porzucić oczekiwanie?",
      )
    )
      return;
    sessionStorage.removeItem(storageKey(userId));
    if (!discard && recoveredReceipt && memory?.store.ownerId === userId) {
      const matching = memory.store.drafts.filter(
        (entry) =>
          entry.pendingRequestId === pendingState.requestId &&
          entry.pendingCommand &&
          exactReceipt(recoveredReceipt, entry.pendingCommand) &&
          sameValue(entry.values, entry.pendingCommand.values),
      );
      for (const entry of matching) memory.remove(userId, entry.id, entry);
    }
    setPendingState(null);
    setRecovered(null);
    setRecoveredReceipt(null);
    setRecoveryMessage(
      discard
        ? "Porzucono oczekiwanie. Nie oznacza to cofnięcia ewentualnego zapisu."
        : "Potwierdzono zapoznanie się z odzyskanym zapisem.",
    );
    reload();
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function restoreFromMemory(draft: MemoryDraft) {
    if (
      pendingState ||
      mode ||
      activeRows.length > 0 ||
      draft.ownerId !== userId
    )
      return;
    try {
      let current: CalendarEvent | undefined;
      if (draft.eventId) {
        const body = await request(userId, { eventId: draft.eventId });
        if (
          !body.event ||
          typeof body.event !== "object" ||
          (body.event as CalendarEvent).id !== draft.eventId
        )
          throw new Error();
        current = body.event as CalendarEvent;
      }
      if (!memory?.store.drafts.some((entry) => entry === draft))
        throw new Error();
      setMemoryInitial(current);
      setRestoreMemory(draft);
      setMode(draft.mode);
    } catch {
      setRecoveryMessage(
        "Nie można odczytać aktualnego wydarzenia; szkic pozostaje w pamięci tej karty.",
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
          const focused = document.activeElement;
          const returnFocus =
            focused instanceof HTMLElement &&
            panelRef.current?.contains(focused)
              ? focused
              : null;
          setEvents(allEvents);
          setHasMore(!compact && !contactId && data.hasMore === true);
          setCases(caseRows as Case[]);
          setContacts(peopleRows as Person[]);
          setLoadedScope(readScope);
          if (returnFocus)
            requestAnimationFrame(() => {
              if (!returnFocus.isConnected) heading.current?.focus();
            });
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
    readScope,
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
            (e) =>
              sectionDuringEdit(
                e.status,
                e.schedule,
                now,
                activeSections[e.id],
              ) === "past",
          ),
        ],
        [
          "Nadchodzące wydarzenia",
          list.filter(
            (e) =>
              sectionDuringEdit(
                e.status,
                e.schedule,
                now,
                activeSections[e.id],
              ) === "upcoming",
          ),
        ],
      ]
    : [[title, list]];
  return (
    <section
      ref={panelRef}
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
                ref={recoveryTrigger}
                type="button"
                className={buttonStyles.secondary}
                disabled={recovering}
                onClick={() => void recover()}
              >
                Sprawdź wynik
              </button>
              {recovered ? (
                <>
                  <p>
                    Odzyskane wydarzenie: {recovered.title},{" "}
                    {statusLabel[recovered.status]},{" "}
                    {formatSchedule(recovered.schedule)}
                  </p>
                  <button
                    type="button"
                    className={buttonStyles.secondary}
                    onClick={() => acknowledge(false)}
                  >
                    Potwierdź wynik
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={buttonStyles.secondary}
                  onClick={() => acknowledge(true)}
                >
                  Porzuć oczekiwanie
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {recoveryMessage && <p role="status">{recoveryMessage}</p>}
      {!mode &&
        !pendingState &&
        activeRows.length === 0 &&
        memoryDrafts.map((d) => (
          <div key={d.id} className="rounded-md border border-border p-3">
            <p>Szkic w pamięci: {d.values.title || "Bez tytułu"}</p>
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => void restoreFromMemory(d)}
            >
              Wczytaj szkic
            </button>
          </div>
        ))}
      {mode && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) dismissRef.current?.();
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-overlay" />
            <Dialog.Popup
              {...calendarDialogA11y(panelDialogName(mode), dialogTitleId)
                .popup}
              finalFocus={false}
              className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-card p-4 shadow-xl sm:p-6"
            >
              <Dialog.Title
                {...calendarDialogA11y(panelDialogName(mode), dialogTitleId)
                  .title}
                className="mb-2 text-lg font-semibold"
              >
                {panelDialogName(mode)}
              </Dialog.Title>
              <Dialog.Description className="mb-4 text-sm text-muted-foreground">
                Sprawdź dane przed zapisem. Anulowanie nie zmienia wydarzenia.
              </Dialog.Description>
              <EventForm
                userId={userId}
                caseId={caseId}
                initial={memoryInitial}
                restored={restoreMemory ?? undefined}
                cases={cases}
                contacts={contacts}
                mode={mode}
                dismissRef={dismissRef}
                onDone={() => {
                  setMemoryInitial(undefined);
                  setRestoreMemory(null);
                  setMode(null);
                  reload();
                  requestAnimationFrame(() => heading.current?.focus());
                }}
                onCancel={closePanelForm}
              />
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      {loading && <p role="status">Ładowanie wydarzeń…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          {showCalendarRows(loadedScope, readScope) && (
            <p>Wyświetlone dane mogą być nieaktualne.</p>
          )}
          <button
            type="button"
            className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
            onClick={reload}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      {showCalendarRows(loadedScope, readScope) &&
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
                    onSaved={savedRow}
                    onActivity={onActivity}
                    onDismiss={syncPending}
                    onFocusMissing={focusPanel}
                    onFocusRecovery={focusRecovery}
                    mutationBlocked={Boolean(pendingState)}
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
        <nav
          aria-label="Strony wydarzeń"
          className="flex min-w-0 flex-wrap items-center gap-3"
        >
          <button
            type="button"
            className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
            disabled={page <= 1 || loading}
            onClick={() => setPage((n) => n - 1)}
          >
            Poprzednia strona
          </button>
          <span>Strona {page}</span>
          <button
            type="button"
            className={`${buttonStyles.secondary} max-w-full whitespace-normal [overflow-wrap:anywhere]`}
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
