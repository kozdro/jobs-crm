import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  account,
  mailLink,
  syntheticCredentials,
  sdk,
  verificationCode,
  type Account,
  type AuthTarget,
} from "../integration/auth/fixtures.ts";
import { readAuthTarget } from "../../scripts/auth/f3-target.ts";

type BrowserTarget = AuthTarget & { secondAppOrigin: string };
let target: BrowserTarget;
let a: Account;
let b: Account;

test.beforeAll(async () => {
  const id = process.env.F3_TARGET_ID;
  if (!id)
    throw new Error(
      "Auth browser tests require guarded F3_TARGET_ID, never a cloud URL",
    );
  target = await readAuthTarget(id);
  a = await account(target);
  b = await account(target);
});
async function login(page: Page, user: Account) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/account`);
  await expect(
    page.getByRole("heading", { name: "Twoje konto", exact: true }),
  ).toBeVisible();
  await identity(page.context(), target.appOrigin, user);
}
async function settledLogin(page: Page) {
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.waitForLoadState("load");
  await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zaloguj się", exact: true }),
  ).toBeEnabled();
}
async function identity(
  context: BrowserContext,
  origin: string,
  user: Account,
) {
  const response = await context.request.get(`${origin}/auth/user`, {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = (await response.json()) as {
    user: { id: string; email: string };
  };
  expect(body.user.id).toBe(user.id);
  expect(body.user.email).toBe(user.email);
  expect(Object.keys(body.user).sort()).toEqual(["email", "id"]);
}

async function sdkSessionCookie(context: BrowserContext) {
  const chunks = (await context.cookies()).filter((cookie) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
  );
  expect(chunks.length).toBeGreaterThan(0);
  const encoded = chunks
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true }),
    )
    .map((cookie) => cookie.value)
    .join("");
  try {
    const session = JSON.parse(
      encoded.startsWith("base64-")
        ? Buffer.from(encoded.slice(7), "base64url").toString()
        : encoded,
    ) as { access_token: string; refresh_token: string; expires_at: number };
    expect(
      typeof session.access_token === "string" &&
        typeof session.refresh_token === "string" &&
        Number.isFinite(session.expires_at),
    ).toBe(true);
    return session;
  } catch {
    throw new Error("Invalid synthetic SDK cookie; session material withheld");
  }
}
async function safeAuthNavigation(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch {
    throw new Error("Synthetic protocol navigation failed; URL withheld");
  }
}

test("AUTH-01/03/04/06/07 FQA-22/23/26/28/29 login errors, validation, cookies, no SSR secret leakage and explicit local logout", async ({
  page,
  context,
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => consoleMessages.push(error.message));
  await page.goto(`${target.appOrigin}/account`);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.getByLabel("E-mail", { exact: true }).fill(a.email);
  await page
    .getByLabel("Hasło", { exact: true })
    .fill("Incorrect-synthetic-password!");
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  await login(page, a);
  await identity(context, target.appOrigin, a);
  const cookies = (await context.cookies()).filter((cookie) =>
    cookie.name.startsWith("sb-"),
  );
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
  }
  const response = await context.request.get(`${target.appOrigin}/account`);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const html = await response.text();
  expect(html.includes(a.password)).toBe(false);
  expect(
    /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(html),
  ).toBe(false);
  expect(
    consoleMessages.some(
      (message) =>
        message.includes(a.password) || /eyJ[A-Za-z0-9_-]+\.eyJ/.test(message),
    ),
  ).toBe(false);
  // Preserve a real account document in this tab's history, then end its session in another tab.
  await page.goto(`${target.appOrigin}/login`);
  const logoutTab = await context.newPage();
  try {
    await logoutTab.goto(`${target.appOrigin}/account`);
    await logoutTab
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await settledLogin(logoutTab);
    expect(
      (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
    await page.goBack();
    await expect(page.getByText(a.email, { exact: true })).not.toBeVisible();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await page.goto(`${target.appOrigin}/account`);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  } finally {
    await logoutTab.close();
  }
});

test("AUTH-05/09/12 FQA-27/31/34 A/B tabs two SSR processes and UI others/global preserve scopes and cache", async ({
  browser,
}) => {
  const ca = await browser.newContext({ ignoreHTTPSErrors: true });
  const cb = await browser.newContext({ ignoreHTTPSErrors: true });
  const anotherA = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const pa = await ca.newPage();
    const pb = await cb.newPage();
    await Promise.all([login(pa, a), login(pb, b)]);
    const tab = await ca.newPage();
    await tab.goto(`${target.appOrigin}/account`);
    for (let round = 0; round < 4; round++) {
      await Promise.all([
        identity(ca, target.appOrigin, a),
        identity(cb, target.appOrigin, b),
        identity(ca, target.secondAppOrigin, a),
        identity(cb, target.secondAppOrigin, b),
        pa.reload(),
        tab.reload(),
        pb.reload(),
      ]);
    }
    for (const [context, user, other] of [
      [ca, a, b],
      [cb, b, a],
    ] as const) {
      for (const origin of [target.appOrigin, target.secondAppOrigin]) {
        const ssr = await context.request.get(`${origin}/account`);
        expect(ssr.headers()["cache-control"]).toContain("no-store");
        expect((await ssr.text()).includes(other.email)).toBe(false);
        const rsc = await context.request.get(
          `${origin}/account?_rsc=f3-${Date.now()}`,
          { headers: { RSC: "1" } },
        );
        expect(rsc.headers()["cache-control"]).toContain("no-store");
        const text = await rsc.text();
        expect(text.includes(other.email)).toBe(false);
        expect(/eyJ[A-Za-z0-9_-]+\.eyJ/.test(text)).toBe(false);
        await identity(context, origin, user);
      }
    }
    await ca.setOffline(true);
    await pa
      .reload({ waitUntil: "domcontentloaded", timeout: 5000 })
      .catch(() => undefined);
    await ca.setOffline(false);
    await pa.goto(`${target.appOrigin}/account`);
    await identity(ca, target.appOrigin, a);
    const anotherPage = await anotherA.newPage();
    await login(anotherPage, a);
    const oldOtherSession = await sdkSessionCookie(anotherA);
    await anotherPage.close();
    await pa
      .getByRole("button", { name: "Wyloguj pozostałe sesje", exact: true })
      .click();
    await expect(
      pa.getByText(
        "Pozostałe sesje zostały wylogowane. Bieżąca sesja pozostaje aktywna.",
        { exact: true },
      ),
    ).toBeVisible();
    await identity(ca, target.appOrigin, a);
    await identity(cb, target.appOrigin, b);
    const revokedOther = await sdk(target).auth.refreshSession({
      refresh_token: oldOtherSession.refresh_token,
    });
    expect(Boolean(revokedOther.error) && !revokedOther.data.session).toBe(
      true,
    );
    const newOtherPage = await anotherA.newPage();
    await login(newOtherPage, a);
    const freshOtherSession = await sdkSessionCookie(anotherA);
    await newOtherPage.close();
    const unrelatedSession = await sdkSessionCookie(cb);
    await pa
      .getByRole("button", { name: "Wyloguj wszędzie", exact: true })
      .click();
    await settledLogin(pa);
    expect(
      (await ca.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
    const revokedGlobal = await sdk(target).auth.refreshSession({
      refresh_token: freshOtherSession.refresh_token,
    });
    expect(Boolean(revokedGlobal.error) && !revokedGlobal.data.session).toBe(
      true,
    );
    const stillB = await sdk(target).auth.refreshSession({
      refresh_token: unrelatedSession.refresh_token,
    });
    expect(!stillB.error && stillB.data.user?.id === b.id).toBe(true);
    await identity(cb, target.appOrigin, b);
  } finally {
    await ca.close();
    await cb.close();
    await anotherA.close();
  }
});

test("AUTH-02/06/07 FQA-25/28/29 callback hostile redirects provider errors malformed sessions and mutating methods fail closed", async ({
  request,
  page,
  context,
}) => {
  for (const next of [
    "https://evil.invalid",
    "//evil.invalid",
    "/\\evil.invalid",
    "javascript:alert(1)",
    "/account?owner=other",
    "/%2f%2fevil.invalid",
  ]) {
    const response = await request.get(
      `${target.appOrigin}/auth/callback?code=invalid&next=${encodeURIComponent(next)}`,
      { maxRedirects: 0 },
    );
    expect([302, 303, 307]).toContain(response.status());
    const location = response.headers()["location"];
    expect(new URL(location, target.appOrigin).origin).toBe(target.appOrigin);
    expect(location.includes("code=")).toBe(false);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  for (const suffix of [
    "",
    "?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C/script%3E",
    "?code=first&code=second",
    "?code=bad&next=/account&next=https://evil.invalid",
  ]) {
    const response = await request.get(
      `${target.appOrigin}/auth/callback${suffix}`,
      { maxRedirects: 0 },
    );
    expect([302, 303, 307, 400]).toContain(response.status());
    expect((await request.get(`${target.appOrigin}/auth/user`)).status()).toBe(
      401,
    );
  }
  for (const path of ["/auth/user", "/auth/callback", "/auth/password"]) {
    const crossOrigin = await request.post(`${target.appOrigin}${path}`, {
      headers: {
        Origin: "https://evil.invalid",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: "scope=global&code=invalid",
    });
    expect([403, 405]).toContain(crossOrigin.status());
  }
  expect(
    (await request.get(`${target.appOrigin}/auth/password`)).status(),
  ).toBe(405);
  for (const origin of [undefined, "null", "https://evil.invalid"]) {
    const response = await request.post(`${target.appOrigin}/auth/password`, {
      ...(origin ? { headers: { Origin: origin } } : {}),
      data: {
        password: "Synthetic-do-not-update!",
        expectedUserId: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(response.status()).toBe(403);
  }
  const formPassword = await request.post(`${target.appOrigin}/auth/password`, {
    headers: {
      Origin: target.appOrigin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: "password=Synthetic-do-not-update&expectedUserId=00000000-0000-0000-0000-000000000000",
  });
  expect([403, 415]).toContain(formPassword.status());
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: "malformed-session",
      domain: "127.0.0.1",
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${target.appOrigin}/account`);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto(
    `${target.appOrigin}/login?error=${encodeURIComponent('<img src=x onerror="window.f3Xss=1">')}&next=//evil.invalid`,
  );
  expect(
    await page.evaluate(() => (window as Window & { f3Xss?: number }).f3Xss),
  ).toBeUndefined();
  expect(await page.locator("img[onerror]").count()).toBe(0);
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
});

