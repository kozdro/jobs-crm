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
  await expect(page.locator("[data-content-recovery]")).toBeFocused();
  await expect(page.locator("[data-content-recovery]")).toContainText(
    "Zapisano.",
  );
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
  await expect.poll(() => new URL(page.url()).hash).toBe("#case-history");

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
  await expect.poll(() => new URL(page.url()).hash).toBe("#case-links");
  await page.reload();
  await expect(link).toBeVisible();
  await expect(link).toBeFocused();
  await expect.poll(() => new URL(page.url()).hash).toBe("#case-links");
  await page.goto(
    `${target.appOrigin}/recruitments/${caseId}#access_token=synthetic-secret`,
  );
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.goto(`${target.appOrigin}/recruitments/${caseId}#case-calendar`);
  await expect.poll(() => new URL(page.url()).hash).toBe("#case-calendar");
  await page.reload();
  await expect.poll(() => new URL(page.url()).hash).toBe("#case-calendar");
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

test("a delayed stale search response never replaces the newest query results", async ({
  page,
}) => {
  const oldQuery = `old${randomUUID().replaceAll("-", "")}`;
  const newQuery = `new${randomUUID().replaceAll("-", "")}`;
  await caseFixture(oldQuery);
  await caseFixture(newQuery);
  await login(page);
  await page.route("**/search/data", async (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    if (body.query === oldQuery)
      await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await route.continue();
    } catch {
      /* Abort of obsolete request is expected. */
    }
  });
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  const input = dialog.getByLabel("Szukaj w Jobs CRM", { exact: true });
  const firstRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith("/search/data") &&
      request.postDataJSON()?.query === oldQuery,
  );
  await input.fill(oldQuery);
  await firstRequest;
  await input.fill(newQuery);
  await expect(dialog.getByText(newQuery, { exact: false })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(dialog.getByText(oldQuery, { exact: false })).toHaveCount(0);
  await expect(dialog.getByText(newQuery, { exact: false })).toBeVisible();
});

test("BFF content/audit and duplicate lookup do not reveal another owner's case or link", async ({
  page,
}) => {
  const caseId = await caseFixture(`Private BFF ${randomUUID()}`);
  const secretUrl = `https://example.invalid/${randomUUID()}`;
  const { client } = await sdkLogin(target, owner);
  const created = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "add-link", caseId, url: secretUrl, role: "other" },
  });
  expect(created.error).toBeNull();
  const other = await account(target);
  const positive = await client.rpc("find_case_link_duplicate", {
    p_case_id: caseId,
    p_url: secretUrl,
  });
  expect(positive.error).toBeNull();
  expect(positive.data.id).toBe(created.data.link.id);
  const foreign = await sdkLogin(target, other);
  const deniedLookup = await foreign.client.rpc("find_case_link_duplicate", {
    p_case_id: caseId,
    p_url: secretUrl,
  });
  expect(JSON.stringify(deniedLookup.data)).not.toContain(created.data.link.id);
  await login(page, other);
  const response = await page.evaluate(
    async ({ caseId, targetId, userId, secretUrl }) => {
      const query = new URLSearchParams({
        caseId,
        auditTarget: targetId,
        expectedUserId: userId,
      });
      const read = await fetch(`/recruitments/content?${query}`, {
        cache: "no-store",
      });
      const command = await fetch("/recruitments/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedUserId: userId,
          requestId: crypto.randomUUID(),
          payload: {
            operation: "add-link",
            caseId,
            url: secretUrl,
            role: "other",
          },
        }),
      });
      return {
        readStatus: read.status,
        read: await read.text(),
        commandStatus: command.status,
        command: await command.text(),
      };
    },
    {
      caseId,
      targetId: created.data.link.id as string,
      userId: other.id,
      secretUrl,
    },
  );
  expect(response.readStatus).toBe(404);
  expect(response.commandStatus).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(response)).not.toContain(secretUrl);
  expect(JSON.stringify(response)).not.toContain(created.data.link.id);
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

