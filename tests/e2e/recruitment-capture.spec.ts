/** Product browser tests require an independently guarded local product target. */
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  readRecruitmentTarget,
  type RecruitmentTarget,
} from "../../scripts/recruitment/target.ts";
import { account, sdk, type Account } from "../integration/auth/fixtures.ts";

let target: RecruitmentTarget;
let a: Account;
let b: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("Browser suite requires guarded RECRUITMENT_TARGET_ID");
  target = await readRecruitmentTarget(id);
  a = await account(target);
  b = await account(target);
});
async function login(page: Page, user: Account) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
async function openCapture(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const manual = page.getByRole("menuitem", {
    name: "Dodaj ręcznie",
    exact: true,
  });
  if (await manual.count()) await manual.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sytuacja", { exact: true })).toBeVisible();
  const progress = dialog.getByRole("list", {
    name: "Postęp dodawania sprawy",
    exact: true,
  });
  await expect(progress.getByRole("listitem")).toHaveCount(4);
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    "Sytuacja",
  );
  return dialog;
}
async function dataStep(
  dialog: Locator,
  title: string,
  description?: string,
  sourceUrl?: string,
) {
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    dialog.getByLabel("Nazwa sprawy", { exact: true }),
  ).toBeFocused();
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
  if (sourceUrl)
    await dialog
      .getByLabel("URL źródłowy (opcjonalnie)", { exact: true })
      .fill(sourceUrl);
  if (description !== undefined) {
    await dialog.getByText("Więcej szczegółów", { exact: true }).click();
    await dialog
      .getByLabel("Opis (opcjonalnie)", { exact: true })
      .fill(description);
  }
}
async function summaryStep(dialog: Locator) {
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByText("Podsumowanie", { exact: true })).toBeVisible();
}
async function prepare(
  page: Page,
  title: string,
  description?: string,
  sourceUrl?: string,
) {
  const dialog = await openCapture(page);
  await dataStep(dialog, title, description, sourceUrl);
  await summaryStep(dialog);
  return dialog;
}
async function persisted(user: Account, title?: string) {
  const client = sdk(target);
  const auth = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(auth.error === null && auth.data.user?.id === user.id).toBe(true);
  let query = client
    .from("recruitment_case")
    .select("id,title,description,source_url,status,created_at,request_id");
  if (title) query = query.eq("title", title);
  const result = await query;
  expect(result.error === null).toBe(true);
  return result.data ?? [];
}
async function complete(page: Page, title: string) {
  const dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  return (await persisted(a, title))[0];
}
async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("UC001 partial: four steps write only on confirm, save stays on Dashboard, toast opens real case", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/dashboard`);
  const title = `Spontaniczna kandydatura ${randomUUID()}`;
  const description = "Zażółć gęślą jaźń — kontekst bez aplikowania.";
  const sourceUrl = `https://example.invalid/jobs?posting=${randomUUID()}&keep=1#publication`;
  let sourceFetches = 0;
  await page.route("https://example.invalid/**", async (route) => {
    sourceFetches++;
    await route.abort();
  });
  let writes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/recruitments/commands") && req.method() === "POST")
      writes++;
  });
  const dialog = await openCapture(page);
  await dataStep(dialog, title, description, sourceUrl);
  await summaryStep(dialog);
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(dialog.getByText(description, { exact: true })).toBeVisible();
  expect(writes).toBe(0);
  expect((await persisted(a, title)).length).toBe(0);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await expect(
    page.getByRole("status").filter({ hasText: /zapis/i }),
  ).toBeVisible();
  const records = await persisted(a, title);
  expect(records.length).toBe(1);
  expect(records[0].status).toBe("Zapisane");
  expect(sourceFetches).toBe(0);
  const open = page.getByRole("link", { name: "Otwórz sprawę", exact: true });
  await open.click();
  await expect(page).toHaveURL(
    `${target.appOrigin}/recruitments/${records[0].id}`,
  );
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Zapisane", { exact: true })).toBeVisible();
  await expect(page.getByText("Dodano do CRM", { exact: false })).toBeVisible();
  const source = page.getByRole("link", {
    name: `${sourceUrl} (otwiera nową kartę)`,
    exact: true,
  });
  await expect(source).toHaveAttribute("href", sourceUrl);
  expect((await source.getAttribute("rel"))?.split(" ")).toContain("noopener");
  expect(sourceFetches).toBe(0);
});

test("QC data validation keeps input and no record before valid four-step submission", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const dialog = await openCapture(page);
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill("   ");
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(
    (
      await dialog
        .getByLabel("Nazwa sprawy", { exact: true })
        .getAttribute("aria-describedby")
    )?.split(" "),
  ).toEqual(expect.arrayContaining(["case-title-hint", "case-title-error"]));
  const title = "🚀".repeat(160);
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(`${title}ą`);
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    `${title}ą`,
  );
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
  await dialog
    .getByLabel("URL źródłowy (opcjonalnie)", { exact: true })
    .fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog
    .getByLabel("URL źródłowy (opcjonalnie)", { exact: true })
    .fill("");
  await summaryStep(dialog);
  expect((await persisted(a, title)).length).toBe(0);
});

