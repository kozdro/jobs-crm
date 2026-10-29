"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Plus, X, LoaderCircle } from "lucide-react";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { getRecruitmentCaseByRequestId } from "@/modules/recruitment/application/cases";
import {
  parseCreateCaseInput,
  type CreateCaseInput,
  type CreateCaseResult,
  type RecruitmentCase,
} from "@/modules/recruitment/domain/recruitment-case";
import { intentStorageKey, parsePendingIntent } from "./intent";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const primaryClass = `${buttonClass} bg-foreground text-background hover:bg-foreground hover:opacity-90`;
const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const steps = ["Sytuacja", "Dane", "Działanie", "Podsumowanie"];
type DuplicateResult = Extract<CreateCaseResult, { kind: "duplicates" }>;

export function QuickCapture({ userId }: { userId: string }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const discardPopupRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);
  const liveRef = useRef(true);
  const frozenRef = useRef<CreateCaseInput | null>(null);
  const saveNextRef = useRef(false);
  const [sessionLive, setSessionLive] = useState(true);
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [action, setAction] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [pending, setPending] = useState(false);
  const [payloadFrozen, setPayloadFrozen] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<"title" | "description" | "sourceUrl", string>>
  >({});
  const [toast, setToast] = useState<RecruitmentCase | null>(null);
  const dirty = Boolean(title || description || sourceUrl || action);

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
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setAction(false);
    setStep(0);
    setError(null);
    setErrors({});
    setDuplicates(null);
    setUncertain(false);
    setPayloadFrozen(false);
    saveNextRef.current = false;
    frozenRef.current = null;
  }
  function success(item: RecruitmentCase, addNext: boolean) {
    clearStoredIntent();
    setToast(item);
    resetDraft();
    setOpen(addNext);
    router.refresh();
  }
  async function recover(id: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setRecovering(true);
    try {
      const client = getBrowserClient();
      const current = await client.auth.getUser();
      if (!liveRef.current || current.error || current.data.user?.id !== userId)
        return;
      const found = await getRecruitmentCaseByRequestId(client, id);
      if (!liveRef.current) return;
      if (found) success(found, false);
      else {
        setUncertain(true);
        setError(
          "Nie potwierdzono wyniku poprzedniego zapisu. Możesz sprawdzić ponownie lub ponowić zapis z tym samym identyfikatorem i tymi samymi danymi. Brak wyniku nie oznacza cofnięcia zapisu.",
        );
      }
    } catch {
      if (liveRef.current)
        setError(
          "Nie można sprawdzić poprzedniego zapisu. Zachowano identyfikator; spróbuj ponownie.",
        );
    } finally {
      pendingRef.current = false;
      setRecovering(false);
    }
  }
  useEffect(() => {
    liveRef.current = true;
    let active = true;
    const client = getBrowserClient();
    function hide() {
      liveRef.current = false;
      // Portals are outside AccountSession's hidden subtree. Hide before async navigation.
      if (popupRef.current) popupRef.current.hidden = true;
      if (discardPopupRef.current) discardPopupRef.current.hidden = true;
      setSessionLive(false);
      setOpen(false);
      setDiscard(false);
      setToast(null);
      setTitle("");
      setDescription("");
      setSourceUrl("");
      frozenRef.current = null;
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId))
        hide();
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
            liveRef.current = true;
            setSessionLive(true);
          }
        })
        .catch(() => {
          /* AccountSession keeps private content hidden on failed verification. */
        });
    }
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", pageShow);
    return () => {
      active = false;
      liveRef.current = false;
      data.subscription.unsubscribe();
      window.removeEventListener("pagehide", hide);
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
      event.preventDefault();
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
    if (step === 2 && !action) {
      report("Wybierz „Zapisz tylko sprawę”, aby przejść dalej.");
      return;
    }
    setStep(step + 1);
  }
  function requestClose() {
    if (pendingRef.current || recovering) return;
    if (uncertain) {
      report(
        "Wynik zapisu pozostaje niepotwierdzony. Ponów zapis lub sprawdź jego wynik przed odrzuceniem danych.",
      );
      return;
    }
    if (dirty) setDiscard(true);
    else {
      setOpen(false);
      resetDraft();
    }
  }
  function start() {
    if (!liveRef.current || pendingRef.current || recovering) return;
    if (!requestId) resetDraft();
    setToast(null);
    setOpen(true);
  }
  async function save(addNext = saveNextRef.current, allowDuplicate = false) {
    if (pendingRef.current || !liveRef.current || recovering) return;
    const parsed = frozenRef.current
      ? { success: true as const, data: frozenRef.current }
      : input();
    if (!parsed.success) {
      setErrors(parsed.errors);
      setStep(1);
      report("Sprawdź wprowadzone dane.");
      return;
    }
    if (!action) {
      setStep(2);
      report("Wybierz „Zapisz tylko sprawę”.");
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setPayloadFrozen(true);
    saveNextRef.current = addNext;
    setError(null);
    frozenRef.current = parsed.data;
    rememberIntent(parsed.data.requestId);
    try {
      const response = await fetch("/recruitments/commands", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          allowDuplicate,
          expectedUserId: userId,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!liveRef.current) return;
      if (!response.ok) {
        if (response.status === 400) {
          frozenRef.current = null;
          setPayloadFrozen(false);
          setUncertain(false);
          clearStoredIntent();
          report(
            "Dane nie zostały przyjęte. Sprawdź formularz i spróbuj ponownie.",
          );
        } else {
          setUncertain(true);
          report(
            response.status === 409
              ? "Ten identyfikator zapisu dotyczy innych danych. Sprawdź wynik wcześniejszego zapisu; niczego nie nadpisano."
              : "Nie potwierdzono zapisu. Zachowano dane i identyfikator. Ponów zapis, aby ustalić wynik.",
          );
        }
        return;
      }
      const result = (await response.json()) as CreateCaseResult;
      if (!liveRef.current) return;
      if (result.kind === "duplicates") {
        setDuplicates(result);
        setUncertain(false);
        frozenRef.current = null;
        setPayloadFrozen(false);
        clearStoredIntent();
        requestAnimationFrame(() => feedbackRef.current?.focus());
      } else if (
        (result.kind === "created" || result.kind === "replayed") &&
        result.case?.id
      )
        success(result.case, addNext);
      else {
        setUncertain(true);
        report("Nie potwierdzono wyniku zapisu. Ponów tę samą operację.");
      }
    } catch {
      if (liveRef.current) {
        setUncertain(true);
        report(
          "Nie potwierdzono zapisu. Zachowano dane i identyfikator. Ponów zapis, aby ustalić wynik.",
        );
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  const summary = input();
  const frozen = payloadFrozen || pending;
  if (!sessionLive) return null;
  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        onClick={start}
        disabled={recovering}
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
        </div>
      )}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="basis-full rounded-lg border border-border bg-card p-4 text-sm"
        >
          <p>Sprawa została zapisana.</p>
          <Link
            href={`/recruitments/${toast.id}`}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Otwórz sprawę
          </Link>
          <Button
            type="button"
            aria-label="Zamknij powiadomienie"
            className={`${buttonClass} ml-3`}
            onClick={() => setToast(null)}
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </div>
      )}
      <Dialog.Root
        open={open}
        disablePointerDismissal
        onOpenChange={(value, details) => {
          if (!value) {
            details.cancel();
            requestClose();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/35" />
          <Dialog.Popup
            aria-modal="true"
            ref={popupRef}
            initialFocus={headingRef}
            finalFocus={triggerRef}
            className="fixed inset-0 z-50 flex max-h-dvh min-w-0 flex-col overflow-y-auto bg-card p-5 text-foreground shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[min(40rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-7"
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
            <div
              className="mt-6 flex items-center gap-2"
              aria-label={`Krok ${step + 1} z 4`}
            >
              {steps.map((name, index) => (
                <span
                  key={name}
                  aria-label={`${index + 1}: ${name}`}
                  aria-current={index === step ? "step" : undefined}
                  className={`flex size-8 items-center justify-center rounded-full border text-sm ${index === step ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                >
                  {index + 1}
                </span>
              ))}
            </div>
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="mt-6 text-lg font-medium outline-none"
            >
              {steps[step]}
            </h3>
            <div className="mt-4 min-w-0 space-y-5">
              {step === 0 && (
                <p className="text-sm leading-6 text-muted-foreground">
                  Możesz zapisać ofertę, kontakt z rekruterem, spontaniczną
                  kandydaturę lub inną sprawę. Nazwij ją własnymi słowami w
                  kolejnym kroku.
                </p>
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
                      aria-describedby={
                        errors.title ? "case-title-error" : "case-title-hint"
                      }
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
                      <p id="case-title-error" className="text-sm">
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
                      aria-describedby={
                        errors.sourceUrl ? "case-url-error" : "case-url-hint"
                      }
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
                      <p id="case-url-error" className="text-sm">
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
                        onChange={(event) => setDescription(event.target.value)}
                        disabled={frozen}
                        aria-invalid={Boolean(errors.description)}
                        aria-describedby={
                          errors.description
                            ? "case-description-error"
                            : "case-description-hint"
                        }
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
                        <p id="case-description-error" className="text-sm">
                          {errors.description}
                        </p>
                      )}
                    </div>
                  </details>
                </>
              )}
              {step === 2 && (
                <fieldset className="space-y-3">
                  <legend className="sr-only">Działanie przy zapisie</legend>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-border p-4 text-sm">
                    <input
                      type="radio"
                      name="case-action"
                      checked={action}
                      onChange={() => setAction(true)}
                      disabled={frozen}
                      className="mt-0.5 size-4 accent-foreground"
                    />
                    <span>Zapisz tylko sprawę</span>
                  </label>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Nowa sprawa otrzyma status „Zapisane”. Zapis nie oznacza
                    aplikowania, wysłania CV ani kontaktu.
                  </p>
                </fieldset>
              )}
              {step === 3 && summary.success && (
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Nazwa sprawy</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {summary.data.title}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="mt-1">Zapisane</dd>
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
                    <dt className="text-muted-foreground">Działanie</dt>
                    <dd className="mt-1">Zapisz tylko sprawę</dd>
                  </div>
                </dl>
              )}
              {duplicates && (
                <section
                  className="space-y-3 rounded-lg border border-border bg-secondary p-4"
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
                    onClick={() => void save(saveNextRef.current, true)}
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
                  className="rounded-lg border border-border p-3 text-sm leading-6 outline-none"
                >
                  {error}
                </p>
              )}
              {uncertain && (
                <Button
                  type="button"
                  onClick={() => void recover(requestId)}
                  disabled={pending || recovering}
                  className={buttonClass}
                >
                  Sprawdź wynik zapisu
                </Button>
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
                      onClick={() => void save()}
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
            <AlertDialog.Root open={discard} onOpenChange={setDiscard}>
              <AlertDialog.Portal>
                <AlertDialog.Backdrop className="fixed inset-0 z-60 bg-black/45" />
                <AlertDialog.Popup
                  aria-modal="true"
                  ref={discardPopupRef}
                  className="fixed left-1/2 top-1/2 z-70 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-xl outline-none"
                >
                  <AlertDialog.Title className="text-lg font-semibold">
                    Odrzucić zmiany?
                  </AlertDialog.Title>
                  <AlertDialog.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                    Wprowadzone dane nie zostały zapisane. Możesz kontynuować
                    edycję albo odrzucić ten formularz.
                  </AlertDialog.Description>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <AlertDialog.Close className={buttonClass}>
                      Kontynuuj edycję
                    </AlertDialog.Close>
                    <Button
                      type="button"
                      className={primaryClass}
                      onClick={() => {
                        setDiscard(false);
                        setOpen(false);
                        resetDraft();
                      }}
                    >
                      Odrzuć zmiany
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
