/** Calendar Core: production HTTPS, real identity and owned disposable data. */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  readRecruitmentTarget,
  type RecruitmentTarget,
} from "../../scripts/recruitment/target.ts";
import { account, type Account } from "../integration/auth/fixtures.ts";

test.use({ timezoneId: "Europe/Warsaw" });

let target: RecruitmentTarget;
let user: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("Calendar browser requires a guarded disposable target");
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

for (const width of [375, 768, 1024, 1440]) {
  test(`planned event with unknown hour persists without claiming attendance at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto(`${target.appOrigin}/calendar`);
    await expect(
      page.getByRole("heading", { name: "Kalendarz", exact: true, level: 1 }),
    ).toBeVisible();
    const addButton = page.getByRole("button", {
      name: "Dodaj wydarzenie",
      exact: true,
    });
    await addButton.focus();
    await page.keyboard.press("Enter");
    const titleField = page.getByLabel("Tytuł wydarzenia", { exact: true });
    await expect(titleField).toBeVisible();
    for (
      let i = 0;
      i < 80 &&
      !(await titleField.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(titleField).toBeFocused();
    const title = `Rozmowa QA ${randomUUID()}`;
    await titleField.fill(title);
    await page.getByLabel("Data", { exact: true }).fill("2099-05-15");
    await page
      .getByLabel("Strefa czasowa", { exact: true })
      .fill("Europe/Warsaw");
    await expect(page.getByLabel(/^Godzina \(opcjonalna/)).toHaveValue("");
    await page
      .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
      .click();
    const event = page.getByRole("article", { name: title, exact: true });
    await expect(event).toBeVisible();
    await page.reload();
    await expect(event).toBeVisible();
    await expect(event).not.toContainText("Odbyte");
    await expect(event).not.toContainText("00:00");
    await page.goto(`${target.appOrigin}/dashboard`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.goto(`${target.appOrigin}/calendar`);
    await event
      .getByRole("button", { name: "Przełóż termin", exact: true })
      .click();
    await event.getByLabel("Data", { exact: true }).fill("2099-05-16");
    await event
      .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
      .click();
    await expect(event).toContainText("2099-05-16");
    await expect(event).not.toContainText("Odbyte");
    await event
      .getByRole("button", { name: "Pokaż historię wydarzenia", exact: true })
      .click();
    const history = event.getByRole("region", { name: "Historia wydarzenia" });
    await expect(history).toContainText("2099-05-15");
    await expect(history).toContainText("2099-05-16");
    await event
      .getByRole("button", { name: "Rozlicz wydarzenie", exact: true })
      .click();
    await event
      .getByLabel("Wynik", { exact: true })
      .selectOption("not_occurred");
    await event
      .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
      .click();
    await expect(event).toContainText("Nieodbyte");
  });
}