test("AUTH-14 FQA-57 self-service browser signup confirms in same PKCE context and replay is denied", async ({
  page,
  context,
  browser,
}) => {
  const credentials = syntheticCredentials();
  await page.goto(`${target.appOrigin}/signup`);
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Hasło", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Utwórz konto", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const newSignupMessage = await page.getByRole("status").textContent();
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  const link = await mailLink(target, credentials.email, "signup");
  const code = await verificationCode(link, target);
  const callback = `${target.appOrigin}/auth/callback?code=${encodeURIComponent(code)}`;
  const foreign = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const wrongContext = await foreign.request.get(callback, {
      maxRedirects: 0,
    });
    expect(wrongContext.status()).toBe(303);
    expect(
      new URL(wrongContext.headers()["location"], target.appOrigin).pathname,
    ).toBe("/login");
    expect(
      (await foreign.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
    const hostileOrigin = await context.request.get(callback, {
      maxRedirects: 0,
      headers: { Origin: "https://evil.invalid" },
    });
    expect(hostileOrigin.status()).toBe(303);
    expect(
      new URL(hostileOrigin.headers()["location"], target.appOrigin).pathname,
    ).toBe("/login");
    expect(
      (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
  } finally {
    await foreign.close();
  }
  try {
    await page.goto(callback);
  } catch {
    throw new Error(
      "Synthetic signup callback navigation failed; URL withheld",
    );
  }
  await expect(page).toHaveURL(`${target.appOrigin}/account`);
  await expect(
    page.getByRole("heading", { name: "Twoje konto", exact: true }),
  ).toBeVisible();
  expect(page.url().includes("code=")).toBe(false);
  const user = await context.request.get(`${target.appOrigin}/auth/user`);
  expect(user.status()).toBe(200);
  expect((await user.json()).user.email).toBe(credentials.email);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await settledLogin(page);
  try {
    await page.goto(link);
  } catch {
    throw new Error("Synthetic email-link navigation failed; URL withheld");
  }
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  await page.goto(`${target.appOrigin}/signup`);
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Hasło", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Utwórz konto", exact: true }).click();
  const feedback = page.locator('p[role="status"], p[role="alert"]');
  await expect(feedback).toBeVisible();
  const existingRole = await feedback.getAttribute("role");
  console.info(
    "F3_SIGNUP_UI_OBSERVATION " +
      JSON.stringify({
        newUiOutcome: "status",
        existingUiOutcome: existingRole,
        messagesEqual: (await feedback.textContent()) === newSignupMessage,
        productionAntiEnumerationPolicy:
          "OPEN-041/013 - provider configuration dependent",
      }),
  );
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
});

test("AUTH-10 FQA-32 browser recovery mail link updates password with invalid link generic error", async ({
  page,
  context,
}) => {
  const user = await account(target);
  await page.goto(`${target.appOrigin}/forgot-password`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByRole("button", { name: "Wyślij link", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const link = await mailLink(target, user.email, "recovery");
  try {
    await page.goto(link);
  } catch {
    throw new Error("Synthetic email-link navigation failed; URL withheld");
  }
  await expect(page).toHaveURL(`${target.appOrigin}/reset-password`);
  const password = `Updated-synthetic-${Date.now()}!`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zapisz hasło", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(`${target.appOrigin}/account`);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await settledLogin(page);
  await login(page, { ...user, password });
  await identity(context, target.appOrigin, user);
});

test("AUTH-05/07 FQA-27/29 real expiry refresh across tabs and two SSR processes; Auth outage retry", async ({
  browser,
}) => {
  test.setTimeout(150000);
  const tabs = await browser.newContext({ ignoreHTTPSErrors: true });
  const ssr = await browser.newContext({ ignoreHTTPSErrors: true });
  const unavailable = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const tabsUser = await account(target);
    const ssrUser = await account(target);
    const tab1 = await tabs.newPage();
    const tab2 = await tabs.newPage();
    const serverPage = await ssr.newPage();
    await Promise.all([login(tab1, tabsUser), login(serverPage, ssrUser)]);
    await tab2.goto(`${target.appOrigin}/account`);
    const cookieSnapshot = (await ssr.cookies()).filter((cookie) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
    );
    expect(cookieSnapshot.length).toBeGreaterThan(0);
    const encoded = cookieSnapshot
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true }),
      )
      .map((cookie) => cookie.value)
      .join("");
    let expiresAt = 0;
    try {
      const value = encoded.startsWith("base64-")
        ? Buffer.from(encoded.slice(7), "base64url").toString()
        : encoded;
      expiresAt = (JSON.parse(value) as { expires_at: number }).expires_at;
    } catch {
      throw new Error(
        "Unable to inspect SDK synthetic session expiry without exposing material",
      );
    }
    expect(expiresAt > 0 && expiresAt * 1000 - Date.now() < 120000).toBe(true);
    await serverPage.close(); // No browser auto-refresh in this context: exercise request-time server refresh.
    while (Date.now() < expiresAt * 1000 + 1500) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(5000, expiresAt * 1000 + 1500 - Date.now()),
        ),
      );
    }
    await Promise.all([
      identity(ssr, target.appOrigin, ssrUser),
      identity(ssr, target.secondAppOrigin, ssrUser),
      identity(tabs, target.appOrigin, tabsUser),
      identity(tabs, target.secondAppOrigin, tabsUser),
      tab1.reload(),
      tab2.reload(),
    ]);
    await expect(
      tab1.getByRole("heading", { name: "Twoje konto", exact: true }),
    ).toBeVisible();
    await expect(
      tab2.getByRole("heading", { name: "Twoje konto", exact: true }),
    ).toBeVisible();
    await identity(ssr, target.appOrigin, ssrUser);
    const after = await ssr.cookies();
    expect(
      after.some(
        (cookie) =>
          cookie.name.startsWith("sb-") &&
          !cookieSnapshot.some(
            (old) => old.name === cookie.name && old.value === cookie.value,
          ),
      ),
    ).toBe(true);
    const offline = await unavailable.newPage();
    await unavailable.route("**/auth/v1/token?grant_type=password", (route) =>
      route.abort("connectionrefused"),
    );
    await offline.goto(`${target.appOrigin}/login`);
    await offline.getByLabel("E-mail", { exact: true }).fill(tabsUser.email);
    await offline.getByLabel("Hasło", { exact: true }).fill(tabsUser.password);
    await offline
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(offline.getByRole("main").getByRole("alert")).toBeVisible({
      timeout: 20000,
    });
    expect(
      (await unavailable.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
    await unavailable.unroute("**/auth/v1/token?grant_type=password");
    await login(offline, tabsUser);
    await identity(unavailable, target.appOrigin, tabsUser);
  } finally {
    await tabs.close();
    await ssr.close();
    await unavailable.close();
  }
});

