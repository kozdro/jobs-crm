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
  const sentAudit = historicalApplication
    .locator("details")
    .filter({
      has: page.getByText("Historia korekt dokumentu", { exact: true }),
    })
    .first();
  await sentAudit
    .getByText("Historia korekt dokumentu", { exact: true })
    .click();
  await expect(sentAudit).toContainText("Wskazano wysłaną wersję");
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
  // The sent-version command's errors must survive a successful data refresh.
  await page.route(
    "**/documents/permit",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    { times: 1 },
  );
  const failedPermitRefresh = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  await reference.getByRole("button", { name: "Zapisz korektę" }).click();
  await failedPermitRefresh;
  await expect(
    reference.getByLabel("Poprawna wersja").locator("option:checked"),
  ).toHaveText(`${names[1]} — wersja 2`);
  await expect(historicalApplication.getByRole("alert")).toContainText(
    "Wynik zapisu jest nieznany. Sprawdź stan przed ponowieniem.",
  );
  await page.route(
    "**/documents/commands",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: "{}",
      }),
    { times: 1 },
  );
  const failedCommandRefresh = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  await reference.getByRole("button", { name: "Zapisz korektę" }).click();
  await failedCommandRefresh;
  await expect(
    reference.getByLabel("Poprawna wersja").locator("option:checked"),
  ).toHaveText(`${names[1]} — wersja 2`);
  await expect(historicalApplication.getByRole("alert")).toContainText(
    "Wpis zmienił się. Odśwież stronę i ponownie sprawdź wybór.",
  );
  await historicalApplication
    .getByRole("button", { name: "Sprawdź wynik operacji" })
    .click();
  await expect(
    historicalApplication
      .getByRole("status")
      .filter({ hasText: "bezpiecznie anulowano" }),
  ).toBeVisible();
  await reference.getByRole("button", { name: "Zapisz korektę" }).click();
  await expect(historicalApplication).toContainText(`${names[1]} — wersja 2`);
  await expect(sentAudit).toContainText(
    "Skorygowano wskazanie wysłanej wersji — wersja 2",
  );
  // Hold an actual pre-delete response, then deliver it after the newer delete
  // response. The bytes come from the isolated backend, not a mocked payload.
  let releaseStale!: () => void;
  let staleCaptured!: () => void;
  let staleDelivered!: () => void;
  const staleGate = new Promise<void>((resolve) => (releaseStale = resolve));
  const captured = new Promise<void>((resolve) => (staleCaptured = resolve));
  const delivered = new Promise<void>((resolve) => (staleDelivered = resolve));
  let holdNext = true;
  await page.route("**/documents/data?*", async (route) => {
    if (!holdNext) return route.continue();
    holdNext = false;
    const response = await route.fetch();
    const body = await response.json();
    expect(JSON.stringify(body)).toContain("synthetic-new.txt");
    staleCaptured();
    await staleGate;
    await route.fulfill({ response, json: body });
    staleDelivered();
  });
  await page.evaluate((ownerId) => {
    window.dispatchEvent(
      new CustomEvent("jobs-crm:documents-changed", {
        detail: { owner: ownerId, pending: false },
      }),
    );
  }, owner.id);
  await captured;
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
  await expect(historicalApplication).toContainText(
    /Wysłana wersja 2 — (trwa usuwanie|treść usunięta)/,
  );
  releaseStale();
  await delivered;
  await expect(historicalApplication).not.toContainText(
    `${names[1]} — wersja 2`,
  );
  await expect(panel).not.toContainText("synthetic-new.txt");
  const addSent = historicalApplication.locator("details").filter({
    has: page.getByText("Wskaż wysłane wersje CV", { exact: true }),
  });
  await addSent.getByText("Wskaż wysłane wersje CV", { exact: true }).click();
  const selectedCv = addSent.getByLabel(`${names[1]} — wersja 1`, {
    exact: true,
  });
  await selectedCv.check();
  await selectedCv.focus();
  const nextPoll = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
    { timeout: 10000 },
  );
  await nextPoll;
  await expect(selectedCv).toBeChecked();
  await expect(selectedCv).toBeFocused();
  await expect(sentAudit).not.toContainText("synthetic-new.txt");
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
  await expect(historicalApplication).toContainText(
    "Wysłana wersja 2 — treść usunięta",
    { timeout: 15000 },
  );
  await expect(sentAudit).toContainText("treść usunięta", { timeout: 15000 });
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

