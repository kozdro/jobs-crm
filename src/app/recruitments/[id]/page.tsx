import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { WorkspaceReturnLink } from "@/components/recruitment/workspace-return-link";
import { RelationsPanel } from "@/components/companies-contacts/relations";
import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CaseEventForm } from "@/components/recruitment/case-event-form";
import { CaseHistory } from "@/components/recruitment/case-history";
import { ContentRecoveryProvider } from "@/components/recruitment/content-recovery";
import {
  CaseLinks,
  NoteTarget,
} from "@/components/recruitment/case-content-tools";
import { listRecruitmentTimeline } from "@/modules/recruitment/application/lifecycle";
import { LifecycleActions } from "@/components/recruitment/lifecycle";
import { CaseContent } from "@/components/recruitment/case-content";
import {
  getTrustedUser,
  getServerClient,
} from "@/modules/identity/infrastructure/server";
import { getRecruitmentCase } from "@/modules/recruitment/application/cases";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
export const dynamic = "force-dynamic";

export default async function RecruitmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    historyPage?: string | string[];
    workspaceReturn?: string | string[];
    noteId?: string | string[];
    linkId?: string | string[];
    linkSource?: string | string[];
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
  const workspaceReturnToken =
    typeof query.workspaceReturn === "string" &&
    uuidPattern.test(query.workspaceReturn)
      ? query.workspaceReturn
      : undefined;
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
      <WorkspaceReturnLink userId={user.id} token={workspaceReturnToken} />
      <nav
        aria-label="Sekcje sprawy"
        className="mb-5 flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-border bg-card px-4 py-2 text-sm"
      >
        {[
          ["case-details", "Dane sprawy"],
          ["case-links", "Linki"],
          ["case-relations", "Powiązania"],
          ["case-tasks", "Zadania"],
          ["case-calendar", "Wydarzenia"],
          ["case-lifecycle", "Zakończenie i kontynuacja"],
          ["case-actions", "Działania"],
          ["case-history", "Historia"],
        ].map(([target, label]) => (
          <a
            key={target}
            href={`#${target}`}
            className="ui-link inline-flex min-h-11 items-center"
          >
            {label}
          </a>
        ))}
      </nav>
      <ContentRecoveryProvider owner={user.id} caseId={item.id}>
        <section className="min-w-0" aria-label="Zapisane dane sprawy">
          <div id="case-details" tabIndex={-1} className="scroll-mt-6">
            <CaseContent item={item} />
          </div>
          <CaseLinks
            owner={user.id}
            caseId={item.id}
            targetId={
              typeof query.linkId === "string" && uuidPattern.test(query.linkId)
                ? query.linkId
                : undefined
            }
            targetSource={
              typeof query.linkSource === "string" &&
              ["legacy", "additional"].includes(query.linkSource)
                ? query.linkSource
                : undefined
            }
          />
          <div id="case-relations" tabIndex={-1} className="mt-5 scroll-mt-6">
            <RelationsPanel
              key={`${user.id}:${item.id}`}
              userId={user.id}
              contextType="case"
              contextId={item.id}
            />
          </div>
          <div id="case-tasks" tabIndex={-1} className="mt-5 scroll-mt-6">
            <TasksPanel
              key={`${user.id}:${item.id}`}
              userId={user.id}
              caseId={item.id}
              caseTitle={item.title}
            />
          </div>
          <div id="case-calendar" tabIndex={-1} className="mt-5 scroll-mt-6">
            <CalendarPanel
              userId={user.id}
              caseId={item.id}
              caseTitle={item.title}
            />
          </div>
          <div id="case-lifecycle" tabIndex={-1} className="scroll-mt-6">
            <LifecycleActions
              key={`${user.id}:${item.id}`}
              userId={user.id}
              caseId={item.id}
              status={item.status}
            />
          </div>
          <div id="case-actions" tabIndex={-1} className="scroll-mt-6">
            <CaseEventForm
              userId={user.id}
              caseId={item.id}
              status={item.status}
              stageVersion={item.stage_version}
            />
          </div>
          <div id="case-history" tabIndex={-1} className="scroll-mt-6">
            {typeof query.noteId === "string" &&
              uuidPattern.test(query.noteId) && (
                <NoteTarget
                  owner={user.id}
                  caseId={item.id}
                  noteId={query.noteId}
                  currentPage={historyPage}
                />
              )}
            <CaseHistory
              key={`${user.id}:${item.id}:${historyPage}`}
              userId={user.id}
              caseId={item.id}
              result={history}
              workspaceReturnToken={workspaceReturnToken}
            />
          </div>
        </section>
      </ContentRecoveryProvider>
    </Workspace>
  );
}
