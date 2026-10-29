"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Button } from "@base-ui/react/button";
import { getBrowserClient } from "@/modules/identity/infrastructure/browser";
import {
  credentialsSchema,
  emailSchema,
  passwordSchema,
} from "@/modules/identity/application/validation";
import { getPublicAuthConfig } from "@/shared/public/auth-config";
import { Feedback } from "./feedback";

type Mode = "login" | "signup" | "forgot" | "reset";
const labels: Record<Mode, string> = {
  login: "Zaloguj się",
  signup: "Utwórz konto",
  forgot: "Wyślij link",
  reset: "Zapisz hasło",
};
const buttonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60";
const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function AuthForm({
  mode,
  callbackError = false,
  expectedUserId,
}: {
  mode: Mode;
  callbackError?: boolean;
  expectedUserId?: string;
}) {
  const config = getPublicAuthConfig();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error: boolean;
  } | null>(
    callbackError
      ? {
          message:
            "Link logowania jest nieprawidłowy lub wygasł. Spróbuj ponownie.",
          error: true,
        }
      : null,
  );
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const recoveryInvalidRef = useRef(false);
  const [recoveryInvalid, setRecoveryInvalid] = useState(false);
  const resetBlocked = mode === "reset" && (!expectedUserId || recoveryInvalid);
  // PKCE completes on the server callback. Auth pages never consume implicit
  // fragment tokens; discard the entire fragment before creating any SDK client.
  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, []);
  useEffect(() => {
    if (
      mode !== "reset" ||
      !expectedUserId ||
      !config.enabled ||
      !config.localFixture
    )
      return;
    const { data } = getBrowserClient().auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "SIGNED_OUT" ||
          !session ||
          session.user.id !== expectedUserId
        ) {
          // No awaited SDK call inside the callback: its auth lock is still held.
          recoveryInvalidRef.current = true;
          formRef.current?.reset();
          setRecoveryInvalid(true);
          setFeedback({
            message:
              "Sesja odzyskiwania zmieniła się lub wygasła. Poproś o nowy link.",
            error: true,
          });
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [mode, expectedUserId, config.enabled, config.localFixture]);
  const localOnly = mode !== "login";
  const unavailable = !config.enabled || (localOnly && !config.localFixture);
  function report(message: string, error = false) {
    setFeedback({ message, error });
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable || resetBlocked || recoveryInvalidRef.current)
      return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const fields = { email: form.get("email"), password: form.get("password") };
    const schema =
      mode === "forgot"
        ? emailSchema
        : mode === "reset"
          ? passwordSchema
          : credentialsSchema;
    if (!schema.safeParse(fields).success) {
      report("Sprawdź poprawność wprowadzonych danych.", true);
      return;
    }
    const email = String(fields.email ?? "");
    const password = String(fields.password ?? "");
    setPending(true);
    setFeedback(null);
    try {
      const client = getBrowserClient();
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error)
          report(
            "Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.",
            true,
          );
        else window.location.replace("/account");
      } else if (mode === "signup") {
        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${config.origin}/auth/callback?next=/account`,
          },
        });
        if (error)
          report(
            "Nie udało się ukończyć rejestracji. Sprawdź dane lub spróbuj ponownie.",
            true,
          );
        else
          report(
            "Jeśli rejestracja wymaga potwierdzenia, sprawdź swoją skrzynkę e-mail. Następnie zaloguj się.",
          );
      } else if (mode === "forgot") {
        // Do not distinguish missing accounts from existing accounts in recovery UI.
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${config.origin}/auth/callback?next=/reset-password`,
        });
        if (error)
          report("Nie udało się wysłać linku. Spróbuj ponownie później.", true);
        else
          report(
            "Jeśli konto istnieje, otrzymasz wiadomość z linkiem do zmiany hasła. Otwórz go w tej przeglądarce.",
          );
      } else {
        const response = await fetch("/auth/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ password, expectedUserId }),
        });
        if (recoveryInvalidRef.current) return;
        if ([401, 403, 409].includes(response.status)) {
          recoveryInvalidRef.current = true;
          formElement.reset();
          setRecoveryInvalid(true);
          report(
            "Sesja odzyskiwania zmieniła się lub wygasła. Poproś o nowy link.",
            true,
          );
        } else if (!response.ok)
          report(
            "Nie udało się zmienić hasła. Poproś o nowy link i spróbuj ponownie.",
            true,
          );
        else {
          formElement.reset();
          report("Hasło zostało zmienione. Możesz zalogować się nowym hasłem.");
        }
      }
    } catch {
      report(
        "Nie można połączyć się z usługą logowania. Spróbuj ponownie.",
        true,
      );
    } finally {
      setPending(false);
    }
  }
  async function google() {
    if (pending || !config.enabled || !config.googleEnabled) return;
    setPending(true);
    try {
      const { error } = await getBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${config.origin}/auth/callback?next=/account` },
      });
      if (error)
        report(
          "Nie udało się rozpocząć logowania Google. Spróbuj ponownie.",
          true,
        );
    } catch {
      report(
        "Nie udało się rozpocząć logowania Google. Spróbuj ponownie.",
        true,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      {unavailable ? (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {config.enabled
            ? "Ten przepływ jest dostępny wyłącznie w lokalnym środowisku testowym."
            : "Logowanie nie jest skonfigurowane w tym środowisku."}
        </p>
      ) : (
        <form
          ref={formRef}
          onSubmit={submit}
          className="space-y-4"
          aria-busy={pending}
        >
          {mode !== "reset" && (
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending || resetBlocked}
                className={inputClass}
              />
            </div>
          )}
          {mode !== "forgot" && (
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium">
                {mode === "reset" ? "Nowe hasło" : "Hasło"}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                disabled={pending || resetBlocked}
                className={inputClass}
              />
            </div>
          )}
          <Button
            type="submit"
            disabled={pending || resetBlocked}
            className={buttonClass}
          >
            {pending && (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            )}
            {labels[mode]}
          </Button>
        </form>
      )}
      {feedback && <Feedback ref={feedbackRef} {...feedback} />}
      {mode === "login" && config.enabled && (
        <div className="space-y-3">
          {config.googleEnabled ? (
            <Button
              type="button"
              onClick={google}
              disabled={pending || resetBlocked}
              className={buttonClass}
            >
              Kontynuuj z Google
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Logowanie Google nie jest skonfigurowane.
            </p>
          )}
        </div>
      )}
      <nav
        aria-label="Dostęp do konta"
        className="flex flex-wrap gap-x-4 gap-y-3 text-sm underline underline-offset-4"
      >
        {mode !== "login" && <Link href="/login">Zaloguj się</Link>}
        {mode !== "signup" && <Link href="/signup">Utwórz konto</Link>}
        {mode !== "forgot" && (
          <Link href="/forgot-password">Nie pamiętasz hasła?</Link>
        )}
      </nav>
    </div>
  );
}
