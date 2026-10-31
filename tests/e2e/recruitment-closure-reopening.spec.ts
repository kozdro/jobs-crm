/** DEC-057: actual production HTTPS UI; all setup uses synthetic own Auth fixtures. */
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
  if (!id) throw new Error("3C browser requires guarded disposable target");
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
async function fixture(applied = false) {
  const { client } = await sdkLogin(target, a);
  const title = `3C browser ${randomUUID()}`;
  const result = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(result.error).toBeNull();
  const id = result.data.case.id as string;
  if (applied) {
    const fact = await client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: id,
      p_kind: "application",
      p_direction: null,
      p_occurred_on: "2000-01-01",
    });
    expect(fact.error).toBeNull();
  }
  return { client, id, title };
}
const history = (page: Page) =>
  page.getByRole("region", { name: "Historia sprawy", exact: true });
const closeTrigger = (page: Page) =>
  page.getByRole("button", { name: "Zakończ sprawę", exact: true });
const reopenTrigger = (page: Page) =>
  page.getByRole("button", { name: "Wznów sprawę", exact: true });
const previewButton = (page: Page) =>
  page.getByRole("button", { name: "Pokaż podgląd zmian", exact: true });
async function openClose(page: Page, outcome = "Inny") {
  await closeTrigger(page).click();
  await expect(
    page.getByRole("heading", { name: "Zakończenie sprawy", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: outcome });
}
async function confirm(
  page: Page,
  action: "close" | "reopen" | "correct" = "close",
) {
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  const labels = {
    close: "Potwierdzam zakończenie sprawy i wskazany wynik.",
    reopen: "Potwierdzam wznowienie tej samej sprawy i pokazany stan.",
    correct:
      "Potwierdzam korektę zakończenia i zachowanie jego oryginału w audycie.",
  };
  await page
    .getByRole("checkbox", { name: labels[action], exact: true })
    .check();
  const names = {
    close: "Zatwierdź zakończenie",
    reopen: "Zatwierdź wznowienie",
    correct: "Zatwierdź korektę zakończenia",
  };
  await page.getByRole("button", { name: names[action], exact: true }).click();
}
async function close(page: Page, outcome = "Inny") {
  await openClose(page, outcome);
  await confirm(page);
  await expect(reopenTrigger(page)).toBeVisible();
}
async function reopen(page: Page) {
  await reopenTrigger(page).click();
  await confirm(page, "reopen");
  await expect(closeTrigger(page)).toBeVisible();
}
async function lifecycleRows(c: Awaited<ReturnType<typeof fixture>>) {
  const result = await c.client
    .from("recruitment_case_lifecycle")
    .select("*")
    .eq("case_id", c.id)
    .order("recorded_at");
  expect(result.error).toBeNull();
  return result.data ?? [];
}
async function revisionRows(c: Awaited<ReturnType<typeof fixture>>) {
  const result = await c.client
    .from("recruitment_closure_revision")
    .select("*")
    .eq("case_id", c.id);
  expect(result.error).toBeNull();
  return result.data ?? [];
}

test("DEC057 close has no default outcome, preview is read-only and cancel returns focus without history", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await closeTrigger(page).click();
  await expect(
    page.getByLabel("Wynik zakończenia", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(closeTrigger(page)).toBeFocused();
  expect(await lifecycleRows(c)).toHaveLength(0);
  await openClose(page);
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  expect(await lifecycleRows(c)).toHaveLength(0);
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page
    .getByRole("button", { name: "Potwierdź porzucenie", exact: true })
    .click();
  await expect(closeTrigger(page)).toBeFocused();
  expect(await lifecycleRows(c)).toHaveLength(0);
});

test("DEC057 close/reopen/close retains both results, unknown day and list/detail access after reload", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await close(page, "Odmowa firmy");
  const first = (await lifecycleRows(c))[0];
  expect(first.occurred_on).toBeNull();
  await reopen(page);
  await close(page, "Nie aplikowano");
  const rows = await lifecycleRows(c);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toEqual(first);
  await page.reload();
  await expect(reopenTrigger(page)).toBeVisible();
  await expect(history(page)).toContainText("Odmowa firmy");
  await expect(history(page)).toContainText("Nie aplikowano");
  await page.goto(`${target.appOrigin}/recruitments`);
  await page.getByRole("link", { name: c.title, exact: true }).click();
  await expect(reopenTrigger(page)).toBeVisible();
});

test("DEC057 historical application blocks Not applied only in its own cycle", async ({
  page,
}) => {
  const c = await fixture(true);
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await openClose(page, "Nie aplikowano");
  await previewButton(page).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await lifecycleRows(c)).toHaveLength(0);
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: "Odmowa firmy" });
  await confirm(page);
  await expect(reopenTrigger(page)).toBeVisible();
  await reopen(page);
  await close(page, "Nie aplikowano");
  expect(
    (await lifecycleRows(c)).filter((row) => row.kind === "close"),
  ).toHaveLength(2);
});