test("unreadable content storage keeps lifecycle available while preventing note and link writes", async ({
  page,
}) => {
  const caseId = await caseFixture(`Storage QA ${randomUUID()}`);
  await login(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (
        this === sessionStorage &&
        key.startsWith("jobs-crm.content.pending.")
      )
        throw new Error("Synthetic storage denial");
      return original.call(this, key);
    };
  });
  let contentPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/recruitments/content"
    )
      contentPosts++;
  });
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await expect(
    page.getByText("Nie można sprawdzić zamiaru w tej przeglądarce."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zarejestruj kontakt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Zarejestruj kontakt", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "+ Notatka", exact: true }).click();
  await page
    .getByLabel("Treść notatki", { exact: true })
    .fill("Syntetyczna notatka");
  await expect(
    page.getByRole("button", { name: "Zapisz notatkę", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Dodaj link", exact: true }).click();
  await page
    .getByLabel("Adres URL", { exact: true })
    .fill("https://example.invalid/storage");
  await expect(
    page.getByRole("button", { name: "Zapisz link", exact: true }),
  ).toBeDisabled();
  expect(contentPosts).toBe(0);
});

test("delayed content receipt bootstrap does not swallow the first independent lifecycle click", async ({
  page,
}) => {
  const caseId = await caseFixture(`Bootstrap QA ${randomUUID()}`);
  const requestId = randomUUID();
  await login(page);
  await page.addInitScript(
    ({ ownerId, caseId, requestId }) => {
      sessionStorage.setItem(
        `jobs-crm.content.pending.${ownerId}.${caseId}`,
        requestId,
      );
    },
    { ownerId: owner.id, caseId, requestId },
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signal!: () => void;
  const arrived = new Promise<void>((resolve) => {
    signal = resolve;
  });
  await page.route("**/recruitments/content?*", async (route) => {
    if (!new URL(route.request().url()).searchParams.has("requestId"))
      return route.continue();
    signal();
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    await arrived;
    await expect(
      page.getByText("Sprawdzanie poprzedniego zapisu…"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Zarejestruj kontakt", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Zarejestruj kontakt", exact: true }),
    ).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("lost committed response keeps the frozen intent until receipt is recovered", async ({
  page,
}) => {
  const caseId = await caseFixture(`Recovery QA ${randomUUID()}`);
  const oldA = `https://example.invalid/a-${randomUUID()}`;
  const oldB = `https://example.invalid/b-${randomUUID()}`;
  const newA = `https://example.invalid/new-${randomUUID()}`;
  const { client } = await sdkLogin(target, owner);
  const add = async (url: string) => {
    const { data, error } = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url, role: "other" },
    });
    expect(error).toBeNull();
    return data.link.id as string;
  };
  const linkA = await add(oldA);
  const linkB = await add(oldB);
  let frozen: { requestId: string; payload: unknown } | null = null;
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page
    .getByRole("button", { name: `Popraw link ${oldA}`, exact: true })
    .click();
  const editor = page
    .locator("form")
    .filter({ has: page.getByLabel("Adres URL", { exact: true }) });
  await editor.getByLabel("Adres URL", { exact: true }).fill(newA);
  await page.route("**/recruitments/content", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    frozen = route.request().postDataJSON() as {
      requestId: string;
      payload: unknown;
    };
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ kind: "unavailable" }),
    });
  });
  await editor
    .getByRole("button", { name: "Zapisz link", exact: true })
    .click();
  await expect(
    page.getByText(/Wynik zapisu jest niepewny/).first(),
  ).toBeVisible();
  const lifecycle = page.getByRole("button", {
    name: "Zarejestruj kontakt",
    exact: true,
  });
  if (await lifecycle.isEnabled()) await lifecycle.click({ force: true });
  await expect(
    page.getByRole("heading", { name: "Zarejestruj kontakt", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/recruitments/${caseId}`));
  const other = page.getByRole("button", {
    name: `Popraw link ${oldB}`,
    exact: true,
  });
  if (await other.isEnabled()) await other.click({ force: true });
  await expect(
    page
      .locator(`#case-link-additional-${linkB}`)
      .getByLabel("Adres URL", { exact: true }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("button", { name: "Ponów identyczny zapis", exact: true })
    .first()
    .click();
  await expect(page.locator(`#case-link-additional-${linkA}`)).toContainText(
    newA,
  );
  expect(frozen).not.toBeNull();
  const receipt = await client
    .from("case_content_command")
    .select("request_id,payload")
    .eq("request_id", frozen!.requestId);
  expect(receipt.error).toBeNull();
  expect(receipt.data).toHaveLength(1);
  expect(receipt.data![0].payload).toEqual(frozen!.payload);
});

test("reload after an uncommitted request fences its ID before a new write", async ({
  page,
}) => {
  const caseId = await caseFixture(`Fence QA ${randomUUID()}`);
  const oldUrl = `https://example.invalid/old-${randomUUID()}`;
  const newUrl = `https://example.invalid/new-${randomUUID()}`;
  const { client } = await sdkLogin(target, owner);
  const initial = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "add-link", caseId, url: oldUrl, role: "other" },
  });
  expect(initial.error).toBeNull();
  let frozen: { requestId: string; payload: unknown } | null = null;
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page
    .getByRole("button", { name: `Popraw link ${oldUrl}`, exact: true })
    .click();
  const editor = page
    .locator("form")
    .filter({ has: page.getByLabel("Adres URL", { exact: true }) });
  await editor.getByLabel("Adres URL", { exact: true }).fill(newUrl);
  await page.route("**/recruitments/content", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    frozen = route.request().postDataJSON() as {
      requestId: string;
      payload: unknown;
    };
    await route.abort();
  });
  await editor
    .getByRole("button", { name: "Zapisz link", exact: true })
    .click();
  await expect(
    page.getByText(/Wynik zapisu jest niepewny/).first(),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await page
    .getByRole("button", { name: "Sprawdź i zakończ oczekiwanie", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Poprzedni zamiar bezpiecznie zakończony.").first(),
  ).toBeVisible();
  expect(frozen).not.toBeNull();
  const late = await client.rpc("execute_case_content_command", {
    p_request_id: frozen!.requestId,
    p_payload: frozen!.payload,
  });
  expect(late.error).not.toBeNull();
  const current = await client
    .from("case_link_current")
    .select("url")
    .eq("case_id", caseId)
    .eq("id", initial.data.link.id)
    .single();
  expect(current.error).toBeNull();
  expect(current.data?.url).toBe(oldUrl);
});

test("long historical note shows its actual creation date, and voided links retain their audit", async ({
  page,
}) => {
  const caseId = await caseFixture(`Details QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const longBody = `Początek ${"długa treść ".repeat(60)} zakończenie`;
  const createdNote = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create-note",
      caseId,
      body: longBody,
      dateKind: "historical",
      occurredOn: "2020-01-02",
    },
  });
  expect(createdNote.error).toBeNull();
  const linkUrl = `https://example.invalid/void-${randomUUID()}`;
  const createdLink = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "add-link", caseId, url: linkUrl, role: "other" },
  });
  expect(createdLink.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const note = page.locator(`#note-${createdNote.data.note.id}`);
  await expect(
    note.getByRole("button", { name: "Rozwiń notatkę", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await note
    .getByRole("button", { name: "Rozwiń notatkę", exact: true })
    .click();
  await expect(note.getByText(longBody, { exact: true })).toBeVisible();
  await expect(note.getByText("Dodano do CRM później.")).toBeVisible();
  await note.getByText("Szczegóły notatki", { exact: true }).click();
  await expect(note.locator("time")).toHaveAttribute(
    "datetime",
    createdNote.data.note.created_at,
  );
  page.once("dialog", (confirmation) => void confirmation.accept());
  await page
    .getByRole("button", { name: `Unieważnij link ${linkUrl}`, exact: true })
    .click();
  await page.getByText("Unieważnione linki", { exact: true }).click();
  const voided = page
    .getByText(`Unieważniony link: ${linkUrl}`, { exact: true })
    .locator("..");
  await expect(voided).toBeVisible();
  await voided.getByText("Historia zmian", { exact: true }).click();
  await expect(voided.getByText("Po zmianie").first()).toBeVisible();
});

test("calendar target switches A to B to no target on client navigation", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, owner);
  const schedule = {
    startDate: "2099-05-15",
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: false,
    timeZone: "Europe/Warsaw",
    startOffset: null,
    endOffset: null,
  };
  const makeEvent = async (name: string) => {
    const result = await client.rpc("execute_recruitment_calendar_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create",
        values: {
          title: name,
          description: null,
          caseId: null,
          status: "planned",
          schedule,
          timeZone: "Europe/Warsaw",
          actual: null,
          participants: [],
        },
      },
    });
    expect(result.error).toBeNull();
    return result.data.event.id as string;
  };
  const nameA = `Target A ${randomUUID()}`;
  const nameB = `Target B ${randomUUID()}`;
  const aId = await makeEvent(nameA),
    bId = await makeEvent(nameB);
  await login(page);
  await page.goto(`${target.appOrigin}/calendar?eventId=${aId}`);
  await expect(page.getByLabel("Wskazane wydarzenie")).toContainText(nameA);
  await page.getByRole("button", { name: "Szukaj", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  await dialog.getByLabel("Szukaj w Jobs CRM", { exact: true }).fill(nameB);
  await dialog.getByRole("link", { name: new RegExp(nameB) }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?eventId=${bId}`));
  await expect(page.getByLabel("Wskazane wydarzenie")).toContainText(nameB);
  await expect(page.getByLabel("Wskazane wydarzenie")).not.toContainText(nameA);
  await page
    .getByRole("link", { name: "Kalendarz", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
  await expect(page.getByLabel("Wskazane wydarzenie")).toHaveCount(0);
});

test("desktop search field is keyboard operable and preserves the first typed text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const query = `keyboard${randomUUID().replaceAll("-", "")}`;
  await caseFixture(query);
  await login(page);
  const desktop = page.getByRole("searchbox", {
    name: "Szukaj w Jobs CRM",
    exact: true,
  });
  await desktop.focus();
  await expect(desktop).toBeFocused();
  await page.keyboard.type(query);
  const dialog = page.getByRole("dialog", {
    name: "Wyszukiwanie",
    exact: true,
  });
  const input = dialog.getByLabel("Szukaj w Jobs CRM", { exact: true });
  await expect(input).toHaveValue(query);
  await expect(dialog.getByText(query, { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(desktop).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Wyszukiwanie", exact: true }),
  ).toBeVisible();
});

test("calendar target distinguishes 503 with retry from an unavailable record", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, owner);
  const title = `Retry event ${randomUUID()}`;
  const schedule = {
    startDate: "2099-05-15",
    startTime: null,
    endDate: null,
    endTime: null,
    allDay: false,
    timeZone: "Europe/Warsaw",
    startOffset: null,
    endOffset: null,
  };
  const event = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      values: {
        title,
        description: null,
        caseId: null,
        status: "planned",
        schedule,
        timeZone: "Europe/Warsaw",
        actual: null,
        participants: [],
      },
    },
  });
  expect(event.error).toBeNull();
  const eventId = event.data.event.id as string;
  await login(page);
  await page.route("**/calendar/commands?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("eventId") === eventId)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ kind: "unavailable" }),
      });
    return route.continue();
  });
  await page.goto(`${target.appOrigin}/calendar?eventId=${eventId}`);
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Nie udało się pobrać wskazanego wydarzenia." });
  await expect(error).toBeVisible();
  await expect(
    page.getByText("Nie można otworzyć wskazanego wydarzenia."),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await error
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(page.getByLabel("Wskazane wydarzenie")).toContainText(title);
  await page.goto(`${target.appOrigin}/calendar?eventId=${randomUUID()}`);
  await expect(
    page.getByText("Nie można otworzyć wskazanego wydarzenia."),
  ).toBeVisible();
});

test("note target distinguishes 503 with retry from a missing or foreign note", async ({
  page,
}) => {
  const caseId = await caseFixture(`Note target QA ${randomUUID()}`);
  const foreignCaseId = await caseFixture(`Other context QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const add = async (caseId: string, body: string) => {
    const result = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create-note",
        caseId,
        body,
        dateKind: "ordinary",
        occurredOn: null,
      },
    });
    expect(result.error).toBeNull();
    return result.data.note.id as string;
  };
  const ownId = await add(caseId, "Synthetic target note");
  const foreignId = await add(foreignCaseId, "Synthetic unrelated note");
  await login(page);
  await page.route("**/recruitments/content?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("noteId") === ownId)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ kind: "unavailable" }),
      });
    return route.continue();
  });
  await page.goto(`${target.appOrigin}/recruitments/${caseId}?noteId=${ownId}`);
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Nie udało się pobrać wskazanej notatki." });
  await expect(error).toBeVisible();
  await expect(
    page.getByText("Nie można otworzyć wskazanej notatki."),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await error
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(page.locator(`#note-${ownId}`)).toBeFocused();
  await page.goto(
    `${target.appOrigin}/recruitments/${caseId}?noteId=${foreignId}`,
  );
  await expect(
    page.getByText("Nie można otworzyć wskazanej notatki."),
  ).toBeVisible();
  await expect(page.getByText("Synthetic unrelated note")).toHaveCount(0);
});

