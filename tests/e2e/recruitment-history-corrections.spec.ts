/** DEC-056 acceptance against actual production UI and guarded local Auth/RLS. */
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
let a: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("History browser requires guarded disposable target");
  target = await readRecruitmentTarget(id);
  a = await account(target);
});
async function login(page: Page) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(a.email);
  await page.getByLabel("Hasło", { exact: true }).fill(a.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}
async function fixture(invitation = false) {
  const { client } = await sdkLogin(target, a);
  const title = `Correction browser ${randomUUID()}`;
  const created = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(created.error).toBeNull();
  const id = created.data.case.id as string;
  const result = invitation
    ? await client.rpc("record_recruitment_case_stage_event", {
        p_request_id: randomUUID(),
        p_case_id: id,
        p_kind: "invitation",
        p_stage_name: "Screening",
        p_expected_stage_version: 0,
        p_occurred_on: "2000-01-01",
      })
    : await client.rpc("record_recruitment_case_event", {
        p_request_id: randomUUID(),
        p_case_id: id,
        p_kind: "contact",
        p_direction: "inbound",
        p_occurred_on: "2000-01-01",
      });
  expect(result.error).toBeNull();
  return { client, id, title, event: result.data.event };
}
const history = (page: Page) =>
  page.getByRole("region", { name: "Historia sprawy", exact: true });
const item = (page: Page) => history(page).getByRole("listitem").first();
const previewButton = (page: Page) =>
  page.getByRole("button", { name: "Pokaż podgląd zmian", exact: true });
async function open(page: Page, voided = false) {
  await item(page)
    .getByRole("button", {
      name: voided ? "Unieważnij wpis" : "Skoryguj wpis",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: voided ? "Unieważnienie wpisu historii" : "Korekta wpisu historii",
      exact: true,
    }),
  ).toBeVisible();
}
async function confirm(page: Page, voided = false) {
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: voided
        ? "Potwierdzam unieważnienie i jego wpływ na bieżący status oraz etap."
        : "Potwierdzam korektę i jej wpływ na bieżący status oraz etap.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", {
      name: voided ? "Zatwierdź unieważnienie" : "Zatwierdź korektę",
      exact: true,
    })
    .click();
}
async function auditRows(c: Awaited<ReturnType<typeof fixture>>) {
  const { data, error } = await c.client
    .from("recruitment_case_event_revision")
    .select("*")
    .eq("case_id", c.id);
  expect(error).toBeNull();
  return data ?? [];
}

