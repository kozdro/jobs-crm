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

for (const delivered of [true, false]) {
  test(`reload recovery keeps only owner/request identifiers when response is ${delivered ? "lost after commit" : "undelivered"}`, async ({
    page,
  }) => {
    await login(page);
    await page.goto(`${target.appOrigin}/calendar`);
    await page
      .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
      .click();
    const title = `Prywatny zamiar ${randomUUID()}`;
    await page.getByLabel("Tytuł wydarzenia", { exact: true }).fill(title);
    await page.getByLabel("Data", { exact: true }).fill("2099-05-15");
    let requestId = "";
    await page.route("**/calendar/commands", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      requestId = route.request().postDataJSON().requestId;
      if (delivered) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
      }
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(requestId).toBeTruthy();
    const key = `jobs-crm.calendar.pending.${user.id}`;
    const stored = await page.evaluate(
      (storageKey) => sessionStorage.getItem(storageKey),
      key,
    );
    expect(stored).not.toContain(title);
    const storageContents = await page.evaluate(() =>
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    );
    expect(storageContents).not.toContain(title);
    expect(JSON.parse(stored!)).toEqual({ ownerId: user.id, requestId });
    await page.unroute("**/calendar/commands");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Ponów ten sam zapis", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Sprawdź wynik", exact: true })
      .click();
    if (delivered) {
      await expect(
        page.getByText(`Odzyskane wydarzenie: ${title}`, { exact: false }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          (storageKey) => sessionStorage.getItem(storageKey),
          key,
        ),
      ).toBe(stored);
      await page
        .getByRole("button", { name: "Potwierdź wynik", exact: true })
        .click();
      await expect(
        page.getByRole("article", { name: title, exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(
          /Nie odnaleziono potwierdzenia. Wynik pozostaje nieznany/,
        ),
      ).toBeVisible();
      expect(
        await page.evaluate(
          (storageKey) => sessionStorage.getItem(storageKey),
          key,
        ),
      ).toBe(stored);
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByRole("button", { name: "Porzuć oczekiwanie", exact: true })
        .click();
      await expect(
        page.getByRole("article", { name: title, exact: true }),
      ).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        (storageKey) => sessionStorage.getItem(storageKey),
        key,
      ),
    ).toBeNull();
  });
}

test("direct stale conflict preserves edited values for a refreshed preview", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `Direct conflict ${randomUUID()}`;
  const values = {
    title,
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
  const created = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "create", values },
  });
  expect(created.error).toBeNull();
  const eventId = created.data.event.id as string;
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const event = page.getByRole("article", { name: title, exact: true });
  await event
    .getByRole("button", { name: "Edytuj wydarzenie", exact: true })
    .click();
  const draftTitle = `Wpisany szkic ${randomUUID()}`;
  await event.getByLabel("Tytuł wydarzenia", { exact: true }).fill(draftTitle);
  const changed = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "edit",
      eventId,
      expectedRevision: 0,
      values: { ...values, description: "Równoczesna zmiana" },
    },
  });
  expect(changed.error).toBeNull();
  await event
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(page.getByText(/Wydarzenie zmieniło się/)).toBeVisible();
  await expect(
    event.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  await page
    .getByRole("button", { name: "Odśwież podgląd", exact: true })
    .click();
  await expect(
    page.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  await page
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Podgląd korekty", exact: true }),
  ).toBeVisible();
  const current = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: eventId,
  });
  expect(current.error).toBeNull();
  expect(current.data.title).toBe(title);
  expect(current.data.description).toBe("Równoczesna zmiana");
});

test("canceling a dirty event form asks before discarding and may be rejected", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  const title = page.getByLabel("Tytuł wydarzenia", { exact: true });
  await title.fill("Niezapisane dane");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(title).toHaveValue("Niezapisane dane");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(title).toHaveCount(0);
});