test("initial server timeline outage can be retried to the exact note and focus", async ({
  page,
}) => {
  const caseId = await caseFixture(`History outage QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const saved = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create-note",
      caseId,
      body: "Synthetic timeline outage target",
      dateKind: "ordinary",
      occurredOn: null,
    },
  });
  expect(saved.error).toBeNull();
  const noteId = saved.data.note.id as string;
  await login(page);
  const database = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    const viewState = () =>
      database`SELECT md5(pg_get_viewdef(c.oid,true)) AS definition, coalesce((SELECT jsonb_agg(jsonb_build_array(a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'[]'::jsonb) AS acl FROM pg_class c WHERE c.oid='public.recruitment_case_timeline'::regclass`;
    const before = await viewState();
    const [privilege] =
      await database`SELECT has_table_privilege('authenticated','public.recruitment_case_timeline','SELECT') AS allowed`;
    expect(privilege.allowed).toBe(true);
    try {
      await database`REVOKE SELECT ON public.recruitment_case_timeline FROM authenticated`;
      await page.goto(
        `${target.appOrigin}/recruitments/${caseId}?noteId=${noteId}`,
      );
      await expect(
        page.getByText("Nie udało się pobrać wskazanej notatki."),
      ).toBeVisible();
    } finally {
      await database`GRANT SELECT ON public.recruitment_case_timeline TO authenticated`;
      expect(await viewState()).toEqual(before);
    }
  } finally {
    await database.end();
  }
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Nie udało się pobrać wskazanej notatki." });
  await alert
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(page.locator(`#note-${noteId}`)).toBeVisible();
  await expect(page.locator(`#note-${noteId}`)).toBeFocused();
});

test("initial CaseLinks read error provides a retry that restores the exact target", async ({
  page,
}) => {
  const caseId = await caseFixture(`Link outage QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const url = `https://example.invalid/restore-${randomUUID()}`;
  const saved = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "add-link", caseId, url, role: "other" },
  });
  expect(saved.error).toBeNull();
  const linkId = saved.data.link.id as string;
  await login(page);
  await page.route("**/recruitments/content?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.has("linksPage"))
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ kind: "unavailable" }),
      });
    return route.continue();
  });
  await page.goto(
    `${target.appOrigin}/recruitments/${caseId}?linkId=${linkId}&linkSource=additional`,
  );
  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Nie udało się pobrać linków." });
  await expect(alert).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await alert
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  const link = page.locator(`#case-link-additional-${linkId}`);
  await expect(link).toBeVisible();
  await expect(link).toContainText(url);
  await expect(link).toBeFocused();
});

