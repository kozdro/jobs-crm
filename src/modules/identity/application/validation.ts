import { z } from "zod";

// Provider validation remains authoritative; this only rejects empty/malformed UI input.
export const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const emailSchema = z.object({ email: z.email() });
export const passwordSchema = z.object({ password: z.string().min(1) });
export const logoutScopeSchema = z.enum(["local", "global", "others"]);
export type LogoutScope = z.infer<typeof logoutScopeSchema>;

/** Exact destinations avoid URL parsing ambiguities and user-controlled external redirects. */
export function callbackDestination(
  value: string | null,
): "/account" | "/reset-password" | null {
  if (value === null || value === "/account") return "/account";
  if (value === "/reset-password") return value;
  return null;
}

export function callbackCode(value: string | null): string | null {
  // Codes are opaque. Reject control characters and whitespace; never reflect/log them.
  if (!value || /[\s\u0000-\u001f\u007f]/u.test(value)) return null;
  return value;
}
