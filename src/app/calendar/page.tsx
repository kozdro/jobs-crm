import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function CalendarPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Kalendarz"
      description="Planowane i rozliczone wydarzenia."
    >
      <CalendarPanel userId={user.id} />
    </Workspace>
  );
}
