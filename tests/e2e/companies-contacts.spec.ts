/** DEC-058: production HTTPS browser, synthetic data only. */
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
let b: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id) throw new Error("CC browser requires guarded disposable target");
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
async function fixture(user = a) {
  const { client } = await sdkLogin(target, user);
  return { client, user };
}
async function command(payload: Record<string, unknown>, user = a) {
  const { client } = await fixture(user);
  const key = randomUUID();
  const { data, error } = await client.rpc("execute_catalog_command", {
    p_request_id: key,
    p_payload: payload,
  });
  expect(error).toBeNull();
  return { data, key, client };
}
async function profile(
  type = "contact",
  name = `CC browser ${randomUUID()}`,
  email: string | null = null,
  user = a,
) {
  const result = await command(
    { operation: "create-profile", profileType: type, name, email },
    user,
  );
  expect(result.data.kind).toBe("saved");
  return { ...result.data.profile, client: result.client, key: result.key } as {
    id: string;
    type: string;
    name: string;
    email: string | null;
    revision: number;
    client: typeof result.client;
    key: string;
  };
}
async function caseFixture() {
  const { client } = await fixture();
  const title = `CC browser case ${randomUUID()}`;
  const { data, error } = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(error).toBeNull();
  return { id: data.case.id as string, title, client };
}
const relations = (page: Page) =>
  page.getByRole("region", { name: "Powiązania", exact: true });
