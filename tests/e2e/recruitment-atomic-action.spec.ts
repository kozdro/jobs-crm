/** DEC-061: four-step, situation-independent action and browser privacy. */
import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  readRecruitmentTarget,
  type RecruitmentTarget,
} from "../../scripts/recruitment/target.ts";
import { account, sdk, type Account } from "../integration/auth/fixtures.ts";

let target: RecruitmentTarget;
let a: Account;

test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id) throw new Error("Atomic Action requires guarded target");
  target = await readRecruitmentTarget(id);
  a = await account(target);
});

async function login(page: Page) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(a.email);
  await page.getByLabel("Hasło", { exact: true }).fill(a.password);
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
  await expect(
    dialog.getByRole("heading", { name: "Sytuacja", exact: true }),
  ).toBeVisible();
  await expect(
    dialog
      .getByRole("list", { name: "Postęp dodawania sprawy", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(4);
  return dialog;
}

async function enterData(dialog: Locator, title: string, description: string) {
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  const titleField = dialog.getByLabel("Nazwa sprawy", { exact: true });
  await expect(titleField).toHaveValue("");
  await titleField.fill(title);
  await dialog.getByText("Więcej szczegółów", { exact: true }).click();
  await dialog
    .getByLabel("Opis (opcjonalnie)", { exact: true })
    .fill(description);
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Działanie", exact: true }),
  ).toBeVisible();
}

async function readOwnCase(title: string) {
  const client = sdk(target);
  const auth = await client.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  });
  expect(auth.error === null && auth.data.user?.id === a.id).toBe(true);
  const result = await client
    .from("recruitment_case")
    .select("id,title,status,request_id")
    .eq("title", title);
  expect(result.error === null).toBe(true);
  return result.data ?? [];
}

async function readOwnEvents(caseId: string) {
  const client = sdk(target);
  const auth = await client.auth.signInWithPassword({
    email: a.email,
    password: a.password,
  });
  expect(auth.error === null && auth.data.user?.id === a.id).toBe(true);
  const result = await client
    .from("recruitment_case_event")
    .select("id,kind,direction,occurred_on,request_id")
    .eq("case_id", caseId);
  expect(result.error === null).toBe(true);
  return result.data ?? [];
}

async function expectNoPrivateBrowserPersistence(
  page: Page,
  expectedRequestId?: string,
  privateValues: string[] = [],
) {
  const state = await page.evaluate(() => {
    const all = (storage: Storage) =>
      Object.fromEntries(
        Array.from({ length: storage.length }, (_, index) => {
          const key = storage.key(index)!;
          return [key, storage.getItem(key)];
        }),
      );
    return {
      local: all(localStorage),
      session: all(sessionStorage),
      url: location.href,
    };
  });
  const pending = state.session["jobs-crm.manual-case.pending"];
  if (expectedRequestId) {
    expect(pending).not.toBeNull();
    const parsed = JSON.parse(pending!) as Record<string, unknown>;
    expect(parsed).toEqual({ ownerId: a.id, requestId: expectedRequestId });
  }
  for (const [key, value] of Object.entries(state.local)) {
    expect(`${key} ${value}`).not.toMatch(
      /title|description|sourceUrl|occurredOn|factConfirmed|fingerprint|application|contact_inbound|contact_outbound/i,
    );
  }
  for (const [key, value] of Object.entries(state.session)) {
    if (key === "jobs-crm.manual-case.pending") continue;
    expect(`${key} ${value}`).not.toMatch(
      /title|description|sourceUrl|occurredOn|factConfirmed|fingerprint|application|contact_inbound|contact_outbound/i,
    );
  }
  expect(state.url).not.toMatch(
    /application|contact_inbound|contact_outbound|occurredOn|factConfirmed|fingerprint/i,
  );
  for (const value of privateValues) {
    expect(JSON.stringify(state.local)).not.toContain(value);
    expect(JSON.stringify(state.session)).not.toContain(value);
    expect(decodeURIComponent(state.url)).not.toContain(value);
  }
}