test("AUTH-10/12 FQA-32/34 recovery owner switch cannot update another account and upstream errors allow retry", async ({
  page,
  context,
}) => {
  const recoveryOwner = await account(target);
  const other = await account(target);
  await page.goto(`${target.appOrigin}/forgot-password`);
  await page.getByLabel("E-mail", { exact: true }).fill(recoveryOwner.email);
  for (const status of [429, 503]) {
    await context.route("**/auth/v1/recover**", (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error_code: "synthetic_unavailable",
          msg: "Synthetic upstream failure",
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Wyślij link", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByRole("button", { name: "Wyślij link", exact: true }),
    ).toBeEnabled();
    await context.unroute("**/auth/v1/recover**");
  }
  await page.getByRole("button", { name: "Wyślij link", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const link = await mailLink(target, recoveryOwner.email, "recovery");
  try {
    await page.goto(link);
  } catch {
    throw new Error("Synthetic recovery navigation failed; URL withheld");
  }
  await expect(page).toHaveURL(`${target.appOrigin}/reset-password`);
  const attemptedPassword = `Must-not-update-B-${Date.now()}!`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(attemptedPassword);
  const otherTab = await context.newPage();
  try {
    await login(otherTab, other);
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    const save = page.getByRole("button", {
      name: "Zapisz hasło",
      exact: true,
    });
    await expect(save).toBeDisabled();
    await page.evaluate(() => document.querySelector("form")?.requestSubmit());
    for (const origin of [undefined, "null", "https://evil.invalid"]) {
      const csrf = await context.request.post(
        `${target.appOrigin}/auth/password`,
        {
          ...(origin ? { headers: { Origin: origin } } : {}),
          data: { password: attemptedPassword, expectedUserId: other.id },
        },
      );
      expect(csrf.status()).toBe(403);
    }
    const crossSite = await context.request.post(
      `${target.appOrigin}/auth/password`,
      {
        headers: { Origin: target.appOrigin, "Sec-Fetch-Site": "cross-site" },
        data: { password: attemptedPassword, expectedUserId: other.id },
      },
    );
    expect(crossSite.status()).toBe(403);
    const mismatch = await context.request.post(
      `${target.appOrigin}/auth/password`,
      {
        headers: { Origin: target.appOrigin },
        data: { password: attemptedPassword, expectedUserId: recoveryOwner.id },
      },
    );
    expect(mismatch.status()).toBe(403);
    const original = await sdk(target).auth.signInWithPassword({
      email: other.email,
      password: other.password,
    });
    expect(Boolean(original.error)).toBe(false);
    const forged = await sdk(target).auth.signInWithPassword({
      email: other.email,
      password: attemptedPassword,
    });
    expect(Boolean(forged.error) && !forged.data.session).toBe(true);
  } finally {
    await otherTab.close();
  }
});

test("AUTH-05/07 FQA-27/29 delayed actual browser refresh then network loss through expiry yields retry or explicit re-login", async ({
  browser,
}) => {
  test.setTimeout(210000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const independent = await browser.newContext({ ignoreHTTPSErrors: true });
  const user = await account(target);
  const other = await account(target);
  let mode: "delay" | "network" | "reject" = "delay";
  let delayed = 0,
    networkFailures = 0,
    rejected = 0;
  const refreshUrl = /\/auth\/v1\/token\?grant_type=refresh_token(?:&|$)/;
  try {
    await context.route(refreshUrl, async (route) => {
      if (mode === "delay") {
        delayed++;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      } else if (mode === "network") {
        networkFailures++;
        await route.abort("connectionrefused");
      } else {
        rejected++;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "invalid_grant",
            error_code: "refresh_token_not_found",
            error_description: "Synthetic revoked refresh token",
          }),
        });
      }
    });
    const page = await context.newPage();
    const unrelated = await independent.newPage();
    await Promise.all([login(page, user), login(unrelated, other)]);
    const refreshed = page.waitForResponse(
      (response) =>
        refreshUrl.test(response.url()) && response.status() === 200,
      { timeout: 65000 },
    );
    await refreshed;
    expect(delayed).toBeGreaterThan(0);
    const session = await sdkSessionCookie(context);
    expect(session.expires_at * 1000 > Date.now()).toBe(true);
    mode = "network";
    await expect
      .poll(() => networkFailures, {
        timeout: 65000,
        intervals: [250, 500, 1000],
      })
      .toBeGreaterThan(0);
    while (Date.now() < session.expires_at * 1000 + 1500) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(5000, session.expires_at * 1000 + 1500 - Date.now()),
        ),
      );
    }
    mode = "reject";
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 65000 });
    expect(rejected).toBeGreaterThan(0);
    await expect(
      page.getByRole("button", { name: "Zaloguj się", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(user.email, { exact: true })).not.toBeVisible();
    expect(
      (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
    ).toBe(401);
    await identity(independent, target.appOrigin, other);
    await context.unroute(refreshUrl);
    await login(page, user);
    await identity(context, target.appOrigin, user);
    console.info(
      "F3_REFRESH_FAULT_OBSERVATION " +
        JSON.stringify({
          delayedRefreshRequests: delayed,
          networkFailures,
          rejectedRefreshRequests: rejected,
          actualAccessExpiryReached: true,
          explicitReLoginShown: true,
          reconnectPreservedOwner: true,
          unrelatedBPreserved: true,
        }),
    );
  } finally {
    await context.close();
    await independent.close();
  }
});

