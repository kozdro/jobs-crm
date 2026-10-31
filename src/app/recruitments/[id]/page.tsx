import { WorkspaceReturnLink } from "@/components/recruitment/workspace-return-link";
import { RelationsPanel } from "@/components/companies-contacts/relations";
import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CaseEventForm } from "@/components/recruitment/case-event-form";
import { CaseHistory } from "@/components/recruitment/case-history";
import { listRecruitmentTimeline } from "@/modules/recruitment/application/lifecycle";
import { LifecycleActions } from "@/components/recruitment/lifecycle";
import { CaseContent } from "@/components/recruitment/case-content";
import {
  getTrustedUser,
  getServerClient,
} from "@/modules/identity/infrastructure/server";
import { getRecruitmentCase } from "@/modules/recruitment/application/cases";
export const dynamic = "force-dynamic";

export default async function RecruitmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    historyPage?: string | string[];
    workspaceReturn?: string | string[];
  }>;
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
  const query = await searchParams;
  const rawPage = query.historyPage;
  const historyPage =
    typeof rawPage === "string" && /^[1-9][0-9]{0,5}$/.test(rawPage)
      ? Number(rawPage)
      : 1;
  let history: Awaited<ReturnType<typeof listRecruitmentTimeline>> | null =
    null;
  try {
    history = await listRecruitmentTimeline(
      await getServerClient(),
      id,
      historyPage,
    );
  } catch {
    /* A failed history read is not an empty history. */
  }

  return (
    <Workspace userId={user.id} title={item.title}>
      <WorkspaceReturnLink
        userId={user.id}
        token={
          typeof query.workspaceReturn === "string"
            ? query.workspaceReturn
            : undefined
        }
      />
      <section className="min-w-0" aria-label="Zapisane dane sprawy">
        <CaseContent item={item} />
        <div className="mt-5">
          <RelationsPanel
            key={`${user.id}:${item.id}`}
            userId={user.id}
            contextType="case"
            contextId={item.id}
          />
        </div>
        <LifecycleActions
          key={`${user.id}:${item.id}`}
          userId={user.id}
          caseId={item.id}
          status={item.status}
        />
        <CaseEventForm
          userId={user.id}
          caseId={item.id}
          status={item.status}
          stageVersion={item.stage_version}
        />
        <CaseHistory
          key={`${user.id}:${item.id}:${historyPage}`}
          userId={user.id}
          caseId={item.id}
          result={history}
        />
      </section>
    </Workspace>
  );
}
