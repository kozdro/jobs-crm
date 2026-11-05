/** Calendar Core: production HTTPS, real identity and owned disposable data. */
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

test("correcting an unplanned conversation sends resolve, keeps history and does not invent a plan", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Zapisz odbytą rozmowę", exact: true })
    .click();
  const title = `Korekta rozmowy ${randomUUID()}`;
  await page.getByLabel("Tytuł wydarzenia", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  const event = page.getByRole("article", { name: title, exact: true });
  await expect(event).toContainText("Odbyte");
  await expect(event).toContainText("Bez wcześniejszego planu");
  let operation: string | undefined;
  await page.route("**/calendar/commands", async (route) => {
    if (route.request().method() === "POST")
      operation = route.request().postDataJSON().operation;
    await route.continue();
  });
  await event
    .getByRole("button", { name: "Skoryguj wydarzenie", exact: true })
    .click();
  await event.getByLabel("Wynik", { exact: true }).selectOption("cancelled");
  await event
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await event
    .getByRole("button", { name: "Potwierdź korektę", exact: true })
    .click();
  await expect(event).toContainText("Anulowane");
  expect(operation).toBe("resolve");
  await expect(event).toContainText("Bez wcześniejszego planu");
  await event
    .getByRole("button", { name: "Pokaż historię wydarzenia", exact: true })
    .click();
  const history = event.getByRole("region", { name: "Historia wydarzenia" });
  await expect(history).toContainText("Odbyte");
  await expect(history).toContainText("Anulowane");
});

test("clearing the start time clears the prior end time when it is shown again", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  await page.getByLabel("Data", { exact: true }).fill("2026-06-01");
  const start = page.getByLabel(/^Godzina \(opcjonalna/);
  const end = page.getByLabel(/^Godzina końca \(opcjonalna/);
  await start.fill("10:00");
  await end.fill("11:00");
  await start.fill("");
  await expect(end).toHaveCount(0);
  await start.fill("12:00");
  await expect(end).toHaveValue("");
});

test("DST repeated hour needs an occurrence and updates its offset when the day changes", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  const date = page.getByLabel("Data", { exact: true });
  await date.fill("2026-10-25");
  await page.getByLabel(/^Godzina \(opcjonalna/).fill("02:30");
  const first = page.getByRole("radio", { name: /Pierwsze \(UTC\+02:00\)/ });
  const second = page.getByRole("radio", { name: /Drugie \(UTC\+01:00\)/ });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).not.toBeChecked();
  await expect(second).not.toBeChecked();
  await first.check();
  await date.fill("2026-10-26");
  await expect(first).toHaveCount(0);
  await expect(
    page.getByText("Godzina początku: UTC+01:00", { exact: true }),
  ).toBeVisible();
});

test("lost mixed-close response recovers receipt with event snapshot and resolutions", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const createdCase = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: `Close recovery ${randomUUID()}`,
  });
  expect(createdCase.error).toBeNull();
  const caseId = createdCase.data.case.id as string;
  const title = `Open event ${randomUUID()}`;
  const createdEvent = await client.rpc(
    "execute_recruitment_calendar_command",
    {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create",
        values: {
          title,
          description: null,
          caseId,
          status: "planned",
          timeZone: "Europe/Warsaw",
          actual: null,
          participants: [],
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
        },
      },
    },
  );
  expect(createdEvent.error).toBeNull();
  const eventId = createdEvent.data.event.id as string;
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  let sent:
    | {
        requestId: string;
        expectedEventSnapshot: string[];
        eventResolutions: unknown[];
      }
    | undefined;
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.postDataJSON().action === "confirm") {
      sent = req.postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Zakończ sprawę", exact: true })
    .click();
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: "Inny" });
  await page
    .getByRole("button", { name: "Pokaż podgląd zmian", exact: true })
    .click();
  const eventChoice = page.getByRole("group", { name: title, exact: true });
  await eventChoice.getByRole("radio", { name: "Odłącz", exact: true }).check();
  await page
    .getByRole("checkbox", {
      name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(sent?.expectedEventSnapshot).toEqual([`${eventId}:0`]);
  expect(sent?.eventResolutions).toEqual([{ eventId, action: "detach" }]);
  await page.unroute("**/recruitments/lifecycle-commands");
  const receipt = await page.request.get(
    `${target.appOrigin}/recruitments/lifecycle-commands?caseId=${caseId}&requestId=${sent!.requestId}`,
  );
  expect(receipt.status()).toBe(200);
  const body = await receipt.json();
  expect(body.entry.expected_event_snapshot).toEqual(
    sent!.expectedEventSnapshot,
  );
  expect(body.entry.event_resolutions).toEqual(sent!.eventResolutions);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Wznów sprawę", exact: true }),
  ).toBeVisible();
  const rows = await client
    .from("recruitment_case_lifecycle")
    .select("id")
    .eq("case_id", caseId);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
});

