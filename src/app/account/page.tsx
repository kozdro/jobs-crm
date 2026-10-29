import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccountSession } from "@/components/auth/account-session";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await getTrustedUser();
  if (!user) redirect("/login");
  return (
    <AuthShell title="Twoje konto">
      <AccountSession userId={user.id}>
        <p className="break-words text-sm leading-6">
          Zalogowano jako{" "}
          <span className="font-medium">{user.email ?? "użytkownik"}</span>.
        </p>
      </AccountSession>
    </AuthShell>
  );
}
