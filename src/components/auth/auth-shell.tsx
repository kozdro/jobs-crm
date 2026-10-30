import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid min-h-svh w-full max-w-6xl content-start items-center gap-10 px-5 py-8 md:grid-cols-2 md:content-normal md:gap-20 md:px-10 md:py-16">
      <div className="self-start md:self-center">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight"
        >
          Jobs CRM
        </Link>
        <div className="mt-8 hidden max-w-sm md:block">
          <p className="text-[32px] leading-tight font-semibold tracking-tight">
            Mniej rozproszonych informacji.
            <br />
            <span className="text-primary">Więcej kontekstu.</span>
          </p>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            Zachowaj oferty i sprawy rekrutacyjne w jednym, prywatnym miejscu.
            Wróć do nich, kiedy potrzebujesz.
          </p>
          <div className="mt-8 w-12 border-t-2 border-primary" />
        </div>
      </div>
      <section
        className="ui-panel w-full max-w-md justify-self-center p-6 sm:p-8 md:justify-self-end"
        aria-labelledby="auth-heading"
      >
        <h1
          id="auth-heading"
          className="mb-6 text-2xl font-semibold tracking-tight"
        >
          {title}
        </h1>
        {children}
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" size={14} />
          Jobs CRM
        </Link>
      </section>
    </main>
  );
}
