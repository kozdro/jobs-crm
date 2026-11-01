"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Plus, X, LoaderCircle } from "lucide-react";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import {
  isCalendarDate,
  warsawToday,
} from "@/modules/recruitment/domain/case-events";
import { getRecruitmentCaseByRequestId } from "@/modules/recruitment/application/cases";
import type {
  QuickCaptureAction,
  QuickCaptureAtomicInput,
  QuickCaptureAtomicIntent,
  QuickCaptureAtomicReceipt,
  QuickCaptureAtomicResult,
} from "@/modules/recruitment/domain/quick-capture-atomic";
import {
  parseCreateCaseInput,
  type RecruitmentCase,
  uuidPattern,
} from "@/modules/recruitment/domain/recruitment-case";
import {
  captureActionLabel,
  captureStatus,
  intentStorageKey,
  makeCaptureAction,
  parsePendingIntent,
  resolveSaveNext,
  type CaptureActionKind,
} from "./intent";
import { SavedCaseNotice } from "./saved-case-notice";
import { recoveryRequiresLogin } from "./recovery-session";
import { buttonStyles, inputStyles } from "@/components/ui/styles";

const buttonClass = buttonStyles.secondary;
const primaryClass = buttonStyles.primary;
const inputClass = inputStyles;
const steps = ["Sytuacja", "Dane", "Działanie", "Podsumowanie"];
// UX Blueprint §3: presentation-only intent, never a case type or a business fact.
const situations = [
  "Zapisana oferta",
  "Wykonana aplikacja",
  "Kontakt",
  "Spontaniczna kandydatura",
  "Inna / bez określenia",
] as const;
type DuplicateResult = Extract<
  QuickCaptureAtomicResult,
  { kind: "duplicates" }
>;
type AtomicCaptureAction = QuickCaptureAction;
type AtomicCaptureCommand = Pick<
  QuickCaptureAtomicInput,
  "contractVersion" | "requestId" | "intent"
>;
type AtomicCaptureReceipt = QuickCaptureAtomicReceipt;
function sameAtomicIntent(
  left: QuickCaptureAtomicIntent,
  right: QuickCaptureAtomicIntent,
) {
  if (
    left.title !== right.title ||
    left.description !== right.description ||
    left.sourceUrl !== right.sourceUrl ||
    left.action.kind !== right.action.kind
  )
    return false;
  if (left.action.kind === "save_only")
    return right.action.kind === "save_only";
  return (
    right.action.kind !== "save_only" &&
    left.action.occurredOn === right.action.occurredOn &&
    left.action.factConfirmed === right.action.factConfirmed
  );
}
function isAtomicReceipt(
  value: unknown,
  requestId: string,
): value is AtomicCaptureReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Partial<AtomicCaptureReceipt>;
  const intent = receipt.intent;
  const action = intent?.action;
  return Boolean(
    receipt.requestId === requestId &&
    receipt.contractVersion === 1 &&
    typeof receipt.intentFingerprint === "string" &&
    /^[0-9a-f]{32}$/.test(receipt.intentFingerprint) &&
    typeof receipt.recordedAt === "string" &&
    Number.isFinite(Date.parse(receipt.recordedAt)) &&
    intent &&
    typeof intent.title === "string" &&
    (typeof intent.description === "string" || intent.description === null) &&
    (typeof intent.sourceUrl === "string" || intent.sourceUrl === null) &&
    action &&
    (action.kind === "save_only"
      ? Object.keys(action).length === 1
      : ["application", "contact_inbound", "contact_outbound"].includes(
          action.kind,
        ) &&
        Object.keys(action).length === 3 &&
        (action.occurredOn === null ||
          (typeof action.occurredOn === "string" &&
            isCalendarDate(action.occurredOn))) &&
        action.factConfirmed === true) &&
    receipt.case &&
    typeof receipt.case.id === "string" &&
    uuidPattern.test(receipt.case.id) &&
    typeof receipt.case.title === "string" &&
    ["Zapisane", "Kontakt rozpoczęty"].includes(receipt.case.status) &&
    (receipt.event === null || typeof receipt.event === "object"),
  );
}

function isAtomicDuplicateResult(value: unknown): value is DuplicateResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<DuplicateResult>;
  return Boolean(
    result.kind === "duplicates" &&
    Array.isArray(result.matches) &&
    result.matches.length > 0 &&
    result.matches.length <= 20 &&
    result.matches.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        uuidPattern.test(item.id) &&
        typeof item.title === "string" &&
        typeof item.status === "string",
    ) &&
    typeof result.hasMore === "boolean" &&
    typeof result.intentFingerprint === "string" &&
    /^[0-9a-f]{32}$/.test(result.intentFingerprint) &&
    typeof result.matchSetFingerprint === "string" &&
    /^[0-9a-f]{32}$/.test(result.matchSetFingerprint),
  );
}

