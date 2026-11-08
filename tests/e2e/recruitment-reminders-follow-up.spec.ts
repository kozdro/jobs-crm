/** DEC-063: explicit reminder and suggestion UI, using synthetic data only. */
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
let user: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("DEC-063 browser requires a guarded disposable target");
  target = await readRecruitmentTarget(id);
});
test.beforeEach(async () => {
  user = await account(target);
});
async function login(page: Page) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}

test("reminder requires explicit date and timezone, survives reload, and acknowledgement persists", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `Przypomnienie QA ${randomUUID()}`;
  const created = await client.rpc("execute_recruitment_task_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      title,
      description: null,
      dueOn: "2099-01-01",
      caseId: null,
    },
  });
  expect(created.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  const task = page.getByRole("article", { name: title, exact: true });
  const section = task.getByRole("region", { name: `Przypomnienie: ${title}` });
  await expect(section).toContainText(
    "Przypomnienie wyłączone lub nieustawione.",
  );
  await section
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await expect(section.getByLabel("Data przypomnienia")).toHaveValue("");
  await expect(section.getByLabel("Godzina przypomnienia")).toHaveValue("");
  await expect(section.getByLabel("Strefa IANA")).toHaveValue("");
  await section.getByLabel("Data przypomnienia").fill("2001-01-01");
  await section.getByLabel("Godzina przypomnienia").fill("12:00");
  await section.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await section
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  await expect(section).toContainText("2001-01-01");
  await page.reload();
  await expect(section).toContainText("2001-01-01");
  await page.goto(`${target.appOrigin}/dashboard`);
  const reminders = page.getByRole("region", { name: "Aktywne przypomnienia" });
  await expect(reminders.getByText(title, { exact: false })).toBeVisible();
  await reminders
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  await expect(reminders.getByText(title, { exact: false })).toHaveCount(0);
  await expect(reminders.getByRole("status")).toHaveText("Zapisano.");
  await page.reload();
  await expect(reminders.getByText(title, { exact: false })).toHaveCount(0);
});

test("task reminders share their read and announce pending and success", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const titles = Array.from(
    { length: 3 },
    () => `Wspólny odczyt QA ${randomUUID()}`,
  );
  for (const title of titles) {
    const result = await client.rpc("execute_recruitment_task_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create",
        title,
        description: null,
        dueOn: null,
        caseId: null,
      },
    });
    expect(result.error).toBeNull();
  }
  await login(page);
  // Close the dashboard document before counting reads for the tasks screen.
  await page.goto("about:blank");
  let reads = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/reminders/commands**", async (route) => {
    if (route.request().method() === "GET") reads += 1;
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await page.goto(`${target.appOrigin}/tasks`);
  for (const title of titles) {
    await expect(
      page.getByRole("region", { name: `Przypomnienie: ${title}` }),
    ).toContainText("Przypomnienie wyłączone lub nieustawione.");
  }
  expect(reads).toBeLessThanOrEqual(2);
  const section = page.getByRole("region", {
    name: `Przypomnienie: ${titles[0]}`,
  });
  await section
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await section.getByLabel("Data przypomnienia").fill("2099-01-01");
  await section.getByLabel("Godzina przypomnienia").fill("12:00");
  await section.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await section
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Zapisywanie…" }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("status").filter({ hasText: "Zapisano." }),
  ).toBeVisible();
  await expect(section).toContainText("2099-01-01");
});