test("AUTH-02/06 FQA-25/28 attacker PKCE and implicit fragments cannot replace a logged victim or inject anonymous session", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const victim = await browser.newContext({ ignoreHTTPSErrors: true });
  const attacker = await browser.newContext({ ignoreHTTPSErrors: true });
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const owner = await account(target);
    const victimPage = await victim.newPage();
    const attackerPage = await attacker.newPage();
    const credentials = syntheticCredentials();
    await login(victimPage, owner);
    await attackerPage.goto(`${target.appOrigin}/signup`);
    await attackerPage
      .getByLabel("E-mail", { exact: true })
      .fill(credentials.email);
    await attackerPage
      .getByLabel("Hasło", { exact: true })
      .fill(credentials.password);
    await attackerPage
      .getByRole("button", { name: "Utwórz konto", exact: true })
      .click();
    await expect(attackerPage.getByRole("status")).toBeVisible();
    const code = await verificationCode(
      await mailLink(target, credentials.email, "signup"),
      target,
    );
    const callback = `${target.appOrigin}/auth/callback?code=${encodeURIComponent(code)}`;
    await safeAuthNavigation(victimPage, callback);
    await expect(victimPage).toHaveURL(/\/login\?error=callback$/);
    await identity(victim, target.appOrigin, owner);
    await safeAuthNavigation(attackerPage, callback);
    await expect(attackerPage).toHaveURL(`${target.appOrigin}/account`);
    const session = await sdk(target).auth.signInWithPassword(credentials);
    expect(Boolean(session.error) || !session.data.session).toBe(false);
    const fragment = new URLSearchParams({
      access_token: session.data.session!.access_token,
      refresh_token: session.data.session!.refresh_token,
      token_type: "bearer",
      expires_in: "60",
      type: "recovery",
    }).toString();
    for (const path of ["/login", "/auth/callback"]) {
      await safeAuthNavigation(
        victimPage,
        `${target.appOrigin}${path}#${fragment}`,
      );
      await victimPage
        .getByLabel("E-mail", { exact: true })
        .fill("no-such-account@example.invalid");
      await victimPage
        .getByLabel("Hasło", { exact: true })
        .fill("Incorrect-synthetic-password!");
      await victimPage
        .getByRole("button", { name: "Zaloguj się", exact: true })
        .click();
      await expect(
        victimPage.getByRole("main").getByRole("alert"),
      ).toBeVisible();
      expect(Boolean(new URL(victimPage.url()).hash)).toBe(false);
      await identity(victim, target.appOrigin, owner);
      const anonymousPage = await anonymous.newPage();
      try {
        await safeAuthNavigation(
          anonymousPage,
          `${target.appOrigin}${path}#${fragment}`,
        );
        await anonymousPage
          .getByLabel("E-mail", { exact: true })
          .fill("no-such-account@example.invalid");
        await anonymousPage
          .getByLabel("Hasło", { exact: true })
          .fill("Incorrect-synthetic-password!");
        await anonymousPage
          .getByRole("button", { name: "Zaloguj się", exact: true })
          .click();
        await expect(
          anonymousPage.getByRole("main").getByRole("alert"),
        ).toBeVisible();
        expect(Boolean(new URL(anonymousPage.url()).hash)).toBe(false);
        expect(
          (
            await anonymous.request.get(`${target.appOrigin}/auth/user`)
          ).status(),
        ).toBe(401);
      } finally {
        await anonymousPage.close();
      }
    }
    await safeAuthNavigation(
      victimPage,
      `${target.appOrigin}/account#${fragment}`,
    );
    await expect(
      victimPage.getByRole("button", { name: "Wyloguj tutaj", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => Boolean(new URL(victimPage.url()).hash))
      .toBe(false);
    await expect(
      victimPage.getByText(owner.email, { exact: true }),
    ).toBeVisible();
    await identity(victim, target.appOrigin, owner);
  } finally {
    await victim.close();
    await attacker.close();
    await anonymous.close();
  }
});

