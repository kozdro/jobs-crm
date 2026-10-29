import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace userId={user.id} title="Dashboard">
      <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
        <h2 className="text-lg font-medium">Twoje sprawy rekrutacyjne</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Dodaj sprawę ręcznie przez „Dodaj”. Wystarczy nazwa; dodatkowy opis i
          URL są opcjonalne.
        </p>
        <Link
          href="/recruitments"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        >
          Otwórz listę spraw
        </Link>
      </section>
    </Workspace>
  );
}
