/** AC-TN-005 / DEC-063: owner chooses the channel for one reminder. */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
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
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("Email reminder browser test requires an owned target");
  target = await readRecruitmentTarget(id);
});

async function login(page: Page, user: Account) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}

test("email stays off until explicit consent, survives reload, and can be disabled", async ({
  page,
}) => {
  const user = await account(target);
  const { client } = await sdkLogin(target, user);
  const title = `Syntetyczne zadanie ${randomUUID()}`;
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
  let emailWrites = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/reminders/email" &&
      request.method() === "POST"
    )
      emailWrites++;
  });
  await login(page, user);
  await page.goto(`${target.appOrigin}/tasks`);
  const reminder = page.getByRole("region", {
    name: `Przypomnienie: ${title}`,
  });
  await reminder
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await reminder.getByLabel("Data przypomnienia").fill("2099-01-01");
  await reminder.getByLabel("Godzina przypomnienia").fill("12:00");
  await reminder.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await reminder
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  const email = reminder.getByRole("region", { name: "Przypomnienie e-mail" });
  await expect(email).toContainText("Kanał e-mail: wyłączony.");
  await expect(email).toContainText(user.email);
  expect(emailWrites).toBe(0);
  await email
    .getByRole("button", {
      name: "Włącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  await expect(email).toContainText("oczekuje na wysyłkę");
  await page.reload();
  await expect(email).toContainText("oczekuje na wysyłkę");
  await email
    .getByRole("button", {
      name: "Wyłącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  await expect(email).toContainText("Kanał e-mail: wyłączony.");
  await page.reload();
  await expect(email).toContainText("Kanał e-mail: wyłączony.");
});

test("switching accounts removes the previous owner's reminder and email address", async ({
  page,
}) => {
  const owner = await account(target);
  const other = await account(target);
  const { client } = await sdkLogin(target, owner);
  const title = `Prywatne zadanie ${randomUUID()}`;
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
  await login(page, owner);
  await page.goto(`${target.appOrigin}/tasks`);
  const reminder = page.getByRole("region", {
    name: `Przypomnienie: ${title}`,
  });
  await reminder
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await reminder.getByLabel("Data przypomnienia").fill("2099-01-01");
  await reminder.getByLabel("Godzina przypomnienia").fill("12:00");
  await reminder.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await reminder
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  const email = reminder.getByRole("region", { name: "Przypomnienie e-mail" });
  await expect(email).toContainText(owner.email);
  await email
    .getByRole("button", {
      name: "Włącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  await expect(email).toContainText("oczekuje na wysyłkę");
  await page.goto(`${target.appOrigin}/account`);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, other);
  await page.goto(`${target.appOrigin}/tasks`);
  await expect(page.getByText(title, { exact: false })).toHaveCount(0);
  await expect(page.getByText(owner.email, { exact: false })).toHaveCount(0);
});

test("terminal transport states are described without claiming delivery", async ({
  page,
}) => {
  const user = await account(target);
  const { client } = await sdkLogin(target, user);
  const title = `Syntetyczny status ${randomUUID()}`;
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
  await login(page, user);
  await page.goto(`${target.appOrigin}/tasks`);
  const reminder = page.getByRole("region", {
    name: `Przypomnienie: ${title}`,
  });
  await reminder
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await reminder.getByLabel("Data przypomnienia").fill("2099-01-01");
  await reminder.getByLabel("Godzina przypomnienia").fill("12:00");
  await reminder.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await reminder
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  const email = reminder.getByRole("region", { name: "Przypomnienie e-mail" });
  await email
    .getByRole("button", {
      name: "Włącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  await expect(email).toContainText("oczekuje na wysyłkę");
  const db = postgres({ ...target.db, max: 1 });
  try {
    for (const [state, label] of [
      ["accepted", "przyjęty przez dostawcę"],
      ["unknown", "wynik wysyłki nieustalony"],
      ["expired", "pominięty z powodu opóźnienia"],
      ["failed", "wysyłka nie powiodła się"],
    ] as const) {
      const changed =
        await db`update email_reminder.intent set state=${state}, enabled=false, terminal_at=clock_timestamp() where owner_id=${user.id}::uuid returning id`;
      expect(changed).toHaveLength(1);
      await page.reload();
      await expect(email).toContainText(label);
      await expect(
        email.getByRole("button", {
          name: "Włącz e-mail dla przypomnienia",
          exact: true,
        }),
      ).toHaveCount(0);
    }
  } finally {
    await db.end();
  }
});

test("address changed after display rejects stale consent and retains the 409 alert", async ({
  page,
}) => {
  const user = await account(target);
  const { client } = await sdkLogin(target, user);
  const title = `Syntetyczna zgoda ${randomUUID()}`;
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
  await login(page, user);
  await page.goto(`${target.appOrigin}/tasks`);
  const reminder = page.getByRole("region", {
    name: `Przypomnienie: ${title}`,
  });
  await reminder
    .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
    .click();
  await reminder.getByLabel("Data przypomnienia").fill("2099-01-01");
  await reminder.getByLabel("Godzina przypomnienia").fill("12:00");
  await reminder.getByLabel("Strefa IANA").fill("Europe/Warsaw");
  await reminder
    .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
    .click();
  const email = reminder.getByRole("region", { name: "Przypomnienie e-mail" });
  await expect(email).toContainText(user.email);
  const changedEmail = `changed-${randomUUID()}@example.invalid`;
  const update = await fetch(
    `${target.apiUrl}/auth/v1/admin/users/${user.id}`,
    {
      method: "PUT",
      headers: {
        apikey: target.serviceRoleKey,
        Authorization: `Bearer ${target.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: changedEmail, email_confirm: true }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    },
  );
  expect(update.status).toBe(200);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/reminders/email" &&
      r.request().method() === "POST",
  );
  await email
    .getByRole("button", {
      name: "Włącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  expect((await response).status()).toBe(409);
  await expect(email).toContainText(changedEmail);
  await expect(email).toContainText("Kanał e-mail: wyłączony.");
  await expect(email.getByRole("alert")).toContainText(
    "Dane mogły się zmienić",
  );
  await email
    .getByRole("button", {
      name: "Włącz e-mail dla przypomnienia",
      exact: true,
    })
    .click();
  await expect(email).toContainText("oczekuje na wysyłkę");
});

for (const status of [401, 403] as const) {
  test(`uncertain write followed by ${status} on recovery returns to login without another POST`, async ({
    page,
  }) => {
    const user = await account(target);
    const { client } = await sdkLogin(target, user);
    const title = `Syntetyczny retry ${randomUUID()}`;
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
    await login(page, user);
    await page.goto(`${target.appOrigin}/tasks`);
    const reminder = page.getByRole("region", {
      name: `Przypomnienie: ${title}`,
    });
    await reminder
      .getByRole("button", { name: "Ustaw przypomnienie", exact: true })
      .click();
    await reminder.getByLabel("Data przypomnienia").fill("2099-01-01");
    await reminder.getByLabel("Godzina przypomnienia").fill("12:00");
    await reminder.getByLabel("Strefa IANA").fill("Europe/Warsaw");
    await reminder
      .getByRole("button", { name: "Potwierdź przypomnienie", exact: true })
      .click();
    const email = reminder.getByRole("region", {
      name: "Przypomnienie e-mail",
    });
    await expect(email).toContainText(user.email);
    let writes = 0;
    await page.route("**/reminders/email**", async (route) => {
      if (route.request().method() === "POST") {
        writes++;
        await route.abort("failed");
      } else if (writes > 0) {
        await route.fulfill({
          status,
          contentType: "application/json",
          body: "{}",
        });
      } else await route.continue();
    });
    await email
      .getByRole("button", {
        name: "Włącz e-mail dla przypomnienia",
        exact: true,
      })
      .click();
    await expect(email.getByRole("alert")).toContainText(
      "Wynik zapisu jest nieznany",
    );
    await email
      .getByRole("button", {
        name: "Sprawdź stan i ponów ten sam zapis",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/login/);
    expect(writes).toBe(1);
  });
}