test("DEC056 correction preview is read-only; confirm updates effective day/direction with immutable original and readable audit", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2001-02-03");
  await page
    .getByRole("radio", { name: "Kontakt wychodzący", exact: true })
    .check();
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(0);
  await page
    .getByRole("checkbox", {
      name: "Potwierdzam korektę i jej wpływ na bieżący status oraz etap.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Zatwierdź korektę", exact: true })
    .click();
  await expect(item(page)).toContainText("Kontakt wychodzący");
  await expect(item(page).locator("time[datetime='2001-02-03']")).toBeVisible();
  expect(await auditRows(c)).toHaveLength(1);
  const { data: original, error } = await c.client
    .from("recruitment_case_event")
    .select("direction,occurred_on,recorded_at")
    .eq("id", c.event.id)
    .single();
  expect(error).toBeNull();
  expect(original).toEqual({
    direction: "inbound",
    occurred_on: "2000-01-01",
    recorded_at: c.event.recorded_at,
  });
  await item(page)
    .getByRole("button", { name: "Pokaż audyt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Audyt wpisu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Właściciel tej sprawy", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(item(page)).toContainText("Kontakt wychodzący");
});

for (const width of [1440, 375])
  test(`DEC056 void preview, explicit confirmation, status list/detail/reload and layout ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const c = await fixture(true);
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
    await open(page, true);
    await previewButton(page).click();
    await expect(
      page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Zapisane", { exact: true }).last(),
    ).toBeVisible();
    expect(await auditRows(c)).toHaveLength(0);
    await page.screenshot({
      path: test.info().outputPath(`void-preview-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Scope to the confirmation control; wording must distinguish invalidating an entry from cancelling a real invitation.
    await page
      .getByRole("checkbox", { name: /Potwierdzam unieważnienie/ })
      .check();
    await page
      .getByRole("button", { name: "Zatwierdź unieważnienie", exact: true })
      .click();
    await expect(item(page)).toContainText(/Unieważnion/);
    await expect(
      page.getByRole("region", { name: "Szczegóły sprawy", exact: true }),
    ).toContainText("Zapisane");
    expect(await auditRows(c)).toHaveLength(1);
    await expect(
      item(page).getByRole("button", { name: "Skoryguj wpis", exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await expect(item(page)).toContainText(/Unieważnion/);
    await page.goto(`${target.appOrigin}/recruitments`);
    await expect(
      page.getByRole("listitem").filter({
        has: page.getByRole("link", { name: c.title, exact: true }),
      }),
    ).toContainText("Zapisane");
  });

test("DEC056 stale preview never writes; draft is preserved and new preview requires new confirmation", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2002-03-04");
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  const concurrent = await c.client.rpc("record_recruitment_case_event", {
    p_request_id: randomUUID(),
    p_case_id: c.id,
    p_kind: "application",
    p_direction: null,
    p_occurred_on: null,
  });
  expect(concurrent.error).toBeNull();
  await page.getByRole("checkbox", { name: /Potwierdzam korektę/ }).check();
  await page
    .getByRole("button", { name: "Zatwierdź korektę", exact: true })
    .click();
  await expect(page.getByText(/Sprawa lub wpis zmieniły się/)).toBeVisible();
  expect(await auditRows(c)).toHaveLength(0);
  await expect(
    page.getByLabel("Data zdarzenia (opcjonalnie)", { exact: true }),
  ).toHaveValue("2002-03-04");
  await previewButton(page).click();
  await expect(
    page.getByRole("checkbox", { name: /Potwierdzam korektę/ }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: /Potwierdzam korektę/ }).check();
  await page
    .getByRole("button", { name: "Zatwierdź korektę", exact: true })
    .click();
  await expect(
    history(page).locator("time[datetime='2002-03-04']"),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(1);
});

test("DEC056 lost correction response reload explicitly recovers one immutable audit and clears the owner-bound frozen command", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  let writes = 0;
  await page.route("**/recruitments/history-commands", async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().action !== "confirm"
    )
      return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2003-04-05");
  await confirm(page);
  await expect(
    page
      .getByRole("button", {
        name: /Sprawdź wynik korekty|Ponów ten sam zapis/,
      })
      .first(),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(1);
  const storage = await page.evaluate(() =>
    Object.values(sessionStorage).join(" "),
  );
  expect(storage).toContain("2003-04-05");
  expect(storage).toContain(a.id);
  await page.reload();
  await page
    .getByRole("button", { name: "Sprawdź wynik korekty", exact: true })
    .click();
  await expect(
    page.getByText(/Potwierdzono wcześniejszy zapis korekty/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sprawdź wynik korekty", exact: true }),
  ).not.toBeVisible();
  await expect(
    history(page).locator("time[datetime='2003-04-05']"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Object.values(sessionStorage).join(" ")),
  ).not.toContain("2003-04-05");
  expect(writes).toBe(1);
  expect(await auditRows(c)).toHaveLength(1);
});

test("DEC056 natural keyboard cancel returns focus and creates no revision", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  const trigger = item(page).getByRole("button", {
    name: "Skoryguj wpis",
    exact: true,
  });
  for (
    let count = 0;
    count < 45 &&
    !(await trigger.evaluate((node) => node === document.activeElement));
    count++
  )
    await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Korekta wpisu historii", exact: true }),
  ).toBeFocused();
  const cancel = page.getByRole("button", { name: "Anuluj", exact: true });
  for (
    let count = 0;
    count < 25 &&
    !(await cancel.evaluate((node) => node === document.activeElement));
    count++
  )
    await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toBeFocused();
  expect(await auditRows(c)).toHaveLength(0);
});

test("DEC056 BFF protects preview/confirm/audit/recovery from unsafe Origin, spoofed identity and other accounts", async ({
  page,
  browser,
}) => {
  const c = await fixture();
  await login(page);
  const body = {
    action: "preview",
    expectedUserId: a.id,
    caseId: c.id,
    eventId: c.event.id,
    operation: "correct",
    occurredOn: "2000-01-02",
    direction: "inbound",
    stageName: null,
  };
  for (const origin of ["https://evil.invalid", "null"]) {
    const r = await page.request.post(
      `${target.appOrigin}/recruitments/history-commands`,
      { data: body, headers: { Origin: origin } },
    );
    expect(r.status()).toBe(403);
  }
  const spoof = await page.request.post(
    `${target.appOrigin}/recruitments/history-commands`,
    {
      data: { ...body, expectedUserId: randomUUID() },
      headers: { Origin: target.appOrigin },
    },
  );
  expect(spoof.status()).toBe(403);
  for (const extra of [
    { ownerId: randomUUID() },
    { recordedAt: "2000-01-01T00:00:00Z" },
    { kind: "invitation" },
  ]) {
    const r = await page.request.post(
      `${target.appOrigin}/recruitments/history-commands`,
      { data: { ...body, ...extra }, headers: { Origin: target.appOrigin } },
    );
    expect(r.status()).toBe(400);
  }
  const stranger = await account(target);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const other = await context.newPage();
    await other.goto(`${target.appOrigin}/login`);
    await other.getByLabel("E-mail", { exact: true }).fill(stranger.email);
    await other.getByLabel("Hasło", { exact: true }).fill(stranger.password);
    await other
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(other).toHaveURL(`${target.appOrigin}/dashboard`);
    const r = await other.request.post(
      `${target.appOrigin}/recruitments/history-commands`,
      {
        data: { ...body, expectedUserId: stranger.id },
        headers: { Origin: target.appOrigin },
      },
    );
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await r.json())).not.toContain(c.title);
    for (const query of [
      `caseId=${c.id}&eventId=${c.event.id}`,
      `caseId=${c.id}&requestId=${randomUUID()}`,
    ]) {
      const hidden = await other.request.get(
        `${target.appOrigin}/recruitments/history-commands?${query}`,
      );
      const value = await hidden.json();
      expect(JSON.stringify(value)).not.toContain(c.title);
      expect(JSON.stringify(value)).not.toContain(c.event.id);
    }
    await other.goto(`${target.appOrigin}/recruitments/${c.id}`);
    await expect(
      other.getByRole("button", { name: "Skoryguj wpis", exact: true }),
    ).not.toBeVisible();
  } finally {
    await context.close();
  }
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const r = await anonymous.request.post(
      `${target.appOrigin}/recruitments/history-commands`,
      { data: body, headers: { Origin: target.appOrigin } },
    );
    expect(r.status()).toBe(401);
  } finally {
    await anonymous.close();
  }
  expect(await auditRows(c)).toHaveLength(0);
});