test("QC006/007 duplicate warning exposes only own matches; cancel makes no change and explicit continue creates another", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Potencjalny duplikat ${randomUUID()}`;
  const first = await complete(page, title);
  let dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByText(/potencjaln.*duplikat/i)).toBeVisible();
  const existing = dialog.getByRole("link", { name: title, exact: true });
  await expect(existing).toHaveAttribute("href", `/recruitments/${first.id}`);
  expect((await persisted(a, title)).length).toBe(1);
  await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page
    .getByRole("button", { name: "Odrzuć zmiany", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect((await persisted(a, title)).length).toBe(1);
  dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Utwórz nową sprawę", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Utwórz nową sprawę", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const records = await persisted(a, title);
  expect(records.length).toBe(2);
  expect(records.some((row) => row.id === first.id)).toBe(true);
});

test("UC029 partial: save-and-add-next clears fields/action and uses a new independent intent", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const titleA = `Seria A ${randomUUID()}`;
  const dialog = await prepare(
    page,
    titleA,
    "Pierwszy kontekst",
    "https://example.invalid/series",
  );
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sytuacja", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByLabel("URL źródłowy (opcjonalnie)", { exact: true }),
  ).toHaveValue("");
  await dialog.getByText("Więcej szczegółów", { exact: true }).click();
  await expect(
    dialog.getByLabel("Opis (opcjonalnie)", { exact: true }),
  ).toHaveValue("");
  const titleB = `Seria B ${randomUUID()}`;
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(titleB);
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    dialog.getByRole("radio", { name: "Zapisz tylko sprawę", exact: true }),
  ).not.toBeChecked();
  await dialog
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const first = (await persisted(a, titleA))[0];
  const second = (await persisted(a, titleB))[0];
  expect(first.id).not.toBe(second.id);
  expect(first.request_id).not.toBe(second.request_id);
  expect(second.description).toBeNull();
  expect(second.source_url).toBeNull();
});

test("Dirty Escape/X require explicit discard, backdrop preserves fields and keyboard focus remains usable", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const trigger = page.getByRole("button", { name: "Dodaj", exact: true });
  let dialog = await openCapture(page);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  dialog = await openCapture(page);
  await dataStep(dialog, `Niezapisane ${randomUUID()}`);
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  const confirm = page.getByRole("alertdialog", {
    name: "Odrzucić zmiany?",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: "Kontynuuj edycję", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Nazwa sprawy", { exact: true }),
  ).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
  await expect(confirm).toBeVisible();
  await confirm
    .getByRole("button", { name: "Odrzuć zmiany", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("Lost response then retry and double-click create once without false success", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Retry ${randomUUID()}`;
  const requests: { requestId: string }[] = [];
  let lose = true;
  await page.route("**/recruitments/commands", async (route) => {
    requests.push(route.request().postDataJSON() as { requestId: string });
    const response = await route.fetch();
    if (lose) {
      lose = false;
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  const dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Otwórz sprawę", exact: true }),
  ).not.toBeVisible();
  expect((await persisted(a, title)).length).toBe(1);
  await dialog
    .getByRole("button", { name: "Zapisz", exact: true })
    .dblclick({ force: true });
  await expect(dialog).not.toBeVisible();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(new Set(requests.map((body) => body.requestId)).size).toBe(1);
  expect((await persisted(a, title)).length).toBe(1);
});

test("RW/AD partial: own list/details, indistinguishable B/missing IDs, no private data after logout", async ({
  browser,
}) => {
  const ca = await browser.newContext({ ignoreHTTPSErrors: true });
  const cb = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const pa = await ca.newPage();
    const pb = await cb.newPage();
    await Promise.all([login(pa, a), login(pb, b)]);
    await pa.goto(`${target.appOrigin}/recruitments`);
    const title = `Prywatne A ${randomUUID()}`;
    const row = await complete(pa, title);
    await pa.goto(`${target.appOrigin}/recruitments`);
    await expect(
      pa.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await pb.goto(`${target.appOrigin}/recruitments`);
    await expect(pb.getByText(title, { exact: true })).not.toBeVisible();
    const foreign = await cb.request.get(
      `${target.appOrigin}/recruitments/${row.id}`,
    );
    const missing = await cb.request.get(
      `${target.appOrigin}/recruitments/${randomUUID()}`,
    );
    expect(foreign.status()).toBe(missing.status());
    expect(foreign.status()).toBe(404);
    expect((await foreign.text()).includes(title)).toBe(false);
    const detail = await ca.request.get(
      `${target.appOrigin}/recruitments/${row.id}`,
    );
    expect(detail.status()).toBe(200);
    expect(detail.headers()["cache-control"]).toContain("no-store");
    const rsc = await cb.request.get(
      `${target.appOrigin}/recruitments?_rsc=recruitment-${Date.now()}`,
      { headers: { RSC: "1" } },
    );
    expect(rsc.headers()["cache-control"]).toContain("no-store");
    expect((await rsc.text()).includes(title)).toBe(false);
    await pa.goto(`${target.appOrigin}/recruitments/${row.id}`);
    const logoutTab = await ca.newPage();
    await logoutTab.goto(`${target.appOrigin}/account`);
    await logoutTab
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await expect(logoutTab).toHaveURL(/\/login(?:\?|$)/);
    await expect(pa.getByText(title, { exact: true })).not.toBeVisible();
    await pa.goto(`${target.appOrigin}/recruitments/${row.id}`);
    await expect(pa).toHaveURL(/\/login(?:\?|$)/);
  } finally {
    await Promise.all([ca.close(), cb.close()]);
  }
});

test("Mobile375px dialog/list/details avoid overflow and expose named keyboard controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  await expectNoOverflow(page);
  const title = `Kontakt ${randomUUID()}`;
  const dialog = await openCapture(page);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await dataStep(dialog, title, "Opis na małym ekranie");
  await expectNoOverflow(page);
  await summaryStep(dialog);
  await expectNoOverflow(page);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Otwórz sprawę", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expectNoOverflow(page);
});

