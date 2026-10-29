import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const dynamic = "force-dynamic";
export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Odzyskaj dostęp">
      <AuthForm mode="forgot" />
    </AuthShell>
  );
}