test("DEC057 offer outcome requires explicit factual offer confirmation", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await openClose(page, "Oferta przyjęta");
  const offered = page.getByRole("checkbox", {
    name: "Potwierdzam, że oferta rzeczywiście była.",
    exact: true,
  });
  await expect(offered).not.toBeChecked();
  await offered.check();
  await confirm(page);
  await expect(reopenTrigger(page)).toBeVisible();
  expect((await lifecycleRows(c))[0].offer_confirmed).toBe(true);
  const facts = await c.client
    .from("recruitment_case_event")
    .select("id")
    .eq("case_id", c.id);
  expect(facts.error).toBeNull();
  expect(facts.data).toHaveLength(0);
});

test("DEC057 correction keeps original, shows audit and adds no lifecycle activity", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await close(page, "Odmowa firmy");
  const original = (await lifecycleRows(c))[0];
  await history(page)
    .getByRole("button", { name: "Skoryguj zakończenie", exact: true })
    .click();
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: "Rezygnacja użytkownika" });
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2001-02-03");
  await confirm(page, "correct");
  await expect(history(page)).toContainText("Rezygnacja użytkownika");
  await expect(
    history(page).locator("time[datetime='2001-02-03']"),
  ).toBeVisible();
  expect(await lifecycleRows(c)).toEqual([original]);
  expect(await revisionRows(c)).toHaveLength(1);
  await history(page)
    .getByRole("button", { name: "Pokaż audyt zakończenia", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Audyt zakończenia", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Odmowa firmy", { exact: false }).last(),
  ).toBeVisible();
});

for (const width of [375, 768, 1024, 1440]) {
  test(`DEC057 closure/reopening keyboard and layout at ${width}px`, async ({
    page,
  }) => {
    const c = await fixture();
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
    await openClose(page, "Nie aplikowano");
    await expect(
      page.getByLabel("Wynik zakończenia", { exact: true }),
    ).toBeVisible();
    if (width === 375 || width === 1440)
      await page.screenshot({
        path: `.recruitment-local/${target.id}/3c-visual/closure-form-${width}.png`,
        fullPage: true,
      });
    await confirm(page);
    await expect(reopenTrigger(page)).toBeVisible();
    await reopenTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Wznowienie sprawy", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(reopenTrigger(page)).toBeFocused();
    const layout = await page.evaluate(() => ({
      inner: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(layout.inner).toBe(width);
    expect(layout.scroll).toBeLessThanOrEqual(width);
    expect(await lifecycleRows(c)).toHaveLength(1);
  });
}

test("DEC057 undelivered confirm survives reload and retries identical intent exactly once", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  let pending: unknown;
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (route.request().method() === "POST" && body?.action === "confirm") {
      pending = body;
      await route.abort("failed");
    } else await route.continue();
  });
  await openClose(page);
  await confirm(page);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(pending).toBeTruthy();
  expect(await lifecycleRows(c)).toHaveLength(0);
  await page.unroute("**/recruitments/lifecycle-commands");
  await page.reload();
  // The recovery UI must offer a same-intent retry, never create a replacement command.
  const retry = page.getByRole("button", {
    name: "Ponów wcześniejszy zapis cyklu",
    exact: true,
  });
  await expect(retry).toBeVisible();
  let retried: unknown;
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    if (route.request().method() === "POST")
      retried = route.request().postDataJSON();
    await route.continue();
  });
  await retry.click();
  await expect(reopenTrigger(page)).toBeVisible();
  expect(retried).toEqual(pending);
  expect(await lifecycleRows(c)).toHaveLength(1);
});

test("DEC057 BFF enforces Origin, bound owner and private no-store responses", async ({
  page,
}) => {
  const c = await fixture();
  const route = `${target.appOrigin}/recruitments/lifecycle-commands`;
  const command = {
    action: "preview",
    expectedUserId: a.id,
    caseId: c.id,
    operation: "close",
    closureId: null,
    outcome: "Inny",
    occurredOn: null,
    offerConfirmed: false,
  };
  const anonymous = await page.request.post(route, {
    headers: { Origin: target.appOrigin },
    data: command,
  });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["cache-control"]).toContain("no-store");
  await login(page);
  const crossSite = await page.request.post(route, {
    headers: { Origin: "https://untrusted.example.invalid" },
    data: command,
  });
  expect(crossSite.status()).toBe(403);
  const spoof = await page.request.post(route, {
    headers: { Origin: target.appOrigin },
    data: { ...command, expectedUserId: randomUUID() },
  });
  expect(spoof.status()).toBeGreaterThanOrEqual(400);
  expect(spoof.status()).toBeLessThan(500);
  const own = await page.request.post(route, {
    headers: { Origin: target.appOrigin },
    data: command,
  });
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect(own.headers()["cache-control"]).toContain("private");
  expect(await lifecycleRows(c)).toHaveLength(0);
});

