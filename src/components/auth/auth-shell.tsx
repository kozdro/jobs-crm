import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link
            href="/"
            className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Jobs CRM
          </Link>
          <LockKeyhole aria-hidden="true" className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>
    </main>
  );
}