test("DEC-061 preserves four steps, keeps action independent from situation, and stores only recovery identity", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);

  const privateDescription = `Prywatny opis syntetyczny ${randomUUID()}`;
  const saveOnlyTitle = `Atomic save only ${randomUUID()}`;
  const first = await openCapture(page);
  await first
    .getByRole("radio", { name: "Wykonana aplikacja", exact: true })
    .check();
  await enterData(first, saveOnlyTitle, privateDescription);
  await first
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await first.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    first.getByRole("heading", { name: "Podsumowanie", exact: true }),
  ).toBeVisible();
  await expect(
    first.getByText("Wykonana aplikacja", { exact: true }),
  ).toBeVisible();
  await expect(first.getByText(saveOnlyTitle, { exact: true })).toBeVisible();
  await expect(
    first.getByText("Zapisz tylko sprawę", { exact: true }),
  ).toBeVisible();
  let prematureWrites = 0;
  page.on("request", (request) => {
    if (
      request.url().endsWith("/recruitments/commands") &&
      request.method() === "POST"
    )
      prematureWrites++;
  });
  await first
    .getByRole("button", { name: "Popraw sytuację", exact: true })
    .click();
  await expect(
    first.getByRole("radio", { name: "Wykonana aplikacja", exact: true }),
  ).toBeChecked();
  await first.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(first.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    saveOnlyTitle,
  );
  await expect(
    first.getByLabel("Opis (opcjonalnie)", { exact: true }),
  ).toHaveValue(privateDescription);
  await first.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    first.getByRole("radio", { name: "Zapisz tylko sprawę", exact: true }),
  ).toBeChecked();
  await first.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    first.getByRole("heading", { name: "Podsumowanie", exact: true }),
  ).toBeVisible();
  expect(prematureWrites).toBe(0);

  let commandId = "";
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as {
      requestId: string;
      intent: { action: { kind: string } };
    };
    commandId = body.requestId;
    expect(body.intent.action.kind).toBe("save_only");
    await expectNoPrivateBrowserPersistence(page, commandId, [
      saveOnlyTitle,
      privateDescription,
    ]);
    await route.continue();
  });
  await first.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(first).not.toBeVisible();
  expect(commandId).not.toBe("");
  const savedOnly = await readOwnCase(saveOnlyTitle);
  expect(savedOnly).toHaveLength(1);
  expect(savedOnly[0].status).toBe("Zapisane");
  expect(savedOnly[0].request_id).toBe(commandId);
  expect(await readOwnEvents(savedOnly[0].id)).toHaveLength(0);
  await page.unroute("**/recruitments/commands");

  const actionTitle = `Atomic application ${randomUUID()}`;
  const actionDescription = `Opis prywatny ${randomUUID()}`;
  const second = await openCapture(page);
  await second
    .getByRole("radio", { name: "Zapisana oferta", exact: true })
    .check();
  await enterData(second, actionTitle, actionDescription);
  await second
    .getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true })
    .check();
  const day = second.getByLabel("Dzień działania (opcjonalnie)", {
    exact: true,
  });
  await expect(day).toHaveValue("");
  const confirmation = second.getByRole("checkbox", {
    name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
    exact: true,
  });
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await day.fill("2000-01-02");
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await second.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    second.getByRole("heading", { name: "Podsumowanie", exact: true }),
  ).toBeVisible();
  await expect(second.getByText(actionTitle, { exact: true })).toBeVisible();
  await expect(
    second.getByText("Rzeczywiście aplikowano", { exact: true }),
  ).toBeVisible();
  await expect(
    second.getByText("Kontakt rozpoczęty", { exact: true }),
  ).toBeVisible();
  let applicationRequestId = "";
  await page.unroute("**/recruitments/commands");
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const requestBody = route.request().postDataJSON() as {
      requestId: string;
      intent: { action: { kind: string; occurredOn: string | null } };
    };
    applicationRequestId = requestBody.requestId;
    expect(requestBody.intent.action).toMatchObject({
      kind: "application",
      occurredOn: "2000-01-02",
    });
    await expectNoPrivateBrowserPersistence(page, requestBody.requestId, [
      actionTitle,
      actionDescription,
      "2000-01-02",
    ]);
    await route.continue();
  });
  await second
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(second).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "Sytuacja", exact: true }),
  ).toBeVisible();
  const actionCase = await readOwnCase(actionTitle);
  expect(actionCase).toHaveLength(1);
  expect(actionCase[0].status).toBe("Kontakt rozpoczęty");
  const events = await readOwnEvents(actionCase[0].id);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    kind: "application",
    direction: null,
    occurred_on: "2000-01-02",
  });
  await page.unroute("**/recruitments/commands");

  const nextTitle = `Atomic next save-only ${randomUUID()}`;
  await enterData(second, nextTitle, `Następny opis ${randomUUID()}`);
  await expect(
    second.getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true }),
  ).not.toBeChecked();
  await expect(
    second.getByRole("radio", { name: "Zapisz tylko sprawę", exact: true }),
  ).not.toBeChecked();
  await second
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await second.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    second.getByRole("heading", { name: "Podsumowanie", exact: true }),
  ).toBeVisible();
  let nextRequestId = "";
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const requestBody = route.request().postDataJSON() as {
      requestId: string;
      intent: { action: { kind: string } };
    };
    nextRequestId = requestBody.requestId;
    expect(requestBody.intent.action.kind).toBe("save_only");
    await expectNoPrivateBrowserPersistence(page, nextRequestId, [nextTitle]);
    await route.continue();
  });
  await second.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(second).not.toBeVisible();
  expect(applicationRequestId).not.toBe("");
  expect(nextRequestId).not.toBe("");
  expect(nextRequestId).not.toBe(applicationRequestId);
  const nextCase = await readOwnCase(nextTitle);
  expect(nextCase).toHaveLength(1);
  expect(nextCase[0].status).toBe("Zapisane");
  expect(await readOwnEvents(nextCase[0].id)).toHaveLength(0);
});