test("switching edited links or paging protects an unsaved link draft", async ({
  page,
}) => {
  const caseId = await caseFixture(`Dirty QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  const urls: string[] = [];
  for (let i = 0; i < 26; i++) {
    const url = `https://example.invalid/dirty-${i}-${randomUUID()}`;
    const result = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url, role: "other" },
    });
    expect(result.error).toBeNull();
    urls.push(url);
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page
    .getByRole("button", { name: `Popraw link ${urls[0]}`, exact: true })
    .click();
  const draft = `https://example.invalid/unsaved-${randomUUID()}`;
  await page.getByLabel("Adres URL", { exact: true }).fill(draft);
  page.once("dialog", (confirmation) => void confirmation.dismiss());
  await page
    .getByRole("button", { name: `Popraw link ${urls[1]}`, exact: true })
    .click();
  await expect(page.getByLabel("Adres URL", { exact: true })).toHaveValue(
    draft,
  );
  page.once("dialog", (confirmation) => void confirmation.dismiss());
  await page
    .getByRole("button", { name: "Następna strona linków", exact: true })
    .click();
  await expect(page.getByLabel("Adres URL", { exact: true })).toHaveValue(
    draft,
  );
  page.once("dialog", (confirmation) => void confirmation.accept());
  await page
    .getByRole("button", { name: `Popraw link ${urls[1]}`, exact: true })
    .click();
  await expect(page.getByLabel("Adres URL", { exact: true })).toHaveValue(
    urls[1],
  );
});

