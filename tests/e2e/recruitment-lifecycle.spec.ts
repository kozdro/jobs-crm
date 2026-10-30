/** DEC-054 lifecycle acceptance against guarded local Auth, DB and production server. */
import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Locator } from "@playwright/test";
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
let a: Account;
let b: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id) throw new Error("Lifecycle browser requires guarded target");
  target = await readRecruitmentTarget(id);
  a = await account(target);
  b = await account(target);
});
async function login(page: Page, user = a) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}
async function create(user = a) {
  const { client } = await sdkLogin(target, user);
  const title = `Lifecycle browser ${randomUUID()}`;
  const { data, error } = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(error === null).toBe(true);
  expect(data.case.status).toBe("Zapisane");
  return { client, title, id: data.case.id as string };
}
async function stored(caseId: string, user = a) {
  const { client } = await sdkLogin(target, user);
  const { data, error } = await client
    .from("recruitment_case_event")
    .select("id,case_id,kind,direction,occurred_on,recorded_at,request_id")
    .eq("case_id", caseId);
  expect(error === null).toBe(true);
  return data ?? [];
}
const history = (page: Page) =>
  page.getByRole("region", { name: "Historia sprawy", exact: true });
const confirm = (page: Page) =>
  page.getByRole("checkbox", {
    name: "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
    exact: true,
  });
const save = (page: Page) =>
  page.getByRole("button", { name: "Zapisz zdarzenie", exact: true });
async function open(page: Page, kind: "application" | "contact") {
  await page
    .getByRole("button", {
      name:
        kind === "application"
          ? "Zarejestruj aplikowanie"
          : "Zarejestruj kontakt",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Data zdarzenia (opcjonalnie)", { exact: true }),
  ).toBeVisible();
}
async function record(
  page: Page,
  kind: "application" | "inbound" | "outbound",
  day?: string,
) {
  await open(page, kind === "application" ? "application" : "contact");
  if (kind !== "application")
    await page
      .getByRole("radio", {
        name:
          kind === "inbound"
            ? "Kontakt przychodzący (inbound)"
            : "Kontakt wychodzący (outbound)",
        exact: true,
      })
      .check();
  if (day)
    await page
      .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
      .fill(day);
  await confirm(page).check();
  await save(page).click();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  await expect(save(page)).not.toBeVisible();
}

test("LC005/006/014 HE001/002: three explicit real facts, status list/detail/reload, day chronology and unknown date", async ({
  page,
}) => {
  const saved = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  await expect(history(page)).toContainText(
    "Nie zarejestrowano jeszcze zdarzeń biznesowych.",
  );
  expect(await stored(saved.id)).toHaveLength(0);
  await record(page, "application", "2000-02-01");
  await expect(
    page.getByText("Kontakt rozpoczęty", { exact: true }),
  ).toBeVisible();
  await record(page, "outbound", "2000-01-01");
  await record(page, "inbound");
  const entries = history(page).getByRole("listitem");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("Zarejestrowano aplikowanie");
  await expect(
    entries.nth(0).locator("time[datetime='2000-02-01']"),
  ).toHaveText("01.02.2000");
  await expect(entries.nth(1)).toContainText("Kontakt wychodzący");
  await expect(entries.nth(2)).toContainText("Kontakt przychodzący");
  await expect(
    history(page).getByRole("heading", { name: "Data zdarzenia nieznana" }),
  ).toBeVisible();
  await entries
    .nth(0)
    .getByText("Szczegóły rejestracji", { exact: true })
    .click();
  await expect(entries.nth(0)).toContainText("Dodano do CRM:");
  const rows = await stored(saved.id);
  expect(rows).toHaveLength(3);
  expect(
    rows.find((row) => row.direction === "inbound")?.occurred_on,
  ).toBeNull();
  await page.reload();
  await expect(history(page).getByRole("listitem")).toHaveCount(3);
  await page.goto(`${target.appOrigin}/recruitments`);
  const row = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: saved.title, exact: true }),
  });
  await expect(row).toContainText("Kontakt rozpoczęty");
});

