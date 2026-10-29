/** Disposable synthetic Auth fixtures. Never import this module from the app. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Cases, ApiTarget, User } from "../rls/data-api.ts";

export type AuthTarget = ApiTarget & { mailUrl: string; appOrigin: string };
export type AuthCases = Cases;
export type Account = { id: string; email: string; password: string };
export const syntheticCredentials = () => ({
  email: `f3-${randomUUID()}@example.invalid`,
  password: `Synthetic-F3-${randomUUID()}!`,
});
export function sdk(target: AuthTarget): SupabaseClient {
  return createClient(target.apiUrl, target.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}
export function success(
  error: { code?: string; status?: number } | null,
  label: string,
): void {
  assert.ok(
    error === null,
    `${label} failed (code=${error?.code ?? "unknown"}, status=${error?.status ?? "unknown"})`,
  );
}
export async function account(target: AuthTarget): Promise<Account> {
  const credentials = syntheticCredentials();
  // Sole elevated phase: create one synthetic confirmed account. User operations use anon+JWT.
  const response = await fetch(`${target.apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: target.serviceRoleKey,
      Authorization: `Bearer ${target.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...credentials, email_confirm: true }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  assert.equal(response.status, 200, "Synthetic account setup failed");
  const body = (await response.json()) as { id: string };
  assert.ok(typeof body.id === "string");
  return { ...credentials, id: body.id };
}
export async function login(target: AuthTarget, user: Account) {
  const client = sdk(target);
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  success(result.error, "password login");
  assert.ok(result.data.session, "Login must issue session");
  assert.ok(result.data.user?.id === user.id, "Login owner mismatch");
  return { client, session: result.data.session };
}
export function userFixture(user: Account, token: string): User {
  return { ...user, token };
}
export async function mailLink(
  target: AuthTarget,
  email: string,
  type: "signup" | "recovery",
): Promise<string> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const response = await fetch(`${target.mailUrl}/api/v1/messages`, {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    assert.equal(response.status, 200, "Mail sink must be reachable");
    const body = (await response.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    assert.ok(
      Array.isArray(body.messages),
      "Mail sink messages shape mismatch",
    );
    for (const message of body.messages) {
      if (!message.To.some((to) => to.Address === email)) continue;
      const content = await fetch(
        `${target.mailUrl}/api/v1/message/${encodeURIComponent(message.ID)}`,
        { signal: AbortSignal.timeout(5000), redirect: "error" },
      );
      assert.equal(content.status, 200);
      const mail = (await content.json()) as { HTML?: string; Text?: string };
      const raw = `${mail.HTML ?? ""}\n${mail.Text ?? ""}`.replaceAll(
        "&amp;",
        "&",
      );
      for (const match of raw.matchAll(/https?:\/\/[^\s"<>]+/g)) {
        const url = new URL(match[0]);
        if (
          url.pathname === "/auth/v1/verify" &&
          url.searchParams.get("type") === type
        ) {
          assert.ok(
            url.origin === target.apiUrl,
            "Verification link origin must match guarded local target",
          );
          return url.href;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Expected synthetic verification message did not arrive");
}
/** Verify the provider's actual redirect, not a reconstructed callback URL. */
export async function verificationRedirect(
  link: string,
  target: AuthTarget,
  expectedNext: "/account" | "/reset-password" | null,
): Promise<{ code: string; callback: string }> {
  const response = await fetch(link, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    response.status,
    303,
    "Verification must redirect to PKCE callback",
  );
  const location = response.headers.get("location");
  assert.ok(location, "Verification callback missing");
  const url = new URL(location);
  assert.equal(url.origin, target.appOrigin, "Auth callback origin mismatch");
  assert.equal(url.pathname, "/auth/callback", "Wrong Auth callback path");
  assert.equal(url.username, "", "Callback must not contain credentials");
  assert.equal(url.password, "", "Callback must not contain credentials");
  assert.equal(url.hash, "", "Callback must not contain fragment tokens");
  assert.deepEqual(
    url.searchParams.getAll("next"),
    expectedNext === null ? [] : [expectedNext],
    "Provider did not preserve the requested callback destination",
  );
  assert.deepEqual(
    [...url.searchParams.keys()].sort(),
    expectedNext === null ? ["code"] : ["code", "next"],
    "Unexpected or repeated callback query parameters",
  );
  const code = url.searchParams.get("code");
  assert.ok(code, "PKCE callback must contain a code");
  return { code, callback: url.href };
}

export async function verificationCode(
  link: string,
  target: AuthTarget,
  expectedNext: "/account" | "/reset-password" | null = null,
): Promise<string> {
  return (await verificationRedirect(link, target, expectedNext)).code;
}
