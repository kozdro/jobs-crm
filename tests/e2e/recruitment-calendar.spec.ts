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
    const editDialog = page.getByRole("dialog", {
      name: "Edytuj wydarzenie",
      exact: true,
    });
    await editDialog.getByLabel("Data", { exact: true }).fill("2099-05-16");
    await editDialog
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
    const resolveDialog = page.getByRole("dialog", {
      name: "Rozlicz wydarzenie",
      exact: true,
    });
    await resolveDialog
      .getByLabel("Wynik", { exact: true })
      .selectOption("not_occurred");
    await resolveDialog
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
  const correctionDialog = page.getByRole("dialog", {
    name: "Skoryguj wydarzenie",
    exact: true,
  });
  await correctionDialog
    .getByLabel("Wynik", { exact: true })
    .selectOption("cancelled");
  await correctionDialog
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await correctionDialog
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
  let finishIntercept!: () => void;
  const intercepted = new Promise<void>((resolve) => {
    finishIntercept = resolve;
  });
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.postDataJSON().action === "confirm") {
      sent = req.postDataJSON();
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
      finishIntercept();
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
  await intercepted;
  await expect(
    page.getByText(/Wynik zapisu jest nieznany\. Zapis mógł się powieść/),
  ).toBeVisible();
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
  const editDialog = page.getByRole("dialog", {
    name: "Edytuj wydarzenie",
    exact: true,
  });
  await editDialog
    .getByLabel("Tytuł wydarzenia", { exact: true })
    .fill(draftTitle);
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
  await editDialog
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(page.getByText(/Wydarzenie zmieniło się/)).toBeVisible();
  await expect(
    editDialog.getByLabel("Tytuł wydarzenia", { exact: true }),
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

test("Calendar dialog traps keyboard focus, protects dirty Escape and returns focus on cancel at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const trigger = page.getByRole("button", {
    name: "Dodaj wydarzenie",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Nowe wydarzenie",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const title = dialog.getByLabel("Tytuł wydarzenia", { exact: true });
  await expect(title).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Tab");
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  await title.fill(`Niezapisany dialog ${randomUUID()}`);
  const value = await title.inputValue();
  page.once("dialog", (warning) => warning.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(title).toHaveValue(value);
  page.once("dialog", (warning) => warning.accept());
  await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("every Calendar form dialog exposes its own accessible name and focuses the title", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const { client } = await sdkLogin(target, user);
  const plannedTitle = `Named planned ${randomUUID()}`;
  const occurredTitle = `Named occurred ${randomUUID()}`;
  const values = {
    title: plannedTitle,
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
  const planned = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: { operation: "create", values },
  });
  expect(planned.error).toBeNull();
  const occurred = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      values: {
        ...values,
        title: occurredTitle,
        status: "occurred",
        schedule: null,
      },
    },
  });
  expect(occurred.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  for (const [action, name] of [
    ["Dodaj wydarzenie", "Nowe wydarzenie"],
    ["Zapisz odbytą rozmowę", "Zapisz odbytą rozmowę"],
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Tytuł wydarzenia", { exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  for (const [title, action, name] of [
    [plannedTitle, "Edytuj wydarzenie", "Edytuj wydarzenie"],
    [plannedTitle, "Przełóż termin", "Edytuj wydarzenie"],
    [plannedTitle, "Rozlicz wydarzenie", "Rozlicz wydarzenie"],
    [occurredTitle, "Skoryguj wydarzenie", "Skoryguj wydarzenie"],
  ]) {
    await page
      .getByRole("article", { name: title, exact: true })
      .getByRole("button", { name: action, exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Tytuł wydarzenia", { exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("uncertain Calendar dialog cannot be dismissed silently and keeps pending identifiers", async ({
  page,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Nowe wydarzenie",
    exact: true,
  });
  const title = `Nieznany wynik ${randomUUID()}`;
  await dialog.getByLabel("Tytuł wydarzenia", { exact: true }).fill(title);
  await dialog.getByLabel("Data", { exact: true }).fill("2099-05-15");
  await page.route("**/calendar/commands", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  let warningText = "";
  page.once("dialog", (warning) => {
    warningText = warning.message();
    void warning.dismiss();
  });
  await page.keyboard.press("Escape");
  expect(warningText).toContain("Wynik zapisu jest nieznany");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(title);
  page.once("dialog", (warning) => warning.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sprawdź wynik", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    `jobs-crm.calendar.pending.${user.id}`,
  );
  expect(Object.keys(JSON.parse(stored!)).sort()).toEqual([
    "ownerId",
    "requestId",
  ]);
  expect(stored).not.toContain(title);
  await page
    .getByRole("button", { name: "Sprawdź wynik", exact: true })
    .click();
  await expect(
    page.getByText(/Nie odnaleziono potwierdzenia. Wynik pozostaje nieznany/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      `jobs-crm.calendar.pending.${user.id}`,
    ),
  ).toBe(stored);
});

for (const mode of ["create", "occurred"] as const) {
  test(`unknown ${mode} can be closed using a visible button with confirmation and focus on recovery`, async ({
    page,
  }) => {
    await login(page);
    await page.goto(`${target.appOrigin}/calendar`);
    const action =
      mode === "create" ? "Dodaj wydarzenie" : "Zapisz odbytą rozmowę";
    const dialogName =
      mode === "create" ? "Nowe wydarzenie" : "Zapisz odbytą rozmowę";
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
    const title = `Unknown ${mode} ${randomUUID()}`;
    await dialog.getByLabel("Tytuł wydarzenia", { exact: true }).fill(title);
    if (mode === "create")
      await dialog.getByLabel("Data", { exact: true }).fill("2099-05-15");
    await page.route("**/calendar/commands", async (route) => {
      if (route.request().method() === "POST") await route.abort("failed");
      else await route.continue();
    });
    await dialog
      .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Nie potwierdzono wyniku",
    );
    const close = dialog.getByRole("button", {
      name: "Zamknij formularz",
      exact: true,
    });
    await expect(close).toBeVisible();
    await expect(close).toBeEnabled();
    let warningText = "";
    page.once("dialog", (warning) => {
      warningText = warning.message();
      void warning.dismiss();
    });
    await close.click();
    expect(warningText).toContain("Wynik zapisu jest nieznany");
    await expect(dialog).toBeVisible();
    page.once("dialog", (warning) => warning.accept());
    await close.click();
    await expect(dialog).toHaveCount(0);
    const recovery = page.getByRole("button", {
      name: "Sprawdź wynik",
      exact: true,
    });
    await expect(recovery).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const focused = document.activeElement;
          return (
            focused?.textContent?.trim() === "Sprawdź wynik" ||
            (focused?.tagName === "H2" &&
              focused.textContent?.trim() === "Kalendarz")
          );
        }),
      )
      .toBe(true);
    const stored = await page.evaluate(
      (key) => sessionStorage.getItem(key),
      `jobs-crm.calendar.pending.${user.id}`,
    );
    expect(Object.keys(JSON.parse(stored!)).sort()).toEqual([
      "ownerId",
      "requestId",
    ]);
    expect(stored).not.toContain(title);
  });
}

