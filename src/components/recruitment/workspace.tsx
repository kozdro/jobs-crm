"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AccountSession } from "@/components/auth/account-session";
import { QuickCapture } from "./quick-capture";

export function Workspace({
  userId,
  title,
  children,
}: {
  userId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <AccountSession userId={userId}>
        <div className="space-y-8">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight"
            >
              Jobs CRM
            </Link>
            <nav
              aria-label="Główna nawigacja"
              className="flex flex-wrap items-center gap-4 text-sm"
            >
              <Link
                href="/dashboard"
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Dashboard
              </Link>
              <Link
                href="/recruitments"
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Rekrutacje
              </Link>
              <Link
                href="/account"
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Konto
              </Link>
            </nav>
            <QuickCapture userId={userId} />
          </header>
          <div className="min-w-0 space-y-6">
            <h1 className="break-words text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
              {title}
            </h1>
            {children}
          </div>
        </div>
      </AccountSession>
    </main>
  );
}