test("document panel fences delayed reads through delete and recovers after setup failures", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const caseId = await createCase();
  const name = `Panel QA ${randomUUID()}`;
  const filename = "synthetic-panel-private.txt";
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
  await panel
    .getByRole("button", { name: "Dodaj do biblioteki i sprawy" })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("Synthetic panel race\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(name);
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  const item = panel
    .locator("li")
    .filter({ has: page.getByRole("heading", { name }) })
    .first();
  await expect(item).toContainText(filename);

  // A failed permit must unblock the panel and start a fresh read.
  await page.route(
    "**/documents/permit",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      }),
    { times: 1 },
  );
  await item.getByRole("button", { name: "Popraw dane" }).click();
  const permitRecoveryRead = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  await item.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Wynik operacji jest nieznany",
  );
  await permitRecoveryRead;
  await expect(panel.getByText("Pobieranie dokumentów…")).toBeHidden();
  await expect(panel.getByRole("alert")).toContainText(
    "Wynik operacji jest nieznany",
  );
  await expect(item).toContainText(filename);

  // A denied local receipt write must also unblock reads, without issuing a command.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (
      window as unknown as { restoreDocumentStorage: () => void }
    ).restoreDocumentStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("jobs-crm.documents.pending."))
        throw new Error("synthetic storage failure");
      return original.call(this, key, value);
    };
  });
  const storageRecoveryRead = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  await item.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Nie można bezpiecznie zapisać identyfikatora operacji",
  );
  await storageRecoveryRead;
  await expect(panel.getByText("Pobieranie dokumentów…")).toBeHidden();
  await expect(panel.getByRole("alert")).toContainText(
    "Nie można bezpiecznie zapisać identyfikatora operacji",
  );
  await page.evaluate(() =>
    (
      window as unknown as { restoreDocumentStorage: () => void }
    ).restoreDocumentStorage(),
  );
  await expect(item).toContainText(filename);

  // A command conflict also remains visible after the succeeding refresh.
  await page.route(
    "**/documents/commands",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: "{}",
      }),
    { times: 1 },
  );
  const conflictRecoveryRead = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  await item.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await conflictRecoveryRead;
  await expect(panel.getByText("Pobieranie dokumentów…")).toBeHidden();
  await expect(panel.getByRole("alert")).toContainText(
    "Dane zmieniły się. Odśwież i ponownie sprawdź działanie.",
  );
  await panel.getByRole("button", { name: "Sprawdź wynik operacji" }).click();
  await expect(
    panel.getByRole("status").filter({ hasText: "bezpiecznie anulowano" }),
  ).toBeVisible();

  // Capture a real panel GET after a successful rename and hold its old bytes.
  let releaseOld!: () => void;
  let reportOld!: () => void;
  let reportDelivered!: () => void;
  const oldGate = new Promise<void>((resolve) => (releaseOld = resolve));
  const oldCaptured = new Promise<void>((resolve) => (reportOld = resolve));
  const oldDelivered = new Promise<void>(
    (resolve) => (reportDelivered = resolve),
  );
  let holdOld = true;
  await page.route("**/documents/data?*", async (route) => {
    if (!holdOld) return route.continue();
    holdOld = false;
    const response = await route.fetch();
    const body = await response.json();
    expect(JSON.stringify(body)).toContain(filename);
    reportOld();
    await oldGate;
    await route.fulfill({ response, json: body });
    reportDelivered();
  });
  await item.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await oldCaptured;
  await expect(
    item.getByRole("button", { name: "Usuń treść wersji" }),
  ).toBeEnabled();
  await item.getByRole("button", { name: "Usuń treść wersji" }).click();
  const preview = panel.getByRole("group", {
    name: "Potwierdź usunięcie treści",
  });
  await preview
    .getByLabel("Potwierdzam usunięcie treści w przedstawionym zakresie.")
    .check();

  // The command reaches the real server; only delivery of its response is delayed.
  let releaseDelete!: () => void;
  let reportDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => (releaseDelete = resolve));
  const deleteCommitted = new Promise<void>(
    (resolve) => (reportDelete = resolve),
  );
  await page.route("**/documents/commands", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "delete-confirm") return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    reportDelete();
    await deleteGate;
    await route.fulfill({ response });
  });
  await preview
    .getByRole("button", { name: "Usuń treść", exact: true })
    .click();
  await deleteCommitted;
  releaseOld();
  await oldDelivered;
  await expect(panel).not.toContainText(filename);
  await expect(panel).not.toContainText(name);
  const refreshed = page.waitForResponse(
    (response) => response.url().includes("/documents/data?") && response.ok(),
  );
  releaseDelete();
  await refreshed;
  await expect(panel).not.toContainText(filename);
  await expect(panel).not.toContainText(name);
  await expect(panel).toContainText(/usuwanie|usunięta/i);
});