test("moving link 26 across a page boundary preserves target, focus and status", async ({
  page,
}) => {
  const caseId = await caseFixture(`Move QA ${randomUUID()}`);
  const { client } = await sdkLogin(target, owner);
  let last = { id: "", url: "" };
  for (let i = 0; i < 26; i++) {
    const url = `https://example.invalid/move-${i}-${randomUUID()}`;
    const result = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url, role: "other" },
    });
    expect(result.error).toBeNull();
    if (i === 25) last = { id: result.data.link.id, url };
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page
    .getByRole("button", { name: "Następna strona linków", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Przenieś wyżej ${last.url}`, exact: true })
    .click();
  const row = page.locator(`#case-link-additional-${last.id}`);
  await expect(row).toBeVisible();
  await expect(row).toBeFocused();
  const links = page.getByRole("region", { name: "Linki", exact: true });
  await expect(links.getByRole("status")).toHaveText(
    "Przeniesiono link. Strona 1.",
  );
  await expect(
    links.getByRole("navigation", { name: "Strony linków" }),
  ).toContainText("Strona 1");
  const persisted = await client
    .from("case_link_current")
    .select("position")
    .eq("case_id", caseId)
    .eq("id", last.id)
    .single();
  expect(persisted.error).toBeNull();
  expect(persisted.data?.position).toBe(24);
});

