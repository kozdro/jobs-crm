import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerEnv } from "@/shared/server/env";

import "./globals.css";
import { CalendarMemoryDraftProvider } from "@/components/calendar/memory-drafts";

export const metadata: Metadata = {
  title: "Jobs CRM",
  description: "Twoja prywatna przestrzeń do porządkowania rekrutacji.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  getServerEnv();

  return (
    <html lang="pl">
      <body>
        <CalendarMemoryDraftProvider>{children}</CalendarMemoryDraftProvider>
      </body>
    </html>
  );
}