test("DEC-061 refresh recovery keeps only owner/requestId and cannot retry without the private intent", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Unknown atomic result ${randomUUID()}`;
  const description = `Secret draft description ${randomUUID()}`;
  let requestId = "";
  let posts = 0;
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    requestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    await expectNoPrivateBrowserPersistence(page, requestId, [
      title,
      description,
      "2000-01-02",
    ]);
    await route.abort("failed");
  });
  const dialog = await openCapture(page);
  await dialog
    .getByRole("radio", { name: "Wykonana aplikacja", exact: true })
    .check();
  await enterData(dialog, title, description);
  await dialog
    .getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true })
    .check();
  const confirmation = dialog.getByRole("checkbox", {
    name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
    exact: true,
  });
  await dialog
    .getByLabel("Dzień działania (opcjonalnie)", { exact: true })
    .fill("2000-01-02");
  await confirmation.check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(posts).toBe(1);
  expect(requestId).not.toBe("");

  await page.unroute("**/recruitments/commands");
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nie znaleziono potwierdzonego wyniku",
  );
  await expect(page.getByText(title, { exact: true })).not.toBeVisible();
  await expect(page.getByText(description, { exact: true })).not.toBeVisible();
  const pending = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("jobs-crm.manual-case.pending") ?? "null",
    ),
  );
  expect(pending).toEqual({ ownerId: a.id, requestId });
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(posts).toBe(1);
});

test("DEC-061 committed response loss recovers the immutable fact receipt without duplicate effects", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Committed response loss ${randomUUID()}`;
  const description = `Receipt private text ${randomUUID()}`;
  let requestId = "";
  let posts = 0;
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    requestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    await expectNoPrivateBrowserPersistence(page, requestId, [
      title,
      description,
    ]);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  const dialog = await openCapture(page);
  await dialog
    .getByRole("radio", { name: "Zapisana oferta", exact: true })
    .check();
  await enterData(dialog, title, description);
  await dialog
    .getByRole("radio", {
      name: "Kontakt przychodzący (inbound)",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("checkbox", {
      name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
      exact: true,
    })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(posts).toBe(1);
  const committedCase = await readOwnCase(title);
  expect(committedCase).toHaveLength(1);
  expect(committedCase[0].status).toBe("Kontakt rozpoczęty");
  const committedEvents = await readOwnEvents(committedCase[0].id);
  expect(committedEvents).toHaveLength(1);
  expect(committedEvents[0]).toMatchObject({
    kind: "contact",
    direction: "inbound",
    occurred_on: null,
    request_id: requestId,
  });

  await page.unroute("**/recruitments/commands");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Dodaj", exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Kontakt przychodzący (inbound)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Kontakt rozpoczęty" }),
  ).toBeVisible();
  expect(posts).toBe(1);
  const recoveredCase = await readOwnCase(title);
  expect(recoveredCase).toHaveLength(1);
  expect(recoveredCase[0].id).toBe(committedCase[0].id);
  expect(await readOwnEvents(committedCase[0].id)).toHaveLength(1);
});
