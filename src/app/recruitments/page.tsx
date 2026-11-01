import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";
import {
  getTrustedUser,
  getServerClient,
} from "@/modules/identity/infrastructure/server";
import { loadWorkspace } from "@/modules/recruitment/application/workspace-read";
import {
  defaultWorkspaceQuery,
  parseWorkspaceQuery,
  type WorkspaceData,
} from "@/modules/recruitment/domain/workspace";
export const dynamic = "force-dynamic";

export default async function RecruitmentListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  const values = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value))
      for (const item of value) params.append(key, item);
    else if (value !== undefined) params.set(key, value);
  }
  let query = defaultWorkspaceQuery();
  let invalidQuery = false;
  try {
    query = parseWorkspaceQuery(params);
  } catch {
    invalidQuery = true;
  }
  let data: WorkspaceData | null = null;
  try {
    data = await loadWorkspace(await getServerClient(), query);
  } catch {
    /* A failed read is not an empty collection. */
  }
  return (
    <Workspace
      userId={user.id}
      title="Rekrutacje"
      description="Przeglądaj sprawy i ich kontekst. Zmiany wykonasz na pełnej stronie sprawy."
    >
      <RecruitmentWorkspace
        key={`${user.id}:${randomUUID()}`}
        userId={user.id}
        initialQuery={query}
        initialData={data}
        invalidQuery={invalidQuery}
      />
    </Workspace>
  );
}
