import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";

export const dynamic = "force-dynamic";
export default async function DocumentsPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Dokumenty"
      description="Prywatna biblioteka dokumentów i ich wersji."
    >
      <DocumentsPanel key={user.id} userId={user.id} />
    </Workspace>
  );
}