test("content validation identifies and focuses the invalid note, date and URL controls", async ({
  page,
}) => {
  const caseId = await caseFixture(`Validation QA ${randomUUID()}`);
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page.getByRole("button", { name: "+ Notatka", exact: true }).click();
  const text = page.getByLabel("Treść notatki", { exact: true });
  await page
    .getByRole("button", { name: "Zapisz notatkę", exact: true })
    .click();
  await expect(text).toHaveAttribute("aria-invalid", "true");
  await expect(text).toBeFocused();
  await expect(text).toHaveAttribute("aria-describedby", /.+/);
  await text.fill("Poprawna treść");
  await page.getByLabel("Data notatki", { exact: true }).selectOption("known");
  const date = page.getByLabel("Data zdarzenia", { exact: true });
  await date.fill("2099-01-01");
  await page
    .getByRole("button", { name: "Zapisz notatkę", exact: true })
    .click();
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(date).toBeFocused();
  page.once("dialog", (confirmation) => void confirmation.accept());
  await page
    .locator("form")
    .filter({ has: text })
    .getByRole("button", { name: "Anuluj", exact: true })
    .click();
  await page.getByRole("button", { name: "Dodaj link", exact: true }).click();
  const url = page.getByLabel("Adres URL", { exact: true });
  await url.fill("ftp://example.invalid/path");
  await page.getByRole("button", { name: "Zapisz link", exact: true }).click();
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(url).toBeFocused();
  await expect(url).toHaveAttribute("aria-describedby", /.+/);
});

test("workspace drawer uses Warsaw day for an ordinary note at UTC midnight boundary", async ({
  page,
}) => {
  const title = `Warsaw QA ${randomUUID()}`;
  const caseId = await caseFixture(title);
  const { client } = await sdkLogin(target, owner);
  const result = await client.rpc("execute_case_content_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create-note",
      caseId,
      body: "Warsaw day fixture",
      dateKind: "ordinary",
      occurredOn: null,
    },
  });
  expect(result.error).toBeNull();
  const database = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  try {
    const triggerState = () =>
      database`SELECT tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='public.case_note'::regclass AND tgname='case_note_projection_guard'`;
    const before = await triggerState();
    expect(before).toHaveLength(1);
    expect(before[0].tgenabled).toBe("O");
    try {
      await database.begin(async (tx) => {
        await tx.unsafe(
          "ALTER TABLE public.case_note DISABLE TRIGGER case_note_projection_guard",
        );
        await tx.unsafe(
          "UPDATE public.case_note SET created_at=$1::timestamptz WHERE owner_id=$2::uuid AND id=$3::uuid",
          ["2020-01-01T23:30:00Z", owner.id, result.data.note.id],
        );
        await tx.unsafe(
          "ALTER TABLE public.case_note ENABLE TRIGGER case_note_projection_guard",
        );
      });
    } finally {
      expect(await triggerState()).toEqual(before);
    }
  } finally {
    await database.end();
  }
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments?view=list`);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  const drawer = page.getByRole("dialog", {
    name: "Podgląd sprawy",
    exact: true,
  });
  await expect(drawer).toContainText("Warsaw day fixture");
  await expect(drawer).toContainText("Data zdarzenia: 2020-01-02");
});

for (const operation of ["void", "correct"] as const) {
  test(`committed link ${operation} and failed refresh never leave the old URL actionable`, async ({
    page,
  }) => {
    const caseId = await caseFixture(`Stale link QA ${randomUUID()}`);
    const { client } = await sdkLogin(target, owner);
    const oldUrl = `https://example.invalid/stale-${randomUUID()}`;
    const updatedUrl = `https://example.invalid/current-${randomUUID()}`;
    const saved = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: { operation: "add-link", caseId, url: oldUrl, role: "other" },
    });
    expect(saved.error).toBeNull();
    const linkId = saved.data.link.id as string;
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    const row = page.locator(`#case-link-additional-${linkId}`);
    await expect(row).toContainText(oldUrl);
    let failRead = false;
    await page.route("**/recruitments/content?*", async (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (failRead && params.has("linksPage"))
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ kind: "unavailable" }),
        });
      return route.continue();
    });
    if (operation === "void") {
      page.once("dialog", (confirmation) => void confirmation.accept());
      failRead = true;
      await page
        .getByRole("button", { name: `Unieważnij link ${oldUrl}`, exact: true })
        .click();
    } else {
      await page
        .getByRole("button", { name: `Popraw link ${oldUrl}`, exact: true })
        .click();
      const editor = page
        .locator("form")
        .filter({ has: page.getByLabel("Adres URL", { exact: true }) });
      await editor.getByLabel("Adres URL", { exact: true }).fill(updatedUrl);
      failRead = true;
      await editor
        .getByRole("button", { name: "Zapisz link", exact: true })
        .click();
    }
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "Nie udało się pobrać linków." });
    await expect(alert).toBeVisible();
    const staleLink = page.locator(`a[href="${oldUrl}"]`);
    await expect(staleLink).toBeHidden();
    await expect(staleLink).not.toBeFocused();
    await expect(
      page.getByRole("button", { name: `Popraw link ${oldUrl}`, exact: true }),
    ).toHaveCount(0);
    failRead = false;
    await alert
      .getByRole("button", { name: "Spróbuj ponownie", exact: true })
      .click();
    if (operation === "correct") {
      await expect(row).toContainText(updatedUrl);
      await expect(row).not.toContainText(oldUrl);
    } else {
      await page.getByText("Unieważnione linki", { exact: true }).click();
      await expect(
        page.getByText(`Unieważniony link: ${oldUrl}`, { exact: true }),
      ).toBeVisible();
    }
  });
}

