/** DEC-059 production HTTPS browser evidence; synthetic disposable target only. */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  readRecruitmentTarget,
  type RecruitmentTarget,
} from "../../scripts/recruitment/target.ts";
import {
  account,
  login as sdkLogin,
  type Account,
} from "../integration/auth/fixtures.ts";
let target: RecruitmentTarget;
let a: Account, b: Account;
let cases: { id: string; title: string }[];
let organization: { id: string; name: string },
  person: { id: string; name: string };
const marker = randomUUID();
test.describe.configure({ timeout: 120000 });
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("Workspace browser requires guarded disposable target");
  target = await readRecruitmentTarget(id);
  a = await account(target);
  b = await account(target);
  const { client } = await sdkLogin(target, a);
  cases = [];
  for (let i = 0; i < 28; i++) {
    const title = `Workspace ${marker} ${String(i).padStart(2, "0")}`;
    const { data, error } = await client.rpc("create_recruitment_case", {
      p_request_id: randomUUID(),
      p_title: title,
    });
    expect(error).toBeNull();
    cases.push({ id: data.case.id, title });
  }
  const profile = async (type: string, name: string) => {
    const { data, error } = await client.rpc("execute_catalog_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create-profile",
        profileType: type,
        name,
        email: null,
      },
    });
    expect(error).toBeNull();
    return data.profile as { id: string; name: string };
  };
  organization = await profile("organization", `Workspace firma ${marker}`);
  person = await profile("contact", `Workspace osoba ${marker}`);
  for (let i = 0; i < 26; i++)
    await profile("organization", `Later organization ${marker} ${i}`);
  for (const [relationType, rightId, role] of [
    ["case-organization", organization.id, "agency"],
    ["case-contact", person.id, null],
  ] as const) {
    const { error } = await client.rpc("execute_catalog_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "attach",
        relationType,
        leftId: cases[0].id,
        rightId,
        role,
      },
    });
    expect(error).toBeNull();
  }
  const { error } = await client.rpc("record_recruitment_case_stage_event", {
    p_request_id: randomUUID(),
    p_case_id: cases[1].id,
    p_kind: "invitation",
    p_stage_name: "Ocena techniczna",
    p_expected_stage_version: 0,
    p_occurred_on: "2020-01-01",
  });
  expect(error).toBeNull();
  for (let i = 0; i < 26; i++) {
    const fact = await client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: cases[1].id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: null,
    });
    expect(fact.error).toBeNull();
  }
  const closure = {
    p_case_id: cases[2].id,
    p_operation: "close",
    p_closure_id: null,
    p_outcome: "Inny",
    p_occurred_on: null,
    p_offer_confirmed: false,
  };
  const preview = await client.rpc(
    "preview_recruitment_case_lifecycle",
    closure,
  );
  expect(preview.error).toBeNull();
  const close = await client.rpc("confirm_recruitment_case_lifecycle", {
    ...closure,
    p_request_id: randomUUID(),
    p_expected_case_revision: preview.data.caseRevision,
    p_expected_closure_revision: preview.data.closureRevision,
  });
  expect(close.error).toBeNull();
  await client.auth.stopAutoRefresh();
});
async function login(page: Page, user = a) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}
const board = (page: Page) =>
  page.getByRole("region", { name: "Tablica rekrutacji", exact: true });
const drawer = (page: Page) =>
  page.getByRole("dialog", { name: "Podgląd sprawy", exact: true });
