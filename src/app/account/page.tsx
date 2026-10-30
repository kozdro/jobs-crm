import { redirect } from "next/navigation";
import { Workspace } from "@/components/recruitment/workspace";
import { SessionControls } from "@/components/auth/account-session";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <Workspace
      userId={user.id}
      title="Twoje konto"
      description="Dostęp do Twojej przestrzeni i zarządzanie sesjami."
    >
      <div className="max-w-4xl space-y-5">
        <section className="ui-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Dane logowania</h2>
          <p className="mt-3 break-words text-sm leading-6">
            Zalogowano jako{" "}
            <span className="font-semibold [overflow-wrap:anywhere]">
              {user.email ?? "użytkownik"}
            </span>
            .
          </p>
        </section>
        <SessionControls />
      </div>
    </Workspace>
  );
}
