/** Global Search UI: production HTTPS with a guarded, disposable synthetic target. */
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
let owner: Account;
test.beforeAll(async () => {
  const targetId = process.env.RECRUITMENT_TARGET_ID;
  if (!targetId)
    throw new Error(
      "Global Search browser requires a guarded disposable target",
    );
  target = await readRecruitmentTarget(targetId);
  owner = await account(target);
});

async function login(page: Page, user = owner) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}

async function caseFixture(title: string) {
  const { client } = await sdkLogin(target, owner);
  const { data, error } = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(error).toBeNull();
  return data.case.id as string;
}

test("a real inline note is searchable, opens its case context, and a private query never enters browser storage or URL", async ({
  page,
}) => {
  const query = `notatka${randomUUID().replaceAll("-", "")}`;
  const caseId = await caseFixture(`Sprawa QA ${randomUUID()}`);
  const visitedUrls: string[] = [];
  page.on("request", (request) => visitedUrls.push(request.url()));
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page.getByRole("button", { name: "+ Notatka", exact: true }).click();
  await page
    .getByLabel("Treść notatki", { exact: true })
    .fill(`Historyczna treść ${query}`);
  await page
    .getByRole("button", { name: "Zapisz notatkę", exact: true })
    .click();
  await expect(
    page.getByText(`Historyczna treść ${query}`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(query);
  await expect(
    dialog.getByRole("heading", { name: "Notatki", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(`Historyczna treść ${query}`, { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("link", { name: "Wszystkie wyniki", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wyniki wyszukiwania", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Notatki", exact: true }),
  ).toBeVisible();
  await page.getByText(`Historyczna treść ${query}`, { exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/recruitments/${caseId}`));
  await expect(
    page.getByText(`Historyczna treść ${query}`, { exact: true }),
  ).toBeVisible();

  const retained = await page.evaluate(() => ({
    href: location.href,
    local: { ...localStorage },
    session: { ...sessionStorage },
    cookie: document.cookie,
  }));
  expect(JSON.stringify(retained)).not.toContain(query);
  expect(visitedUrls.join("\n")).not.toContain(query);
});

test("search is available from an existing module on a narrow viewport and reload clears the query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const query = `mobile${randomUUID().replaceAll("-", "")}`;
  const caseId = await caseFixture(query);
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(query);
  await expect(
    dialog.getByRole("heading", { name: "Sprawy i stanowiska", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(query, { exact: false })).toBeVisible();
  await dialog.getByText(query, { exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/recruitments/${caseId}`));
  await page.reload();
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Wyszukiwanie" })
      .getByLabel("Szukaj w Jobs CRM"),
  ).toHaveValue("");
});

test("a note outside the first history page resolves to the exact owner-scoped target", async ({
  page,
}) => {
  const caseId = await caseFixture(`Paginated QA ${randomUUID()}`);
  const query = `oldernote${randomUUID().replaceAll("-", "")}`;
  const { client } = await sdkLogin(target, owner);
  const createNote = async (body: string) => {
    const { data, error } = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create-note",
        caseId,
        body,
        dateKind: "ordinary",
        occurredOn: null,
      },
    });
    expect(error).toBeNull();
    return data.note.id as string;
  };
  const targetNoteId = await createNote(query);
  // Exercise data beyond PostgREST's usual 1000-row default using the real
  // owner-scoped command trigger, in one guarded synthetic SQL transaction.
  const database = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    await database.begin(async (transaction) => {
      const tx = transaction as unknown as typeof database;
      await tx`SELECT set_config('request.jwt.claim.sub',${owner.id},true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`
        INSERT INTO public.case_content_command(request_id,payload)
        SELECT gen_random_uuid(), jsonb_build_object(
          'operation','create-note','caseId',${caseId}::text,
          'body','Synthetic later note '||n::text,'dateKind','ordinary','occurredOn',null
        ) FROM generate_series(1,1002) n
      `;
    });
  } finally {
    await database.end();
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const targetReply = await page.evaluate(
    async ({ caseId, targetNoteId, userId }) => {
      const params = new URLSearchParams({
        caseId,
        noteId: targetNoteId,
        expectedUserId: userId,
      });
      const response = await fetch(
        `/recruitments/content?${params.toString()}`,
        { cache: "no-store" },
      );
      return { status: response.status, body: await response.json() };
    },
    { caseId, targetNoteId, userId: owner.id },
  );
  expect(targetReply.status).toBe(200);
  expect(targetReply.body.targetNote.id).toBe(targetNoteId);
  expect(targetReply.body.timelinePage).toBeGreaterThan(1);
  expect(targetReply.body.notes).toHaveLength(25);
  expect(targetReply.body.hasMoreNotes).toBe(true);
  const laterPage = await page.evaluate(
    async ({ caseId, userId }) => {
      const params = new URLSearchParams({
        caseId,
        expectedUserId: userId,
        notesPage: "41",
      });
      const response = await fetch(
        `/recruitments/content?${params.toString()}`,
        { cache: "no-store" },
      );
      return { status: response.status, body: await response.json() };
    },
    { caseId, userId: owner.id },
  );
  expect(laterPage.status).toBe(200);
  expect(laterPage.body.notes.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(query);
  await dialog.getByText(query, { exact: false }).click();
  await expect(page).toHaveURL(new RegExp(`/recruitments/${caseId}`));
  await expect(page.getByText(query, { exact: true })).toBeVisible();
});

test("a link outside the first page opens and focuses its own row", async ({
  page,
}) => {
  const caseId = await caseFixture(`Links QA ${randomUUID()}`);
  const marker = `linktarget${randomUUID().replaceAll("-", "")}`;
  const { client } = await sdkLogin(target, owner);
  let linkId = "";
  for (let i = 0; i < 27; i++) {
    const url =
      i === 26
        ? `https://example.invalid/${marker}`
        : `https://example.invalid/${randomUUID()}`;
    const { data, error } = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url, role: "other" },
    });
    expect(error).toBeNull();
    if (i === 26) linkId = data.link.id;
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page.getByRole("button", { name: "Dodaj link", exact: true }).click();
  await page
    .getByLabel("Adres URL", { exact: true })
    .fill(`https://example.invalid/${marker}`);
  await page.getByRole("button", { name: "Zapisz link", exact: true }).click();
  await expect(
    page.getByText("Ten link już istnieje w tej sprawie.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Otwórz istniejący link" }).first(),
  ).toHaveAttribute("href", new RegExp(`linkId=${linkId}`));
  page.once("dialog", (confirmation) => void confirmation.accept());
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Adres URL", { exact: true }) })
    .getByRole("button", { name: "Anuluj", exact: true })
    .click();
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(marker);
  await dialog.getByRole("link", { name: new RegExp(marker) }).click();
  await expect(page).toHaveURL(new RegExp(`/recruitments/${caseId}`));
  const link = page.locator(`#case-link-additional-${linkId}`);
  await expect(link).toBeVisible();
  await expect(link).toBeFocused();
  await expect(link).toContainText(marker);
});

