/** AC-TN-005 / DEC-063: owner chooses the channel for one reminder. */
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
  await expect(email).toContainText("Kanał e-mail: włączony.");
  await page.reload();
  await expect(email).toContainText("Kanał e-mail: włączony.");
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
  await expect(email).toContainText("Kanał e-mail: włączony.");
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
