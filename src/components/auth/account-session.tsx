"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@base-ui/react/button";
import {
  getBrowserClient,
  signOut,
} from "@/modules/identity/infrastructure/browser";
import type { LogoutScope } from "@/modules/identity/application/validation";
import { Feedback } from "./feedback";
import { buttonStyles } from "@/components/ui/styles";

type SessionActions = {
  pending: boolean;
  logout: (scope: LogoutScope) => Promise<void>;
  feedback: { message: string; error: boolean } | null;
};
const SessionContext = createContext<SessionActions | null>(null);
export function useSessionActions() {
  const actions = useContext(SessionContext);
  if (!actions) throw new Error("Session controls require AccountSession");
  return actions;
}

export function SessionFeedback() {
  const { feedback } = useSessionActions();
  return feedback ? (
    <div className="mb-5 max-w-3xl">
      <Feedback {...feedback} />
    </div>
  ) : null;
}

export function SessionControls() {
  const { pending, logout } = useSessionActions();
  return (
    <section className="ui-panel p-5 sm:p-6" aria-labelledby="session-heading">
      <h2 id="session-heading" className="text-lg font-semibold">
        Zarządzanie sesjami
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Wybierz, które sesje chcesz zakończyć.
      </p>
      <div className="mt-5 flex flex-wrap gap-3" aria-busy={pending}>
        {(
          [
            ["local", "Wyloguj tutaj"],
            ["global", "Wyloguj wszędzie"],
            ["others", "Wyloguj pozostałe sesje"],
          ] as const
        ).map(([scope, label]) => (
          <Button
            key={scope}
            type="button"
            disabled={pending}
            onClick={() => void logout(scope)}
            className={buttonStyles.secondary}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className="mt-5 max-w-2xl text-[13px] leading-5 text-muted-foreground">
        Wylogowanie kończy możliwość odnawiania wskazanych sesji. Wydane
        wcześniej tokeny dostępu mogą działać do wygaśnięcia.
      </p>
    </section>
  );
}

export function AccountSession({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const navigationPendingRef = useRef(false);
  const [verified, setVerified] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const navigateToLogin = useCallback(() => {
    // SIGNED_OUT may arrive before signOut resolves. Both paths share one navigation.
    if (navigationPendingRef.current) return;
    navigationPendingRef.current = true;
    if (contentRef.current) contentRef.current.hidden = true;
    setVerified(false);
    window.location.replace("/login");
  }, []);
  useEffect(() => {
    let active = true;
    const client = getBrowserClient();
    function hide() {
      if (contentRef.current) contentRef.current.hidden = true;
      setVerified(false);
    }
    async function validate() {
      hide();
      try {
        const response = await fetch("/auth/user", { cache: "no-store" });
        const result = await response.json();
        if (!active || navigationPendingRef.current) return;
        if (!response.ok || result.user?.id !== userId) {
          navigateToLogin();
          return;
        }
        setVerified(true);
        if (contentRef.current) contentRef.current.hidden = false;
      } catch {
        if (active)
          setFeedback({
            message:
              "Nie można potwierdzić sesji. Odśwież stronę lub zaloguj się ponownie.",
            error: true,
          });
      }
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== userId)) {
        navigateToLogin();
      }
    });
    function pageShow(event: PageTransitionEvent) {
      if (event.persisted) void validate();
    }
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", pageShow);
    void validate();
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", pageShow);
    };
  }, [userId, navigateToLogin]);
  async function logout(scope: LogoutScope) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const { error } = await signOut(scope);
      if (error) {
        setFeedback({
          message:
            "Nie udało się zakończyć wskazanych sesji. Spróbuj ponownie.",
          error: true,
        });
        return;
      }
      if (scope === "others")
        setFeedback({
          message:
            "Pozostałe sesje zostały wylogowane. Bieżąca sesja pozostaje aktywna.",
          error: false,
        });
      else navigateToLogin();
    } catch {
      setFeedback({
        message: "Nie można połączyć się z usługą logowania. Spróbuj ponownie.",
        error: true,
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <SessionContext.Provider value={{ pending, logout, feedback }}>
      {!verified && (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Sprawdzanie sesji…
        </p>
      )}
      <div ref={contentRef} hidden={!verified}>
        {children}
      </div>
      {!verified && feedback && (
        <div className="mx-5 max-w-3xl">
          <Feedback {...feedback} />
        </div>
      )}
    </SessionContext.Provider>
  );
}
