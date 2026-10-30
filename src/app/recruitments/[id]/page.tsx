import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CaseContent } from "@/components/recruitment/case-content";
import {
  getTrustedUser,
  getServerClient,
} from "@/modules/identity/infrastructure/server";
import { getRecruitmentCase } from "@/modules/recruitment/application/cases";
export const dynamic = "force-dynamic";

export default async function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  const { id } = await params;
  let item: Awaited<ReturnType<typeof getRecruitmentCase>>;
  try {
    item = await getRecruitmentCase(await getServerClient(), id);
  } catch {
    return (
      <Workspace userId={user.id} title="Sprawa">
        <p role="alert" className="text-sm">
          Nie udało się pobrać sprawy. Odśwież stronę i spróbuj ponownie.
        </p>
      </Workspace>
    );
  }
  if (!item) notFound();
  return (
    <Workspace userId={user.id} title={item.title}>
      <Link
        href="/recruitments"
        className="ui-link mb-5 inline-flex min-h-11 items-center text-sm"
      >
        Wróć do listy spraw
      </Link>
      <section className="min-w-0" aria-label="Zapisane dane sprawy">
        <CaseContent item={item} />
      </section>
    </Workspace>
  );
}