test("Refresh after lost committed response recovers only the persisted owner/intent and never creates a second case", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Refresh recovery ${randomUUID()}`;
  let committedKey = "";
  await page.route("**/recruitments/commands", async (route) => {
    committedKey = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  const dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Wstecz", exact: true }),
  ).toBeDisabled();
  expect((await persisted(a, title)).length).toBe(1);
  expect(committedKey).not.toBe("");
  await page.unroute("**/recruitments/commands");
  page.once("dialog", (event) => event.accept());
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "Sprawa została zapisana." }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const rows = await persisted(a, title);
  expect(rows.length).toBe(1);
  expect(rows[0].request_id).toBe(committedKey);
  await expect(
    page.getByRole("link", { name: "Otwórz sprawę", exact: true }),
  ).toHaveAttribute("href", `/recruitments/${rows[0].id}`);
});

test("Pending save freezes the existing intent and prevents closing or starting another save", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Pending ${randomUUID()}`;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/recruitments/commands", async (route) => {
    calls++;
    await gate;
    await route.continue();
  });
  const dialog = await prepare(page, title);
  try {
    await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(
      dialog.getByRole("button", { name: "Zapisz", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", {
        name: "Zapisz i dodaj kolejną",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Wstecz", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Zamknij", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(calls).toBe(1);
  } finally {
    release?.();
  }
  await expect(dialog).not.toBeVisible();
  expect((await persisted(a, title)).length).toBe(1);
});

test("Duplicate save-and-add-next retains the chosen continuation and resets to an independent blank draft", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Duplicate next ${randomUUID()}`;
  await complete(page, title);
  const dialog = await prepare(page, title);
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Utwórz nową sprawę", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Utwórz nową sprawę", exact: true })
    .click();
  await expect(dialog.getByText("Sytuacja", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByLabel("URL źródłowy (opcjonalnie)", { exact: true }),
  ).toHaveValue("");
  const records = await persisted(a, title);
  expect(records.length).toBe(2);
  expect(new Set(records.map((row) => row.request_id)).size).toBe(2);
});

test("Own list limits pages to25 and orders tied technical timestamps by stable descending UUID", async ({
  page,
}) => {
  const owner = await account(target);
  const client = sdk(target);
  const auth = await client.auth.signInWithPassword({
    email: owner.email,
    password: owner.password,
  });
  expect(auth.error === null).toBe(true);
  const marker = randomUUID();
  const batch = Array.from({ length: 27 }, (_, index) => ({
    request_id: randomUUID(),
    title: `Page-${marker}-${index}`,
  }));
  const inserted = await client
    .from("recruitment_case")
    .insert(batch)
    .select("id,title,created_at");
  expect(inserted.error === null).toBe(true);
  expect(inserted.data?.length).toBe(27);
  expect(new Set(inserted.data?.map((row) => row.created_at)).size).toBe(1);
  const expected = [...(inserted.data ?? [])].sort((left, right) =>
    right.id.localeCompare(left.id),
  );
  await login(page, owner);
  await page.goto(`${target.appOrigin}/recruitments`);
  const caseLinks = page.locator("ul > li > h2 > a");
  await expect(caseLinks).toHaveCount(25);
  expect(await caseLinks.allTextContents()).toEqual(
    expected.slice(0, 25).map((row) => row.title),
  );
  await page
    .getByRole("link", { name: "Następna strona", exact: true })
    .click();
  await expect(page).toHaveURL(`${target.appOrigin}/recruitments?page=2`);
  await expect(caseLinks).toHaveCount(2);
  expect(await caseLinks.allTextContents()).toEqual(
    expected.slice(25).map((row) => row.title),
  );
  await expect(
    page.getByRole("link", { name: "Następna strona", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("link", { name: "Poprzednia strona", exact: true })
    .click();
  await expect(caseLinks).toHaveCount(25);
  expect(await caseLinks.allTextContents()).toEqual(
    expected.slice(0, 25).map((row) => row.title),
  );
});

test("Unknown save never reached backend: reload preserves intent and explicit abandonment warns without claiming rollback", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Unconfirmed old ${randomUUID()}`;
  const sent: { requestId: string }[] = [];
  let lose = true;
  await page.route("**/recruitments/commands", async (route) => {
    sent.push(route.request().postDataJSON() as { requestId: string });
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.continue();
  });
  let dialog = await prepare(page, title);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect((await persisted(a, title)).length).toBe(0);
  page.once("dialog", (event) => event.accept());
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nie potwierdzono wyniku poprzedniego zapisu",
  );
  dialog = await openCapture(page);
  await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Porzucić niepotwierdzony zapis?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(
    "Sprawa mogła już zostać utworzona.",
  );
  await expect(confirmation).toContainText("nie cofa ani nie usuwa zapisu.");
  await confirmation
    .getByRole("button", { name: "Wróć do zapisu", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "Porzuć ten zapis", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const newTitle = `Conscious new ${randomUUID()}`;
  dialog = await prepare(page, newTitle);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(sent.length).toBe(2);
  expect(sent[1].requestId).not.toBe(sent[0].requestId);
  expect((await persisted(a, title)).length).toBe(0);
  expect((await persisted(a, newTitle)).length).toBe(1);
});

test("Command401/403 removes private portal and returns to login while retaining owner-bound recovery identifier", async ({
  browser,
}) => {
  for (const status of [401, 403]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await login(page, a);
      await page.goto(`${target.appOrigin}/recruitments`);
      const title = `Auth denial ${status} ${randomUUID()}`;
      let sentKey = "";
      await page.route("**/recruitments/commands", async (route) => {
        sentKey = (route.request().postDataJSON() as { requestId: string })
          .requestId;
        await route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: "Nie można potwierdzić sesji." }),
        });
      });
      const dialog = await prepare(page, title);
      await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(page.getByText(title, { exact: true })).not.toBeVisible();
      const pending = (await page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("jobs-crm.manual-case.pending") ?? "null",
        ),
      )) as { ownerId: string; requestId: string };
      expect(pending.ownerId).toBe(a.id);
      expect(pending.requestId).toBe(sentKey);
      expect(Object.keys(pending).sort()).toEqual(["ownerId", "requestId"]);
      expect((await persisted(a, title)).length).toBe(0);
    } finally {
      await context.close();
    }
  }
});