test("follow-up needs explicit rule and dismissal persists without creating a task", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `Follow-up QA ${randomUUID()}`;
  const created = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(created.error).toBeNull();
  const caseId = created.data.case.id as string;
  const contact = await client.rpc("record_manual_recruitment_contact", {
    p_request_id: randomUUID(),
    p_case_id: caseId,
    p_direction: "outbound",
    p_occurred_on: "2001-01-01",
  });
  expect(contact.error).toBeNull();
  await login(page);
  const suggestions = page.getByRole("region", { name: "Sugestie follow-up" });
  await expect(suggestions.getByText(title, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await expect(page.getByLabel("Odstęp w dniach")).toHaveValue("");
  await expect(page.getByLabel("Strefa odniesienia IANA")).toHaveValue("");
  await page.getByLabel("Odstęp w dniach").fill("3");
  await page.getByLabel("Strefa odniesienia IANA").fill("Europe/Warsaw");
  await page
    .getByRole("button", { name: "Zapisz regułę", exact: true })
    .click();
  const row = suggestions.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  expect(
    await client.from("recruitment_task").select("id").eq("case_id", caseId),
  ).toMatchObject({ data: [], error: null });
  await row
    .getByRole("button", { name: "Odrzuć sugestię", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(suggestions.getByText(title, { exact: true })).toHaveCount(0);
  expect(
    await client.from("recruitment_task").select("id").eq("case_id", caseId),
  ).toMatchObject({ data: [], error: null });
});

test("uncertain result retains the same intent across SPA navigation and retry", async ({
  page,
}) => {
  await login(page);
  const seen: unknown[] = [];
  await page.route("**/reminders/commands", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    seen.push(route.request().postDataJSON());
    if (seen.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await page.getByLabel("Odstęp w dniach").fill("7");
  await page.getByLabel("Strefa odniesienia IANA").fill("Europe/Warsaw");
  await page
    .getByRole("button", { name: "Zapisz regułę", exact: true })
    .click();
  await expect(
    page.getByText(/Wynik zapisu jest nieznany/).first(),
  ).toBeVisible();
  const pendingId = (seen[0] as { requestId: string }).requestId;
  expect(
    await page.evaluate(
      (value) =>
        `${JSON.stringify(localStorage)} ${JSON.stringify(sessionStorage)}`.includes(
          value,
        ),
      pendingId,
    ),
  ).toBe(false);
  await page
    .getByRole("link", { name: "Zadania", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page
    .getByRole("button", { name: "Ponów ten sam zapis", exact: true })
    .first()
    .click();
  await expect.poll(() => seen.length).toBe(2);
  expect(seen[1]).toEqual(seen[0]);
  await expect(page.getByText(/Wynik zapisu jest nieznany/)).toHaveCount(0);
  await page.goto(`${target.appOrigin}/dashboard`);
  await expect(page.getByText("Włączona: 7 dni, Europe/Warsaw.")).toBeVisible();
});

test("unsaved reminder and rule forms retain values when discard is cancelled", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `Niezapisany formularz QA ${randomUUID()}`;
  const created = await client.rpc("execute_recruitment_task_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      title,
      description: null,
      dueOn: null,
      caseId: null,
    },
  });
  expect(created.error).toBeNull();
  await login(page);
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await page.getByLabel("Odstęp w dniach").fill("7");
  await page.getByLabel("Strefa odniesienia IANA").fill("Europe/Warsaw");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Zamknij ustawienia reguły", exact: true })
    .click();
  await expect(page.getByLabel("Odstęp w dniach")).toHaveValue("7");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("link", { name: "Zadania", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("Strefa odniesienia IANA")).toHaveValue(
    "Europe/Warsaw",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("link", { name: "Zadania", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/tasks$/);
  const section = page.getByRole("region", { name: `Przypomnienie: ${title}` });
  await section
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await section.getByLabel("Data przypomnienia").fill("2099-01-01");
  page.once("dialog", (dialog) => dialog.dismiss());
  await section
    .getByRole("button", { name: "Zamknij konfigurację", exact: true })
    .click();
  await expect(section.getByLabel("Data przypomnienia")).toHaveValue(
    "2099-01-01",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await section
    .getByRole("button", { name: "Zamknij konfigurację", exact: true })
    .click();
  await expect(section.getByLabel("Data przypomnienia")).toHaveCount(0);
});

test("draft survives browser history when Navigation API is absent", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "navigation", {
      value: undefined,
      configurable: true,
    });
  });
  await login(page);
  await page
    .getByRole("link", { name: "Zadania", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page
    .getByRole("link", { name: "Dashboard", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await page.getByLabel("Odstęp w dniach").fill("9");
  await page.getByLabel("Strefa odniesienia IANA").fill("Europe/Warsaw");
  await page.goBack();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("Odstęp w dniach")).toHaveValue("9");
  await expect(page.getByLabel("Strefa odniesienia IANA")).toHaveValue(
    "Europe/Warsaw",
  );
});

test("private draft stays out of browser storage and is lost on reload", async ({
  page,
}) => {
  await login(page);
  const marker = `Private-QA-${randomUUID()}`;
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await page.getByLabel("Odstęp w dniach").fill("7");
  await page.getByLabel("Strefa odniesienia IANA").fill(marker);
  const stored = await page.evaluate(async (needle) => {
    const values = [
      JSON.stringify(localStorage),
      JSON.stringify(sessionStorage),
    ];
    if (typeof indexedDB.databases !== "function")
      throw new Error("IndexedDB inspection unavailable");
    for (const database of await indexedDB.databases()) {
      if (!database.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const name of Array.from(db.objectStoreNames)) {
        const result = await new Promise<unknown[]>((resolve, reject) => {
          const request = db
            .transaction(name, "readonly")
            .objectStore(name)
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        values.push(JSON.stringify(result));
      }
      db.close();
    }
    return values.some((value) => value.includes(needle));
  }, marker);
  expect(stored).toBe(false);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await expect(page.getByLabel("Odstęp w dniach")).toHaveValue("");
  await expect(page.getByLabel("Strefa odniesienia IANA")).toHaveValue("");
});

test("logout and next owner do not inherit an in-memory private rule draft", async ({
  page,
}) => {
  const other = await account(target);
  await login(page);
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await page.getByLabel("Odstęp w dniach").fill("17");
  await page.getByLabel("Strefa odniesienia IANA").fill("Europe/Warsaw");
  await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("menuitem", { name: "Twoje konto", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("E-mail", { exact: true }).fill(other.email);
  await page.getByLabel("Hasło", { exact: true }).fill(other.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Ustaw regułę", exact: true }).click();
  await expect(page.getByLabel("Odstęp w dniach")).toHaveValue("");
  await expect(page.getByLabel("Strefa odniesienia IANA")).toHaveValue("");
  await expect(page.getByText(/Wynik zapisu jest nieznany/)).toHaveCount(0);
});
