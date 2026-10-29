import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Session } from "@supabase/supabase-js";
import { assertIsolation, request, rest, rows, seed } from "../rls/data-api.ts";
import {
  account,
  login,
  mailLink,
  sdk,
  success,
  syntheticCredentials,
  userFixture,
  verificationCode,
  type AuthCases,
  type AuthTarget,
} from "./fixtures.ts";

/** Called only by the guarded F3 runner after migration of its disposable target. */
export async function runAuthSdkCases(
  cases: AuthCases,
  target: AuthTarget,
): Promise<void> {
  const a = await account(target);
  const b = await account(target);
  const expiryAccount = await account(target);
  const expiryClient = sdk(target);
  const otpIssuedAt = Date.now();
  success(
    (
      await expiryClient.auth.resetPasswordForEmail(expiryAccount.email, {
        redirectTo: `${target.appOrigin}/auth/callback?next=/reset-password`,
      })
    ).error,
    "expiry recovery request",
  );
  const expiryLink = await mailLink(target, expiryAccount.email, "recovery");
  const replay: {
    session: Session;
    ownId: string;
    foreignId: string;
    scope: string;
  }[] = [];
  await cases.test(
    "AUTH-01/04 FQA-22/26 SDK password login and verified current user reject wrong credentials/tampered JWT",
    async () => {
      const bad = await sdk(target).auth.signInWithPassword({
        email: a.email,
        password: `Wrong-${randomUUID()}!`,
      });
      assert.ok(
        bad.error && !bad.data.session,
        "Wrong password must fail without session",
      );
      const { client, session } = await login(target, a);
      const current = await client.auth.getUser();
      success(current.error, "trusted getUser");
      assert.ok(current.data.user?.id === a.id);
      const invalid = await sdk(target).auth.getUser(
        `${session.access_token.slice(0, -8)}invalid!`,
      );
      assert.ok(
        invalid.error && !invalid.data.user,
        "Tampered token cannot authorize",
      );
      const malformed = await sdk(target).auth.getUser("not-a-jwt");
      assert.ok(malformed.error && !malformed.data.user);
    },
  );
  await cases.test(
    "AUTH-06 FQA-28 direct Auth/Data API require Authorization and ignore ambient app cookies",
    async () => {
      const signed = await login(target, a);
      const cookie = `sb-fixture-auth-token=${encodeURIComponent(signed.session.access_token)}`;
      const data = await request(
        target,
        undefined,
        rest("probe_item"),
        "GET",
        undefined,
        { Cookie: cookie, Origin: "https://evil.invalid" },
      );
      assert.ok(
        data.status === 401 || data.status === 403,
        "Cookie alone cannot authorize Data API",
      );
      const logout = await fetch(
        `${target.apiUrl}/auth/v1/logout?scope=global`,
        {
          method: "POST",
          headers: {
            apikey: target.anonKey,
            Cookie: cookie,
            Origin: "https://evil.invalid",
          },
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
      );
      assert.ok(
        logout.status === 401 || logout.status === 403,
        "Cookie-only cross-origin logout must not revoke a session",
      );
      success(
        (await signed.client.auth.refreshSession()).error,
        "cookie-only attack left real session usable",
      );
    },
  );
  await cases.test(
    "AUTH-12 FQA-34 SDK Data API RLS A/B lists IDs relations and user metadata override",
    async () => {
      const aa = await login(target, a);
      const bb = await login(target, b);
      const ua = userFixture(a, aa.session.access_token);
      const ub = userFixture(b, bb.session.access_token);
      const fa = await seed(target, ua);
      const fb = await seed(target, ub);
      await assertIsolation(target, ua, ub, fb);
      await assertIsolation(target, ub, ua, fa);
      success(
        (
          await aa.client.auth.updateUser({
            data: { owner_id: b.id, role: "service_role" },
          })
        ).error,
        "metadata fixture",
      );
      success(
        (await aa.client.auth.refreshSession()).error,
        "metadata refresh",
      );
      const own = await aa.client
        .schema("foundation_poc")
        .from("probe_item")
        .select("id,owner_id");
      success(own.error, "SDK RLS list");
      assert.ok(
        own.data?.some((row) => row.id === fa.probe_item.id),
        "Owner positive row missing",
      );
      assert.ok(
        own.data?.every((row) => row.owner_id === a.id),
        "Metadata must not change auth.uid",
      );
      const foreign = await aa.client
        .schema("foundation_poc")
        .from("probe_item")
        .select("id")
        .eq("id", fb.probe_item.id);
      success(foreign.error, "SDK RLS direct foreign ID");
      assert.equal(foreign.data?.length, 0);
      const forged = await aa.client
        .schema("foundation_poc")
        .from("probe_item")
        .insert({
          id: randomUUID(),
          owner_id: b.id,
          marker: "synthetic-forged-owner",
        });
      assert.ok(forged.error, "Forged owner must be denied by RLS");
      const concurrent = await Promise.all(
        Array.from({ length: 12 }, async (_, index) => {
          const current = index % 2 ? aa : bb;
          const expected = index % 2 ? a : b;
          const result = await current.client
            .schema("foundation_poc")
            .from("probe_item")
            .select("owner_id");
          success(result.error, "interleaved SDK Data API");
          assert.ok(
            result.data &&
              result.data.length > 0 &&
              result.data.every((row) => row.owner_id === expected.id),
          );
          return true;
        }),
      );
      assert.equal(concurrent.length, 12);
    },
  );
  await cases.test(
    "AUTH-05/07 FQA-26/27 SDK concurrent refresh deduplication preserves owner and revoked refresh cannot recover",
    async () => {
      const { client, session } = await login(target, a);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => client.auth.refreshSession()),
      );
      for (const result of results) {
        success(result.error, "concurrent refresh");
        assert.ok(result.data.user?.id === a.id, "Refresh owner changed");
      }
      success(
        (await client.auth.signOut({ scope: "local" })).error,
        "local cleanup",
      );
      const result = await sdk(target).auth.refreshSession({
        refresh_token: session.refresh_token,
      });
      assert.ok(
        result.error && !result.data.session,
        "Revoked refresh cannot recover session",
      );
    },
  );
  for (const scope of ["local", "others", "global"] as const) {
    await cases.test(
      `AUTH-08/09/11 FQA-30/31/33 ${scope} three A sessions plus B; separate client/refresh/access-JWT results`,
      async () => {
        const current = await login(target, a);
        const other = await login(target, a);
        const third = await login(target, a);
        const unrelated = await login(target, b);
        const fa = await seed(
          target,
          userFixture(a, current.session.access_token),
        );
        const fb = await seed(
          target,
          userFixture(b, unrelated.session.access_token),
        );
        const result = await current.client.auth.signOut({ scope });
        success(result.error, `signOut ${scope}`);
        const local = await current.client.auth.getSession();
        success(local.error, "post-signout local client state");
        assert.ok(
          scope === "others"
            ? local.data.session?.user.id === a.id
            : local.data.session === null,
          "Client state must match explicit logout scope",
        );
        for (const [index, candidate] of [current, other, third].entries()) {
          const refresh = await sdk(target).auth.refreshSession({
            refresh_token: candidate.session.refresh_token,
          });
          const revoked =
            scope === "global" ||
            (scope === "local" ? index === 0 : index !== 0);
          if (revoked)
            assert.ok(
              refresh.error && !refresh.data.session,
              "Scope must revoke selected refresh session",
            );
          else {
            success(refresh.error, "unaffected A refresh");
            assert.ok(refresh.data.user?.id === a.id);
          }
        }
        const refreshedB = await unrelated.client.auth.refreshSession();
        success(refreshedB.error, "B unaffected refresh");
        assert.ok(refreshedB.data.user?.id === b.id);
        const access = await request(
          target,
          current.session.access_token,
          rest("probe_item", `id=eq.${fa.probe_item.id}`),
        );
        assert.equal(
          rows(access).length,
          1,
          "Unexpired copied JWT still has native Data API validity",
        );
        assert.equal(
          rows(
            await request(
              target,
              current.session.access_token,
              rest("probe_item", `id=eq.${fb.probe_item.id}`),
            ),
          ).length,
          0,
          "Replay JWT never grants foreign owner data",
        );
        replay.push({
          session: current.session,
          ownId: fa.probe_item.id,
          foreignId: fb.probe_item.id,
          scope,
        });
      },
    );
  }
  await cases.test(
    "AUTH-14/02 FQA-57/25 self-service signup requires email confirmation; PKCE correct context and replay",
    async () => {
      const credentials = syntheticCredentials();
      const client = sdk(target);
      const signup = await client.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: `${target.appOrigin}/auth/callback` },
      });
      success(signup.error, "self signup");
      assert.ok(
        signup.data.user && !signup.data.session,
        "Fixture requires confirmation before session",
      );
      const premature = await sdk(target).auth.signInWithPassword(credentials);
      assert.ok(
        premature.error && !premature.data.session,
        "Unconfirmed account cannot login",
      );
      const link = await mailLink(target, credentials.email, "signup");
      const code = await verificationCode(link, target);
      const missing = await sdk(target).auth.exchangeCodeForSession(code);
      assert.ok(
        missing.error && !missing.data.session,
        "Another context lacks PKCE verifier",
      );
      const confirmed = await client.auth.exchangeCodeForSession(code);
      success(confirmed.error, "confirmed signup code exchange");
      assert.ok(
        confirmed.data.user?.id === signup.data.user.id &&
          confirmed.data.session,
      );
      const privateData = await client
        .schema("foundation_poc")
        .from("probe_item")
        .select("id");
      success(privateData.error, "new account RLS");
      assert.equal(
        privateData.data?.length,
        0,
        "New account must not inherit existing fixture rows",
      );
      const repeated = await client.auth.exchangeCodeForSession(code);
      assert.ok(
        repeated.error && !repeated.data.session,
        "Code replay must fail",
      );
      // Observe provider anti-enumeration instead of claiming the SDK always hides existing users.
      const duplicate = await sdk(target).auth.signUp(credentials);
      if (duplicate.error)
        assert.ok(
          typeof duplicate.error.code === "string",
          "Provider error must be structured",
        );
      else
        assert.ok(
          !duplicate.data.session,
          "Duplicate signup cannot establish unauthenticated session",
        );
      const invalid = await sdk(target).auth.signUp({
        email: "invalid",
        password: "x",
      });
      assert.ok(
        invalid.error && !invalid.data.session,
        "Invalid signup input must be rejected",
      );
    },
  );
  await cases.test(
    "AUTH-10/02 FQA-32/25 real mail recovery PKCE missing/wrong context replay and changed password",
    async () => {
      const user = await account(target);
      const client = sdk(target);
      success(
        (
          await client.auth.resetPasswordForEmail(user.email, {
            redirectTo: `${target.appOrigin}/auth/callback?next=/reset-password`,
          })
        ).error,
        "recovery request",
      );
      const link = await mailLink(target, user.email, "recovery");
      const code = await verificationCode(link, target);
      const wrongContext = sdk(target);
      // A distinct PKCE verifier must not be accepted for this recovery code.
      success(
        (
          await wrongContext.auth.resetPasswordForEmail(
            `absent-${randomUUID()}@example.invalid`,
            {
              redirectTo: `${target.appOrigin}/auth/callback?next=/reset-password`,
            },
          )
        ).error,
        "unknown-email recovery request",
      );
      const wrong = await wrongContext.auth.exchangeCodeForSession(code);
      assert.ok(
        wrong.error && !wrong.data.session,
        "Foreign verifier must not redeem recovery code",
      );
      const recovered = await client.auth.exchangeCodeForSession(code);
      success(recovered.error, "recovery exchange");
      assert.ok(recovered.data.user?.id === user.id && recovered.data.session);
      const password = `Recovered-${randomUUID()}!`;
      success(
        (await client.auth.updateUser({ password })).error,
        "recovery password update",
      );
      const old = await sdk(target).auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      assert.ok(
        old.error && !old.data.session,
        "Old password must no longer login",
      );
      await login(target, { ...user, password });
      const replayed = await sdk(target).auth.exchangeCodeForSession(code);
      assert.ok(replayed.error && !replayed.data.session);
      const invalid = await sdk(target).auth.exchangeCodeForSession(
        "invalid-synthetic-code",
      );
      assert.ok(invalid.error && !invalid.data.session);
      const reusedLink = await fetch(link, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      const location = reusedLink.headers.get("location");
      assert.ok(
        location && !new URL(location).searchParams.has("code"),
        "Consumed recovery link cannot issue a fresh code",
      );
    },
  );
  await cases.test(
    "AUTH-11/07 FQA-33/29 real-clock replay for local/others/global rejected after JWT expiry",
    async () => {
      assert.equal(
        replay.length,
        3,
        "All logout scope replay samples required",
      );
      const latest = Math.max(
        ...replay.map((row) => row.session.expires_at ?? 0),
      );
      assert.ok(
        latest > 0 && latest * 1000 - Date.now() < 180000,
        "Expected bounded synthetic JWT TTL; refusing production-length wait",
      );
      // Respect actual exp and PostgREST clock tolerance. No fake clock modifies provider validity.
      const deadline = latest * 1000 + 65000;
      const pending = new Set(replay);
      while (pending.size && Date.now() < deadline) {
        for (const entry of pending) {
          const result = await request(
            target,
            entry.session.access_token,
            rest("probe_item", `id=eq.${entry.ownId}`),
          );
          if (result.status === 401) pending.delete(entry);
          else
            assert.equal(
              result.status,
              200,
              "JWT replay must be either native validity or expiry rejection",
            );
        }
        if (pending.size)
          await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.equal(
        pending.size,
        0,
        "All copied access tokens must be rejected after expiry",
      );
      for (const entry of replay) {
        assert.equal(
          (
            await request(
              target,
              entry.session.access_token,
              rest("probe_item", `id=eq.${entry.foreignId}`),
            )
          ).status,
          401,
        );
        const trusted = await sdk(target).auth.getUser(
          entry.session.access_token,
        );
        assert.ok(
          trusted.error && !trusted.data.user,
          "Expired token cannot establish server identity",
        );
      }
    },
  );
  await cases.test(
    "AUTH-10 FQA-32 real-clock expired recovery email cannot establish session",
    async () => {
      const deadline = otpIssuedAt + 62500;
      if (Date.now() < deadline)
        await new Promise((resolve) =>
          setTimeout(resolve, deadline - Date.now()),
        );
      const expired = await fetch(expiryLink, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      assert.ok(expired.status >= 300 && expired.status < 400);
      const location = expired.headers.get("location");
      assert.ok(
        location,
        "Expired email must return a controlled failure redirect",
      );
      const url = new URL(location);
      assert.ok(
        url.origin === target.appOrigin && !url.searchParams.has("code"),
      );
      assert.ok(
        url.hash.includes("otp_expired") ||
          url.searchParams.get("error_code") === "otp_expired",
        "Fixture recovery link must be rejected for actual OTP expiry",
      );
      const empty = await expiryClient.auth.getSession();
      success(empty.error, "expiry client state");
      assert.ok(
        !empty.data.session,
        "Expired recovery must not establish client session",
      );
    },
  );
}