test("canonical link URL is frozen for a lost-response retry and invalid schemes never write", async ({
  page,
}) => {
  const caseId = await caseFixture(`Canonical QA ${randomUUID()}`);
  const raw = `https://żółć.example/ścieżka ze spacją/${randomUUID()}`;
  const canonical = new URL(raw).href;
  const { client } = await sdkLogin(target, owner);
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  await page.getByRole("button", { name: "Dodaj link", exact: true }).click();
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Adres URL", { exact: true }) });
  let posts = 0;
  let frozen: { requestId: string; payload: { url: string } } | null = null;
  await page.route("**/recruitments/content", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    frozen = route.request().postDataJSON();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"kind":"unavailable"}',
    });
  });
  await form
    .getByLabel("Adres URL", { exact: true })
    .fill("javascript:alert(1)");
  await form.getByRole("button", { name: "Zapisz link", exact: true }).click();
  expect(posts).toBe(0);
  await form.getByLabel("Adres URL", { exact: true }).fill(raw);
  await form.getByRole("button", { name: "Zapisz link", exact: true }).click();
  await expect(
    page.getByText(/Wynik zapisu jest niepewny/).first(),
  ).toBeVisible();
  expect(frozen!.payload.url).toBe(canonical);
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("button", { name: "Ponów identyczny zapis", exact: true })
    .click();
  const receipt = await client
    .from("case_content_command")
    .select("payload")
    .eq("request_id", frozen!.requestId)
    .single();
  expect(receipt.error).toBeNull();
  expect(receipt.data?.payload).toEqual(frozen!.payload);
  const link = await client
    .from("case_link_current")
    .select("id,url")
    .eq("case_id", caseId)
    .single();
  expect(link.error).toBeNull();
  expect(link.data?.url).toBe(canonical);
  await page.getByRole("button", { name: "Dodaj link", exact: true }).click();
  const duplicate = page
    .locator("form")
    .filter({ has: page.getByLabel("Adres URL", { exact: true }) });
  await duplicate.getByLabel("Adres URL", { exact: true }).fill(raw);
  await duplicate
    .getByRole("button", { name: "Zapisz link", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Otwórz istniejący link", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await duplicate.getByRole("button", { name: "Anuluj", exact: true }).click();
  const row = page.locator(`#case-link-additional-${link.data!.id}`);
  await row
    .getByRole("button", { name: `Popraw link ${canonical}`, exact: true })
    .click();
  const changedRaw = `https://zażółć.example/inna ścieżka/${randomUUID()}`;
  await row.getByLabel("Adres URL", { exact: true }).fill(changedRaw);
  await row.getByRole("button", { name: "Zapisz link", exact: true }).click();
  await expect(row).toContainText(new URL(changedRaw).href);
});