async function newProfile(
  page: Page,
  type = "contact",
  name = `CC UI ${randomUUID()}`,
  email = "",
) {
  await page.goto(type === "contact" ? "/contacts" : "/companies");
  await page
    .getByRole("button", {
      name: type === "contact" ? "Dodaj kontakt" : "Dodaj firmę",
      exact: true,
    })
    .click();
  await page
    .getByLabel(type === "contact" ? "Nazwa kontaktu" : "Nazwa firmy", {
      exact: true,
    })
    .fill(name);
  if (type === "contact")
    await page.getByLabel("E-mail (opcjonalnie)", { exact: true }).fill(email);
  return name;
}
async function rows(table: string, filter: string) {
  const { client } = await fixture();
  const { data, error } = await client
    .from(table)
    .select("*")
    .eq(...(filter.split(":") as [string, string]));
  expect(error).toBeNull();
  return data ?? [];
}
async function attachUI(
  page: Page,
  type: "case" | "organization" | "contact",
  id: string,
  role?: string,
) {
  const section = relations(page);
  const labels = {
    case: "Powiąż ze sprawą",
    organization: "Powiąż z firmą",
    contact: "Powiąż z kontaktem",
  };
  await section
    .getByRole("button", { name: labels[type], exact: true })
    .click();
  const selector = section.getByLabel(
    type === "case"
      ? "Wybierz sprawę"
      : type === "organization"
        ? "Wybierz firmę"
        : "Wybierz kontakt",
    { exact: true },
  );
  await expect(selector).toBeEnabled();
  for (let i = 0; i < 20; i++) {
    if (await selector.locator(`option[value="${id}"]`).count()) break;
    const next = section
      .getByRole("navigation", {
        name: "Strony wyboru powiązania",
        exact: true,
      })
      .getByRole("button", { name: "Następna strona", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(selector).toBeEnabled();
  }
  await selector.selectOption(id);
  if (role)
    await section
      .getByLabel("Rola firmy w sprawie", { exact: true })
      .selectOption(role);
  await section
    .getByRole("button", { name: "Zapisz powiązanie", exact: true })
    .click();
  await expect(
    section.getByRole("heading", { name: "Nowe powiązanie", exact: true }),
  ).toHaveCount(0);
}

test("DEC058 standalone profiles create/edit/audit, private PII stays out of browser storage and console", async ({
  page,
}) => {
  const logs: string[] = [];
  page.on("console", (message) => logs.push(message.text()));
  await login(page);
  const before = await rows("recruitment_case", `owner_id:${a.id}`);
  const name = `Synthetic Person ${randomUUID()}`;
  const email = `cc-${randomUUID()}@example.invalid`;
  await newProfile(page, "contact", name, email);
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(
    page
      .getByRole("region", { name: "Dane profilu" })
      .getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain(name);
  expect(JSON.stringify(storage)).not.toContain(email);
  expect(logs.join("\n")).not.toContain(email);
  expect(logs.join("\n")).not.toContain(name);
  await page
    .getByRole("button", { name: "Edytuj profil", exact: true })
    .click();
  await page
    .getByLabel("Nazwa kontaktu", { exact: true })
    .fill(`${name} corrected`);
  await page
    .getByRole("button", { name: "Zapisz zmiany", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${name} corrected`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Audyt zmian", exact: true }).click();
  const audit = page.getByRole("list", { name: "Wpisy audytu", exact: true });
  await expect(
    audit.getByText("Utworzenie profilu", { exact: true }),
  ).toBeVisible();
  await expect(
    audit.getByText("Korekta profilu", { exact: true }),
  ).toBeVisible();
  await audit
    .getByText("Dane przed i po zmianie", { exact: true })
    .first()
    .click();
  await expect(audit).toContainText(name);
  expect(await rows("recruitment_case", `owner_id:${a.id}`)).toEqual(before);
});
test("DEC058 form errors and cancel keep explicit user intent, return focus without creating records", async ({
  page,
}) => {
  await login(page);
  await newProfile(page, "organization", " ");
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await expect(
    page.getByText("Sprawdź oznaczone pola formularza.", { exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Dodaj firmę", exact: true }),
  ).toBeFocused();
  await newProfile(page, "contact", "Synthetic valid", "bad");
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await expect(page.getByLabel("E-mail (opcjonalnie)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
test("DEC058 duplicate warning opens existing or explicitly creates separate profile without merge", async ({
  page,
}) => {
  const existing = await profile();
  await login(page);
  await newProfile(page, "contact", existing.name);
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  const warning = page.getByRole("region", {
    name: "Możliwe duplikaty",
    exact: true,
  });
  await expect(warning).toBeVisible();
  await expect(
    warning.getByRole("link", {
      name: `Otwórz profil: ${existing.name}`,
      exact: true,
    }),
  ).toHaveAttribute("href", `/contacts/${existing.id}`);
  await warning.getByRole("link").click();
  await expect(page).toHaveURL(`${target.appOrigin}/contacts/${existing.id}`);
  await newProfile(page, "contact", existing.name);
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Zapisz jako odrębny profil", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  expect(page.url()).not.toContain(existing.id);
  expect((await rows("catalog_profile", `name:${existing.name}`)).length).toBe(
    2,
  );
});
test("DEC058 explicit company/contact/case M:N and role correction/detach do not inherit event history", async ({
  page,
}) => {
  const org = await profile("organization"),
    person = await profile(),
    another = await profile();
  const c = await caseFixture(),
    second = await caseFixture();
  await login(page);
  await page.goto(`/companies/${org.id}`);
  await attachUI(page, "case", c.id, "agency");
  await attachUI(page, "case", second.id, "employer");
  await attachUI(page, "contact", person.id);
  await expect(
    relations(page).getByRole("link", { name: c.title, exact: true }),
  ).toBeVisible();
  await expect(
    relations(page).getByRole("link", { name: second.title, exact: true }),
  ).toBeVisible();
  await expect(
    relations(page).getByRole("link", { name: person.name, exact: true }),
  ).toBeVisible();
  await page.goto(`/recruitments/${c.id}`);
  await attachUI(page, "contact", person.id);
  await attachUI(page, "contact", another.id);
  const companyRow = relations(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: org.name, exact: true }) });
  await expect(
    companyRow.getByText("Rola firmy: Agencja", { exact: true }),
  ).toBeVisible();
  await companyRow
    .getByRole("button", { name: "Zmień rolę firmy", exact: true })
    .click();
  await relations(page).getByLabel("Nowa rola firmy").selectOption("employer");
  await relations(page)
    .getByRole("button", { name: "Potwierdź zmianę roli", exact: true })
    .click();
  await expect(
    companyRow.getByText("Rola firmy: Pracodawca", { exact: true }),
  ).toBeVisible();
  await companyRow
    .getByRole("button", { name: `Odłącz ${org.name}`, exact: true })
    .click();
  await relations(page)
    .getByRole("button", { name: "Potwierdź odłączenie", exact: true })
    .click();
  await expect(
    relations(page).getByRole("link", { name: org.name, exact: true }),
  ).toHaveCount(0);
  for (const endpointId of [c.id, org.id]) {
    const auditResponse = await page.request.get(
      `${target.appOrigin}/catalog/commands?auditId=${endpointId}&page=1`,
    );
    expect(auditResponse.status()).toBe(200);
    const auditBody = (await auditResponse.json()) as {
      audit: { operation: string }[];
    };
    expect(auditBody.audit.some((entry) => entry.operation === "detach")).toBe(
      true,
    );
  }
  await page.goto(`/companies/${org.id}`);
  await page
    .getByRole("button", { name: "Audyt zmian", exact: true })
    .last()
    .click();
  await expect(
    page
      .getByRole("list", { name: "Wpisy audytu", exact: true })
      .getByText("Odłączenie powiązania", { exact: true }),
  ).toBeVisible();
  await page.goto(`/contacts/${person.id}`);
  await attachUI(page, "case", second.id);
  await expect(
    relations(page).getByRole("link", { name: c.title, exact: true }),
  ).toBeVisible();
  await expect(
    relations(page).getByRole("link", { name: second.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Historia sprawy", exact: true }),
  ).toHaveCount(0);
  expect(await rows("recruitment_case_event", `case_id:${c.id}`)).toEqual([]);
});
test("DEC058 delivered commit with lost response recovers same intent without PII persistence", async ({
  page,
}) => {
  await login(page);
  const name = await newProfile(
    page,
    "contact",
    `Lost ${randomUUID()}`,
    `lost-${randomUUID()}@example.invalid`,
  );
  let sent: Record<string, unknown> | null = null;
  let lose = true;
  await page.route("**/catalog/commands", async (route) => {
    if (route.request().method() === "POST" && lose) {
      lose = false;
      sent = route.request().postDataJSON();
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Wynik zapisu jest nieznany",
  );
  await expect(
    page.getByLabel("Nazwa kontaktu", { exact: true }),
  ).toBeDisabled();
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(storage).not.toContain(name);
  await page
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  expect(sent).not.toBeNull();
  expect(await rows("catalog_profile", `name:${name}`)).toHaveLength(1);
});
test("DEC058 nondelivered mutation retries byte-identical intent exactly once", async ({
  page,
}) => {
  await login(page);
  const name = await newProfile(page);
  const sent: unknown[] = [];
  let stop = true;
  await page.route("**/catalog/commands", async (route) => {
    if (route.request().method() === "POST") {
      sent.push(route.request().postDataJSON());
      if (stop) {
        stop = false;
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Zapisz profil", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ponów ten sam zapis", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual(sent[1]);
  expect(await rows("catalog_profile", `name:${name}`)).toHaveLength(1);
});
test("DEC058 stale edit preserves draft and refreshes explicitly instead of overwriting", async ({
  page,
}) => {
  const p = await profile();
  await login(page);
  await page.goto(`/contacts/${p.id}`);
  await page
    .getByRole("button", { name: "Edytuj profil", exact: true })
    .click();
  await page
    .getByLabel("Nazwa kontaktu", { exact: true })
    .fill("Synthetic stale draft");
  await command({
    operation: "edit-profile",
    profileType: "contact",
    profileId: p.id,
    name: "Synthetic concurrent corrected",
    email: null,
    expectedRevision: p.revision,
  });
  await page
    .getByRole("button", { name: "Zapisz zmiany", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Dane zmieniły się w międzyczasie",
  );
  await expect(page.getByLabel("Nazwa kontaktu", { exact: true })).toHaveValue(
    "Synthetic stale draft",
  );
  await page
    .getByRole("button", { name: "Odśwież dane profilu", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Synthetic concurrent corrected",
      exact: true,
    }),
  ).toBeVisible();
});
test("DEC058 paginated lists and relationship selector expose records beyond first25", async ({
  page,
}) => {
  const user = await account(target);
  const list = [];
  for (let i = 0; i < 27; i++)
    list.push(
      await profile("organization", `Paged ${i} ${randomUUID()}`, null, user),
    );
  await login(page, user);
  await page.goto("/companies");
  const region = page.getByRole("region", { name: "Lista firm", exact: true });
  await expect(region.getByRole("listitem")).toHaveCount(25);
  const nav = page.getByRole("navigation", {
    name: "Strony listy firm",
    exact: true,
  });
  await nav
    .getByRole("button", { name: "Następna strona", exact: true })
    .click();
  await expect(region.getByRole("listitem")).toHaveCount(2);
  await expect(
    region.getByRole("link", { name: list[0].name, exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "Następna strona", exact: true }),
  ).toBeDisabled();
  const p = await profile(
    "contact",
    `Paged Person ${randomUUID()}`,
    null,
    user,
  );
  await page.goto(`/contacts/${p.id}`);
  await attachUI(page, "organization", list[0].id);
  await expect(
    relations(page).getByRole("link", { name: list[0].name, exact: true }),
  ).toBeVisible();
});
test("DEC058 authenticated BFF origin/account binding and private read surfaces prevent cross-user metadata leaks", async ({
  page,
}) => {
  const p = await profile();
  await login(page, b);
  await page.goto(`/contacts/${p.id}`);
  await expect(
    page
      .getByRole("main")
      .getByText("Nie znaleziono dostępnego profilu.", { exact: true }),
  ).toBeVisible();
  for (const query of [
    `id=${p.id}`,
    `auditId=${p.id}&page=1`,
    `requestId=${p.key}`,
    `contextType=contact&contextId=${p.id}&page=1`,
  ]) {
    const response = await page.request.get(
      `${target.appOrigin}/catalog/commands?${query}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain(p.name);
  }
  const base = {
    expectedUserId: b.id,
    requestId: randomUUID(),
    operation: "create-profile",
    profileType: "contact",
    name: `Origin rejected ${randomUUID()}`,
    email: null,
  };
  const rejectedHeaders: Record<string, string>[] = [
    {},
    { Origin: "https://example.invalid" },
    { Origin: target.appOrigin, "sec-fetch-site": "cross-site" },
  ];
  for (const headers of rejectedHeaders) {
    const response = await page.request.post(
      `${target.appOrigin}/catalog/commands`,
      { data: base, headers },
    );
    expect(response.status()).toBe(403);
  }
  const mismatch = await page.request.post(
    `${target.appOrigin}/catalog/commands`,
    {
      data: { ...base, expectedUserId: a.id },
      headers: { Origin: target.appOrigin },
    },
  );
  expect(mismatch.status()).toBe(403);
});
test("DEC058 uncertain relation mutation remains recoverable while paging and other mutations are blocked", async ({
  page,
}) => {
  const c = await caseFixture();
  const org = await profile("organization");
  await command({
    operation: "attach",
    relationType: "case-organization",
    leftId: c.id,
    rightId: org.id,
    role: "agency",
  });
  await login(page);
  await page.goto(`/recruitments/${c.id}`);
  const section = relations(page);
  await section
    .getByRole("button", { name: `Odłącz ${org.name}`, exact: true })
    .click();
  let lose = true;
  await page.route("**/catalog/commands", async (route) => {
    if (lose && route.request().method() === "POST") {
      lose = false;
      const actual = await route.fetch();
      expect(actual.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await section
    .getByRole("button", { name: "Potwierdź odłączenie", exact: true })
    .click();
  await expect(section.getByRole("alert")).toContainText(
    "Wynik zapisu jest nieznany",
  );
  const nav = section.getByRole("navigation", {
    name: "Strony powiązań",
    exact: true,
  });
  await expect(
    nav.getByRole("button", { name: "Następna strona", exact: true }),
  ).toBeDisabled();
  await expect(
    section.getByRole("button", { name: "Powiąż z firmą", exact: true }),
  ).toBeDisabled();
  await section
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(
    section.getByRole("link", { name: org.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Powiąż z firmą", exact: true }),
  ).toBeEnabled();
});
for (const width of [1440, 1024, 768, 375])
  test(`DEC058 ${width}px names/XSS render as text, form and focus remain usable without horizontal overflow`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const name = `<img src=x onerror=alert(1)> ${"Syntetyczne".repeat(10)} ${width}`;
    await newProfile(page, "contact", name);
    await page
      .getByRole("button", { name: "Zapisz profil", exact: true })
      .click();
    await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    await page
      .getByRole("button", { name: "Edytuj profil", exact: true })
      .click();
    await page.getByLabel("Nazwa kontaktu", { exact: true }).focus();
    await expect(
      page.getByLabel("Nazwa kontaktu", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("E-mail (opcjonalnie)", { exact: true }),
    ).toBeFocused();
    const dimensions = await page.evaluate(() => ({
      inner: innerWidth,
      scroll: document.documentElement.scrollWidth,
      visual: visualViewport?.width,
    }));
    expect(dimensions.inner).toBe(width);
    expect(dimensions.scroll).toBeLessThanOrEqual(width);
    expect(dimensions.visual).toBe(width);
    await page.screenshot({
      path: testInfo.outputPath(`cc-form-${width}.png`),
      fullPage: true,
    });
  });