test("Mobile save-next announces success and offers opening the persisted case inside the still-open dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Mobile next ${randomUUID()}`;
  const dialog = await prepare(page, title);
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText(
    "Sprawa została zapisana.",
  );
  const open = dialog.getByRole("link", { name: "Otwórz sprawę", exact: true });
  await expect(open).toBeVisible();
  await expectNoOverflow(page);
  const rows = await persisted(a, title);
  expect(rows.length).toBe(1);
  await open.click();
  await expect(page).toHaveURL(
    `${target.appOrigin}/recruitments/${rows[0].id}`,
  );
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
});

test("Back from duplicate save-next then edit and ordinary save closes the wizard without reusing old continuation", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const original = `Old continuation ${randomUUID()}`;
  await complete(page, original);
  const dialog = await prepare(page, original);
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Utwórz nową sprawę", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Wstecz", exact: true }).click();
  await dialog.getByRole("button", { name: "Wstecz", exact: true }).click();
  const edited = `Edited ordinary ${randomUUID()}`;
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(edited);
  await summaryStep(dialog);
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await persisted(a, original)).length).toBe(1);
  expect((await persisted(a, edited)).length).toBe(1);
});

test("Escape in nested discard confirmation cancels only confirmation and restores draft focus", async ({
  page,
}) => {
  await login(page, a);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Nested Escape ${randomUUID()}`;
  const dialog = await openCapture(page);
  await dataStep(dialog, title);
  await page.keyboard.press("Escape");
  const confirmation = page.getByRole("alertdialog", {
    name: "Odrzucić zmiany?",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    title,
  );
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  expect((await persisted(a, title)).length).toBe(0);
});