test("upload drafts survive a failed refresh without revealing document metadata", async ({
  page,
}) => {
  const documentName = `Draft target ${randomUUID()}`;
  const draftName = `Draft retained ${randomUUID()}`;
  const privateFilename = "synthetic-existing-private.txt";
  await login(page);
  await page.goto(`${target.appOrigin}/documents`);
  const library = page.getByRole("region", { name: "Biblioteka dokumentów" });
  await library
    .getByRole("button", { name: "Dodaj dokument", exact: true })
    .click();
  await library.getByLabel("Plik", { exact: true }).setInputFiles({
    name: privateFilename,
    mimeType: "text/plain",
    buffer: Buffer.from("Existing synthetic bytes\n"),
  });
  await library.getByLabel("Nazwa dokumentu").fill(documentName);
  await library.getByLabel("To jest CV").check();
  await library
    .getByRole("button", { name: "Dodaj plik", exact: true })
    .click();
  const item = library
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: documentName }) })
    .first();
  await expect(item).toContainText(privateFilename);
  for (const mode of ["library", "version"] as const) {
    if (mode === "library")
      await library
        .getByRole("button", { name: "Dodaj dokument", exact: true })
        .click();
    else await item.getByRole("button", { name: "Dodaj wersję" }).click();
    const draftFile = `synthetic-draft-${mode}.txt`;
    const draftBytes = Buffer.from(`Synthetic draft ${mode}\n`);
    const fileInput = library.getByLabel("Plik", { exact: true });
    await fileInput.setInputFiles({
      name: draftFile,
      mimeType: "text/plain",
      buffer: draftBytes,
    });
    if (mode === "library") {
      await library.getByLabel("Nazwa dokumentu").fill(draftName);
      await library.getByLabel("To jest CV").check();
    }
    await library
      .getByLabel("Etykieta wersji (opcjonalnie)")
      .fill(`Etykieta ${mode}`);
    await page.route(
      "**/documents/data",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        }),
      { times: 1 },
    );
    await library.getByRole("button", { name: "Odśwież stan" }).click();
    await expect(library.getByRole("alert")).toContainText(
      "Nie udało się pobrać dokumentów",
    );
    await expect(library).not.toContainText(documentName);
    await expect(library).not.toContainText(privateFilename);
    await expect(
      library.getByRole("button", { name: "Dodaj plik", exact: true }),
    ).toBeDisabled();
    expect(
      await fileInput.evaluate(
        (input: HTMLInputElement) => input.files?.[0]?.name,
      ),
    ).toBe(draftFile);
    await expect(
      library.getByLabel("Etykieta wersji (opcjonalnie)"),
    ).toHaveValue(`Etykieta ${mode}`);
    if (mode === "library") {
      await expect(library.getByLabel("Nazwa dokumentu")).toHaveValue(
        draftName,
      );
      await expect(library.getByLabel("To jest CV")).toBeChecked();
    }
    await library.getByRole("button", { name: "Spróbuj ponownie" }).click();
    await expect(item).toContainText(privateFilename);
    await expect(
      library.getByRole("button", { name: "Dodaj plik", exact: true }),
    ).toBeEnabled();
    expect(
      await fileInput.evaluate(
        (input: HTMLInputElement) => input.files?.[0]?.name,
      ),
    ).toBe(draftFile);
    await library
      .getByRole("button", { name: "Dodaj plik", exact: true })
      .click();
    const uploaded =
      mode === "library"
        ? library
            .locator("li")
            .filter({ has: page.getByRole("heading", { name: draftName }) })
            .first()
        : item;
    await expect(uploaded).toContainText(draftFile);
    const downloadPromise = page.waitForEvent("download");
    await uploaded
      .locator("li")
      .filter({ hasText: draftFile })
      .getByRole("link", { name: "Pobierz" })
      .click();
    const download = await downloadPromise;
    const chunks: Buffer[] = [];
    for await (const chunk of (await download.createReadStream())!)
      chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(draftBytes);
  }
});

