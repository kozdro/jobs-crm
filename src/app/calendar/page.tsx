import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CalendarPanel } from "@/components/calendar/calendar-panel";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
export const dynamic = "force-dynamic";
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  return (
    <Workspace
      userId={user.id}
      title="Kalendarz"
      description="Planowane i rozliczone wydarzenia."
    >
      <CalendarPanel
        userId={user.id}
        targetEventId={
          typeof params.eventId === "string" && uuidPattern.test(params.eventId)
            ? params.eventId
            : undefined
        }
      />
    </Workspace>
  );
}
