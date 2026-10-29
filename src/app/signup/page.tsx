import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
export const dynamic = "force-dynamic";
export default function SignupPage() {
  return (
    <AuthShell title="Utwórz konto">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
