import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { SearchContent } from "@/components/global-search/search";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function SearchPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace userId={user.id} title="Wyniki wyszukiwania">
      <SearchContent userId={user.id} />
    </Workspace>
  );
}