test("DEC057 mixed facts/closures timeline paginates known and unknown days without losing or duplicating entries", async ({
  page,
}) => {
  const c = await fixture();
  for (let i = 0; i < 24; i++) {
    const fact = await c.client.rpc("record_recruitment_case_event", {
      p_request_id: randomUUID(),
      p_case_id: c.id,
      p_kind: "contact",
      p_direction: "inbound",
      p_occurred_on: i % 2 ? "2000-01-01" : null,
    });
    expect(fact.error).toBeNull();
  }
  const command = async (
    operation: string,
    outcome: string | null,
    occurredOn: string | null,
  ) => {
    const input = {
      p_case_id: c.id,
      p_operation: operation,
      p_closure_id: null,
      p_outcome: outcome,
      p_occurred_on: occurredOn,
      p_offer_confirmed: false,
    };
    const p = await c.client.rpc("preview_recruitment_case_lifecycle", input);
    expect(p.error).toBeNull();
    const result = await c.client.rpc("confirm_recruitment_case_lifecycle", {
      ...input,
      p_request_id: randomUUID(),
      p_expected_case_revision: p.data.caseRevision,
      p_expected_closure_revision: p.data.closureRevision,
    });
    expect(result.error).toBeNull();
  };
  await command("close", "Inny", "2001-02-03");
  await command("reopen", null, null);
  await command("close", "Nie aplikowano", null);
  await login(page);
  const getPage = async (number: number) => {
    const response = await page.request.get(
      `${target.appOrigin}/recruitments/lifecycle-commands?caseId=${c.id}&timeline=true&page=${number}&expectedUserId=${a.id}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    return (await response.json()) as {
      entries: (
        | { type: "fact"; fact: { id: string; occurred_on: string | null } }
        | {
            type: "lifecycle";
            entry: { id: string; occurred_on: string | null };
          }
      )[];
      hasMore: boolean;
    };
  };
  const first = await getPage(1),
    second = await getPage(2);
  expect(first.entries).toHaveLength(25);
  expect(first.hasMore).toBe(true);
  expect(second.entries).toHaveLength(2);
  expect(second.hasMore).toBe(false);
  const entries = [...first.entries, ...second.entries];
  const values = entries.map((row) =>
    row.type === "fact" ? row.fact : row.entry,
  );
  expect(new Set(values.map((row) => row.id)).size).toBe(27);
  expect(entries.filter((row) => row.type === "lifecycle")).toHaveLength(3);
  expect(values[0].occurred_on).toBe("2001-02-03");
  const firstUnknown = values.findIndex((row) => row.occurred_on === null);
  expect(firstUnknown).toBeGreaterThan(0);
  expect(
    values.slice(firstUnknown).every((row) => row.occurred_on === null),
  ).toBe(true);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await expect(history(page)).toContainText("Zakończono sprawę");
  await expect(history(page)).toContainText("Data zdarzenia nieznana");
});

test("DEC057 unavailable durable storage refuses POST; later committed lost response remains recoverable after abandonment", async ({
  page,
}) => {
  const c = await fixture();
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Reflect.set(window, "qa3cOriginalSetItem", original);
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("jobs-crm.lifecycle.pending"))
        throw new DOMException(
          "Synthetic 3C storage refusal",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
  });
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  const confirms: unknown[] = [];
  let deliver = false;
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    const body = route.request().postDataJSON() as { action?: string } | null;
    if (route.request().method() === "POST" && body?.action === "confirm") {
      confirms.push(body);
      if (deliver) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await response.dispose();
      }
      await route.abort("failed");
    } else await route.continue();
  });
  await openClose(page);
  await confirm(page);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Nie wysłano operacji.",
  );
  expect(confirms).toHaveLength(0);
  expect(await lifecycleRows(c)).toHaveLength(0);
  await page
    .getByRole("button", { name: "Wróć do danych", exact: true })
    .click();
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: "Rezygnacja użytkownika" });
  await page
    .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
    .fill("2001-02-03");
  await page.evaluate(() => {
    Storage.prototype.setItem = Reflect.get(
      window,
      "qa3cOriginalSetItem",
    ) as Storage["setItem"];
  });
  deliver = true;
  await previewButton(page).click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
  const consent = page.getByRole("checkbox", {
    name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
    exact: true,
  });
  await expect(consent).not.toBeChecked();
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  expect(confirms).toHaveLength(0);
  await consent.check();
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  expect(confirms).toHaveLength(1);
  expect(confirms[0]).toMatchObject({
    outcome: "Rezygnacja użytkownika",
    occurredOn: "2001-02-03",
  });
  await expect.poll(async () => (await lifecycleRows(c)).length).toBe(1);
  const pending = await page.evaluate(
    (caseId) =>
      JSON.parse(
        sessionStorage.getItem(`jobs-crm.lifecycle.pending.${caseId}`) ??
          "null",
      ),
    c.id,
  );
  expect(pending?.requestId).toBe(
    (confirms[0] as { requestId: string }).requestId,
  );
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page
    .getByRole("button", { name: "Potwierdź porzucenie", exact: true })
    .click();
  await page.getByRole("button", { name: /^(Zakończ|Wznów) sprawę$/ }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Najpierw sprawdź wynik",
  );
  expect(confirms).toHaveLength(1);
  await page.unroute("**/recruitments/lifecycle-commands");
  await page.reload();
  await page
    .getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(reopenTrigger(page)).toBeVisible();
  expect(await lifecycleRows(c)).toHaveLength(1);
});