for (const direction of ["back", "forward"] as const) {
  test(`browser ${direction} protects a dirty calendar form in SPA navigation`, async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalendarz", exact: true }).click();
    await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
    if (direction === "forward") {
      await page.getByRole("link", { name: "Dashboard", exact: true }).click();
      await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
      await page.goBack();
      await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
    }
    await page
      .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
      .click();
    const title = page.getByLabel("Tytuł wydarzenia", { exact: true });
    await title.fill(`Szkic nawigacja ${randomUUID()}`);
    const entered = await title.inputValue();
    let prompts = 0;
    page.once("dialog", async (dialog) => {
      prompts++;
      await dialog.dismiss();
    });
    await page.evaluate(
      (step) => (step === "back" ? history.back() : history.forward()),
      direction,
    );
    await expect.poll(() => prompts).toBe(1);
    await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
    await expect(title).toHaveValue(entered);
  });
}

test("browser without Navigation API restores the working draft after back and forward", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "navigation", {
      value: undefined,
      configurable: true,
    });
  });
  await login(page);
  await page.getByRole("link", { name: "Kalendarz", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  const title = `Szkic bez Navigation API ${randomUUID()}`;
  await page.getByLabel("Tytuł wydarzenia", { exact: true }).fill(title);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Wczytaj szkic", exact: true })
    .click();
  await expect(
    page.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(title);
});

test("an open calendar moves an event to attention after its deadline without changing status", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const initialNow = Date.now();
  const due = new Date((Math.floor(initialNow / 60000) + 3) * 60000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(due)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const offset =
    (Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    ) -
      due.getTime()) /
    60000;
  const title = `Upcoming clock ${randomUUID()}`;
  const created = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      values: {
        title,
        description: null,
        caseId: null,
        status: "planned",
        timeZone: "Europe/Warsaw",
        actual: null,
        participants: [],
        schedule: {
          startDate: day,
          startTime: time,
          endDate: null,
          endTime: null,
          allDay: false,
          timeZone: "Europe/Warsaw",
          startOffset: offset,
          endOffset: null,
        },
      },
    },
  });
  expect(created.error).toBeNull();
  await login(page);
  await page.clock.install({ time: new Date(initialNow) });
  await page.goto(`${target.appOrigin}/calendar`);
  const event = page.getByRole("article", { name: title, exact: true });
  await expect(event).toBeVisible();
  await expect(event).not.toContainText("wymaga rozliczenia");
  await event
    .getByRole("button", { name: "Edytuj wydarzenie", exact: true })
    .click();
  const draftTitle = `Szkic podczas terminu ${randomUUID()}`;
  await event.getByLabel("Tytuł wydarzenia", { exact: true }).fill(draftTitle);
  await page.clock.runFor(5 * 60 * 1000);
  await expect(
    event.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  await event
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  const savedEvent = page.getByRole("article", {
    name: draftTitle,
    exact: true,
  });
  await expect(savedEvent).toContainText("wymaga rozliczenia");
  await expect(savedEvent).not.toContainText("Odbyte");
  const after = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: created.data.event.id,
  });
  expect(after.error).toBeNull();
  expect(after.data.status).toBe("planned");
  expect(after.data.title).toBe(draftTitle);
});

test("unplanned event shows its own zone and actual offset in card, audit and case timeline", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const createdCase = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: `Offset case ${randomUUID()}`,
  });
  expect(createdCase.error).toBeNull();
  const caseId = createdCase.data.case.id as string;
  const title = `Actual offset ${randomUUID()}`;
  const created = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      values: {
        title,
        description: null,
        caseId,
        status: "occurred",
        schedule: null,
        timeZone: "UTC",
        actual: {
          date: "2020-10-25",
          time: "02:30",
          offset: 120,
          timeZone: "Europe/Warsaw",
        },
        participants: [],
      },
    },
  });
  expect(created.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const event = page.getByRole("article", { name: title, exact: true });
  await expect(event).toContainText("Strefa wydarzenia: UTC");
  await expect(event).toContainText("02:30 UTC+02:00");
  await event
    .getByRole("button", { name: "Pokaż historię wydarzenia", exact: true })
    .click();
  const audit = event.getByRole("region", { name: "Historia wydarzenia" });
  await expect(audit).toContainText("Strefa wydarzenia: UTC");
  await expect(audit).toContainText("02:30 UTC+02:00");
  await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
  const timeline = page.getByRole("region", {
    name: "Historia sprawy",
    exact: true,
  });
  await expect(timeline).toContainText(title);
  await expect(timeline).toContainText("Strefa wydarzenia: UTC");
  await expect(timeline).toContainText("02:30 UTC+02:00");
});