test("pending Calendar intent blocks changes to other events while recovery and audit remain available", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const plannedTitle = `Other planned ${randomUUID()}`;
  const occurredTitle = `Other occurred ${randomUUID()}`;
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
  const create = async (title: string, status: "planned" | "occurred") => {
    const result = await client.rpc("execute_recruitment_calendar_command", {
      p_request_id: randomUUID(),
      p_payload: {
        operation: "create",
        values: {
          title,
          description: null,
          caseId: null,
          status,
          timeZone: "Europe/Warsaw",
          actual: null,
          participants: [],
          schedule: status === "planned" ? schedule : null,
        },
      },
    });
    expect(result.error).toBeNull();
    return result.data.event as {
      id: string;
      revision: number;
      status: string;
    };
  };
  const planned = await create(plannedTitle, "planned");
  const occurred = await create(occurredTitle, "occurred");
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Dodaj wydarzenie", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Nowe wydarzenie",
    exact: true,
  });
  await dialog
    .getByLabel("Tytuł wydarzenia", { exact: true })
    .fill(`Pending ${randomUUID()}`);
  await dialog.getByLabel("Data", { exact: true }).fill("2099-05-15");
  await page.route("**/calendar/commands", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Nie potwierdzono wyniku",
  );
  page.once("dialog", (warning) => warning.accept());
  await dialog
    .getByRole("button", { name: "Zamknij formularz", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const plannedArticle = page.getByRole("article", {
    name: plannedTitle,
    exact: true,
  });
  const occurredArticle = page.getByRole("article", {
    name: occurredTitle,
    exact: true,
  });
  for (const action of [
    "Edytuj wydarzenie",
    "Przełóż termin",
    "Rozlicz wydarzenie",
  ]) {
    await expect(
      plannedArticle.getByRole("button", { name: action, exact: true }),
    ).toBeDisabled();
  }
  await expect(
    occurredArticle.getByRole("button", {
      name: "Skoryguj wydarzenie",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(plannedArticle).toContainText(
    "Najpierw sprawdź wynik poprzedniego zapisu wydarzenia.",
  );
  await expect(
    page.getByRole("button", { name: "Sprawdź wynik", exact: true }),
  ).toBeVisible();
  await expect(
    plannedArticle.getByRole("button", {
      name: "Pokaż historię wydarzenia",
      exact: true,
    }),
  ).toBeEnabled();
  await plannedArticle
    .getByRole("button", { name: "Pokaż historię wydarzenia", exact: true })
    .click();
  await expect(
    plannedArticle.getByRole("region", { name: "Historia wydarzenia" }),
  ).toBeVisible();
  const [plannedAfter, occurredAfter] = await Promise.all([
    client.rpc("get_recruitment_calendar_event", { p_event_id: planned.id }),
    client.rpc("get_recruitment_calendar_event", { p_event_id: occurred.id }),
  ]);
  expect(plannedAfter.error).toBeNull();
  expect(occurredAfter.error).toBeNull();
  expect(plannedAfter.data.revision).toBe(planned.revision);
  expect(occurredAfter.data.revision).toBe(occurred.revision);
  await page.unroute("**/calendar/commands");
  await page
    .getByRole("button", { name: "Sprawdź wynik", exact: true })
    .click();
  await expect(
    page.getByText(/Nie odnaleziono potwierdzenia. Wynik pozostaje nieznany/),
  ).toBeVisible();
  page.once("dialog", (warning) => warning.accept());
  await page
    .getByRole("button", { name: "Porzuć oczekiwanie", exact: true })
    .click();
  await expect(
    plannedArticle.getByRole("button", {
      name: "Edytuj wydarzenie",
      exact: true,
    }),
  ).toBeEnabled();
});

for (const action of ["Edytuj wydarzenie", "Rozlicz wydarzenie"] as const) {
  test(`canceling ${action} returns focus to the same event action after list refresh`, async ({
    page,
  }) => {
    const { client } = await sdkLogin(target, user);
    const title = `Focus return ${randomUUID()}`;
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
    });
    expect(created.error).toBeNull();
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page);
    await page.goto(`${target.appOrigin}/calendar`);
    const article = page.getByRole("article", { name: title, exact: true });
    const trigger = article.getByRole("button", { name: action, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: action, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const after = await client.rpc("get_recruitment_calendar_event", {
      p_event_id: created.data.event.id,
    });
    expect(after.error).toBeNull();
    expect(after.data.status).toBe("planned");
    expect(after.data.revision).toBe(created.data.event.revision);
  });
}

test("failed refresh after cancel keeps the event visible, reports stale data and restores focus", async ({
  page,
}) => {
  const { client } = await sdkLogin(target, user);
  const title = `Focus on failed refresh ${randomUUID()}`;
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
  });
  expect(created.error).toBeNull();
  await login(page);
  await page.goto(`${target.appOrigin}/calendar`);
  const article = page.getByRole("article", { name: title, exact: true });
  const trigger = article.getByRole("button", {
    name: "Edytuj wydarzenie",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Edytuj wydarzenie",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  let failedReads = 0;
  await page.route("**/calendar/commands?*", async (route) => {
    if (route.request().method() === "GET") {
      failedReads++;
      await route.abort("failed");
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
  await expect.poll(() => failedReads).toBeGreaterThan(0);
  await expect(dialog).toHaveCount(0);
  await expect(article).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Wyświetlone dane mogą być nieaktualne." }),
  ).toBeVisible();
  await page.unroute("**/calendar/commands?*");
  await page
    .getByRole("button", { name: "Spróbuj ponownie", exact: true })
    .click();
  await expect(article).toBeVisible();
  await expect(
    page.getByText("Wyświetlone dane mogą być nieaktualne.", { exact: false }),
  ).toHaveCount(0);
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

test("restored in-memory edit shows fresh server baseline against preserved draft before saving", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "navigation", {
      value: undefined,
      configurable: true,
    }),
  );
  const { client } = await sdkLogin(target, user);
  const original = `Original ${randomUUID()}`;
  const values = {
    title: original,
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
  await page.getByRole("link", { name: "Kalendarz", exact: true }).click();
  const article = page.getByRole("article", { name: original, exact: true });
  await article
    .getByRole("button", { name: "Edytuj wydarzenie", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Edytuj wydarzenie",
    exact: true,
  });
  const draftTitle = `Szkic ${randomUUID()}`;
  await edit.getByLabel("Tytuł wydarzenia", { exact: true }).fill(draftTitle);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  const currentTitle = `Zmieniony serwer ${randomUUID()}`;
  const changed = await client.rpc("execute_recruitment_calendar_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "edit",
      eventId,
      expectedRevision: 0,
      values: { ...values, title: currentTitle },
    },
  });
  expect(changed.error).toBeNull();
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(`${target.appOrigin}/calendar`);
  await page
    .getByRole("button", { name: "Wczytaj szkic", exact: true })
    .click();
  const restored = page.getByRole("dialog", {
    name: "Zachowany szkic zmiany wydarzenia",
    exact: true,
  });
  await expect(
    restored.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toBeFocused();
  await expect(
    restored.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  await restored
    .getByRole("button", { name: "Zapisz wydarzenie", exact: true })
    .click();
  const preview = restored
    .getByRole("heading", { name: "Podgląd korekty", exact: true })
    .locator("..");
  await expect(preview).toContainText(currentTitle);
  await expect(preview).toContainText(draftTitle);
  const before = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: eventId,
  });
  expect(before.data.title).toBe(currentTitle);
  await restored
    .getByRole("button", { name: "Potwierdź korektę", exact: true })
    .click();
  await expect(restored).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: draftTitle, exact: true }),
  ).toBeVisible();
  const saved = await client.rpc("get_recruitment_calendar_event", {
    p_event_id: eventId,
  });
  expect(saved.error).toBeNull();
  expect(saved.data.title).toBe(draftTitle);
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
  const editDialog = page.getByRole("dialog", {
    name: "Edytuj wydarzenie",
    exact: true,
  });
  await editDialog
    .getByLabel("Tytuł wydarzenia", { exact: true })
    .fill(draftTitle);
  await page.clock.runFor(5 * 60 * 1000);
  await expect(
    editDialog.getByLabel("Tytuł wydarzenia", { exact: true }),
  ).toHaveValue(draftTitle);
  await editDialog
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
