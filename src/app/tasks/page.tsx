import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { TasksPanel } from "@/components/tasks/tasks-panel";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function TasksPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Zadania"
      description="Działania ogólne i powiązane ze sprawami. Termin jest opcjonalny."
    >
      <TasksPanel key={user.id} userId={user.id} />
    </Workspace>
  );
}