async function ready(page: Page) {
  await expect(
    page.getByText("Widok spraw zaktualizowany.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Lista", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Nie udało się pobrać spraw.", { exact: false }),
  ).toHaveCount(0);
}
async function snapshot() {
  const { client } = await sdkLogin(target, a);
  const values = [];
  for (const table of [
    "recruitment_case",
    "recruitment_case_event",
    "recruitment_case_lifecycle",
    "recruitment_closure_revision",
    "catalog_profile",
    "catalog_relation",
    "catalog_command",
  ]) {
    const { data, error } = await client.from(table).select("*").order("id");
    expect(error).toBeNull();
    values.push({ table, data });
  }
  await client.auth.stopAutoRefresh();
  return values;
}
async function chooseOrganization(page: Page) {
  const selector = page.getByLabel("Organizacja", { exact: true });
  await expect(selector).toBeEnabled();
  for (let i = 0; i < 3; i++) {
    if (await selector.locator(`option[value="${organization.id}"]`).count())
      break;
    await page
      .getByRole("button", { name: "Pokaż dalsze organizacje", exact: true })
      .click();
  }
  await expect(
    selector.locator(`option[value="${organization.id}"]`),
  ).toHaveCount(1);
  await selector.selectOption(organization.id);
  await expect(
    page.getByRole("button", { name: cases[0].title, exact: true }),
  ).toBeVisible();
}

test("DEC059 default board/list filters operate on complete data, presets and controls never write", async ({
  page,
}) => {
  const before = await snapshot();
  const writes: string[] = [];
  page.on("request", (r) => {
    if (
      new URL(r.url()).pathname.startsWith("/recruitments") &&
      r.method() !== "GET"
    )
      writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await login(page);
  await page.goto("/recruitments");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(board(page)).toBeVisible();
  for (const s of [
    "Zapisane",
    "Kontakt rozpoczęty",
    "W rekrutacji",
    "Zakończone",
  ])
    await expect(
      board(page).getByRole("heading", { name: s, exact: true }),
    ).toBeVisible();
  await expect(page.locator('[draggable="true"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: cases[2].title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Zakończone", exact: true }).click();
  await expect(
    page.getByRole("button", { name: cases[2].title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Wszystkie", exact: true }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await ready(page);
  const rows = page
    .getByRole("list", { name: "Sprawy rekrutacyjne", exact: true })
    .getByRole("button");
  await expect(rows).toHaveCount(25);
  const first = await rows.allTextContents();
  await page
    .getByRole("navigation", { name: "Strony listy", exact: true })
    .getByRole("button", { name: "Dalsze wyniki", exact: true })
    .click();
  await expect(rows).toHaveCount(3);
  expect(new Set([...first, ...(await rows.allTextContents())]).size).toBe(28);
  await chooseOrganization(page);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(cases[0].title);
  await page
    .getByLabel("Osoba kontaktowa", { exact: true })
    .selectOption(person.id);
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Sortowanie", { exact: true }).selectOption("oldest");
  await page.getByRole("button", { name: "Aktywne", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole("button", { name: "Zakończone", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("Brak wyników", { exact: false })).toBeVisible();
  await page
    .getByRole("button", { name: "Wyczyść filtry", exact: true })
    .click();
  await expect(page.getByLabel("Organizacja", { exact: true })).toHaveValue("");
  await expect(
    page.getByLabel("Osoba kontaktowa", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Sortowanie", { exact: true })).toHaveValue(
    "newest",
  );
  await expect(rows).toHaveCount(25);
  await page.getByRole("link", { name: "Rekrutacje", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(board(page)).toBeVisible();
  expect(writes).toEqual([]);
  expect(await snapshot()).toEqual(before);
});

test("DEC059 drawer exact ID, readonly history and detail return restore actual workspace context", async ({
  page,
}) => {
  await login(page);
  await page.goto("/recruitments?view=list&sort=oldest&page=2&closedOpen=1");
  await ready(page);
  const item = page
    .getByRole("list", { name: "Sprawy rekrutacyjne", exact: true })
    .getByRole("button")
    .first();
  const title = await item.innerText();
  await item.click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page)).toContainText(title);
  await expect(drawer(page).getByRole("textbox")).toHaveCount(0);
  await expect(
    drawer(page).getByRole("button", { name: /Zakończ|Zapisz|Zmień etap/ }),
  ).toHaveCount(0);
  const contextURL = page.url();
  await page.evaluate(() => window.scrollTo(0, 180));
  const scrollBefore = await page.evaluate(() => scrollY);
  await drawer(page)
    .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
    .click();
  await expect(page).toHaveURL(/\/recruitments\/[a-f0-9-]+(?:\?|$)/);
  await page
    .getByRole("link", { name: "Wróć do listy spraw", exact: true })
    .click();
  await expect(page).toHaveURL(contextURL);
  await expect(drawer(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(scrollBefore);
  await expect(
    page.getByRole("button", { name: "Lista", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Sortowanie", { exact: true })).toHaveValue(
    "oldest",
  );
  await expect(item).toContainText(title);
  await item.click();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(item).toBeFocused();
  await page.goto(`/recruitments/${cases[0].id}`);
  await page
    .getByRole("link", { name: "Wróć do listy spraw", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Kanban", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("DEC059 history pagination preserves workspace token, board/column scroll and independent Kanban pages", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await login(page);
  await page.goto("/recruitments?view=kanban&sort=oldest&closedOpen=1");
  await ready(page);
  const scroller = page.getByLabel("Przewijanie tablicy", { exact: true });
  const saved = page.getByLabel("Sprawy: Zapisane", { exact: true });
  await saved.evaluate((element) => {
    element.scrollTop = 480;
  });
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const before = {
    board: await scroller.evaluate((e) => e.scrollLeft),
    column: await saved.evaluate((e) => e.scrollTop),
  };
  expect(before.board).toBeGreaterThan(0);
  expect(before.column).toBeGreaterThan(0);
  await page.getByRole("button", { name: cases[1].title, exact: true }).click();
  await expect(drawer(page)).toContainText("Ocena techniczna");
  const href = page.url();
  await drawer(page)
    .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
    .click();
  const token = new URL(page.url()).searchParams.get("workspaceReturn");
  expect(token).toBeTruthy();
  await page
    .getByRole("link", { name: "Następna strona historii", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("historyPage"))
    .toBe("2");
  expect(new URL(page.url()).searchParams.get("workspaceReturn")).toBe(token);
  await page
    .getByRole("link", { name: "Wróć do listy spraw", exact: true })
    .click();
  await expect(page).toHaveURL(href);
  await ready(page);
  await expect(drawer(page)).toHaveCount(0);
  await expect
    .poll(() => scroller.evaluate((e) => e.scrollLeft))
    .toBe(before.board);
  await expect
    .poll(() => saved.evaluate((e) => e.scrollTop))
    .toBe(before.column);
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await page
    .getByRole("navigation", { name: "Strony: Zapisane", exact: true })
    .getByRole("button", { name: "Dalsze wyniki", exact: true })
    .click();
  await ready(page);
  expect(new URL(page.url()).searchParams.get("savedPage")).toBe("2");
  expect(new URL(page.url()).searchParams.get("recruitingPage")).toBeNull();
  const last = saved.getByRole("button").first();
  await last.click();
  await drawer(page)
    .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Wróć do listy spraw", exact: true })
    .click();
  await ready(page);
  expect(new URL(page.url()).searchParams.get("savedPage")).toBe("2");
  expect(new URL(page.url()).searchParams.get("recruitingPage")).toBeNull();
  await expect(
    page.getByRole("navigation", { name: "Strony: Zapisane", exact: true }),
  ).toContainText("Strona 2");
  await expect(
    page.getByRole("navigation", { name: "Strony: W rekrutacji", exact: true }),
  ).toContainText("Strona 1");
});

test("DEC059 preview errors/retry and out-of-order responses cannot replace the selected case", async ({
  page,
}) => {
  await login(page);
  await page.goto("/recruitments?view=list&sort=oldest");
  await ready(page);
  const rows = page
    .getByRole("list", { name: "Sprawy rekrutacyjne", exact: true })
    .getByRole("button");
  const firstTitle = await rows.nth(0).innerText(),
    secondTitle = await rows.nth(1).innerText();
  let release: () => void = () => {};
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  await page.route("**/recruitments/workspace-data?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") !== "preview")
      return route.continue();
    if (first) {
      first = false;
      await delayed;
    }
    await route.continue().catch(() => {});
  });
  await rows.nth(0).click();
  await rows.nth(1).click();
  await expect(drawer(page)).toContainText(secondTitle);
  release();
  await expect(drawer(page)).not.toContainText(firstTitle);
  await page.unroute("**/recruitments/workspace-data?**");
  await drawer(page)
    .getByRole("button", { name: "Zamknij podgląd", exact: true })
    .click();
  await page.route("**/recruitments/workspace-data?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("mode") === "preview")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic unavailable" }),
      });
    return route.continue();
  });
  await rows.first().click();
  await expect(drawer(page).getByRole("alert")).toBeVisible();
  await expect(
    drawer(page).getByRole("link", {
      name: "Otwórz pełną stronę",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/recruitments/workspace-data?**");
  await drawer(page)
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(drawer(page)).toContainText(firstTitle);
});

for (const width of [1440, 1024, 768, 375, 320])
  test(`DEC059 workspace keyboard/read-only overlay and reflow at${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`/recruitments?view=list&organization=${organization.id}`);
    await ready(page);
    if (width === 375)
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
    const row = page.getByRole("button", { name: cases[0].title, exact: true });
    await expect(row).toBeVisible();
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText(organization.name);
    await expect(drawer(page)).toContainText(person.name);
    await expect(
      drawer(page).getByRole("link", {
        name: "Otwórz pełną stronę",
        exact: true,
      }),
    ).toBeInViewport();
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const r = document.activeElement!.getBoundingClientRect();
        const d = document
          .querySelector('[aria-label="Podgląd sprawy"]')!
          .getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          overlayLeft: d.left,
          overlayRight: d.right,
          inside: !!document.activeElement?.closest(
            '[aria-label="Podgląd sprawy"]',
          ),
        };
      });
      expect(focused.top).toBeGreaterThanOrEqual(0);
      expect(focused.bottom).toBeLessThanOrEqual(901);
      if (!focused.inside)
        expect(
          focused.right <= focused.overlayLeft ||
            focused.left >= focused.overlayRight,
        ).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`workspace-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(row).toBeFocused();
  });

test("DEC059 private HTML/RSC/API, B/anon direct IDs and A-to-B logout do not leak workspace", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/recruitments");
  for (const path of ["/recruitments", `/recruitments?view=list`]) {
    const html = await page.request.get(`${target.appOrigin}${path}`, {
      maxRedirects: 0,
    });
    expect(html.status()).toBe(200);
    expect(html.headers()["cache-control"]).toContain("private");
    expect(html.headers()["cache-control"]).toContain("no-store");
    const rsc = await page.request.get(
      `${target.appOrigin}${path}${path.includes("?") ? "&" : "?"}_rsc`,
      { headers: { RSC: "1" }, maxRedirects: 0 },
    );
    expect(rsc.status()).toBe(200);
    expect(rsc.headers()["content-type"]).toContain("text/x-component");
    expect(rsc.headers()["cache-control"]).toContain("no-store");
  }
  const apiURL = `${target.appOrigin}/recruitments/workspace-data?mode=preview&id=${cases[0].id}&expectedUserId=${a.id}`;
  const api = await page.request.get(apiURL);
  expect(api.status()).toBe(200);
  expect(api.headers()["cache-control"]).toContain("private");
  expect(api.headers()["cache-control"]).toContain("no-store");
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  for (const value of [cases[0].title, organization.name, person.name])
    expect(storage).not.toContain(value);
  const anon = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    expect((await anon.request.get(apiURL, { maxRedirects: 0 })).status()).toBe(
      401,
    );
  } finally {
    await anon.close();
  }
  await page.goto("/account");
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await login(page, b);
  await page.goto("/recruitments");
  await ready(page);
  await expect(page.getByText(cases[0].title, { exact: true })).toHaveCount(0);
  expect((await page.request.get(apiURL)).status()).toBe(403);
  const ownExpected = apiURL.replace(a.id, b.id);
  expect((await page.request.get(ownExpected)).status()).toBe(404);
  await page.goBack();
  await page.reload();
  await expect(page.getByText(cases[0].title, { exact: true })).toHaveCount(0);
});

test("DEC059 new read endpoint refreshes genuinely expired SSR cookies with private no-store response", async ({
  browser,
}) => {
  test.setTimeout(420000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await login(page);
    await page.close();
    const before = (await context.cookies()).filter((c) =>
      /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name),
    );
    expect(before.length).toBeGreaterThan(0);
    const encoded = [...before]
      .sort((x, y) =>
        x.name.localeCompare(y.name, undefined, { numeric: true }),
      )
      .map((c) => c.value)
      .join("");
    let expiry: number;
    try {
      const session = JSON.parse(
        encoded.startsWith("base64-")
          ? Buffer.from(encoded.slice(7), "base64url").toString()
          : encoded,
      ) as { expires_at: number; access_token: string };
      const claims = JSON.parse(
        Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
      ) as { exp: number };
      expiry = Math.max(session.expires_at, claims.exp);
    } catch {
      throw new Error(
        "Synthetic session expiry inspection failed; material withheld",
      );
    }
    expect(expiry * 1000 - Date.now()).toBeGreaterThan(250000);
    expect(expiry * 1000 - Date.now()).toBeLessThanOrEqual(305000);
    while (Date.now() < expiry * 1000 + 2000)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await context.request.get(
      `${target.appOrigin}/recruitments/workspace-data?expectedUserId=${a.id}&view=list`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"]).toBeTruthy();
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const after = await context.cookies();
    expect(
      after.some(
        (c) =>
          c.name.startsWith("sb-") &&
          !before.some((old) => old.name === c.name && old.value === c.value),
      ),
    ).toBe(true);
    const body = (await response.json()) as {
      list: { cases: { title: string }[] };
    };
    expect(body.list.cases.length).toBe(25);
  } finally {
    await context.close();
  }
});
