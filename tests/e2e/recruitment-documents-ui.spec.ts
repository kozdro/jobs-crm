/** Documents UI against the guarded disposable Supabase target and real Storage. */
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
let owner: Account;
test.beforeAll(async () => {
  const targetId = process.env.RECRUITMENT_TARGET_ID;
  if (!targetId)
    throw new Error("Documents browser requires a guarded disposable target");
  target = await readRecruitmentTarget(targetId);
  owner = await account(target);
});
async function login(page: Page) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(owner.email);
  await page.getByLabel("Hasło", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}
async function createCase() {
  const { client } = await sdkLogin(target, owner);
  const { data, error } = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: `Dokumenty QA ${randomUUID()}`,
  });
  expect(error).toBeNull();
  return data.case.id as string;
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
]) {
  test(`real document upload, reuse and deletion preview at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const caseId = await createCase();
    const name = `CV QA ${randomUUID()}`;
    await login(page);
    await page.goto(`${target.appOrigin}/documents`);
    const library = page.getByRole("region", { name: "Biblioteka dokumentów" });
    const add = library.getByRole("button", {
      name: "Dodaj dokument",
      exact: true,
    });
    await add.focus();
    await page.keyboard.press("Enter");
    await library.getByLabel("Plik", { exact: true }).setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic QA document\n", "utf8"),
    });
    await library.getByLabel("Nazwa dokumentu").fill(name);
    await library.getByLabel("To jest CV").check();
    await library
      .getByRole("button", { name: "Dodaj plik", exact: true })
      .click();
    const item = library
      .locator("li")
      .filter({ has: page.getByRole("heading", { name }) })
      .first();
    await expect(item).toContainText("Wersja 1");
    await expect(item).toContainText("Dostępna");
    const downloadPromise = page.waitForEvent("download");
    await item.getByRole("link", { name: "Pobierz" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(
      Buffer.from("Synthetic QA document\n", "utf8"),
    );
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
    const linkedItem = panel
      .locator("li")
      .filter({ has: page.getByRole("heading", { name }) })
      .first();
    await linkedItem.getByRole("button", { name: "Dołącz do sprawy" }).click();
    await expect(
      panel.getByRole("status").filter({ hasText: "Nie oznacza to wysłania" }),
    ).toBeVisible();
    await linkedItem.getByRole("button", { name: "Usuń treść wersji" }).click();
    const preview = panel.getByRole("group", {
      name: "Potwierdź usunięcie treści",
    });
    await expect(
      preview.getByRole("heading", { name: "Potwierdź usunięcie treści" }),
    ).toBeFocused();
    await expect(preview).toContainText("Powiązane sprawy: 1");
    await expect(
      preview.getByRole("button", { name: "Usuń treść", exact: true }),
    ).toBeDisabled();
    await preview.getByRole("button", { name: "Anuluj" }).click();
    await expect(
      linkedItem.getByRole("link", { name: "Pobierz" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("both case upload paths and an atomic application with two actual CV versions", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const caseId = await createCase();
  const names = [
    `Prywatne CV ${randomUUID()}`,
    `Biblioteczne CV ${randomUUID()}`,
  ];
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
  for (const [index, trigger] of [
    "Dodaj plik tylko do sprawy",
    "Dodaj do biblioteki i sprawy",
  ].entries()) {
    await panel.getByRole("button", { name: trigger }).click();
    await panel.getByLabel("Plik", { exact: true }).setInputFiles({
      name: `synthetic-${index}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`Synthetic CV ${index}\n`),
    });
    await panel.getByLabel("Nazwa dokumentu").fill(names[index]);
    await panel.getByLabel("To jest CV").check();
    await panel
      .getByRole("button", { name: "Dodaj plik", exact: true })
      .click();
    await expect(
      panel.getByRole("heading", { name: names[index] }),
    ).toBeVisible();
  }
  const actions = page.getByRole("region", { name: "Działania w sprawie" });
  await actions
    .getByRole("button", { name: "Zarejestruj aplikowanie" })
    .click();
  await actions.getByLabel(new RegExp(names[0])).check();
  await actions.getByLabel(new RegExp(names[1])).check();
  await actions
    .getByLabel("Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.")
    .check();
  await actions.getByRole("button", { name: "Zapisz zdarzenie" }).click();
  await expect(actions.getByRole("status")).toContainText(
    "Zdarzenie zostało zapisane.",
  );
  const application = page
    .locator("li")
    .filter({ hasText: "Zarejestrowano aplikowanie" })
    .first();
  await expect(application).toContainText(names[0]);
  await expect(application).toContainText(names[1]);
  await page.goto(`${target.appOrigin}/documents`);
  await expect(page.getByRole("heading", { name: names[1] })).toBeVisible();
  await expect(page.getByRole("heading", { name: names[0] })).toHaveCount(0);
  const library = page.getByRole("region", { name: "Biblioteka dokumentów" });
  const document = library
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: names[1] }) })
    .first();
  await document.getByRole("button", { name: "Dodaj wersję" }).click();
  await library.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-new.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic second version\n"),
  });
  await library
    .getByRole("button", { name: "Dodaj plik", exact: true })
    .click();
  await expect(document).toContainText("Wersja 2");
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const historicalApplication = page
    .locator("li")
    .filter({ hasText: "Zarejestrowano aplikowanie" })
    .first();
  await expect(historicalApplication).toContainText(`${names[1]} — wersja 1`);
  await expect(
    historicalApplication.locator("li").filter({
      has: page.getByText(`${names[1]} — wersja 2`, { exact: true }),
    }),
  ).toHaveCount(0);
  const reference = historicalApplication
    .locator("li")
    .filter({ hasText: `${names[1]} — wersja 1` })
    .first();
  await reference.getByRole("button", { name: "Skoryguj wskazanie" }).click();
  await reference
    .getByLabel("Poprawna wersja")
    .selectOption({ label: `${names[1]} — wersja 2` });
  await reference.getByRole("button", { name: "Zapisz korektę" }).click();
  await expect(historicalApplication).toContainText(`${names[1]} — wersja 2`);
  const caseDocument = page
    .getByRole("region", { name: "Dokumenty sprawy" })
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: names[1] }) })
    .first();
  const version2 = caseDocument
    .locator("li")
    .filter({ hasText: "Wersja 2" })
    .first();
  const downloadHref = await version2
    .getByRole("link", { name: "Pobierz" })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();
  await version2.getByRole("button", { name: "Usuń treść wersji" }).click();
  const confirmation = page.getByRole("group", {
    name: "Potwierdź usunięcie treści",
  });
  await expect(confirmation).toContainText("Powiązane fakty aplikowania");
  await confirmation
    .getByLabel("Potwierdzam usunięcie treści w przedstawionym zakresie.")
    .check();
  await confirmation
    .getByRole("button", { name: "Usuń treść", exact: true })
    .click();
  await expect(
    page.getByText(
      "Rozpoczęto usuwanie. Fizyczna kasacja wymaga potwierdzenia.",
    ),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        return page.evaluate(
          async ({ caseId, ownerId }) => {
            const response = await fetch(
              `/documents/data?caseId=${encodeURIComponent(caseId)}`,
              { cache: "no-store", headers: { "x-expected-user-id": ownerId } },
            );
            if (!response.ok) return false;
            const body = await response.json();
            return (
              Array.isArray(body.sent) &&
              body.sent.some(
                (ref: { versionNumber: number; status: string }) =>
                  ref.versionNumber === 2 && ref.status === "deleted",
              )
            );
          },
          { caseId, ownerId: owner.id },
        );
      },
      { timeout: 90000, intervals: [1000, 2000] },
    )
    .toBe(true);
  await page.reload();
  await expect(historicalApplication).toContainText(
    "Wysłana wersja 2 — treść usunięta",
  );
  await expect(historicalApplication).not.toContainText("synthetic-new.txt");
  expect(
    (await page.request.get(`${target.appOrigin}${downloadHref}`)).status(),
  ).toBe(404);
  const eventElementId = await historicalApplication.getAttribute("id");
  expect(eventElementId).toMatch(/^history-entry-/);
  const eventId = eventElementId!.replace(/^history-entry-/, "");
  const audit = await page.request.get(
    `${target.appOrigin}/documents/audit?eventId=${eventId}`,
    { headers: { "x-expected-user-id": owner.id } },
  );
  expect(audit.status()).toBe(200);
  const auditBody = await audit.json();
  const adds = auditBody.entries.filter(
    (entry: { kind: string; versionNumber: number }) =>
      entry.kind === "sent-add" && entry.versionNumber === 1,
  );
  expect(
    new Set(adds.map((entry: { versionId: string }) => entry.versionId)).size,
  ).toBe(2);
  expect(auditBody.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "sent-correct",
        versionId: downloadHref!.split("/").at(-1),
        versionNumber: 2,
        availability: "deleted",
      }),
    ]),
  );
  expect(JSON.stringify(auditBody)).not.toContain("synthetic-new.txt");
  const deletedReference = historicalApplication
    .locator("li")
    .filter({ hasText: "Wysłana wersja 2 — treść usunięta" })
    .first();
  await expect(deletedReference).toContainText(
    "Wysłana wersja 2 — treść usunięta",
  );
  await deletedReference
    .getByRole("button", { name: "Skoryguj wskazanie" })
    .click();
  await deletedReference
    .getByLabel("Poprawna wersja")
    .selectOption({ label: `${names[1]} — wersja 1` });
  await deletedReference
    .getByRole("button", { name: "Zapisz korektę" })
    .click();
  const correctedReference = historicalApplication
    .locator("li")
    .filter({ has: page.getByText(`${names[1]} — wersja 1`, { exact: true }) })
    .first();
  await expect(correctedReference).toContainText(`${names[1]} — wersja 1`);
  await correctedReference
    .getByRole("button", { name: "Wycofaj wskazanie" })
    .click();
  await correctedReference
    .getByRole("button", { name: "Potwierdź wycofanie" })
    .click();
  await expect(historicalApplication).toContainText("wskazanie wycofane");
  const auditAfterWithdrawal = await page.request.get(
    `${target.appOrigin}/documents/audit?eventId=${eventId}`,
    { headers: { "x-expected-user-id": owner.id } },
  );
  expect(auditAfterWithdrawal.status()).toBe(200);
  const withdrawalBody = await auditAfterWithdrawal.json();
  expect(withdrawalBody.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "sent-withdraw", versionNumber: 1 }),
    ]),
  );
  expect(JSON.stringify(withdrawalBody)).not.toContain("synthetic-new.txt");
});