test("history distinguishes the two occurrences of a repeated DST hour", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `DST history ${randomUUID()}`;
  const values = {
    title,
    description: null,
    caseId: null,
    status: "planned",
    timeZone: "Europe/Warsaw",
    actual: null,
    participants: [],
    schedule: {
      startDate: "2026-10-25",
      startTime: "02:30",
      endDate: null,
      endTime: null,
      allDay: false,
      timeZone: "Europe/Warsaw",
      startOffset: 120,
      endOffset: null,
    },
  };
  const created = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "create", values },
  });
  expect(created.error).toBeNull();
  const changed = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "edit",
      eventId: created.data.event.id,
      expectedRevision: created.data.event.revision,
      values: { ...values, schedule: { ...values.schedule, startOffset: 60 } },
    },
  });
  expect(changed.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const event = page.getByRole("article", { name: title, exact: true });
  await event
    .getByRole("button", { name: "Pokaż historię wydarzenia", exact: true })
    .click();
  const history = event.getByRole("region", { name: "Historia wydarzenia" });
  await expect(history).toContainText("2026-10-25, 02:30 UTC+02:00");
  await expect(history).toContainText("2026-10-25, 02:30 UTC+01:00");
});

test("stale retry after reload preserves draft and never overwrites a concurrent edit", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const originalTitle = `Racing calendar ${randomUUID()}`;
  const values = {
    title: originalTitle,
    description: null,
    caseId: null,
    status: "planned",
    timeZone: "Europe/Warsaw",
    actual: null,
    participants: [],
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
  };
  const create = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "create", values },
  });
  expect(create.error).toBeNull();
  const eventId = create.data.event.id as string;
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const event = page.getByRole("article", { name: originalTitle, exact: true });
  await event
    .getByRole("button", { name: "Edytuj wydarzenie", exact: true })
    .click();
  const draftTitle = `Niezapisany szkic ${randomUUID()}`;
  await event.getByLabel("Tytuł wydarzenia", { exact: true }).fill(draftTitle);
  await page.route("**/calendar/commands", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await event
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/calendar/commands");
  const otherTitle = `Zmiana równoczesna ${randomUUID()}`;
  const changed = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "edit",
      eventId,
      expectedRevision: 0,
      values: { ...values, title: otherTitle },
    },
  });
  expect(changed.error).toBeNull();
  await page.reload();
  await page
    .getByRole("button", { name: "Ponów ten sam zapis", exact: true })
    .click();
  await expect(
    page.getByText(
      "Zapis odrzucono, ponieważ wydarzenie zmieniło się. Zachowaj szkic i odśwież dane.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Zachowaj szkic i odblokuj", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: otherTitle, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wczytaj zachowany szkic", exact: true })
    .click();
  await expect(
    page.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  const current = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: eventId,
  });
  expect(current.error).toBeNull();
  expect(current.data.title).toBe(otherTitle);
});