test("an event detached after search resolves to the current calendar event, not its former case", async ({
  page,
}) => {
  const caseId = await caseFixture(`Event QA ${randomUUID()}`);
  const marker = `eventtarget${randomUUID().replaceAll("-", "")}`;
  const { client } = await sdkLogin(target, owner);
  const values = {
    title: `Event ${marker}`,
    description: `Opis ${marker}`,
    caseId,
    status: "planned",
    schedule: {
      startDate: "2099-05-15",
      startTime: null,
      endDate: null,
      endTime: null,
      allDay: false,
      timeZone: "Europe/Warsaw",
      startOffset: null,
      endOffset: null,
    },
    timeZone: "Europe/Warsaw",
    actual: null,
    participants: [],
  };
  const created = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "create", values },
  });
  expect(created.error).toBeNull();
  const eventId = created.data.event.id as string;
  await login(page);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(marker);
  await expect(
    dialog.getByRole("heading", { name: "Wydarzenia", exact: true }),
  ).toBeVisible();
  const changed = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "edit",
      eventId,
      expectedRevision: created.data.event.revision,
      values: { ...values, caseId: null },
    },
  });
  expect(changed.error).toBeNull();
  await dialog.getByRole("link", { name: new RegExp(marker) }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?eventId=${eventId}`));
  await expect(
    page.getByText(`Event ${marker}`, { exact: true }).first(),
  ).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`/recruitments/${caseId}`));
});

test("search dialog is keyboard operable and distinguishes network error from empty results", async ({
  page,
}) => {
  await login(page);
  const trigger = page.getByRole("button", { name: "Szukaj", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  const input = dialog.getByLabel("Szukaj w Jobs CRM", { exact: true });
  await expect(input).toBeFocused();
  const marker = `network${randomUUID().replaceAll("-", "")}`;
  await page.route("**/search/data", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ kind: "unavailable" }),
    });
  });
  await input.fill(marker);
  await expect(dialog.getByRole("alert")).toContainText(
    "Nie udało się pobrać wyników",
  );
  await expect(
    dialog.getByText("Brak wyników. Spróbuj innej frazy."),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await dialog
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(
    dialog.getByText("Brak wyników. Spróbuj innej frazy."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("signing out and changing owner clears the private query and results", async ({
  page,
}) => {
  const marker = `private${randomUUID().replaceAll("-", "")}`;
  await caseFixture(marker);
  const other = await account(target);
  await login(page);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Wyszukiwanie", exact: true });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(marker);
  await expect(dialog.getByText(marker, { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await login(page, other);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Wyszukiwanie", exact: true });
  const input = dialog.getByLabel("Szukaj w Jobs CRM", { exact: true });
  await expect(input).toHaveValue("");
  await input.fill(marker);
  await expect(
    dialog.getByText("Brak wyników. Spróbuj innej frazy."),
  ).toBeVisible();
  await expect(dialog.getByText(marker, { exact: false })).toHaveCount(0);
});

test("the BFF returns reorder audit for both the moved and displaced links", async ({
  page,
}) => {
  const caseId = await caseFixture(`Audit QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const add = async () => {
    const url = `https://example.invalid/${randomUUID()}`;
    const result = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url, role: "other" },
    });
    expect(result.error).toBeNull();
    return { ...result.data.link, url } as {
      id: string;
      revision: number;
      url: string;
    };
  };
  const first = await add();
  const second = await add();
  const moved = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "correct-link",
      caseId,
      id: second.id,
      source: "additional",
      expectedRevision: second.revision,
      url: second.url,
      role: "other",
      position: 0,
    },
  });
  expect(moved.error).toBeNull();
  await login(page);
  for (const targetId of [first.id, second.id]) {
    const reply = await page.evaluate(
      async ({ caseId, targetId, userId }) => {
        const params = new URLSearchParams({
          caseId,
          auditTarget: targetId,
          expectedUserId: userId,
        });
        const response = await fetch(
          `/recruitments/content?${params.toString()}`,
          { cache: "no-store" },
        );
        return { status: response.status, body: await response.json() };
      },
      { caseId, targetId, userId: owner.id },
    );
    expect(reply.status).toBe(200);
    expect(
      reply.body.audit.some(
        (entry: { after_values?: { reordered?: { id?: string } } }) =>
          entry.after_values?.reordered?.id === first.id,
      ),
    ).toBe(true);
  }
});
