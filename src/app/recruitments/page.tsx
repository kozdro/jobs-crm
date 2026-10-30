import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CaseListItem } from "@/components/recruitment/case-content";
import {
  getTrustedUser,
  getServerClient,
} from "@/modules/identity/infrastructure/server";
import { listRecruitmentCases } from "@/modules/recruitment/application/cases";
export const dynamic = "force-dynamic";

export default async function RecruitmentListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const raw = query.page;
  const page =
    typeof raw === "string" && /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : 1;
  let result: Awaited<ReturnType<typeof listRecruitmentCases>> | null = null;
  try {
    result = await listRecruitmentCases(await getServerClient(), page);
  } catch {
    /* Render a neutral error, never an empty success. */
  }
  return (
    <Workspace
      userId={user.id}
      title="Rekrutacje"
      description="Twoje zapisane sprawy, od najnowszej."
    >
      {!result ? (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-surface p-5 text-sm text-danger"
        >
          Nie udało się pobrać spraw. Odśwież stronę i spróbuj ponownie.
        </p>
      ) : (
        <>
          {result.cases.length === 0 ? (
            <section className="ui-panel p-6 sm:p-9">
              <h2 className="text-lg font-semibold">
                {page === 1
                  ? "Nie masz jeszcze spraw"
                  : "Brak spraw na tej stronie"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {page === 1
                  ? "Wybierz „Dodaj”, aby zapisać pierwszą sprawę."
                  : "Wróć do poprzedniej strony lub początku listy."}
              </p>
            </section>
          ) : (
            <ul aria-label="Sprawy rekrutacyjne" className="ui-panel">
              {result.cases.map((item) => (
                <CaseListItem key={item.id} item={item} />
              ))}
            </ul>
          )}
          <nav
            aria-label="Strony listy spraw"
            className="mt-5 flex flex-wrap items-center gap-5 text-sm text-muted-foreground"
          >
            {page > 1 && (
              <Link
                href={`/recruitments?page=${page - 1}`}
                className="ui-link inline-flex min-h-11 items-center"
              >
                Poprzednia strona
              </Link>
            )}
            <span>Strona {page}</span>
            {result.hasMore && (
              <Link
                href={`/recruitments?page=${page + 1}`}
                className="ui-link inline-flex min-h-11 items-center"
              >
                Następna strona
              </Link>
            )}
          </nav>
        </>
      )}
    </Workspace>
  );
}