test("DEC056 an open editor disables history pagination; cancellation unlocks navigation and the next page editor", async ({
  page,
}) => {
  const c = await fixture();
  for (let index = 0; index < 26; index++) {
    const saved = await c.client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: c.id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: "2000-01-01",
    });
    expect(saved.error).toBeNull();
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await expect(history(page).getByRole("listitem")).toHaveCount(25);
  await open(page);
  await expect(
    history(page).getByRole("link", {
      name: "Następna strona historii",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await history(page)
    .getByRole("link", { name: "Następna strona historii", exact: true })
    .click();
  await expect(history(page).getByRole("listitem")).toHaveCount(2);
  await expect(
    item(page).getByRole("button", { name: "Skoryguj wpis", exact: true }),
  ).toBeEnabled();
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Korekta wpisu historii", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await history(page)
    .getByRole("link", { name: "Poprzednia strona historii", exact: true })
    .click();
  await expect(history(page).getByRole("listitem")).toHaveCount(25);
  expect(await auditRows(c)).toHaveLength(0);
});

test("DEC056 an undelivered confirm survives reload and retries the exact owner-bound command once", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  const commands: unknown[] = [];
  let abortFirst = true;
  await page.route("**/recruitments/history-commands", async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().action !== "confirm"
    )
      return route.continue();
    commands.push(route.request().postDataJSON());
    if (abortFirst) {
      abortFirst = false;
      return route.abort("failed");
    }
    await route.continue();
  });
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2004-05-06");
  await confirm(page);
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(0);
  expect(commands).toHaveLength(1);
  await page.reload();
  const recover = page.getByRole("button", {
    name: "Sprawdź wynik korekty",
    exact: true,
  });
  await expect(recover).toBeVisible();
  await recover.click();
  expect(await auditRows(c)).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ponów ten sam zapis", exact: true })
    .click();
  await expect(
    history(page).locator("time[datetime='2004-05-06']"),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(1);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(
    await page.evaluate(() => Object.values(sessionStorage).join(" ")),
  ).not.toContain("2004-05-06");
});

