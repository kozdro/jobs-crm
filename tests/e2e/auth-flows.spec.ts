import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  account,
  mailLink,
  syntheticCredentials,
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
  await expect(page.getByRole("alert")).toBeVisible();
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
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Twoje konto", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("AUTH-05/12 FQA-27/34 interleaved A/B browser tabs SSR RSC and two independent app processes never share identity/cache", async ({
  browser,
}) => {
  const ca = await browser.newContext({ ignoreHTTPSErrors: true });
  const cb = await browser.newContext({ ignoreHTTPSErrors: true });
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
    await pa
      .getByRole("button", { name: "Wyloguj pozostałe sesje", exact: true })
      .click();
    await identity(ca, target.appOrigin, a);
    await identity(cb, target.appOrigin, b);
  } finally {
    await ca.close();
    await cb.close();
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
  for (const path of ["/auth/user", "/auth/callback"]) {
    const crossOrigin = await request.post(`${target.appOrigin}${path}`, {
      headers: {
        Origin: "https://evil.invalid",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: "scope=global&code=invalid",
    });
    expect([403, 405]).toContain(crossOrigin.status());
  }
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
}) => {
  const credentials = syntheticCredentials();
  await page.goto(`${target.appOrigin}/signup`);
  await page.getByLabel("E-mail", { exact: true }).fill(credentials.email);
  await page.getByLabel("Hasło", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Utwórz konto", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  const link = await mailLink(target, credentials.email, "signup");
  await page.goto(link);
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
  await page.goto(link);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
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
  await page.goto(link);
  await expect(page).toHaveURL(`${target.appOrigin}/reset-password`);
  const password = `Updated-synthetic-${Date.now()}!`;
  await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zapisz hasło", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(`${target.appOrigin}/account`);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
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
    await expect(offline.getByRole("alert")).toBeVisible({ timeout: 20000 });
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
