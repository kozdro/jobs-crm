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

test("DEC-061 summarizes every capture validation error with keyboard field links", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const dialog = await openCapture(page);
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog
    .getByLabel("Nazwa sprawy", { exact: true })
    .fill(`Valid title ${randomUUID()}`);
  await dialog.getByText("Więcej szczegółów", { exact: true }).click();
  const description = dialog.getByLabel("Opis (opcjonalnie)", {
    exact: true,
  });
  await description.fill("x".repeat(2001));
  const sourceUrl = dialog.getByLabel("URL źródłowy (opcjonalnie)", {
    exact: true,
  });
  await sourceUrl.fill("javascript:alert(1)");
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();

  const summary = dialog.getByRole("alert", {
    name: "Podsumowanie błędów sprawy",
    exact: true,
  });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link")).toHaveCount(2);
  await expect(sourceUrl).toHaveAttribute("aria-invalid", "true");
  await expect(description).toHaveAttribute("aria-invalid", "true");

  for (const [message, field] of [
    ["Podaj poprawny pełny adres HTTP lub HTTPS.", sourceUrl],
    ["Opis może mieć najwyżej 2000 znaków.", description],
  ] as const) {
    const link = summary.getByRole("link", { name: message, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(field).toBeFocused();
  }

  await sourceUrl.fill("https://example.invalid/source");
  await description.fill("Poprawiony opis");
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Działanie", exact: true }),
  ).toBeVisible();
});

test("DEC-061 refresh recovery cannot resume or reuse an intent without its private payload", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Unknown atomic result ${randomUUID()}`;
  const description = `Secret draft description ${randomUUID()}`;
  const requestIds: string[] = [];
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const requestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    requestIds.push(requestId);
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
  expect(requestIds).toHaveLength(1);
  const requestId = requestIds[0];
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

  await page
    .getByRole("main")
    .getByRole("button", { name: "Porzuć ten zapis", exact: true })
    .click();
  const abandonment = page.getByRole("alertdialog", {
    name: "Porzucić niepotwierdzony zapis?",
    exact: true,
  });
  await expect(abandonment).toBeVisible();
  await expect(
    abandonment.getByRole("button", { name: "Wróć do zapisu", exact: true }),
  ).toHaveCount(0);
  await abandonment
    .getByRole("button", { name: "Porzuć ten zapis", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("jobs-crm.manual-case.pending"),
    ),
  ).toBeNull();

  const freshTitle = `New intent after explicit abandon ${randomUUID()}`;
  const fresh = await openCapture(page);
  await enterData(
    fresh,
    freshTitle,
    "Nowy zamiar po jawnym porzuceniu starego.",
  );
  await fresh
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await fresh.getByRole("button", { name: "Dalej", exact: true }).click();
  await fresh.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(fresh.getByRole("alert")).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[1]).not.toBe(requestId);
});

test("DEC-061 action validation stays keyboard accessible and within the viewport at supported widths", async ({
  page,
}) => {
  await login(page);
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${target.appOrigin}/recruitments`);
    const dialog = await openCapture(page);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog
      .getByLabel("Nazwa sprawy", { exact: true })
      .fill(`Action validation ${width} ${randomUUID()}`);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();

    const checkViewport = async (container: Locator) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const rect = await container.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          height: window.innerHeight,
          width: window.innerWidth,
        };
      });
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(rect.width);
      expect(rect.top).toBeLessThan(rect.height);
      expect(rect.bottom).toBeGreaterThan(0);
    };

    await checkViewport(dialog);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    const summary = dialog.getByRole("alert", {
      name: "Podsumowanie błędów działania",
      exact: true,
    });
    await expect(summary).toBeFocused();
    await checkViewport(summary);
    const actionLink = summary.getByRole("link", {
      name: "Wybierz działanie do zarejestrowania.",
      exact: true,
    });
    await actionLink.focus();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("radio", { name: "Zapisz tylko sprawę", exact: true }),
    ).toBeFocused();

    await dialog
      .getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true })
      .check();
    const date = dialog.getByLabel("Dzień działania (opcjonalnie)", {
      exact: true,
    });
    await date.fill("2999-12-31");
    await dialog
      .getByLabel("Potwierdzam, że to działanie rzeczywiście miało miejsce", {
        exact: true,
      })
      .check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(
      "Podaj prawidłowy dzień działania, nie późniejszy niż dzisiaj.",
    );
    await checkViewport(summary);
    const dateLink = summary.getByRole("link", {
      name: "Podaj prawidłowy dzień działania, nie późniejszy niż dzisiaj.",
      exact: true,
    });
    await dateLink.focus();
    await page.keyboard.press("Enter");
    await expect(date).toBeFocused();

    await date.fill("");
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(summary).toBeFocused();
    await expect(summary).toContainText(
      "Potwierdź, że to działanie rzeczywiście miało miejsce.",
    );
    await checkViewport(summary);
    const confirmation = dialog.getByRole("checkbox", {
      name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
      exact: true,
    });
    const confirmationLink = summary.getByRole("link", {
      name: "Potwierdź, że to działanie rzeczywiście miało miejsce.",
      exact: true,
    });
    await confirmationLink.focus();
    await page.keyboard.press("Enter");
    await expect(confirmation).toBeFocused();
    await confirmation.check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: "Podsumowanie", exact: true }),
    ).toBeVisible();
    await checkViewport(dialog);
    await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
    const discard = page.getByRole("alertdialog", { name: "Odrzucić zmiany?" });
    await expect(discard).toBeVisible();
    await discard
      .getByRole("button", { name: "Odrzuć zmiany", exact: true })
      .click();
  }
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

