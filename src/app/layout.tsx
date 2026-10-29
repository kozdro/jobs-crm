import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getServerEnv } from "@/shared/server/env";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jobs CRM — fundament aplikacji",
  description: "Techniczna strona startowa Jobs CRM.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  getServerEnv();

  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
