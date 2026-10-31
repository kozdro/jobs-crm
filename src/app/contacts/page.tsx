import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CatalogList } from "@/components/companies-contacts/catalog";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function ContactsPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Kontakty"
      description="Osoby kontaktowe mogą istnieć bez sprawy i uczestniczyć w wielu procesach."
    >
      <CatalogList key={user.id} userId={user.id} type="contact" />
    </Workspace>
  );
}