test("AUTH-03/07 FQA-23/29 native no-store BFCache exclusion and back/logout navigation preserve private data", async ({
  browser,
}) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const events: { path: string; persisted: boolean }[] = [];
  try {
    await context.exposeBinding(
      "__f3ObservePageshow",
      (_source, value: { path: string; persisted: boolean }) => {
        events.push(value);
      },
    );
    await context.addInitScript(() => {
      const observed = window as unknown as Window & {
        __f3ObservePageshow(value: {
          path: string;
          persisted: boolean;
        }): Promise<void>;
      };
      window.addEventListener("pageshow", (event) => {
        void observed.__f3ObservePageshow({
          path: window.location.pathname,
          persisted: event.persisted,
        });
      });
    });
    const user = await account(target);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    const exclusionReasons: string[] = [];
    cdp.on("Page.backForwardCacheNotUsed", (event) => {
      for (const explanation of event.notRestoredExplanations as {
        reason: string;
      }[]) {
        if (
          explanation.reason === "MainResourceHasCacheControlNoStore" ||
          explanation.reason ===
            "JsNetworkRequestReceivedCacheControlNoStoreResource"
        )
          exclusionReasons.push(explanation.reason);
      }
    });
    await login(page, user);
    await expect(
      page.getByRole("button", { name: "Wyloguj tutaj", exact: true }),
    ).toBeVisible();
    await page.goto(`${target.appOrigin}/`);
    const verifiedAfterBack = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/auth/user" &&
        response.status() === 200,
    );
    const back = await page.goBack({ waitUntil: "commit" });
    const validation = await verifiedAfterBack;
    expect((await validation.json()).user.id).toBe(user.id);
    expect(back?.status()).toBe(200);
    expect(back?.headers()["cache-control"]).toContain("no-store");
    await expect.poll(() => exclusionReasons.length).toBeGreaterThan(0);
    expect(
      events.filter((event) => event.path === "/account" && event.persisted)
        .length,
    ).toBe(0);
    await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    const nativeNoStoreReason = exclusionReasons[0];
    if (!nativeNoStoreReason)
      throw new Error(
        "Native BFCache no-store exclusion reason was not observed",
      );
    await page.goto(`${target.appOrigin}/`);
    const logoutTab = await context.newPage();
    try {
      await logoutTab.goto(`${target.appOrigin}/account`);
      await logoutTab
        .getByRole("button", { name: "Wyloguj tutaj", exact: true })
        .click();
      await settledLogin(logoutTab);
      await page.goBack({ waitUntil: "commit" });
      await expect(
        page.getByText(user.email, { exact: true }),
      ).not.toBeVisible();
      await settledLogin(page);
      expect(
        (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
      ).toBe(401);
      console.info(
        "F3_BFCACHE_OBSERVATION " +
          JSON.stringify({
            cacheExclusionObserved: true,
            nativeNoStoreReason,
            reloadedAfterBack: true,
            noPrivateAfterLogout: true,
            actualRestoreHandler:
              "NOT RUN - browser excludes no-store private page",
          }),
      );
    } finally {
      await logoutTab.close();
    }
  } finally {
    await context.close();
  }
});
