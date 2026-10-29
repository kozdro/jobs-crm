import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { getTrustedUser } from "@/modules/identity/infrastructure/server";
import { getAuthConfig } from "@/shared/server/env";
export const dynamic = "force-dynamic";
export default async function ResetPasswordPage() {
  const config = getAuthConfig();
  if (config.enabled && config.localFixture && !(await getTrustedUser()))
    redirect("/forgot-password");
  return (
    <AuthShell title="Ustaw nowe hasło">
      <AuthForm mode="reset" />
    </AuthShell>
  );
}