export function QuickCapture({ userId }: { userId: string }) {
  // A changed verified owner gets a new draft lifetime, including every portal.
  return <CaptureSession key={userId} userId={userId} />;
}

function CaptureSession({ userId }: { userId: string }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const discardPopupRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);
  const liveRef = useRef(true);
  const lifetimeRef = useRef(0);
  const frozenRef = useRef<AtomicCaptureCommand | null>(null);
  const saveNextRef = useRef(false);
  const [sessionLive, setSessionLive] = useState(true);
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const [step, setStep] = useState(0);
  const [situation, setSituation] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [actionKind, setActionKind] = useState<CaptureActionKind | null>(null);
  const [occurredOn, setOccurredOn] = useState("");
  const [factConfirmed, setFactConfirmed] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [pending, setPending] = useState(false);
  const [payloadFrozen, setPayloadFrozen] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<"title" | "description" | "sourceUrl", string>>
  >({});
  const [toast, setToast] = useState<RecruitmentCase | null>(null);
  const [toastOutcome, setToastOutcome] = useState<string | null>(null);
  const dirty = Boolean(
    situation || title || description || sourceUrl || actionKind,
  );

  function clearStoredIntent() {
    try {
      sessionStorage.removeItem(intentStorageKey);
    } catch {
      /* Current-tab idempotence still holds without storage. */
    }
  }
  function rememberIntent(id: string) {
    try {
      sessionStorage.setItem(
        intentStorageKey,
        JSON.stringify({ ownerId: userId, requestId: id }),
      );
    } catch {
      /* Refresh recovery is conditional on a preserved identifier. */
    }
  }
  function resetDraft(id = crypto.randomUUID()) {
    setRequestId(id);
    setSituation("");
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setActionKind(null);
    setOccurredOn("");
    setFactConfirmed(false);
    setStep(0);
    setError(null);
    setErrors({});
    setDuplicates(null);
    setUncertain(false);
    setPayloadFrozen(false);
    setRetryAvailable(false);
    saveNextRef.current = false;
    frozenRef.current = null;
  }
  function success(
    item: RecruitmentCase,
    addNext: boolean,
    savedAction: AtomicCaptureAction = { kind: "save_only" },
  ) {
    clearStoredIntent();
    setToast(item);
    setToastOutcome(
      `${captureActionLabel(savedAction.kind)}. Status po zapisie: ${item.status}${
        savedAction.kind !== "save_only"
          ? `; dzień działania: ${savedAction.occurredOn || "nieznany"}`
          : "; bez zdarzenia aplikowania lub kontaktu"
      }.`,
    );
    resetDraft();
    setOpen(addNext);
    router.refresh();
  }
  function hidePrivateDraft() {
    liveRef.current = false;
    lifetimeRef.current += 1;
    // Portals are outside AccountSession's hidden subtree. Hide synchronously.
    if (popupRef.current) popupRef.current.hidden = true;
    if (discardPopupRef.current) discardPopupRef.current.hidden = true;
    setSessionLive(false);
    setOpen(false);
    setDiscard(false);
    setToast(null);
    resetDraft("");
    pendingRef.current = false;
    setPending(false);
    setRecovering(false);
  }
  function requireLogin() {
    // Keep only the owner-scoped intent identifier so a later login can recover it.
    hidePrivateDraft();
    window.location.replace("/login");
  }
  async function recover(id: string) {
    if (pendingRef.current) return;
    const lifetime = lifetimeRef.current;
    const currentLifetime = () =>
      liveRef.current && lifetimeRef.current === lifetime;
    pendingRef.current = true;
    setRecovering(true);
    try {
      const client = getBrowserClient();
      const current = await client.auth.getUser();
      if (!currentLifetime()) return;
      if (current.error && !recoveryRequiresLogin(current.error)) {
        throw new Error("Session verification unavailable");
      }
      if (current.error || current.data.user?.id !== userId) {
        requireLogin();
        return;
      }
      const response = await fetch(
        `/recruitments/commands?requestId=${encodeURIComponent(id)}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!currentLifetime()) return;
      if (response.status === 401 || response.status === 403) {
        requireLogin();
        return;
      }
      if (!response.ok) throw new Error("Receipt recovery unavailable");
      const result = (await response.json()) as unknown;
      if (!currentLifetime()) return;
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new Error("Malformed receipt recovery response");
      const envelope = result as Record<string, unknown>;
      if (envelope.kind === "receipt") {
        if (
          Object.keys(envelope).length !== 2 ||
          !isAtomicReceipt(envelope.receipt, id)
        )
          throw new Error("Malformed receipt recovery response");
        const receipt = envelope.receipt;
        if (
          frozenRef.current &&
          !sameAtomicIntent(receipt.intent, frozenRef.current.intent)
        ) {
          setUncertain(true);
          setRetryAvailable(false);
          setError(
            "Wynik wcześniejszego zapisu dotyczy innych danych. Zachowano bieżący szkic i identyfikator; nie potwierdzono go jako zapisanego.",
          );
          return;
        }
        success(receipt.case, false, receipt.intent.action);
        return;
      }
      if (envelope.kind !== "not-found" || Object.keys(envelope).length !== 1)
        throw new Error("Malformed receipt recovery response");
      // Legacy save-only requests predate immutable atomic receipts. Keep their
      // owner-scoped recovery path without promoting them to fact-bearing writes.
      const legacy = await getRecruitmentCaseByRequestId(client, id);
      if (!currentLifetime()) return;
      if (legacy) {
        success(legacy, false);
        return;
      }
      setUncertain(true);
      const canRetryInMemory = Boolean(frozenRef.current);
      setRetryAvailable(canRetryInMemory);
      setError(
        canRetryInMemory
          ? "Nie znaleziono potwierdzonego wyniku. Możesz sprawdzić ponownie albo ponowić dokładnie ten sam zapis z niezmienionym identyfikatorem. Brak wyniku nie oznacza cofnięcia zapisu."
          : "Nie znaleziono potwierdzonego wyniku. Po odświeżeniu nie zachowujemy treści szkicu w przeglądarce, więc nie można bezpiecznie ponowić tego zapisu. Sprawdź swoją listę spraw albo porzuć lokalny zamiar. Brak wyniku nie oznacza cofnięcia zapisu.",
      );
    } catch {
      if (currentLifetime())
        setError(
          "Nie można teraz sprawdzić poprzedniego zapisu. Zachowano identyfikator; spróbuj ponownie.",
        );
    } finally {
      if (lifetimeRef.current === lifetime) {
        pendingRef.current = false;
        setRecovering(false);
      }
    }
  }
  useEffect(() => {
    liveRef.current = true;
    let active = true;
    const client = getBrowserClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId))
        hidePrivateDraft();
    });
    const stored = parsePendingIntent(sessionStorageSafeRead(), userId);
    if (stored)
      void Promise.resolve().then(() => {
        if (!active) return;
        setRequestId(stored.requestId);
        setUncertain(true);
        void recover(stored.requestId);
      });
    function pageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      void fetch("/auth/user", { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (active && response.ok && result.user?.id === userId) {
            const outstanding = parsePendingIntent(
              sessionStorageSafeRead(),
              userId,
            );
            resetDraft(outstanding?.requestId);
            liveRef.current = true;
            setSessionLive(true);
            if (outstanding) {
              setUncertain(true);
              void recover(outstanding.requestId);
            }
          } else if (active) {
            requireLogin();
          }
        })
        .catch(() => {
          /* AccountSession keeps private content hidden on failed verification. */
        });
    }
    window.addEventListener("pagehide", hidePrivateDraft);
    window.addEventListener("pageshow", pageShow);
    return () => {
      active = false;
      liveRef.current = false;
      lifetimeRef.current += 1;
      data.subscription.unsubscribe();
      window.removeEventListener("pagehide", hidePrivateDraft);
      window.removeEventListener("pageshow", pageShow);
    };
    // Identity owns the entire draft lifetime. Recovery runs only at mount/identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (step === 1) titleRef.current?.focus();
      else headingRef.current?.focus();
    });
  }, [open, step]);
  useEffect(() => {
    if (!open || !dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (liveRef.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [open, dirty]);

  function report(message: string) {
    setError(message);
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }
  function input() {
    return parseCreateCaseInput({
      requestId,
      title,
      description,
      sourceUrl,
      allowDuplicate: false,
    });
  }
  function next() {
    setError(null);
    if (step === 1) {
      const parsed = input();
      if (!parsed.success) {
        setErrors(parsed.errors);
        report("Sprawdź nazwę sprawy, opis i URL.");
        requestAnimationFrame(() => titleRef.current?.focus());
        return;
      }
      setErrors({});
    }
    if (step === 2) {
      if (!actionKind) {
        report("Wybierz, czy zapisać tylko sprawę, czy potwierdzić działanie.");
        return;
      }
      if (
        actionKind !== "save_only" &&
        occurredOn &&
        (!isCalendarDate(occurredOn) || occurredOn > warsawToday())
      ) {
        report("Podaj prawidłowy dzień działania, nie późniejszy niż dzisiaj.");
        return;
      }
      if (actionKind !== "save_only" && !factConfirmed) {
        report("Potwierdź, że to działanie rzeczywiście miało miejsce.");
        return;
      }
    }
    setStep(step + 1);
  }
  function requestClose() {
    if (pendingRef.current || recovering) return;
    if (uncertain) {
      setDiscard(true);
      return;
    }
    if (dirty) setDiscard(true);
    else {
      setOpen(false);
      resetDraft();
    }
  }
  function start() {
    if (
      !liveRef.current ||
      pendingRef.current ||
      recovering ||
      (uncertain && !retryAvailable)
    )
      return;
    if (!requestId) resetDraft();
    setToast(null);
    setToastOutcome(null);
    setOpen(true);
  }
  function requestAbandon() {
    if (pendingRef.current || recovering) return;
    setOpen(true);
    setDiscard(true);
  }
  function guardDuplicateNavigation(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (pendingRef.current || recovering) {
      event.preventDefault();
      return;
    }
    if (dirty || uncertain) {
      event.preventDefault();
      setPendingNavigation(href);
      setDiscard(true);
    }
  }
  async function save(addNext = false, allowDuplicate = false) {
    if (pendingRef.current || !liveRef.current || recovering) return;
    const lifetime = lifetimeRef.current;
    const currentLifetime = () =>
      liveRef.current && lifetimeRef.current === lifetime;
    const parsed = input();
    if (!parsed.success) {
      setErrors(parsed.errors);
      setStep(1);
      report("Sprawdź wprowadzone dane.");
      return;
    }
    const action = makeCaptureAction(actionKind, occurredOn, factConfirmed);
    if (!frozenRef.current && !action) {
      setStep(2);
      report(
        !actionKind
          ? "Wybierz działanie."
          : "Potwierdź, że to działanie rzeczywiście miało miejsce.",
      );
      return;
    }
    if (
      !frozenRef.current &&
      action?.kind !== "save_only" &&
      action?.occurredOn &&
      (!isCalendarDate(action.occurredOn) || action.occurredOn > warsawToday())
    ) {
      setStep(2);
      report("Podaj prawidłowy dzień działania, nie późniejszy niż dzisiaj.");
      return;
    }
    const command: AtomicCaptureCommand = frozenRef.current ?? {
      contractVersion: 1,
      requestId: parsed.data.requestId,
      intent: {
        title: parsed.data.title,
        description: parsed.data.description,
        sourceUrl: parsed.data.sourceUrl,
        action: action!,
      },
    };
    pendingRef.current = true;
    setPending(true);
    setPayloadFrozen(true);
    saveNextRef.current = addNext;
    setError(null);
    frozenRef.current = command;
    setRetryAvailable(true);
    rememberIntent(command.requestId);
    try {
      const response = await fetch("/recruitments/commands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractVersion: command.contractVersion,
          requestId: command.requestId,
          intent: command.intent,
          expectedUserId: userId,
          ...(allowDuplicate && duplicates
            ? {
                duplicateAcknowledgement: {
                  intentFingerprint: duplicates.intentFingerprint,
                  matchSetFingerprint: duplicates.matchSetFingerprint,
                  createSeparateCase: true,
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!currentLifetime()) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          requireLogin();
          return;
        }
        if (response.status === 400) {
          frozenRef.current = null;
          setPayloadFrozen(false);
          setUncertain(false);
          setRetryAvailable(false);
          clearStoredIntent();
          report(
            "Dane nie zostały przyjęte. Sprawdź formularz i spróbuj ponownie.",
          );
        } else {
          setUncertain(true);
          if (response.status === 409) setRetryAvailable(false);
          report(
            response.status === 409
              ? "Ten identyfikator zapisu dotyczy innych danych. Sprawdź wynik wcześniejszego zapisu; niczego nie nadpisano."
              : "Nie potwierdzono zapisu. Zachowano dane i identyfikator. Ponów zapis, aby ustalić wynik.",
          );
        }
        return;
      }
      const result = (await response.json()) as unknown;
      if (!currentLifetime()) return;
      if (isAtomicDuplicateResult(result)) {
        setDuplicates(result);
        setUncertain(false);
        frozenRef.current = null;
        setPayloadFrozen(false);
        setRetryAvailable(false);
        clearStoredIntent();
        requestAnimationFrame(() => feedbackRef.current?.focus());
      } else if (
        result &&
        typeof result === "object" &&
        ((result as { kind?: unknown }).kind === "created" ||
          (result as { kind?: unknown }).kind === "replayed") &&
        isAtomicReceipt(
          (result as { receipt?: unknown }).receipt,
          command.requestId,
        )
      ) {
        const receipt = (result as { receipt: AtomicCaptureReceipt }).receipt;
        if (sameAtomicIntent(receipt.intent, command.intent)) {
          success(receipt.case, addNext, receipt.intent.action);
        } else {
          setUncertain(true);
          setRetryAvailable(false);
          report(
            "Wynik zapisu dotyczy innych danych. Zachowano bieżący szkic i identyfikator; nie potwierdzono go jako zapisanego.",
          );
        }
      } else {
        setUncertain(true);
        report("Nie potwierdzono wyniku zapisu. Ponów tę samą operację.");
      }
    } catch {
      if (currentLifetime()) {
        setUncertain(true);
        report(
          "Nie potwierdzono zapisu. Zachowano dane i identyfikator. Ponów zapis, aby ustalić wynik.",
        );
      }
    } finally {
      if (lifetimeRef.current === lifetime) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  }
  const summary = input();
  const currentAction = makeCaptureAction(
    actionKind,
    occurredOn,
    factConfirmed,
  );
  const frozen = payloadFrozen || pending;
  if (!sessionLive) return null;
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        onClick={start}
        disabled={recovering || (uncertain && !retryAvailable)}
        className={primaryClass}
      >
        <Plus aria-hidden="true" size={18} />
        Dodaj
      </Button>
      {recovering && (
        <p role="status" className="text-sm text-muted-foreground">
          Sprawdzanie poprzedniego zapisu…
        </p>
      )}
      {!open && error && (
        <div className="basis-full space-y-2">
          <p role="alert" className="max-w-xl text-sm leading-6">
            {error}
          </p>
          <Button
            type="button"
            className={buttonClass}
            onClick={() => void recover(requestId)}
            disabled={recovering}
          >
            Sprawdź wynik zapisu
          </Button>
          {uncertain && (
            <Button
              type="button"
              className={buttonClass}
              onClick={requestAbandon}
              disabled={recovering}
            >
              Porzuć ten zapis
            </Button>
          )}
        </div>
      )}
      <SavedCaseNotice
        item={open ? null : toast}
        floating
        onDismiss={() => {
          setToast(null);
          setToastOutcome(null);
        }}
      />
      {!open && toastOutcome && (
        <p role="status" className="basis-full text-sm text-muted-foreground">
          {toastOutcome}
        </p>
      )}
      <Dialog.Root
        open={open}
        disablePointerDismissal
        onOpenChange={(value, details) => {
          if (!value) {
            details.cancel();
            if (!discard) requestClose();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-overlay" />
          <Dialog.Popup
            aria-modal="true"
            ref={popupRef}
            initialFocus={headingRef}
            finalFocus={triggerRef}
            className="fixed inset-0 z-50 flex max-h-dvh min-w-0 flex-col overflow-y-auto bg-card p-5 text-foreground shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[min(40rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-8"
          >
            <div className="flex items-start justify-between gap-3">
              <Dialog.Title className="text-xl font-semibold">
                Dodaj ręcznie
              </Dialog.Title>
              <Dialog.Close
                aria-label="Zamknij"
                disabled={pending || recovering}
                className={buttonClass}
              >
                <X aria-hidden="true" size={18} />
              </Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
              Zapisz kontekst sprawy. Wystarczy nazwa.
            </Dialog.Description>
            <div className={toast ? "mt-4" : undefined}>
              <SavedCaseNotice
                item={open ? toast : null}
                onDismiss={() => {
                  setToast(null);
                  setToastOutcome(null);
                }}
              />
              {open && toastOutcome && (
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  {toastOutcome}
                </p>
              )}
            </div>
            <ol
              className="mt-6 grid grid-cols-4 gap-2 border-b border-border pb-5"
              aria-label="Postęp dodawania sprawy"
            >
              {steps.map((name, index) => (
                <li
                  key={name}
                  aria-current={index === step ? "step" : undefined}
                  className={`flex min-w-0 flex-col gap-2 text-xs ${index === step ? "font-semibold text-primary" : "text-muted-foreground"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-7 items-center justify-center rounded-sm border ${index === step ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                  >
                    {index + 1}
                  </span>
                  <span aria-hidden="true" className="text-[11px] sm:text-xs">
                    {name}
                  </span>
                  <span className="sr-only">
                    Krok {index + 1} z 4: {name}
                  </span>
                </li>
              ))}
            </ol>
            <h3
              ref={headingRef}
              tabIndex={-1}
              aria-describedby={
                open && toast ? "capture-success-message" : undefined
              }
              className="mt-6 text-lg font-semibold outline-none"
            >
              {steps[step]}
            </h3>
            <div className="mt-4 min-w-0 space-y-5">
              {step === 0 && (
                <fieldset className="min-w-0 space-y-3" disabled={frozen}>
                  <legend className="mb-3 text-sm font-medium">
                    Co chcesz zapisać? (opcjonalnie)
                  </legend>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Wybór pomaga opisać sytuację. Sam nie potwierdza aplikowania
                    ani kontaktu i nie zmienia statusu sprawy. Możesz też
                    przejść dalej bez wyboru.
                  </p>
                  {situations.map((value) => (
                    <label
                      key={value}
                      className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="case-situation"
                        value={value}
                        checked={situation === value}
                        onChange={() => setSituation(value)}
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {step === 1 && (
                <>
                  <div className="space-y-2">
                    <label
                      htmlFor="case-title"
                      className="block text-sm font-medium"
                    >
                      Nazwa sprawy
                    </label>
                    <input
                      ref={titleRef}
                      id="case-title"
                      value={title}
                      onChange={(event) => {
                        setTitle(event.target.value);
                        setDuplicates(null);
                      }}
                      disabled={frozen}
                      aria-invalid={Boolean(errors.title)}
                      aria-describedby={`case-title-hint${errors.title ? " case-title-error" : ""}`}
                      className={inputClass}
                    />
                    <p
                      id="case-title-hint"
                      className="text-xs text-muted-foreground"
                    >
                      1–160 znaków po usunięciu otaczających spacji.{" "}
                      {Array.from(title.trim()).length}/160
                    </p>
                    {errors.title && (
                      <p
                        id="case-title-error"
                        className="text-sm text-destructive"
                      >
                        {errors.title}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="case-url"
                      className="block text-sm font-medium"
                    >
                      URL źródłowy (opcjonalnie)
                    </label>
                    <input
                      id="case-url"
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      value={sourceUrl}
                      onChange={(event) => {
                        setSourceUrl(event.target.value);
                        setDuplicates(null);
                      }}
                      disabled={frozen}
                      aria-invalid={Boolean(errors.sourceUrl)}
                      aria-describedby={`case-url-hint${errors.sourceUrl ? " case-url-error" : ""}`}
                      className={inputClass}
                    />
                    <p
                      id="case-url-hint"
                      className="text-xs leading-5 text-muted-foreground"
                    >
                      Absolutny adres HTTP lub HTTPS. Zapisanie adresu nie
                      pobiera strony.
                    </p>
                    {errors.sourceUrl && (
                      <p
                        id="case-url-error"
                        className="text-sm text-destructive"
                      >
                        {errors.sourceUrl}
                      </p>
                    )}
                  </div>
                  <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium underline underline-offset-4">
                      Więcej szczegółów
                    </summary>
                    <div className="space-y-2">
                      <label
                        htmlFor="case-description"
                        className="block text-sm font-medium"
                      >
                        Opis (opcjonalnie)
                      </label>
                      <textarea
                        id="case-description"
                        rows={5}
                        value={description}
                        onChange={(event) => {
                          setDescription(event.target.value);
                          setDuplicates(null);
                        }}
                        disabled={frozen}
                        aria-invalid={Boolean(errors.description)}
                        aria-describedby={`case-description-hint${errors.description ? " case-description-error" : ""}`}
                        className={inputClass}
                      />
                      <p
                        id="case-description-hint"
                        className="text-xs text-muted-foreground"
                      >
                        Do 2000 znaków. {Array.from(description.trim()).length}
                        /2000
                      </p>
                      {errors.description && (
                        <p
                          id="case-description-error"
                          className="text-sm text-destructive"
                        >
                          {errors.description}
                        </p>
                      )}
                    </div>
                  </details>
                </>
              )}
              {step === 2 && (
                <fieldset className="space-y-3" disabled={frozen}>
                  <legend className="mb-2 text-sm font-medium">
                    Co chcesz rzeczywiście zarejestrować?
                  </legend>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Wybór Sytuacji nie wybiera Działania. Możesz zapisać samą
                    sprawę albo jawnie potwierdzić jeden rzeczywisty fakt.
                  </p>
                  {(
                    [
                      ["save_only", "Zapisz tylko sprawę"],
                      ["application", "Rzeczywiście aplikowano"],
                      ["contact_inbound", "Kontakt przychodzący (inbound)"],
                      ["contact_outbound", "Kontakt wychodzący (outbound)"],
                    ] as const
                  ).map(([kind, label]) => (
                    <label
                      key={kind}
                      className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-input p-4 text-sm has-checked:border-primary has-checked:bg-accent"
                    >
                      <input
                        type="radio"
                        name="case-action"
                        value={kind}
                        checked={actionKind === kind}
                        onChange={() => {
                          setActionKind(kind);
                          setFactConfirmed(false);
                          setDuplicates(null);
                        }}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {actionKind === "save_only" && (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Sprawa otrzyma status „Zapisane”. Nie zapisze się fakt
                      aplikowania ani kontaktu, także gdy Sytuacja opisuje
                      wykonaną aplikację.
                    </p>
                  )}
                  {actionKind && actionKind !== "save_only" && (
                    <div className="space-y-4 rounded-lg border border-border p-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="case-action-date"
                          className="block text-sm font-medium"
                        >
                          Dzień działania (opcjonalnie)
                        </label>
                        <input
                          id="case-action-date"
                          type="date"
                          max={warsawToday()}
                          value={occurredOn}
                          onChange={(event) => {
                            setOccurredOn(event.target.value);
                            setFactConfirmed(false);
                            setDuplicates(null);
                          }}
                          aria-describedby="case-action-date-hint"
                          className={inputClass}
                        />
                        <p
                          id="case-action-date-hint"
                          className="text-xs leading-5 text-muted-foreground"
                        >
                          Puste pole oznacza, że dzień jest nieznany. Nie
                          zastępujemy go datą zapisu w CRM.
                        </p>
                      </div>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={factConfirmed}
                          onChange={(event) => {
                            setFactConfirmed(event.target.checked);
                            setDuplicates(null);
                          }}
                          className="mt-0.5 size-4 shrink-0 accent-primary"
                        />
                        <span>
                          Potwierdzam, że to działanie rzeczywiście miało
                          miejsce
                        </span>
                      </label>
                    </div>
                  )}
                </fieldset>
              )}
              {step === 3 && summary.success && (
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      Sytuacja (pomocniczo)
                    </dt>
                    <dd className="mt-1 space-y-2">
                      <span>{situation || "Nie określono"}</span>
                      <Button
                        type="button"
                        disabled={frozen || recovering}
                        className={buttonClass}
                        onClick={() => {
                          setError(null);
                          setStep(0);
                        }}
                      >
                        Popraw sytuację
                      </Button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Nazwa sprawy</dt>
                    <dd className="mt-1 space-y-2">
                      <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {summary.data.title}
                      </span>
                      <Button
                        type="button"
                        disabled={frozen || recovering}
                        className={buttonClass}
                        onClick={() => {
                          setError(null);
                          setStep(1);
                        }}
                      >
                        Popraw dane
                      </Button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status po zapisie</dt>
                    <dd className="mt-1">
                      {actionKind ? captureStatus(actionKind) : "Do ustalenia"}
                    </dd>
                  </div>
                  {summary.data.description && (
                    <div>
                      <dt className="text-muted-foreground">Opis</dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {summary.data.description}
                      </dd>
                    </div>
                  )}
                  {summary.data.sourceUrl && (
                    <div>
                      <dt className="text-muted-foreground">URL źródłowy</dt>
                      <dd className="mt-1 break-all">
                        {summary.data.sourceUrl}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">
                      Rzeczywiście rejestrowane działanie
                    </dt>
                    <dd className="mt-1">
                      {actionKind
                        ? captureActionLabel(actionKind)
                        : "Nie wybrano"}
                    </dd>
                  </div>
                  {currentAction && currentAction.kind !== "save_only" && (
                    <>
                      <div>
                        <dt className="text-muted-foreground">
                          Dzień działania
                        </dt>
                        <dd className="mt-1">
                          {currentAction.occurredOn || "Nieznany"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Potwierdzenie faktu
                        </dt>
                        <dd className="mt-1">Tak</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Zmiana działania</dt>
                    <dd className="mt-1">
                      <Button
                        type="button"
                        disabled={frozen || recovering}
                        className={buttonClass}
                        onClick={() => {
                          setError(null);
                          setStep(2);
                        }}
                      >
                        Popraw działanie
                      </Button>
                    </dd>
                  </div>
                </dl>
              )}
              {duplicates && (
                <section
                  className="space-y-3 rounded-lg border border-warning bg-warning-surface p-4 text-warning"
                  aria-label="Potencjalne duplikaty"
                >
                  <p
                    ref={feedbackRef}
                    role="alert"
                    tabIndex={-1}
                    className="text-sm font-medium outline-none"
                  >
                    Potencjalny duplikat: masz już podobne sprawy.
                  </p>
                  <ul className="space-y-2 text-sm">
                    {duplicates.matches.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/recruitments/${item.id}`}
                          onClick={(event) =>
                            guardDuplicateNavigation(
                              event,
                              `/recruitments/${item.id}`,
                            )
                          }
                          className="inline-flex min-h-11 items-center break-words underline underline-offset-4 [overflow-wrap:anywhere]"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {duplicates.hasMore && (
                    <p className="text-sm">
                      Pokazano pierwsze 20 dopasowań. Więcej spraw znajdziesz na
                      swojej liście.
                    </p>
                  )}
                  <p className="text-sm leading-6">
                    Możesz otworzyć istniejącą sprawę lub świadomie utworzyć
                    niezależną nową.
                  </p>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      void save(
                        resolveSaveNext(
                          "confirm-duplicate",
                          false,
                          saveNextRef.current,
                        ),
                        true,
                      )
                    }
                    className={primaryClass}
                  >
                    Utwórz nową sprawę
                  </Button>
                </section>
              )}
              {error && (
                <p
                  ref={feedbackRef}
                  role="alert"
                  tabIndex={-1}
                  className="rounded-lg border border-destructive bg-destructive-surface p-3 text-sm leading-6 text-destructive outline-none"
                >
                  {error}
                </p>
              )}
              {uncertain && (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => void recover(requestId)}
                    disabled={pending || recovering}
                    className={buttonClass}
                  >
                    Sprawdź wynik zapisu
                  </Button>
                  <Button
                    type="button"
                    onClick={requestAbandon}
                    disabled={pending || recovering}
                    className={buttonClass}
                  >
                    Porzuć ten zapis
                  </Button>
                </div>
              )}
            </div>
            <footer
              className="mt-8 flex flex-wrap gap-3 border-t border-border pt-5"
              aria-busy={pending || recovering}
            >
              <Button
                type="button"
                onClick={requestClose}
                disabled={pending || recovering}
                className={buttonClass}
              >
                Anuluj
              </Button>
              {step > 0 && (
                <Button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setDuplicates(null);
                    setStep(step - 1);
                  }}
                  disabled={pending || frozen || recovering}
                  className={buttonClass}
                >
                  Wstecz
                </Button>
              )}
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={next}
                  disabled={pending || recovering}
                  className={primaryClass}
                >
                  Dalej
                </Button>
              ) : (
                !duplicates && (
                  <>
                    <Button
                      type="button"
                      onClick={() =>
                        void save(
                          resolveSaveNext(
                            "save",
                            payloadFrozen && uncertain,
                            saveNextRef.current,
                          ),
                        )
                      }
                      disabled={pending || recovering}
                      className={primaryClass}
                    >
                      {pending && (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      )}
                      Zapisz
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void save(true)}
                      disabled={pending || recovering || uncertain}
                      className={buttonClass}
                    >
                      Zapisz i dodaj kolejną
                    </Button>
                  </>
                )
              )}
            </footer>
            <AlertDialog.Root
              open={discard}
              onOpenChange={(value, details) => {
                if (details.reason === "escape-key")
                  details.event.stopPropagation();
                setDiscard(value);
                if (!value) setPendingNavigation(null);
              }}
            >
              <AlertDialog.Portal>
                <AlertDialog.Backdrop className="fixed inset-0 z-60 bg-overlay" />
                <AlertDialog.Popup
                  aria-modal="true"
                  ref={discardPopupRef}
                  className="fixed left-1/2 top-1/2 z-70 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-xl outline-none"
                >
                  <AlertDialog.Title className="text-lg font-semibold">
                    {uncertain
                      ? "Porzucić niepotwierdzony zapis?"
                      : "Odrzucić zmiany?"}
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                    {uncertain
                      ? "Wynik zapisu jest nieznany. Sprawa mogła już zostać utworzona. Porzucenie formularza nie cofa ani nie usuwa zapisu. Sprawdź swoją listę przed utworzeniem kolejnej sprawy."
                      : "Wprowadzone dane nie zostały zapisane. Możesz kontynuować edycję albo odrzucić ten formularz."}
                  </AlertDialog.Description>
                  {uncertain && (
                    <Link
                      href="/recruitments"
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        setDiscard(false);
                        setOpen(false);
                        setPendingNavigation(null);
                        // Viewing the list is not abandoning or rolling back this intent.
                        if (
                          window.location.pathname === "/recruitments" &&
                          !window.location.search
                        )
                          router.refresh();
                        else router.push("/recruitments");
                      }}
                      className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                    >
                      Otwórz listę spraw
                    </Link>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <AlertDialog.Close
                      className={buttonClass}
                      onClick={() => setPendingNavigation(null)}
                    >
                      {uncertain ? "Wróć do zapisu" : "Kontynuuj edycję"}
                    </AlertDialog.Close>
                    <Button
                      type="button"
                      className={primaryClass}
                      onClick={() => {
                        const destination = pendingNavigation;
                        setDiscard(false);
                        setOpen(false);
                        if (uncertain) clearStoredIntent();
                        setPendingNavigation(null);
                        resetDraft();
                        if (destination) router.push(destination);
                      }}
                    >
                      {uncertain ? "Porzuć ten zapis" : "Odrzuć zmiany"}
                    </Button>
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function sessionStorageSafeRead() {
  try {
    return sessionStorage.getItem(intentStorageKey);
  } catch {
    return null;
  }
}