test("DEC-061 does not recover a legacy save-only row as the frozen atomic intent", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Legacy collision atomic ${randomUUID()}`;
  const description = `Atomic draft retained ${randomUUID()}`;
  let legacyTitle = "";
  let requestId = "";
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    const client = sdk(target);
    const auth = await client.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    });
    expect(auth.error === null && auth.data.user?.id === a.id).toBe(true);
    legacyTitle = `Legacy row ${randomUUID()}`;
    const legacy = await client.rpc("create_recruitment_case", {
      p_request_id: requestId,
      p_title: legacyTitle,
      p_description: null,
      p_source_url: null,
      p_allow_duplicate: false,
    });
    expect(legacy.error).toBeNull();
    await route.continue();
  });

  const dialog = await openCapture(page);
  await dialog
    .getByRole("radio", { name: "Zapisana oferta", exact: true })
    .check();
  await enterData(dialog, title, description);
  await dialog
    .getByRole("radio", { name: "Kontakt przychodzący (inbound)", exact: true })
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
  await page.unroute("**/recruitments/commands");

  await dialog
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "wcześniejszego zapisu o innym zamiarze",
  );
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(dialog.getByText(description, { exact: true })).toBeVisible();
  expect(requestId).not.toBe("");
  expect(await readOwnCase(legacyTitle)).toHaveLength(1);
  expect(await readOwnCase(title)).toHaveLength(0);
  const legacy = await readOwnCase(legacyTitle);
  expect(await readOwnEvents(legacy[0].id)).toHaveLength(0);
});

test("DEC-061 save-next receipt recovery opens a fresh empty wizard after response loss", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Save next recovery ${randomUUID()}`;
  const description = `Save next recovery description ${randomUUID()}`;
  let requestId = "";
  let posts = 0;
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    requestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
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
    .getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", {
      name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
      exact: true,
    })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(posts).toBe(1);
  const sessionBefore = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("jobs-crm.manual-case.pending") ?? "{}"),
  );
  expect(sessionBefore).toEqual({ ownerId: a.id, requestId });

  await page.unroute("**/recruitments/commands");
  await dialog
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Sytuacja", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    "",
  );
  const sessionAfter = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("jobs-crm.manual-case.pending") ?? "{}"),
  );
  expect(sessionAfter).toEqual({});
  const freshTitle = `Fresh wizard ${randomUUID()}`;
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(freshTitle);
  await dialog.getByText("Więcej szczegółów", { exact: true }).click();
  await dialog
    .getByLabel("Opis (opcjonalnie)", { exact: true })
    .fill("Nowy opis");
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await dialog
    .getByRole("link", { name: "Otwórz sprawę", exact: true })
    .click();
  const discardDialog = page.getByRole("alertdialog");
  await expect(
    discardDialog.getByRole("heading", { name: "Odrzucić zmiany?" }),
  ).toBeVisible();
  await discardDialog
    .getByRole("button", { name: "Kontynuuj edycję", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Wstecz", exact: true }).click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    freshTitle,
  );
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await expect(
    dialog.getByRole("radio", { name: "Zapisz tylko sprawę", exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  let nextRequestId = "";
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    nextRequestId = (route.request().postDataJSON() as { requestId: string })
      .requestId;
    await route.continue();
  });
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(nextRequestId).not.toBe("");
  expect(nextRequestId).not.toBe(requestId);
  expect(posts).toBe(1);
  const saved = await readOwnCase(title);
  expect(saved).toHaveLength(1);
  expect(await readOwnEvents(saved[0].id)).toHaveLength(1);
});

