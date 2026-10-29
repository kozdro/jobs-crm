import Link from "next/link";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CaseContent } from "@/components/recruitment/case-content";
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
    <Workspace userId={user.id} title="Rekrutacje">
      <p className="text-sm text-muted-foreground">
        Twoje zapisane sprawy, od najnowszej.
      </p>
      {!result ? (
        <p role="alert" className="rounded-xl border border-border p-5 text-sm">
          Nie udało się pobrać spraw. Odśwież stronę i spróbuj ponownie.
        </p>
      ) : (
        <>
          {result.cases.length === 0 ? (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-medium">
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
            <ul className="grid gap-4">
              {result.cases.map((item) => (
                <li
                  key={item.id}
                  className="min-w-0 rounded-xl border border-border bg-card p-5"
                >
                  <h2 className="mb-4 break-words text-lg font-medium [overflow-wrap:anywhere]">
                    <Link
                      href={`/recruitments/${item.id}`}
                      className="underline underline-offset-4"
                    >
                      {item.title}
                    </Link>
                  </h2>
                  <CaseContent item={item} />
                </li>
              ))}
            </ul>
          )}
          <nav
            aria-label="Strony listy spraw"
            className="flex flex-wrap items-center gap-5 text-sm"
          >
            {page > 1 && (
              <Link
                href={`/recruitments?page=${page - 1}`}
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Poprzednia strona
              </Link>
            )}
            <span>Strona {page}</span>
            {result.hasMore && (
              <Link
                href={`/recruitments?page=${page + 1}`}
                className="inline-flex min-h-11 items-center underline underline-offset-4"
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