test("DEC056 delayed recovery JSON from an unmounted page cannot clear a newer pending command", async ({
  page,
}) => {
  const c = await fixture();
  for (let index = 0; index < 26; index++) {
    const saved = await c.client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: c.id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: "2000-01-01",
    });
    expect(saved.error).toBeNull();
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  const commands: Record<string, unknown>[] = [];
  await page.route("**/recruitments/history-commands", async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().action !== "confirm"
    )
      return route.continue();
    commands.push(route.request().postDataJSON());
    if (commands.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      return route.abort("failed");
    }
    if (commands.length === 2) return route.abort("failed");
    await route.continue();
  });
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2005-06-07");
  await confirm(page);
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(1);
  await page.reload();
  // Delay only consumption of the first real committed recovery response's JSON.
  // Auth, network request, response data and subsequent requests remain real.
  await page.evaluate((requestId) => {
    const state = window as typeof window & {
      historyJsonWaiting?: boolean;
      releaseHistoryJson?: () => void;
    };
    const originalFetch = window.fetch.bind(window);
    let delayed = false;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (
        !delayed &&
        url.includes("/recruitments/history-commands?") &&
        url.includes(String(requestId))
      ) {
        delayed = true;
        const originalJson = response.json.bind(response);
        response.json = async () => {
          const value = await originalJson();
          state.historyJsonWaiting = true;
          await new Promise<void>((resolve) => {
            state.releaseHistoryJson = resolve;
          });
          return value;
        };
      }
      return response;
    };
  }, commands[0].requestId);
  await page
    .getByRole("button", { name: "Sprawdź wynik korekty", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      (window as typeof window & { historyJsonWaiting?: boolean })
        .historyJsonWaiting === true,
  );
  await history(page)
    .getByRole("link", { name: "Następna strona historii", exact: true })
    .click();
  await expect(history(page).getByRole("listitem")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Sprawdź wynik korekty", exact: true })
    .click();
  await expect(
    page.getByText(/Potwierdzono wcześniejszy zapis korekty/),
  ).toBeVisible();
  await open(page);
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2006-07-08");
  await confirm(page);
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  const pendingB = await page.evaluate(() =>
    Object.values(sessionStorage).find((value) => value.includes("2006-07-08")),
  );
  expect(pendingB).toBeTruthy();
  expect(await auditRows(c)).toHaveLength(1);
  await page.evaluate(async () => {
    (
      window as typeof window & { releaseHistoryJson?: () => void }
    ).releaseHistoryJson?.();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(
    await page.evaluate(() =>
      Object.values(sessionStorage).find((value) =>
        value.includes("2006-07-08"),
      ),
    ),
  ).toBe(pendingB);
  await page.reload();
  await page
    .getByRole("button", { name: "Sprawdź wynik korekty", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ponów ten sam zapis", exact: true })
    .click();
  await expect(
    page.getByText(/Potwierdzono (wcześniejszy )?zapis korekty/),
  ).toBeVisible();
  await history(page)
    .getByRole("link", { name: "Poprzednia strona historii", exact: true })
    .click();
  await expect(
    history(page).locator("time[datetime='2006-07-08']"),
  ).toBeVisible();
  expect(await auditRows(c)).toHaveLength(2);
  expect(commands).toHaveLength(3);
  expect(commands[2]).toEqual(commands[1]);
});
