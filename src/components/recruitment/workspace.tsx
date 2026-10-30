"use client";

import type { ReactNode } from "react";
import { AccountSession } from "@/components/auth/account-session";
import { AppShell } from "@/components/workspace/app-shell";

export function Workspace({
  userId,
  title,
  description,
  children,
}: {
  userId: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AccountSession key={userId} userId={userId}>
      <AppShell userId={userId} title={title} description={description}>
        {children}
      </AppShell>
    </AccountSession>
  );
}