for (const kind of ["note", "link"] as const) {
  test(`stale ${kind} preserves its draft through failed refresh and requires explicit new consent`, async ({
    page,
  }) => {
    const caseId = await caseFixture(`Conflict QA ${randomUUID()}`);
    const { client } = await sdkLogin(target, owner);
    const oldUrl = `https://example.invalid/old-${randomUUID()}`;
    const remoteUrl = `https://example.invalid/remote-${randomUUID()}`;
    const draft =
      kind === "note"
        ? `Szkic ${randomUUID()}`
        : `https://example.invalid/draft-${randomUUID()}`;
    const create = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload:
        kind === "note"
          ? {
              operation: "create-note",
              caseId,
              body: "Pierwotna notatka",
              dateKind: "ordinary",
              occurredOn: null,
            }
          : { operation: "add-link", caseId, url: oldUrl, role: "other" },
    });
    expect(create.error).toBeNull();
    const id = (
      kind === "note" ? create.data.note.id : create.data.link.id
    ) as string;
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    const row =
      kind === "note"
        ? page.locator(`#note-${id}`)
        : page.locator(`#case-link-additional-${id}`);
    await row
      .getByRole("button", {
        name: kind === "note" ? "Popraw notatkę" : `Popraw link ${oldUrl}`,
        exact: true,
      })
      .click();
    const editor = row.locator("form");
    const field = editor.getByLabel(
      kind === "note" ? "Treść notatki" : "Adres URL",
      { exact: true },
    );
    await field.fill(draft);
    const other = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload:
        kind === "note"
          ? {
              operation: "correct-note",
              caseId,
              id,
              expectedRevision: 0,
              body: "Zmiana drugiego klienta",
              dateKind: "ordinary",
              occurredOn: null,
            }
          : {
              operation: "correct-link",
              caseId,
              id,
              source: "additional",
              expectedRevision: 0,
              url: remoteUrl,
              role: "other",
              position: create.data.link.position,
            },
    });
    expect(other.error).toBeNull();
    const writes: {
      requestId: string;
      payload: { expectedRevision: number };
    }[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/recruitments/content"
      )
        writes.push(request.postDataJSON());
    });
    const save = editor.getByRole("button", {
      name: kind === "note" ? "Zapisz notatkę" : "Zapisz link",
      exact: true,
    });
    await save.click();
    await expect(page.getByText(/Dane zmieniły się/).first()).toBeVisible();
    await expect(field).toHaveValue(draft);
    await expect(save).toBeDisabled();
    let failRead = true;
    await page.route("**/recruitments/content?*", async (route) => {
      if (failRead && route.request().method() === "GET") {
        failRead = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: "{}",
        });
      }
      return route.continue();
    });
    const refresh = editor.getByRole("button", {
      name: "Pobierz aktualną wersję",
      exact: true,
    });
    await refresh.click();
    await expect(
      editor.getByText("Nie udało się pobrać aktualnej wersji."),
    ).toBeVisible();
    await expect(field).toHaveValue(draft);
    await expect(save).toBeDisabled();
    await refresh.click();
    await expect(
      editor.getByText(kind === "note" ? "Zmiana drugiego klienta" : remoteUrl),
    ).toBeVisible();
    await expect(field).toHaveValue(draft);
    await expect(save).toBeDisabled();
    await editor
      .getByRole("button", {
        name: "Użyj aktualnej wersji jako podstawy",
        exact: true,
      })
      .click();
    await expect(field).toHaveValue(draft);
    await save.click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[0].payload.expectedRevision).toBe(0);
    expect(writes[1].payload.expectedRevision).toBe(1);
    expect(writes[0].requestId).not.toBe(writes[1].requestId);
    await expect(row).toContainText(draft);
  });
}

for (const kind of ["note", "link"] as const) {
  test(`a remotely voided ${kind} keeps the draft and cannot be resubmitted`, async ({
    page,
  }) => {
    const caseId = await caseFixture(`Voided conflict QA ${randomUUID()}`);
    const { client } = await sdkLogin(target, owner);
    const url = `https://example.invalid/void-${randomUUID()}`;
    const draft =
      kind === "note"
        ? `Szkic ${randomUUID()}`
        : `https://example.invalid/draft-${randomUUID()}`;
    const created = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload:
        kind === "note"
          ? {
              operation: "create-note",
              caseId,
              body: "Pierwotna notatka",
              dateKind: "ordinary",
              occurredOn: null,
            }
          : { operation: "add-link", caseId, url, role: "other" },
    });
    expect(created.error).toBeNull();
    const id = (
      kind === "note" ? created.data.note.id : created.data.link.id
    ) as string;
    await login(page);
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    const row =
      kind === "note"
        ? page.locator(`#note-${id}`)
        : page.locator(`#case-link-additional-${id}`);
    await row
      .getByRole("button", {
        name: kind === "note" ? "Popraw notatkę" : `Popraw link ${url}`,
        exact: true,
      })
      .click();
    const editor = row.locator("form");
    const field = editor.getByLabel(
      kind === "note" ? "Treść notatki" : "Adres URL",
      { exact: true },
    );
    await field.fill(draft);
    const voided = await client.rpc("execute_case_content_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: kind === "note" ? "void-note" : "void-link",
        caseId,
        id,
        expectedRevision: 0,
        ...(kind === "link" ? { source: "additional" } : {}),
      },
    });
    expect(voided.error).toBeNull();
    const save = editor.getByRole("button", {
      name: kind === "note" ? "Zapisz notatkę" : "Zapisz link",
      exact: true,
    });
    await save.click();
    await expect(page.getByText(/Dane zmieniły się/).first()).toBeVisible();
    await editor
      .getByRole("button", { name: "Pobierz aktualną wersję", exact: true })
      .click();
    await expect(
      editor.getByText(
        "Rekord jest niedostępny lub został unieważniony. Zachowaj lub skopiuj szkic.",
      ),
    ).toBeVisible();
    await expect(field).toHaveValue(draft);
    await expect(save).toBeDisabled();
  });
}
