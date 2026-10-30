import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bookmark, FileText, Link2 } from "lucide-react";
import { Workspace } from "@/components/recruitment/workspace";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Dashboard"
      description="Twoja przestrzeń do porządkowania rekrutacji."
    >
      <section className="ui-panel max-w-4xl p-6 sm:p-9">
        <Bookmark
          aria-hidden="true"
          size={24}
          strokeWidth={1.5}
          className="mb-5 text-primary"
        />
        <h2 className="text-xl font-semibold tracking-tight">
          Zachowaj to, do czego chcesz wrócić
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
          Oferta, rozmowa o współpracy, pomysł na kolejny krok. Dodaj sprawę
          przez „Dodaj” w górnym pasku — wystarczy nazwa, a szczegóły uzupełnisz
          podczas zapisu.
        </p>
        <Link
          href="/recruitments"
          className="ui-link mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
        >
          Otwórz listę spraw
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
      <section
        aria-labelledby="capture-guide-heading"
        className="mt-8 max-w-4xl"
      >
        <h2 id="capture-guide-heading" className="text-base font-semibold">
          Kontekst, który zostaje pod ręką
        </h2>
        <div className="mt-4 grid gap-6 border-t border-border pt-5 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <FileText
              aria-hidden="true"
              size={18}
              className="mt-1 shrink-0 text-muted-foreground"
            />
            <div>
              <h3 className="text-sm font-semibold">Nazwij po swojemu</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Nie potrzebujesz nazwy firmy ani stanowiska, żeby zapisać
                sprawę.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Link2
              aria-hidden="true"
              size={18}
              className="mt-1 shrink-0 text-muted-foreground"
            />
            <div>
              <h3 className="text-sm font-semibold">
                Dodaj źródło, jeśli je masz
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Opis i adres URL są opcjonalne. Zapisanie sprawy nie oznacza
                aplikowania.
              </p>
            </div>
          </div>
        </div>
      </section>
    </Workspace>
  );
}
