import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { CatalogProfileScreen } from "@/components/companies-contacts/catalog";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
export const dynamic = "force-dynamic";
export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  return (
    <Workspace userId={user.id} title="Profil kontaktu">
      <CatalogProfileScreen
        key={`${user.id}:${id}`}
        userId={user.id}
        id={id}
        type="contact"
      />
    </Workspace>
  );
}
