"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import { buttonStyles } from "@/components/ui/styles";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { claimContentIntent, clearContentIntent } from "./content-intent";
import { contentChangedEvent } from "./content-events";

export type ContentCommand = {
  requestId: string;
  payload: Record<string, unknown>;
};
type Status =
  "idle" | "checking" | "sending" | "unknown" | "found" | "missing" | "error";
type State = {
  status: Status;
  message: string | null;
  duplicate: { id: string; source: "legacy" | "additional" } | null;
};
type Recovery = {
  execute: (command: ContentCommand, changed?: () => void) => Promise<void>;
  pending: ContentCommand | null;
  unknown: boolean;
  busy: boolean;
  recovery: boolean;
  message: string | null;
  duplicate: State["duplicate"];
  owner: string;
  caseId: string;
};
const Context = createContext<Recovery | null>(null);
function marker(owner: string, caseId: string) {
  return `jobs-crm.content.pending.${owner}.${caseId}`;
}
export function sameContentIntent(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function contentReceiptMatches(
  command: ContentCommand,
  result: unknown,
  caseId: string,
) {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, unknown>;
  if (r.kind !== "saved" && r.kind !== "replayed") return false;
  const p = command.payload;
  if (p.caseId !== caseId) return false;
  const isNote =
    typeof p.operation === "string" && p.operation.endsWith("note");
  const value = isNote ? r.note : r.link;
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (
    row.case_id !== caseId ||
    typeof row.id !== "string" ||
    !uuidPattern.test(row.id)
  )
    return false;
  if (typeof p.id === "string" && row.id !== p.id) return false;
  if (p.source !== undefined && row.source !== p.source) return false;
  if (
    typeof p.expectedRevision === "number" &&
    row.revision !== p.expectedRevision + 1
  )
    return false;
  if (p.operation === "void-note" || p.operation === "void-link")
    return row.voided === true;
  if (isNote)
    return (
      row.body === p.body &&
      row.date_kind === p.dateKind &&
      row.occurred_on === p.occurredOn &&
      row.voided === false
    );
  if (typeof p.url !== "string") return false;
  try {
    return (
      row.url === new URL(p.url).href &&
      row.role === p.role &&
      (p.position === undefined || row.position === p.position) &&
      row.voided === false
    );
  } catch {
    return false;
  }
}
function receiptBelongs(result: unknown, caseId: string) {
  if (!result || typeof result !== "object") return false;
  const row = result as Record<string, unknown>;
  const value = row.note ?? row.link;
  return (
    (row.kind === "saved" || row.kind === "replayed") &&
    !!value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).case_id === caseId
  );
}
async function receipt(owner: string, id: string) {
  const params = new URLSearchParams({ expectedUserId: owner, requestId: id });
  const response = await fetch(`/recruitments/content?${params}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("receipt unavailable");
  return (await response.json()) as { kind?: string; result?: unknown };
}
export function ContentRecoveryProvider({
  owner,
  caseId,
  children,
}: {
  owner: string;
  caseId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const key = marker(owner, caseId);
  const [state, setState] = useState<State>({
    status: "checking",
    message: null,
    duplicate: null,
  });
  const [pending, setPending] = useState<ContentCommand | null>(null);
  const frozen = useRef<ContentCommand | null>(null);
  const callback = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const markerId = useRef<string | null>(null);
  const banner = useRef<HTMLDivElement>(null);
  const blocked = state.status !== "idle";
  const update = useCallback((value: State) => {
    if (alive.current) setState(value);
  }, []);
  const current = useCallback(
    (id: string) => sessionStorage.getItem(key) === id,
    [key],
  );
  const finish = useCallback(
    (id: string, result: unknown, expected: ContentCommand | null) => {
      if (
        !(expected
          ? contentReceiptMatches(expected, result, caseId)
          : receiptBelongs(result, caseId))
      )
        throw new Error("receipt mismatch");
      if (!current(id) || !clearContentIntent(sessionStorage, key, id))
        throw new Error("intent changed");
      markerId.current = null;
      frozen.current = null;
      setPending(null);
      const done = callback.current;
      callback.current = null;
      update({ status: "idle", message: "Zapisano.", duplicate: null });
      window.dispatchEvent(
        new CustomEvent(contentChangedEvent, { detail: { owner, caseId } }),
      );
      router.refresh();
      done?.();
      requestAnimationFrame(() => banner.current?.focus());
    },
    [caseId, current, key, owner, router, update],
  );
  const inspect = useCallback(async () => {
    let id: string | null;
    try {
      id = sessionStorage.getItem(key);
    } catch {
      update({
        status: "error",
        message: "Nie można sprawdzić zamiaru w tej przeglądarce.",
        duplicate: null,
      });
      return;
    }
    if (!id) {
      markerId.current = null;
      update({ status: "idle", message: null, duplicate: null });
      return;
    }
    if (!uuidPattern.test(id)) {
      update({
        status: "error",
        message:
          "Nieprawidłowy identyfikator zamiaru. Nie można bezpiecznie kontynuować.",
        duplicate: null,
      });
      return;
    }
    markerId.current = id;
    update({
      status: "checking",
      message: "Sprawdzanie poprzedniego zapisu…",
      duplicate: null,
    });
    try {
      const value = await receipt(owner, id);
      if (!alive.current || !current(id)) throw new Error("intent changed");
      if (value.kind === "found" && receiptBelongs(value.result, caseId))
        update({
          status: "found",
          message:
            "Poprzedni zapis został potwierdzony. Potwierdź wynik, aby kontynuować.",
          duplicate: null,
        });
      else if (value.kind === "cancelled")
        update({
          status: "missing",
          message:
            "Poprzedni zamiar został bezpiecznie zatrzymany. Potwierdź, aby kontynuować.",
          duplicate: null,
        });
      else if (value.kind === "not-found")
        update({
          status: "missing",
          message:
            "Wynik nie jest znany. Sprawdź i zakończ oczekiwanie przed nowym zapisem.",
          duplicate: null,
        });
      else throw new Error("invalid receipt");
    } catch {
      update({
        status: "error",
        message:
          "Nie udało się zweryfikować poprzedniego zapisu. Spróbuj ponownie.",
        duplicate: null,
      });
    }
  }, [caseId, current, key, owner, update]);
  useEffect(() => {
    alive.current = true;
    void inspect();
    const { data } = getBrowserClient().auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || (session && session.user.id !== owner)) {
          frozen.current = null;
          callback.current = null;
          setPending(null);
          alive.current = false;
        }
      },
    );
    return () => {
      alive.current = false;
      frozen.current = null;
      callback.current = null;
      data.subscription.unsubscribe();
    };
  }, [inspect, owner]);
  useEffect(() => {
    if (!blocked) return;
    const prevent = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]") &&
        !event.target.closest("[data-content-recovery]")
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (frozen.current) event.preventDefault();
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const onNavigate = (event: Event) => {
      const e = event as Event & { navigationType?: string };
      if (e.navigationType === "traverse" && event.cancelable)
        event.preventDefault();
    };
    document.addEventListener("click", prevent, true);
    window.addEventListener("beforeunload", beforeUnload);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      document.removeEventListener("click", prevent, true);
      window.removeEventListener("beforeunload", beforeUnload);
      navigation?.removeEventListener("navigate", onNavigate);
    };
  }, [blocked]);
  const execute = useCallback(
    async (intent: ContentCommand, done?: () => void) => {
      if (lock.current) return;
      lock.current = true;
      try {
        const prior = frozen.current;
        if (prior && !sameContentIntent(prior, intent))
          throw new Error("different intent");
        if (!prior) {
          if (
            state.status !== "idle" ||
            !claimContentIntent(sessionStorage, key, intent.requestId)
          ) {
            markerId.current = sessionStorage.getItem(key);
            throw new Error("pending exists");
          }
          frozen.current = structuredClone(intent);
          callback.current = done ?? null;
          markerId.current = intent.requestId;
          setPending(frozen.current);
        }
        const expected = frozen.current!;
        if (!current(expected.requestId)) throw new Error("intent changed");
        update({
          status: "sending",
          message: "Sprawdzanie i zapis…",
          duplicate: null,
        });
        if (prior) {
          const value = await receipt(owner, expected.requestId);
          if (
            !current(expected.requestId) ||
            !sameContentIntent(frozen.current, expected)
          )
            throw new Error("intent changed");
          if (value.kind === "found") {
            finish(expected.requestId, value.result, expected);
            return;
          }
          if (value.kind !== "not-found")
            throw new Error("receipt unavailable");
        }
        if (
          !current(expected.requestId) ||
          !sameContentIntent(frozen.current, expected)
        )
          throw new Error("intent changed");
        const response = await fetch("/recruitments/content", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedUserId: owner, ...expected }),
          signal: AbortSignal.timeout(20000),
        });
        const result = (await response.json().catch(() => null)) as {
          kind?: string;
          match?: { id?: unknown; source?: unknown };
        } | null;
        if (!alive.current) return;
        if (
          response.ok &&
          (result?.kind === "saved" || result?.kind === "replayed")
        ) {
          if (!contentReceiptMatches(expected, result, caseId))
            throw new Error("receipt mismatch");
          const persisted = await receipt(owner, expected.requestId);
          if (
            persisted.kind !== "found" ||
            !sameContentIntent(frozen.current, expected)
          )
            throw new Error("receipt unavailable");
          finish(expected.requestId, persisted.result, expected);
          return;
        }
        if (response.status === 401 || response.status === 403)
          throw new Error("authorization changed");
        if (response.status < 500 && response.status !== 408) {
          if (
            !current(expected.requestId) ||
            !sameContentIntent(frozen.current, expected) ||
            !clearContentIntent(sessionStorage, key, expected.requestId)
          )
            throw new Error("intent changed");
          frozen.current = null;
          callback.current = null;
          markerId.current = null;
          setPending(null);
          const match: State["duplicate"] =
            result?.kind === "duplicate" &&
            typeof result.match?.id === "string" &&
            uuidPattern.test(result.match.id) &&
            (result.match.source === "legacy" ||
              result.match.source === "additional")
              ? { id: result.match.id, source: result.match.source }
              : null;
          update({
            status: "idle",
            message:
              result?.kind === "duplicate"
                ? "Ten link już istnieje w tej sprawie."
                : result?.kind === "stale"
                  ? "Dane zmieniły się. Odśwież i potwierdź zmianę ponownie."
                  : "Nie udało się zapisać. Sprawdź dane.",
            duplicate: match,
          });
          return;
        }
        throw new Error("uncertain");
      } catch {
        update({
          status: frozen.current ? "unknown" : "error",
          message:
            "Wynik zapisu jest niepewny. Sprawdź wynik przed kolejną operacją.",
          duplicate: null,
        });
      } finally {
        lock.current = false;
      }
    },
    [caseId, current, finish, key, owner, state.status, update],
  );
  const reconcile = useCallback(async () => {
    if (lock.current || frozen.current) return;
    const id = markerId.current;
    if (!id) {
      void inspect();
      return;
    }
    lock.current = true;
    update({
      status: "checking",
      message: "Sprawdzanie poprzedniego zapisu…",
      duplicate: null,
    });
    try {
      if (!current(id)) throw new Error("intent changed");
      const response = await fetch("/recruitments/content/reconcile", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUserId: owner, caseId, requestId: id }),
      });
      const result = (await response.json()) as {
        kind?: string;
        result?: unknown;
      };
      if (!response.ok || !current(id))
        throw new Error("reconciliation failed");
      if (result.kind === "found") {
        finish(id, result.result, null);
        return;
      }
      if (
        result.kind !== "cancelled" ||
        !clearContentIntent(sessionStorage, key, id)
      )
        throw new Error("not cancelled");
      markerId.current = null;
      update({
        status: "idle",
        message: "Poprzedni zamiar bezpiecznie zakończony.",
        duplicate: null,
      });
      window.dispatchEvent(
        new CustomEvent(contentChangedEvent, { detail: { owner, caseId } }),
      );
      router.refresh();
      requestAnimationFrame(() => banner.current?.focus());
    } catch {
      update({
        status: "error",
        message:
          "Nie udało się rozstrzygnąć poprzedniego zapisu. Spróbuj ponownie.",
        duplicate: null,
      });
    } finally {
      lock.current = false;
    }
  }, [caseId, current, finish, inspect, key, owner, router, update]);
  const retry = () => {
    const intent = frozen.current;
    if (intent) void execute(intent, callback.current ?? (() => {}));
  };
  const value: Recovery = {
    execute,
    pending,
    unknown: state.status === "unknown",
    busy: state.status === "sending",
    recovery: !["idle", "sending", "unknown"].includes(state.status),
    message: state.message,
    duplicate: state.duplicate,
    owner,
    caseId,
  };
  return (
    <Context.Provider value={value}>
      <div
        data-content-recovery
        ref={banner}
        tabIndex={-1}
        className="outline-none"
      >
        {state.message && (
          <p
            role={state.status === "idle" ? "status" : "alert"}
            className="my-3 text-sm"
          >
            {state.message}
          </p>
        )}
        {state.duplicate && (
          <Link
            className="ui-link block min-h-11 py-2 text-sm"
            href={`/recruitments/${encodeURIComponent(caseId)}?linkId=${encodeURIComponent(state.duplicate.id)}&linkSource=${encodeURIComponent(state.duplicate.source)}#case-links`}
          >
            Otwórz istniejący link
          </Link>
        )}
        {state.status === "unknown" && pending && (
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={retry}
          >
            Ponów identyczny zapis
          </button>
        )}
        {state.status === "found" && (
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => {
              const id = markerId.current;
              if (!id) return;
              void receipt(owner, id)
                .then((r) => {
                  if (r.kind !== "found") throw new Error();
                  finish(id, r.result, null);
                })
                .catch(() =>
                  update({
                    status: "error",
                    message: "Nie udało się potwierdzić zapisu.",
                    duplicate: null,
                  }),
                );
            }}
          >
            Potwierdź wynik
          </button>
        )}
        {(state.status === "missing" || state.status === "error") && (
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => void reconcile()}
          >
            Sprawdź i zakończ oczekiwanie
          </button>
        )}
      </div>
      <div
        onClickCapture={(event) => {
          if (!blocked) return;
          if (
            event.target instanceof Element &&
            event.target.closest("button")
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </Context.Provider>
  );
}
export function useContentRecovery(
  owner: string,
  caseId: string,
  changed: () => void,
): Recovery {
  const context = useContext(Context);
  if (!context || context.owner !== owner || context.caseId !== caseId)
    throw new Error("Content recovery provider missing or mismatched");
  return {
    ...context,
    execute: (command) => context.execute(command, changed),
  };
}