test("DEC-061 refuses a receipt for a different intent and preserves the frozen draft", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Current frozen intent ${randomUUID()}`;
  const description = `Current private description ${randomUUID()}`;
  const previousTitle = `Previous receipt intent ${randomUUID()}`;
  const previousCaseId = randomUUID();
  let requestId = "";
  let postCount = 0;
  let getCount = 0;
  await page.route("**/recruitments/commands**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      postCount++;
      requestId = (request.postDataJSON() as { requestId: string }).requestId;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "idempotency_conflict" }),
      });
      return;
    }
    getCount++;
    expect(new URL(request.url()).searchParams.get("requestId")).toBe(
      requestId,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "receipt",
        receipt: {
          requestId,
          contractVersion: 1,
          intent: {
            title: previousTitle,
            description: null,
            sourceUrl: null,
            action: { kind: "save_only" },
          },
          intentFingerprint: "a".repeat(32),
          case: {
            id: previousCaseId,
            title: previousTitle,
            description: null,
            source_url: null,
            status: "Zapisane",
            current_stage: null,
            stage_version: 0,
            created_at: "2026-01-01T12:00:00.000Z",
          },
          event: null,
          recordedAt: "2026-01-01T12:00:00.001Z",
        },
      }),
    });
  });
  const dialog = await openCapture(page);
  await enterData(dialog, title, description);
  await dialog
    .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "dotyczy innych danych",
  );
  await dialog
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "nie potwierdzono go jako zapisanego",
  );
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(dialog.getByText(description, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(previousTitle, { exact: true }),
  ).not.toBeVisible();
  expect(postCount).toBe(1);
  expect(getCount).toBe(1);
  expect(
    await page.evaluate(() =>
      JSON.parse(
        sessionStorage.getItem("jobs-crm.manual-case.pending") ?? "null",
      ),
    ),
  ).toEqual({ ownerId: a.id, requestId });
  await expectNoPrivateBrowserPersistence(page, requestId, [
    title,
    description,
  ]);
});

test("DEC-061 malformed or action-mismatched receipts never clear a fact-bearing draft", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments`);
  const title = `Malformed receipt draft ${randomUUID()}`;
  const description = `Malformed receipt description ${randomUUID()}`;
  let requestId = "";
  let postCount = 0;
  let recoveryCount = 0;
  await page.route("**/recruitments/commands**", async (route) => {
    const request = route.request();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      kind: string;
      receipt: { event: Record<string, unknown> | null };
    };
    if (request.method() === "POST") {
      postCount++;
      requestId = (request.postDataJSON() as { requestId: string }).requestId;
      body.receipt.event = {
        ...(body.receipt.event ?? {}),
        kind: "contact",
        direction: "inbound",
      };
    } else {
      recoveryCount++;
      expect(new URL(request.url()).searchParams.get("requestId")).toBe(
        requestId,
      );
      body.receipt.event = {};
    }
    await route.fulfill({ response, body: JSON.stringify(body) });
  });

  const dialog = await openCapture(page);
  await dialog
    .getByRole("radio", { name: "Zapisana oferta", exact: true })
    .check();
  await enterData(dialog, title, description);
  await dialog
    .getByRole("radio", { name: "Rzeczywiście aplikowano", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", {
      name: "Potwierdzam, że to działanie rzeczywiście miało miejsce",
      exact: true,
    })
    .check();
  await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Nie potwierdzono wyniku zapisu",
  );
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Rzeczywiście aplikowano", { exact: true }),
  ).toBeVisible();
  expect(postCount).toBe(1);

  await dialog
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Nie można teraz sprawdzić poprzedniego zapisu",
  );
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Rzeczywiście aplikowano", { exact: true }),
  ).toBeVisible();
  expect(recoveryCount).toBe(1);
  const saved = await readOwnCase(title);
  expect(saved).toHaveLength(1);
  expect(await readOwnEvents(saved[0].id)).toHaveLength(1);
  await expectNoPrivateBrowserPersistence(page, requestId, [
    title,
    description,
  ]);
});
