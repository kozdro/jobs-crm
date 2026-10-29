"use client";

import {
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
    <div className="space-y-5">
      {!verified && (
        <p role="status" className="text-sm text-muted-foreground">
          Sprawdzanie sesji…
        </p>
      )}
      <div ref={contentRef} hidden={!verified} className="space-y-5">
        {children}
        <div className="grid gap-3" aria-busy={pending}>
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
              className="min-h-11 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Wylogowanie kończy możliwość odnawiania wskazanych sesji. Wydane
          wcześniej tokeny dostępu mogą działać do wygaśnięcia.
        </p>
      </div>
      {feedback && <Feedback {...feedback} />}
    </div>
  );
}
