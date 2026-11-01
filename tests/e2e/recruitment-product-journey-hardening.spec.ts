/** Journey regressions: DEC052/054-060, BR007/011/016; business writes use UI.
 * Keep approved Situation → Data → Action → Summary; situation is not a fact.
 * Broader create+action stays blocked pending PO atomic-contract decision.
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readRecruitmentTarget } from "../../scripts/recruitment/target.ts";
import { account, login as sdkLogin } from "../integration/auth/fixtures.ts";

for (const width of [1440, 375]) {
  test(`Product journey create to corrections across modules at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const target = await readRecruitmentTarget(
      process.env.RECRUITMENT_TARGET_ID!,
    );
    const user = await account(target);
    const { client } = await sdkLogin(target, user);
    const mark = randomUUID().slice(0, 8);
    const title = `Journey ${mark}`;
    const history = page.getByRole("region", {
      name: "Historia sprawy",
      exact: true,
    });
    const button = (name: string) =>
      page.getByRole("button", { name, exact: true });
    const noOverflow = async () =>
      expect(
        await page.evaluate(() => ({
          inner: innerWidth,
          scroll: document.documentElement.scrollWidth,
        })),
      ).toEqual({ inner: width, scroll: width });
    const navigate = async (name: string) => {
      if (width < 768) await button("Otwórz nawigację").click();
      const nav = page
        .getByRole("navigation", { name: "Główna nawigacja", exact: true })
        .filter({ visible: true });
      await nav.getByRole("link", { name, exact: true }).click();
      if (width < 768)
        await expect(
          page.getByRole("dialog", { name: "Nawigacja", exact: true }),
        ).toHaveCount(0);
      await noOverflow();
    };
    const state = async () => {
      const result = await client
        .from("recruitment_case")
        .select("id,status,current_stage")
        .eq("title", title)
        .single();
      expect(result.error).toBeNull();
      return result.data!;
    };
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await button("Zaloguj się").click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    await button("Dodaj").click();
    const manual = page.getByRole("menuitem", {
      name: "Dodaj ręcznie",
      exact: true,
    });
    if (await manual.count()) await manual.click();
    const dialog = page.getByRole("dialog");
    // A situation describes context only: even "Wykonana aplikacja" must not
    // manufacture an application, status transition, or required action.
    await dialog
      .getByRole("radio", { name: "Wykonana aplikacja", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog
      .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(dialog).toContainText("Sytuacja (pomocniczo)");
    await expect(dialog).toContainText("Wykonana aplikacja");
    await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const initial = await state();
    expect(initial.status).toBe("Zapisane");
    const caseId = initial.id;
    const initialEvents = await client
      .from("recruitment_case_event")
      .select("id")
      .eq("case_id", caseId);
    expect(initialEvents.error).toBeNull();
    expect(initialEvents.data).toEqual([]);
    await page
      .getByRole("link", { name: "Otwórz sprawę", exact: true })
      .click();
    await button("Zarejestruj aplikowanie").click();
    await page
      .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
      .fill("2000-01-01");
    await page
      .getByRole("checkbox", {
        name: "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
        exact: true,
      })
      .check();
    await button("Zapisz zdarzenie").click();
    await expect(
      page.getByRole("form").filter({
        has: page.getByRole("heading", {
          name: /^(Zarejestruj aplikowanie|Zarejestruj kontakt|Zarejestruj zaproszenie|Zmień etap)$/,
        }),
      }),
    ).toHaveCount(0);
    expect((await state()).status).toBe("Kontakt rozpoczęty");
    await button("Zarejestruj kontakt").click();
    await page
      .getByRole("radio", {
        name: "Kontakt przychodzący (inbound)",
        exact: true,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
        exact: true,
      })
      .check();
    await button("Zapisz zdarzenie").click();
    await expect(
      page.getByRole("form").filter({
        has: page.getByRole("heading", {
          name: /^(Zarejestruj aplikowanie|Zarejestruj kontakt|Zarejestruj zaproszenie|Zmień etap)$/,
        }),
      }),
    ).toHaveCount(0);
    for (const [action, stage, consent] of [
      [
        "Zarejestruj zaproszenie",
        "Screening",
        "Potwierdzam otrzymanie zaproszenia do etapu kwalifikacyjnego i ustawienie wskazanego etapu jako bieżącego.",
      ],
      [
        "Zmień etap",
        "Rozmowa techniczna",
        "Potwierdzam rzeczywiste przejście do wskazanego etapu i ustawienie go jako bieżącego.",
      ],
    ]) {
      await button(action).click();
      await page.getByLabel("Nazwa etapu", { exact: true }).fill(stage);
      await page.getByRole("checkbox", { name: consent, exact: true }).check();
      await button("Zapisz zdarzenie").click();
      await expect(
        page.getByRole("form").filter({
          has: page.getByRole("heading", {
            name: /^(Zarejestruj aplikowanie|Zarejestruj kontakt|Zarejestruj zaproszenie|Zmień etap)$/,
          }),
        }),
      ).toHaveCount(0);
    }
    expect(await state()).toMatchObject({
      status: "W rekrutacji",
      current_stage: "Rozmowa techniczna",
    });
    for (const [module, trigger, label, name] of [
      ["Firmy", "Dodaj firmę", "Nazwa firmy", `Firma ${mark}`],
      ["Kontakty", "Dodaj kontakt", "Nazwa kontaktu", `Osoba ${mark}`],
    ]) {
      await navigate(module);
      await button(trigger).click();
      await page.getByLabel(label, { exact: true }).fill(name);
      await button("Zapisz profil").click();
      await expect(page).toHaveURL(/\/(companies|contacts)\/[0-9a-f-]+$/);
      const relations = page.getByRole("region", {
        name: "Powiązania",
        exact: true,
      });
      await relations
        .getByRole("button", { name: "Powiąż ze sprawą", exact: true })
        .click();
      await relations
        .getByLabel("Wybierz sprawę", { exact: true })
        .selectOption(caseId);
      if (module === "Firmy")
        await relations
          .getByLabel("Rola firmy w sprawie", { exact: true })
          .selectOption("employer");
      await relations
        .getByRole("button", { name: "Zapisz powiązanie", exact: true })
        .click();
      await expect(
        relations.getByRole("heading", {
          name: "Nowe powiązanie",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(relations).toContainText(title);
    }
    await navigate("Rekrutacje");
    await page.getByRole("button", { name: title, exact: true }).click();
    const preview = page.getByRole("dialog", {
      name: "Podgląd sprawy",
      exact: true,
    });
    await expect(preview).toContainText("W rekrutacji");
    await preview
      .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
      .click();
    const relations = page.getByRole("region", {
      name: "Powiązania",
      exact: true,
    });
    await expect(relations).toContainText(`Firma ${mark}`);
    await expect(relations).toContainText(`Osoba ${mark}`);
    const titles = ["Anuluj", "Zachowaj", "Odłącz"].map((x) => `${x} ${mark}`);
    for (const taskTitle of titles) {
      await button("Dodaj zadanie").click();
      await page.getByLabel("Tytuł zadania", { exact: true }).fill(taskTitle);
      await button("Zapisz zadanie").click();
      await expect(
        page.getByRole("article", { name: taskTitle, exact: true }),
      ).toBeVisible();
    }
    await navigate("Dashboard");
    for (const taskTitle of titles)
      await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    await navigate("Zadania");
    for (const taskTitle of titles)
      await expect(
        page.getByRole("article", { name: taskTitle, exact: true }),
      ).toContainText(title);
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    await button("Zakończ sprawę").click();
    await page
      .getByLabel("Wynik zakończenia", { exact: true })
      .selectOption({ label: "Odmowa firmy" });
    await noOverflow();
    await button("Pokaż podgląd zmian").click();
    await noOverflow();
    for (const [i, choice] of ["Anuluj", "Zachowaj", "Odłącz"].entries())
      await page
        .getByRole("group", { name: titles[i], exact: true })
        .getByRole("radio", { name: choice, exact: true })
        .check();
    await page
      .getByRole("checkbox", {
        name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
        exact: true,
      })
      .check();
    await button("Zatwierdź zakończenie").click();
    await expect(button("Wznów sprawę")).toBeVisible();
    expect((await state()).status).toBe("Zakończone");
    await navigate("Dashboard");
    await expect(page.getByText(titles[0], { exact: true })).toHaveCount(0);
    await expect(page.getByText(titles[1], { exact: true })).toBeVisible();
    await expect(page.getByText(titles[2], { exact: true })).toBeVisible();
    await navigate("Rekrutacje");
    await page.getByRole("button", { name: "Zakończone", exact: true }).click();
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(preview).toContainText("Zakończone");
    await preview
      .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
      .click();
    await expect(button("Wznów sprawę")).toBeVisible();
    await navigate("Zadania");
    await expect(
      page.getByRole("article", { name: titles[0], exact: true }),
    ).toContainText("Anulowane");
    await expect(
      page.getByRole("article", { name: titles[1], exact: true }),
    ).toContainText(title);
    await expect(
      page.getByRole("article", { name: titles[2], exact: true }),
    ).not.toContainText(title);
    await page.goto(`${target.appOrigin}/recruitments/${caseId}`);
    await button("Wznów sprawę").click();
    await noOverflow();
    await button("Pokaż podgląd zmian").click();
    await noOverflow();
    await page
      .getByRole("checkbox", {
        name: "Potwierdzam wznowienie tej samej sprawy i pokazany stan.",
        exact: true,
      })
      .check();
    await button("Zatwierdź wznowienie").click();
    await expect(button("Zakończ sprawę")).toBeVisible();
    expect(await state()).toMatchObject({
      status: "W rekrutacji",
      current_stage: "Rozmowa techniczna",
    });
    const taskRows = await client
      .from("recruitment_task")
      .select("title,status,case_id")
      .eq("owner_id", user.id);
    expect(taskRows.error).toBeNull();
    expect(taskRows.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: titles[0],
          status: "Anulowane",
          case_id: caseId,
        }),
        expect.objectContaining({
          title: titles[1],
          status: "Do zrobienia",
          case_id: caseId,
        }),
        expect.objectContaining({
          title: titles[2],
          status: "Do zrobienia",
          case_id: null,
        }),
      ]),
    );
    await expect(
      page.getByRole("article", { name: titles[0], exact: true }),
    ).toContainText("Anulowane");
    await expect(
      page.getByRole("article", { name: titles[1], exact: true }),
    ).toContainText("Do zrobienia");
    await expect(
      page.getByRole("article", { name: titles[2], exact: true }),
    ).toHaveCount(0);
    await history
      .getByRole("listitem")
      .filter({ hasText: "Zarejestrowano aplikowanie" })
      .getByRole("button", { name: "Skoryguj wpis", exact: true })
      .click();
    await page
      .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
      .fill("2000-01-02");
    await noOverflow();
    await button("Pokaż podgląd zmian").click();
    await noOverflow();
    await page
      .getByRole("checkbox", {
        name: "Potwierdzam korektę i jej wpływ na bieżący status oraz etap.",
        exact: true,
      })
      .check();
    await button("Zatwierdź korektę").click();
    await expect(history.locator("time[datetime='2000-01-02']")).toBeVisible();
    await page.reload();
    await expect(history.locator("time[datetime='2000-01-02']")).toBeVisible();
    const facts = await client
      .from("recruitment_case_event")
      .select("kind,occurred_on")
      .eq("case_id", caseId);
    expect(facts.error).toBeNull();
    expect(facts.data).toHaveLength(4);
    expect(facts.data!.find((x) => x.kind === "application")!.occurred_on).toBe(
      "2000-01-01",
    );
    const lifecycle = await client
      .from("recruitment_case_lifecycle")
      .select("kind")
      .eq("case_id", caseId);
    expect(lifecycle.error).toBeNull();
    expect(lifecycle.data!.map((x) => x.kind).sort()).toEqual([
      "close",
      "reopen",
    ]);
    const revisions = await client
      .from("recruitment_case_event_revision")
      .select("id")
      .eq("case_id", caseId);
    expect(revisions.error).toBeNull();
    expect(revisions.data).toHaveLength(1);
    expect(await state()).toMatchObject({
      status: "W rekrutacji",
      current_stage: "Rozmowa techniczna",
    });
    const sectionNav = page.getByRole("navigation", {
      name: "Sekcje sprawy",
      exact: true,
    });
    for (const [name, targetId] of [
      ["Dane sprawy", "case-details"],
      ["Powiązania", "case-relations"],
      ["Zadania", "case-tasks"],
      ["Zakończenie i kontynuacja", "case-lifecycle"],
      ["Działania", "case-actions"],
      ["Historia", "case-history"],
    ]) {
      const link = sectionNav.getByRole("link", { name, exact: true });
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
      await expect(page.locator(`#${targetId}`)).toBeFocused();
      await noOverflow();
    }
    // Section navigation is read-only and preserves history/task projections.
    expect(await state()).toMatchObject({
      status: "W rekrutacji",
      current_stage: "Rozmowa techniczna",
    });
    await noOverflow();
    await page.screenshot({
      path: test.info().outputPath(`journey-${width}.png`),
      fullPage: true,
    });
  });
}

for (const width of [1440, 375]) {
  test(`Task field errors have a keyboard accessible summary at ${width}px`, async ({
    page,
  }) => {
    const target = await readRecruitmentTarget(
      process.env.RECRUITMENT_TARGET_ID!,
    );
    const user = await account(target);
    const { client } = await sdkLogin(target, user);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    await page.goto(`${target.appOrigin}/tasks`);
    await page
      .getByRole("button", { name: "Dodaj zadanie", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Nowe zadanie", exact: true });
    const title = form.getByLabel("Tytuł zadania", { exact: true });
    const description = form.getByLabel("Opis (opcjonalnie)", { exact: true });
    await description.fill("x".repeat(2001));
    await form
      .getByRole("button", { name: "Zapisz zadanie", exact: true })
      .click();
    const summary = form.getByRole("alert", {
      name: "Podsumowanie błędów zadania",
      exact: true,
    });
    await expect(summary).toBeVisible();
    await expect(summary.getByRole("link")).toHaveCount(2);
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(description).toHaveAttribute("aria-invalid", "true");
    const invalid = await client
      .from("recruitment_task")
      .select("id")
      .eq("owner_id", user.id);
    expect(invalid.error).toBeNull();
    expect(invalid.data).toEqual([]);
    for (const [message, field] of [
      ["Podaj tytuł od 1 do 160 znaków po usunięciu skrajnych spacji.", title],
      ["Opis może mieć najwyżej 2000 znaków.", description],
    ] as const) {
      const link = summary.getByRole("link", { name: message, exact: true });
      await link.focus();
      await page.keyboard.press("Enter");
      await expect(field).toBeFocused();
    }
    await expect(description).toHaveValue("x".repeat(2001));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: test.info().outputPath(`task-error-summary-${width}.png`),
      fullPage: true,
    });
    const taskTitle = `Summary ${randomUUID()}`;
    await title.fill(taskTitle);
    await description.fill("Poprawiony opis");
    await form
      .getByRole("button", { name: "Zapisz zadanie", exact: true })
      .click();
    const article = page.getByRole("article", { name: taskTitle, exact: true });
    await expect(article).toBeVisible();
    await article
      .getByRole("button", { name: "Edytuj zadanie", exact: true })
      .click();
    const edit = page.getByRole("form", {
      name: "Edycja zadania",
      exact: true,
    });
    await edit.getByLabel("Tytuł zadania", { exact: true }).fill("");
    await edit
      .getByRole("button", { name: "Zapisz zmiany", exact: true })
      .click();
    await expect(
      edit.getByRole("alert", {
        name: "Podsumowanie błędów zadania",
        exact: true,
      }),
    ).toBeVisible();
    const stored = await client
      .from("recruitment_task")
      .select("title,description,revision")
      .eq("owner_id", user.id)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data).toMatchObject({
      title: taskTitle,
      description: "Poprawiony opis",
      revision: 0,
    });
  });
}

test("Quick Capture keeps four steps, real optional situations, explicit save-only and a fresh next draft", async ({
  page,
}) => {
  const target = await readRecruitmentTarget(
    process.env.RECRUITMENT_TARGET_ID!,
  );
  const user = await account(target);
  const { client } = await sdkLogin(target, user);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", { name: "Dalej", exact: true });
  const back = dialog.getByRole("button", { name: "Wstecz", exact: true });
  const choices = [
    "Zapisana oferta",
    "Wykonana aplikacja",
    "Kontakt",
    "Spontaniczna kandydatura",
    "Inna / bez określenia",
  ];
  for (const label of choices)
    await expect(
      dialog.getByRole("radio", { name: label, exact: true }),
    ).not.toBeChecked();
  await expect(
    dialog.getByRole("list", { name: "Postęp dodawania sprawy", exact: true }),
  ).toContainText("Sytuacja");
  await expect(dialog.getByRole("listitem")).toHaveCount(4);
  const situation = dialog.getByRole("radio", {
    name: "Spontaniczna kandydatura",
    exact: true,
  });
  await situation.focus();
  await page.keyboard.press("Space");
  await expect(situation).toBeChecked();
  await next.click();
  await expect(
    dialog.getByRole("heading", { name: "Dane", exact: true }),
  ).toBeVisible();
  const title = `Sytuacja ${randomUUID()}`;
  await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
  await back.click();
  await expect(situation).toBeChecked();
  await next.click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    title,
  );
  await next.click();
  await expect(
    dialog.getByRole("heading", { name: "Działanie", exact: true }),
  ).toBeVisible();
  const action = dialog.getByRole("radio", {
    name: "Zapisz tylko sprawę",
    exact: true,
  });
  await expect(action).not.toBeChecked();
  await action.check();
  await next.click();
  await expect(
    dialog.getByRole("heading", { name: "Podsumowanie", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Spontaniczna kandydatura");
  const before = await client
    .from("recruitment_case")
    .select("id")
    .eq("owner_id", user.id);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);
  await dialog
    .getByRole("button", { name: "Zapisz i dodaj kolejną", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Sytuacja", exact: true }),
  ).toBeVisible();
  for (const label of choices)
    await expect(
      dialog.getByRole("radio", { name: label, exact: true }),
    ).not.toBeChecked();
  const saved = await client
    .from("recruitment_case")
    .select("id,status,current_stage")
    .eq("title", title)
    .single();
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({ status: "Zapisane", current_stage: null });
  const events = await client
    .from("recruitment_case_event")
    .select("id")
    .eq("case_id", saved.data!.id);
  expect(events.error).toBeNull();
  expect(events.data).toEqual([]);
  // Optional situation: advancing without choosing still works; a new action
  // must be explicitly chosen and no previous data is silently inherited.
  await next.click();
  await expect(dialog.getByLabel("Nazwa sprawy", { exact: true })).toHaveValue(
    "",
  );
  await dialog
    .getByLabel("Nazwa sprawy", { exact: true })
    .fill(`Nieokreślona ${randomUUID()}`);
  await next.click();
  await expect(action).not.toBeChecked();
  await action.check();
  await next.click();
  await expect(dialog).toContainText("Nie określono");
  await dialog.getByRole("button", { name: "Anuluj", exact: true }).click();
  await page
    .getByRole("button", { name: "Odrzuć zmiany", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const all = await client
    .from("recruitment_case")
    .select("id")
    .eq("owner_id", user.id);
  expect(all.error).toBeNull();
  expect(all.data).toHaveLength(1);
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await dialog.getByRole("radio", { name: "Kontakt", exact: true }).check();
  await dialog.getByRole("button", { name: "Zamknij", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Odrzuć zmiany", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Odrzuć zmiany", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
});

for (const situation of [
  null,
  "Zapisana oferta",
  "Wykonana aplikacja",
  "Kontakt",
  "Spontaniczna kandydatura",
  "Inna / bez określenia",
]) {
  test(`Quick Capture save-only never infers facts from situation: ${situation ?? "no selection"}`, async ({
    page,
  }) => {
    const target = await readRecruitmentTarget(
      process.env.RECRUITMENT_TARGET_ID!,
    );
    const user = await account(target);
    const { client } = await sdkLogin(target, user);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    const dialog = page.getByRole("dialog");
    if (situation)
      await dialog.getByRole("radio", { name: situation, exact: true }).check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    const title = `Save-only ${randomUUID()}`;
    await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    const action = dialog.getByRole("radio", {
      name: "Zapisz tylko sprawę",
      exact: true,
    });
    await expect(action).not.toBeChecked();
    await action.check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(dialog).toContainText(situation ?? "Nie określono");
    await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const saved = await client
      .from("recruitment_case")
      .select("id,status,current_stage")
      .eq("title", title)
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({
      status: "Zapisane",
      current_stage: null,
    });
    for (const table of [
      "recruitment_case_event",
      "recruitment_case_lifecycle",
    ]) {
      const facts = await client
        .from(table)
        .select("id")
        .eq("case_id", saved.data!.id);
      expect(facts.error).toBeNull();
      expect(facts.data).toEqual([]);
    }
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  });
}