test("LC014: no write before factual confirmation; cancellation, unknown date and future-day validation preserve truth", async ({
  page,
}) => {
  const saved = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  await open(page, "contact");
  await expect(
    page.getByRole("radio", {
      name: "Kontakt przychodzący (inbound)",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", {
      name: "Kontakt wychodzący (outbound)",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByText(
      /nie można.*(edytować|poprawić)|brak.*(edycji|korekty)|tylko dopisywana/i,
    ),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Kontakt wychodzący (outbound)", exact: true })
    .check();
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2999-01-01");
  await confirm(page).check();
  await save(page).click();
  await expect(
    page.getByLabel("Data zdarzenia (opcjonalnie)", { exact: true }),
  ).toHaveValue("2999-01-01");
  expect(await stored(saved.id)).toHaveLength(0);
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page
    .getByRole("button", { name: "Potwierdź porzucenie", exact: true })
    .click();
  await expect(save(page)).not.toBeVisible();
  expect(await stored(saved.id)).toHaveLength(0);
  await open(page, "application");
  await save(page).click();
  expect(await stored(saved.id)).toHaveLength(0);
  await confirm(page).check();
  await save(page).click();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  expect(await stored(saved.id)).toHaveLength(1);
});

test("Lost event response retries the identical owner-bound intent and reload recovers the committed fact", async ({
  page,
}) => {
  const saved = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  const keys: string[] = [];
  let lost = false;
  await page.route("**/recruitments/commands", async (route) => {
    const input = route.request().postDataJSON();
    if (input.action !== "record-event") return route.continue();
    keys.push(input.requestId);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (!lost) {
      lost = true;
      return route.abort("failed");
    }
    return route.fulfill({ response });
  });
  await open(page, "application");
  await confirm(page).check();
  await save(page).click();
  await expect(page.getByRole("button", { name: /ponów/i })).toBeVisible();
  expect(await stored(saved.id)).toHaveLength(1);
  await page.getByRole("button", { name: /ponów/i }).click();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(await stored(saved.id)).toHaveLength(1);
  await page.reload();
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
});

test("Reload while event result is unknown recovers by owner-bound identifier without resubmitting or storing private draft", async ({
  page,
}) => {
  const saved = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  let writes = 0;
  await page.route("**/recruitments/commands", async (route) => {
    if (route.request().postDataJSON().action !== "record-event")
      return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    return route.abort("failed");
  });
  await open(page, "contact");
  await page
    .getByRole("radio", { name: "Kontakt przychodzący (inbound)", exact: true })
    .check();
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2000-01-01");
  await confirm(page).check();
  await save(page).click();
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  const keys = await page.evaluate(() =>
    Object.keys(sessionStorage).map((key) => ({
      key,
      value: sessionStorage.getItem(key),
    })),
  );
  const intent = keys
    .map((item) => {
      try {
        return JSON.parse(item.value ?? "null");
      } catch {
        return null;
      }
    })
    .find((value) => value?.caseId === saved.id);
  expect(intent).toEqual({
    ownerId: a.id,
    caseId: saved.id,
    requestId: expect.any(String),
  });
  await page.reload();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  await expect(history(page).getByRole("listitem")).toHaveCount(1);
  expect(writes).toBe(1);
  expect(await stored(saved.id)).toHaveLength(1);
});

async function tabTo(page: Page, targetControl: Locator) {
  await expect(targetControl).toBeVisible();
  for (let presses = 0; presses < 30; presses++) {
    if (
      await targetControl.evaluate((node) => node === document.activeElement)
    ) {
      await expect(targetControl).toBeFocused();
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(targetControl).toBeFocused();
}
for (const kind of ["contact", "application"] as const)
  test(`Natural Tab/Shift+Tab ${kind} discard restores form and the correct initiating button`, async ({
    page,
  }) => {
    const saved = await create();
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
    const label =
      kind === "contact" ? "Zarejestruj kontakt" : "Zarejestruj aplikowanie";
    const trigger = page.getByRole("button", { name: label, exact: true });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    const heading = page.getByRole("heading", { name: label, exact: true });
    await expect(heading).toBeFocused();
    if (kind === "contact") {
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("radio", {
          name: "Kontakt przychodzący (inbound)",
          exact: true,
        }),
      ).toBeFocused();
      await page.keyboard.press("ArrowDown");
      const outbound = page.getByRole("radio", {
        name: "Kontakt wychodzący (outbound)",
        exact: true,
      });
      await expect(outbound).toBeFocused();
      await expect(outbound).toBeChecked();
    }
    // Native date inputs can have multiple browser-controlled tab stops. Traverse them without moving focus programmatically.
    await tabTo(page, confirm(page));
    await page.keyboard.press("Space");
    await expect(confirm(page)).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(save(page)).toBeFocused();
    await page.keyboard.press("Tab");
    const cancel = page.getByRole("button", { name: "Anuluj", exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    const back = page.getByRole("button", {
      name: "Wróć do formularza",
      exact: true,
    });
    const discard = page.getByRole("button", {
      name: "Potwierdź porzucenie",
      exact: true,
    });
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(heading).toBeFocused();
    await expect(confirm(page)).toBeChecked();
    if (kind === "contact")
      await expect(
        page.getByRole("radio", {
          name: "Kontakt wychodzący (outbound)",
          exact: true,
        }),
      ).toBeChecked();
    await tabTo(page, cancel);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(trigger).toBeFocused();
    expect(await stored(saved.id)).toHaveLength(0);
  });

test("Unknown lifecycle intent remains owner-bound when the same browser signs out A and signs in B", async ({
  page,
}) => {
  const saved = await create();
  const bCase = await create(b);
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  let sentKey = "";
  let writes = 0;
  await page.route("**/recruitments/commands", async (route) => {
    const input = route.request().postDataJSON();
    if (input.action !== "record-event") return route.continue();
    sentKey = input.requestId;
    writes++;
    await route.abort("failed");
  });
  await open(page, "contact");
  await page
    .getByRole("radio", { name: "Kontakt wychodzący (outbound)", exact: true })
    .check();
  await confirm(page).check();
  await save(page).click();
  await expect(
    page.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
  ).toBeVisible();
  // Native account-session/Auth flow, not injected cookies/session objects.
  const switchTab = await page.context().newPage();
  try {
    await switchTab.goto(`${target.appOrigin}/account`);
    await switchTab
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await login(switchTab, b);
    await page.goto(`${target.appOrigin}/recruitments/${bCase.id}`);
    await expect(
      page.getByRole("button", { name: "Zarejestruj kontakt", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText(saved.title, { exact: true }),
    ).not.toBeVisible();
    const intent = await page.evaluate(
      (caseId) =>
        JSON.parse(
          sessionStorage.getItem(`jobs-crm.case-event.pending.${caseId}`) ??
            "null",
        ),
      saved.id,
    );
    expect(intent).toEqual({
      ownerId: a.id,
      caseId: saved.id,
      requestId: sentKey,
    });
    await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
    await expect(
      page.getByRole("button", { name: "Zarejestruj kontakt", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByText(saved.title, { exact: true }),
    ).not.toBeVisible();
    expect(await stored(saved.id)).toHaveLength(0);
    expect(await stored(bCase.id, b)).toHaveLength(0);
    expect(writes).toBe(1);
    await switchTab.goto(`${target.appOrigin}/account`);
    await switchTab
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await login(page, a);
    await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
    await expect(
      page.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
    ).not.toBeVisible();
    expect(writes).toBe(1);
    expect(await stored(saved.id)).toHaveLength(0);
  } finally {
    await switchTab.close();
  }
});

test("History pagination keeps every fact reachable and equal-day ordering deterministic", async ({
  page,
}) => {
  const saved = await create();
  for (let index = 0; index < 27; index++) {
    const { error } = await saved.client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: saved.id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: "2000-01-01",
    });
    expect(error === null).toBe(true);
  }
  const { data, error } = await saved.client
    .from("recruitment_case_event")
    .select("id,recorded_at")
    .eq("case_id", saved.id)
    .order("occurred_on", { ascending: false, nullsFirst: false })
    .order("recorded_at", { ascending: false })
    .order("id", { ascending: false });
  expect(error === null).toBe(true);
  expect(data).toHaveLength(27);
  expect(new Set(data!.map((row) => Date.parse(row.recorded_at))).size).toBe(
    27,
  );
  const readPageIdentities = async () => {
    const times = await history(page)
      .locator("details time[datetime]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("datetime")),
      );
    return times.map(
      (value) =>
        data!.find((row) => Date.parse(row.recorded_at) === Date.parse(value!))!
          .id,
    );
  };
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  await expect(history(page).getByRole("listitem")).toHaveCount(25);
  const firstPage = await readPageIdentities();
  expect(firstPage).toEqual(data!.slice(0, 25).map((row) => row.id));
  await history(page)
    .getByRole("link", { name: "Następna strona historii", exact: true })
    .click();
  await expect(history(page).getByRole("listitem")).toHaveCount(2);
  const secondPage = await readPageIdentities();
  expect(secondPage).toEqual(data!.slice(25).map((row) => row.id));
  expect(new Set([...firstPage, ...secondPage]).size).toBe(27);
  expect(firstPage.every((id) => !secondPage.includes(id))).toBe(true);
  await history(page)
    .getByRole("link", { name: "Poprzednia strona historii", exact: true })
    .click();
  await expect(history(page).getByRole("listitem")).toHaveCount(25);
  expect(await readPageIdentities()).toEqual(firstPage);
});

test("Real lifecycle BFF denies cross-account, anonymous, unsafe Origin and spoofed owner/time without event writes", async ({
  page,
  browser,
}) => {
  const saved = await create();
  await login(page);
  const body = {
    action: "record-event",
    expectedUserId: a.id,
    requestId: randomUUID(),
    caseId: saved.id,
    kind: "application",
    direction: null,
    occurredOn: null,
  };
  for (const extra of [
    { owner_id: b.id },
    { recorded_at: "2000-01-01T00:00:00Z" },
    { expectedUserId: b.id },
  ]) {
    const response = await page.request.post(
      `${target.appOrigin}/recruitments/commands`,
      { headers: { Origin: target.appOrigin }, data: { ...body, ...extra } },
    );
    expect([400, 403]).toContain(response.status());
  }
  const unsafe = await page.request.post(
    `${target.appOrigin}/recruitments/commands`,
    { headers: { Origin: "https://example.invalid" }, data: body },
  );
  expect(unsafe.status()).toBe(403);
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const otherPage = await other.newPage();
  await login(otherPage, b);
  const denied = await other.request.post(
    `${target.appOrigin}/recruitments/commands`,
    {
      headers: { Origin: target.appOrigin },
      data: { ...body, expectedUserId: b.id },
    },
  );
  expect([400, 403, 404, 503]).toContain(denied.status());
  await otherPage.goto(`${target.appOrigin}/recruitments/${saved.id}`);
  await expect(
    otherPage.getByRole("button", {
      name: "Zarejestruj aplikowanie",
      exact: true,
    }),
  ).not.toBeVisible();
  await other.close();
  const anon = await browser.newContext({ ignoreHTTPSErrors: true });
  const deniedAnon = await anon.request.post(
    `${target.appOrigin}/recruitments/commands`,
    { headers: { Origin: target.appOrigin }, data: body },
  );
  expect(deniedAnon.status()).toBe(401);
  await anon.close();
  expect(await stored(saved.id)).toHaveLength(0);
});

for (const width of [1440, 1024, 768, 375])
  test(`Lifecycle keyboard and layout ${width}px: accessible fact confirmation and readable history`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const saved = await create();
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${saved.id}`);
    const trigger = page.getByRole("button", {
      name: "Zarejestruj kontakt",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Zarejestruj kontakt", exact: true }),
    ).toBeFocused();
    const outbound = page.getByRole("radio", {
      name: "Kontakt wychodzący (outbound)",
      exact: true,
    });
    await outbound.focus();
    await page.keyboard.press("Space");
    await expect(outbound).toBeChecked();
    await confirm(page).focus();
    await page.keyboard.press("Space");
    await expect(confirm(page)).toBeChecked();
    await save(page).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
    ).toBeVisible();
    await expect(history(page).getByRole("listitem")).toHaveCount(1);
    expect(
      await page.evaluate(() => ({
        inner: innerWidth,
        scroll: document.documentElement.scrollWidth,
        visual: visualViewport?.width,
      })),
    ).toMatchObject({ inner: width });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(history(page)).toContainText("Kontakt wychodzący");
  });

const stageConfirmation = (page: Page, invitation: boolean) =>
  page.getByRole("checkbox", {
    name: invitation
      ? "Potwierdzam otrzymanie zaproszenia do etapu kwalifikacyjnego i ustawienie wskazanego etapu jako bieżącego."
      : "Potwierdzam rzeczywiste przejście do wskazanego etapu i ustawienie go jako bieżącego.",
    exact: true,
  });
async function stageAction(
  page: Page,
  name: string,
  invitation = true,
  day?: string,
) {
  await page
    .getByRole("button", {
      name: invitation ? "Zarejestruj zaproszenie" : "Zmień etap",
      exact: true,
    })
    .click();
  await page.getByLabel("Nazwa etapu", { exact: true }).fill(name);
  if (day)
    await page
      .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
      .fill(day);
  await stageConfirmation(page, invitation).check();
  await save(page).click();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  await expect(save(page)).not.toBeVisible();
}

test("DEC055 LC007/008/011/012/013: real invitation starts recruitment, skipped stage preserves snapshots and active contact never regresses", async ({
  page,
}) => {
  const c = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await expect(
    page.getByRole("button", { name: "Zmień etap", exact: true }),
  ).not.toBeVisible();
  await stageAction(page, "Screening");
  await expect(
    page.getByText("W rekrutacji", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Screening", { exact: true }).first(),
  ).toBeVisible();
  await stageAction(page, "Rozmowa techniczna", true, "2000-01-01");
  await stageAction(page, "Oferta", false);
  await record(page, "inbound");
  await record(page, "application");
  const { data, error } = await c.client
    .from("recruitment_case")
    .select("status,current_stage,stage_version")
    .eq("id", c.id)
    .single();
  expect(error === null).toBe(true);
  expect(data).toEqual({
    status: "W rekrutacji",
    current_stage: "Oferta",
    stage_version: 3,
  });
  const { data: facts } = await c.client
    .from("recruitment_case_event")
    .select("kind,stage_name,previous_stage")
    .eq("case_id", c.id)
    .order("recorded_at");
  expect(
    facts?.map((row) => [row.kind, row.stage_name, row.previous_stage]),
  ).toEqual([
    ["invitation", "Screening", null],
    ["invitation", "Rozmowa techniczna", "Screening"],
    ["stage-change", "Oferta", "Rozmowa techniczna"],
    ["contact", null, null],
    ["application", null, null],
  ]);
  await expect(
    history(page).getByText("Screening", { exact: false }).first(),
  ).toBeVisible();
  await page.goto(`${target.appOrigin}/recruitments`);
  await expect(page.getByText(c.title, { exact: true })).toBeVisible();
});

test("DEC055 invitation requires truthful confirmation; unconfirmed save writes nothing and stale concurrent stage requires refresh", async ({
  page,
}) => {
  const c = await create();
  const intents: string[] = [];
  await page.route("**/recruitments/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (body.kind === "stage-change") intents.push(body.requestId);
    await route.continue();
  });
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await page
    .getByRole("button", { name: "Zarejestruj zaproszenie", exact: true })
    .click();
  await page.getByLabel("Nazwa etapu", { exact: true }).fill("Screening");
  await save(page).click();
  await expect(stageConfirmation(page, true)).not.toBeChecked();
  expect(await stored(c.id)).toHaveLength(0);
  await stageConfirmation(page, true).check();
  await save(page).click();
  await expect(save(page)).not.toBeVisible();
  await page.getByRole("button", { name: "Zmień etap", exact: true }).click();
  await page
    .getByLabel("Nazwa etapu", { exact: true })
    .fill("Stale browser choice");
  const { error } = await c.client.rpc("record_recruitment_case_stage_event", {
    p_request_id: randomUUID(),
    p_case_id: c.id,
    p_kind: "stage-change",
    p_stage_name: "Other tab",
    p_expected_stage_version: 1,
    p_occurred_on: null,
  });
  expect(error === null).toBe(true);
  await stageConfirmation(page, false).check();
  await save(page).click();
  await expect(
    page.getByRole("button", { name: "Odśwież stan sprawy", exact: true }),
  ).toBeVisible();
  expect(await stored(c.id)).toHaveLength(2);
  await page
    .getByRole("button", { name: "Odśwież stan sprawy", exact: true })
    .click();
  await expect(page.getByLabel("Nazwa etapu", { exact: true })).toHaveValue(
    "Stale browser choice",
  );
  await expect(stageConfirmation(page, false)).not.toBeChecked();
  expect(await stored(c.id)).toHaveLength(2);
  await stageConfirmation(page, false).check();
  await save(page).click();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  expect(await stored(c.id)).toHaveLength(3);
  expect(intents).toHaveLength(2);
  expect(intents[0]).not.toBe(intents[1]);
  const { data: finalState } = await c.client
    .from("recruitment_case")
    .select("status,current_stage,stage_version")
    .eq("id", c.id)
    .single();
  expect(finalState).toEqual({
    status: "W rekrutacji",
    current_stage: "Stale browser choice",
    stage_version: 3,
  });
});

for (const width of [1440, 1024, 768, 375])
  test(`DEC055 invitation keyboard and long Unicode stage layout ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const c = await create();
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
    const trigger = page.getByRole("button", {
      name: "Zarejestruj zaproszenie",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page
      .getByLabel("Nazwa etapu", { exact: true })
      .fill("😀".repeat(160));
    await stageConfirmation(page, true).check();
    if (width === 375)
      await page.screenshot({
        path: test.info().outputPath("invitation-375.png"),
        fullPage: true,
      });
    await save(page).click();
    await expect(save(page)).not.toBeVisible();
    if (width === 1440)
      await page.screenshot({
        path: test.info().outputPath("active-detail-1440.png"),
        fullPage: true,
      });
    await expect(
      page.getByText("W rekrutacji", { exact: true }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });

test("DEC055 lost invitation response reload recovers one stage mutation without resubmitting private draft", async ({
  page,
}) => {
  const c = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  let writes = 0;
  await page.route("**/recruitments/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (body.kind !== "invitation") return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    return route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Zarejestruj zaproszenie", exact: true })
    .click();
  await page
    .getByLabel("Nazwa etapu", { exact: true })
    .fill("Private stage draft");
  await stageConfirmation(page, true).check();
  await save(page).click();
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  expect(await stored(c.id)).toHaveLength(1);
  const storage = await page.evaluate(() => Object.values(sessionStorage));
  expect(storage.join(" ")).not.toContain("Private stage draft");
  await page.reload();
  await expect(
    page.getByText("Zdarzenie zostało zapisane.", { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  expect(await stored(c.id)).toHaveLength(1);
  const { data } = await c.client
    .from("recruitment_case")
    .select("current_stage,stage_version,status")
    .eq("id", c.id)
    .single();
  expect(data).toEqual({
    status: "W rekrutacji",
    current_stage: "Private stage draft",
    stage_version: 1,
  });
});

test("DEC055 natural Tab ShiftTab and dirty cancel for invitation and stage-change restore initiating focus without a write", async ({
  page,
}) => {
  const c = await create();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  for (const invitation of [true, false]) {
    const before = await stored(c.id);
    const { data: stateBefore } = await c.client
      .from("recruitment_case")
      .select("status,current_stage,stage_version")
      .eq("id", c.id)
      .single();
    const trigger = page.getByRole("button", {
      name: invitation ? "Zarejestruj zaproszenie" : "Zmień etap",
      exact: true,
    });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");
    const heading = page.getByRole("heading", {
      name: invitation ? "Zarejestruj zaproszenie" : "Zmień etap",
      exact: true,
    });
    await expect(heading).toBeFocused();
    await page.keyboard.press("Tab");
    const stage = page.getByLabel("Nazwa etapu", { exact: true });
    await expect(stage).toBeFocused();
    await stage.fill("Unsubmitted stage");
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Data zdarzenia (opcjonalnie)", { exact: true }),
    ).toBeFocused();
    // Traverse native date segments with real Tab presses.
    await tabTo(page, stageConfirmation(page, invitation));
    await page.keyboard.press("Space");
    await expect(stageConfirmation(page, invitation)).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(save(page)).toBeFocused();
    await page.keyboard.press("Tab");
    const cancel = page.getByRole("button", { name: "Anuluj", exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Enter");
    const back = page.getByRole("button", {
      name: "Wróć do formularza",
      exact: true,
    });
    const discard = page.getByRole("button", {
      name: "Potwierdź porzucenie",
      exact: true,
    });
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(heading).toBeFocused();
    await tabTo(page, cancel);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(discard).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(save(page)).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await stored(c.id)).toEqual(before);
    const { data: stateAfter } = await c.client
      .from("recruitment_case")
      .select("status,current_stage,stage_version")
      .eq("id", c.id)
      .single();
    expect(stateAfter).toEqual(stateBefore);
    if (invitation) await stageAction(page, "Actual screening");
  }
});
