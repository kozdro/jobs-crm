import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CatalogList } from "@/components/companies-contacts/catalog";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function CompaniesPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Firmy"
      description="Twoje organizacje i ich jawne powiązania ze sprawami i kontaktami."
    >
      <CatalogList key={user.id} userId={user.id} type="organization" />
    </Workspace>
  );
}