test("login rejects native submission before hydration and still supports switching accounts", async ({
  page,
}) => {
  const second = await account(target);
  let releaseScripts!: () => void;
  const scriptsGate = new Promise<void>(
    (resolve) => (releaseScripts = resolve),
  );
  let blockedScripts = 0;
  const observedUrls: string[] = [];
  page.on("request", (request) => observedUrls.push(request.url()));
  await page.route("**/_next/static/**/*.js*", async (route) => {
    blockedScripts += 1;
    await scriptsGate;
    await route.continue();
  });
  await page.goto(`${target.appOrigin}/login`, { waitUntil: "commit" });
  const email = page.getByLabel("E-mail", { exact: true });
  const password = page.getByLabel("Hasło", { exact: true });
  const submit = page.getByRole("button", { name: "Zaloguj się", exact: true });
  await expect(email).toBeDisabled();
  await expect(password).toBeDisabled();
  await expect(submit).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await expect.poll(() => blockedScripts).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await submit.evaluate((button: HTMLButtonElement) => button.click());
  expect(page.url()).toBe(`${target.appOrigin}/login`);
  expect(
    observedUrls.some(
      (url) =>
        url.includes(owner.email) ||
        url.includes(owner.password) ||
        url.includes(second.email) ||
        url.includes(second.password),
    ),
  ).toBe(false);
  releaseScripts();
  await expect(email).toBeEnabled();
  await expect(password).toBeEnabled();
  await email.fill(owner.email);
  await password.fill(owner.password);
  await submit.click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await page.goto(`${target.appOrigin}/account`);
  await page
    .getByRole("button", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(email).toBeEnabled();
  await email.fill(second.email);
  await password.fill(second.password);
  await submit.click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  expect(
    observedUrls.some(
      (url) =>
        url.includes(encodeURIComponent(owner.email)) ||
        url.includes(encodeURIComponent(owner.password)) ||
        url.includes(encodeURIComponent(second.email)) ||
        url.includes(encodeURIComponent(second.password)),
    ),
  ).toBe(false);
});

test("document edit draft rejects a newer concurrent revision after refresh", async ({
  page,
}) => {
  const original = `Concurrent ${randomUUID()}`;
  const otherName = `Remote ${randomUUID()}`;
  const localName = `Draft ${randomUUID()}`;
  await login(page);
  await page.goto(`${target.appOrigin}/documents`);
  const panel = page.getByRole("region", { name: "Biblioteka dokumentów" });
  await panel
    .getByRole("button", { name: "Dodaj dokument", exact: true })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-revision.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Concurrent revision\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(original);
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  const item = panel
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: original }) })
    .first();
  await item.getByRole("button", { name: "Popraw dane" }).click();
  await item.getByLabel("Nazwa", { exact: true }).fill(localName);
  const other = await page.context().newPage();
  await other.goto(`${target.appOrigin}/documents`);
  const remoteItem = other
    .getByRole("region", { name: "Biblioteka dokumentów" })
    .locator("li")
    .filter({ has: other.getByRole("heading", { name: original }) })
    .first();
  await remoteItem.getByRole("button", { name: "Popraw dane" }).click();
  await remoteItem.getByLabel("Nazwa", { exact: true }).fill(otherName);
  await remoteItem.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(other.getByRole("heading", { name: otherName })).toBeVisible();
  await panel.getByRole("button", { name: "Odśwież stan" }).click();
  const updatedItem = panel
    .locator("li")
    .filter({ has: page.getByRole("heading", { name: otherName }) })
    .first();
  await expect(updatedItem.getByLabel("Nazwa", { exact: true })).toHaveValue(
    localName,
  );
  await updatedItem.getByRole("button", { name: "Zapisz poprawkę" }).click();
  await expect(panel.getByRole("alert")).toContainText("Dane zmieniły się");
  await panel.getByRole("button", { name: "Odśwież stan" }).click();
  await expect(panel.getByRole("heading", { name: otherName })).toBeVisible();
  await expect(panel.getByRole("heading", { name: localName })).toHaveCount(0);
  await other.close();
});

