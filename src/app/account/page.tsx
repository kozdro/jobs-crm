import { redirect } from "next/navigation";
import Link from "next/link";
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
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
        >
          Dashboard
        </Link>
        <p className="break-words text-sm leading-6">
          Zalogowano jako{" "}
          <span className="font-medium">{user.email ?? "użytkownik"}</span>.
        </p>
      </AccountSession>
    </AuthShell>
  );
}