test("an open application cannot silently retain a CV deleted from its case", async ({
  page,
}) => {
  const caseId = await createCase();
  const name = `Application CV ${randomUUID()}`;
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
  await panel
    .getByRole("button", { name: "Dodaj do biblioteki i sprawy" })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-selected.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Selected synthetic CV\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(name);
  await panel.getByLabel("To jest CV").check();
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  const item = panel
    .locator("li")
    .filter({ has: page.getByRole("heading", { name }) })
    .first();
  const actions = page.getByRole("region", { name: "Działania w sprawie" });
  await actions
    .getByRole("button", { name: "Zarejestruj aplikowanie" })
    .click();
  await actions.getByLabel(new RegExp(name)).check();
  await item.getByRole("button", { name: "Usuń treść wersji" }).click();
  const preview = panel.getByRole("group", {
    name: "Potwierdź usunięcie treści",
  });
  await preview
    .getByLabel("Potwierdzam usunięcie treści w przedstawionym zakresie.")
    .check();
  await preview
    .getByRole("button", { name: "Usuń treść", exact: true })
    .click();
  await expect(actions).not.toContainText(name);
  await expect(actions.getByRole("alert")).toContainText(
    /wybran.*wersj.*niedostępn/i,
  );
  await expect(
    actions.getByRole("button", { name: "Zapisz zdarzenie" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Zarejestrowano aplikowanie", { exact: false }),
  ).toHaveCount(0);
});

test("upload mode cannot change while its server result is pending", async ({
  page,
}) => {
  const name = `Upload pending ${randomUUID()}`;
  await login(page);
  await page.goto(`${target.appOrigin}/documents`);
  const panel = page.getByRole("region", { name: "Biblioteka dokumentów" });
  await panel
    .getByRole("button", { name: "Dodaj dokument", exact: true })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-pending.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Pending synthetic file\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(name);
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const pending = new Promise<void>((resolve) => (captured = resolve));
  await page.route(
    "**/documents/upload",
    async (route) => {
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  await pending;
  await expect(
    panel.getByRole("button", { name: "Dodaj dokument", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Anuluj", exact: true }),
  ).toBeDisabled();
  await expect(panel.getByLabel("Nazwa dokumentu")).toHaveValue(name);
  release();
  await expect(panel.getByRole("heading", { name })).toBeVisible();
  await expect(panel).toContainText("synthetic-pending.txt");
  const recoveryName = `Upload recovery ${randomUUID()}`;
  await panel
    .getByRole("button", { name: "Dodaj dokument", exact: true })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-recovery.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Recovery synthetic file\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(recoveryName);
  await page.route(
    "**/documents/upload",
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    },
    { times: 1 },
  );
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Sprawdź wynik operacji" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Dodaj dokument", exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Sprawdź wynik operacji" }).click();
  await expect(
    panel.getByRole("heading", { name: recoveryName }),
  ).toBeVisible();
  await expect(panel).toContainText("synthetic-recovery.txt");
});

test("application CV read failure offers retry or explicit clearing without losing the draft", async ({
  page,
}) => {
  const caseId = await createCase();
  const name = `CV retry ${randomUUID()}`;
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
  await panel
    .getByRole("button", { name: "Dodaj do biblioteki i sprawy" })
    .click();
  await panel.getByLabel("Plik", { exact: true }).setInputFiles({
    name: "synthetic-cv-retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Retry CV\n"),
  });
  await panel.getByLabel("Nazwa dokumentu").fill(name);
  await panel.getByLabel("To jest CV").check();
  await panel.getByRole("button", { name: "Dodaj plik", exact: true }).click();
  await expect(panel.getByRole("heading", { name })).toBeVisible();
  const actions = page.getByRole("region", { name: "Działania w sprawie" });
  await actions
    .getByRole("button", { name: "Zarejestruj aplikowanie" })
    .click();
  await actions.getByLabel(new RegExp(name)).check();
  const confirmation = actions.getByLabel(
    "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
  );
  await confirmation.check();
  const failRead = async () => {
    await page.route(
      "**/documents/data?*",
      (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        }),
      { times: 1 },
    );
    await page.evaluate(
      (ownerId) =>
        window.dispatchEvent(
          new CustomEvent("jobs-crm:documents-changed", {
            detail: { owner: ownerId, pending: false },
          }),
        ),
      owner.id,
    );
    await expect(actions).toContainText("Nie można pobrać wersji CV");
    await expect(confirmation).toBeChecked();
    await expect(
      actions.getByRole("button", { name: "Zapisz zdarzenie" }),
    ).toBeDisabled();
  };
  await failRead();
  await actions.getByRole("button", { name: "Ponów odczyt wersji CV" }).click();
  await expect(actions.getByLabel(new RegExp(name))).toBeChecked();
  await expect(confirmation).toBeChecked();
  await failRead();
  await actions
    .getByRole("button", { name: "Usuń wszystkie wskazania CV" })
    .click();
  await expect(confirmation).toBeChecked();
  await actions.getByRole("button", { name: "Zapisz zdarzenie" }).click();
  await expect(actions.getByRole("status")).toContainText(
    "Zdarzenie zostało zapisane.",
  );
  const application = page
    .locator("li")
    .filter({ hasText: "Zarejestrowano aplikowanie" })
    .first();
  await expect(
    application.getByText("Nie wskazano wersji.", { exact: true }),
  ).toBeVisible();
});

test("sent correction and withdrawal use the revision observed when each draft opened", async ({
  page,
}) => {
  const caseId = await createCase();
  const names = [`Sent A ${randomUUID()}`, `Sent B ${randomUUID()}`];
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const panel = page.getByRole("region", { name: "Dokumenty sprawy" });
  for (const name of names) {
    await panel
      .getByRole("button", { name: "Dodaj do biblioteki i sprawy" })
      .click();
    await panel.getByLabel("Plik", { exact: true }).setInputFiles({
      name: "synthetic-sent.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Sent draft CV\n"),
    });
    await panel.getByLabel("Nazwa dokumentu").fill(name);
    await panel.getByLabel("To jest CV").check();
    await panel
      .getByRole("button", { name: "Dodaj plik", exact: true })
      .click();
    await expect(panel.getByRole("heading", { name })).toBeVisible();
  }
  const actions = page.getByRole("region", { name: "Działania w sprawie" });
  await actions
    .getByRole("button", { name: "Zarejestruj aplikowanie" })
    .click();
  await actions.getByLabel(new RegExp(names[0])).check();
  await actions
    .getByLabel("Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.")
    .check();
  await actions.getByRole("button", { name: "Zapisz zdarzenie" }).click();
  const history = page
    .locator("li")
    .filter({ hasText: "Zarejestrowano aplikowanie" })
    .first();
  const original = history
    .locator("li")
    .filter({ hasText: `${names[0]} — wersja 1` })
    .first();
  await original.getByRole("button", { name: "Skoryguj wskazanie" }).click();
  await original
    .getByLabel("Poprawna wersja")
    .selectOption({ label: `${names[1]} — wersja 1` });
  const other = await page.context().newPage();
  await other.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const remoteHistory = other
    .locator("li")
    .filter({ hasText: "Zarejestrowano aplikowanie" })
    .first();
  const remoteOriginal = remoteHistory
    .locator("li")
    .filter({ hasText: `${names[0]} — wersja 1` })
    .first();
  await remoteOriginal
    .getByRole("button", { name: "Skoryguj wskazanie" })
    .click();
  await remoteOriginal
    .getByLabel("Poprawna wersja")
    .selectOption({ label: `${names[1]} — wersja 1` });
  await remoteOriginal.getByRole("button", { name: "Zapisz korektę" }).click();
  await expect(
    remoteHistory.getByText(`${names[1]} — wersja 1`, { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (ownerId) =>
      window.dispatchEvent(
        new CustomEvent("jobs-crm:documents-changed", {
          detail: { owner: ownerId, pending: false },
        }),
      ),
    owner.id,
  );
  const changed = history
    .locator("li")
    .filter({ hasText: `${names[1]} — wersja 1` })
    .first();
  await expect(changed.getByLabel("Poprawna wersja")).toBeVisible();
  await changed.getByRole("button", { name: "Zapisz korektę" }).click();
  await expect(history.getByRole("alert")).toContainText("Wpis zmienił się");
  await history.getByRole("button", { name: "Sprawdź wynik operacji" }).click();
  await expect(
    history.getByRole("status").filter({ hasText: "bezpiecznie anulowano" }),
  ).toBeVisible();
  await changed.getByRole("button", { name: "Anuluj", exact: true }).click();
  await changed.getByRole("button", { name: "Wycofaj wskazanie" }).click();
  const remoteChanged = remoteHistory
    .locator("li")
    .filter({ hasText: `${names[1]} — wersja 1` })
    .first();
  await remoteChanged
    .getByRole("button", { name: "Skoryguj wskazanie" })
    .click();
  await remoteChanged
    .getByLabel("Poprawna wersja")
    .selectOption({ label: `${names[0]} — wersja 1` });
  await remoteChanged.getByRole("button", { name: "Zapisz korektę" }).click();
  await expect(
    remoteHistory.getByText(`${names[0]} — wersja 1`, { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (ownerId) =>
      window.dispatchEvent(
        new CustomEvent("jobs-crm:documents-changed", {
          detail: { owner: ownerId, pending: false },
        }),
      ),
    owner.id,
  );
  const changedAgain = history
    .locator("li")
    .filter({ hasText: `${names[0]} — wersja 1` })
    .first();
  await changedAgain
    .getByRole("button", { name: "Potwierdź wycofanie" })
    .click();
  await expect(history.getByRole("alert")).toContainText("Wpis zmienił się");
  await expect(history).not.toContainText("wskazanie wycofane");
  await other.close();
});
