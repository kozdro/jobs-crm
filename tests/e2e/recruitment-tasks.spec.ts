/** DEC-060 / UC-030 and task-only TC-012: production HTTPS and real private data. */
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
let a: Account;
test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("Tasks browser requires a guarded disposable target");
  target = await readRecruitmentTarget(id);
});
test.beforeEach(async () => {
  a = await account(target);
});
async function login(page: Page, user = a) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
}
async function fixture() {
  const { client } = await sdkLogin(target, a);
  const title = `Tasks browser ${randomUUID()}`;
  const result = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: title,
  });
  expect(result.error).toBeNull();
  return { client, id: result.data.case.id as string, title };
}
async function taskFixture(
  c: Awaited<ReturnType<typeof fixture>>,
  title: string,
  caseId: string | null = c.id,
) {
  const result = await c.client.rpc("execute_recruitment_task_command", {
    p_request_id: randomUUID(),
    p_payload: {
      operation: "create",
      title,
      description: null,
      dueOn: null,
      caseId,
    },
  });
  expect(result.error).toBeNull();
  return result.data.task as {
    id: string;
    revision: number;
    status: string;
    case_id: string | null;
  };
}
const taskArticle = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });
async function add(
  page: Page,
  title: string,
  description?: string,
  dueOn?: string,
) {
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(title);
  if (description)
    await page
      .getByLabel("Opis (opcjonalnie)", { exact: true })
      .fill(description);
  if (dueOn)
    await page.getByLabel("Termin (opcjonalnie)", { exact: true }).fill(dueOn);
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  await expect(taskArticle(page, title.trim())).toBeVisible();
}
async function taskRows(c: Awaited<ReturnType<typeof fixture>>) {
  const result = await c.client
    .from("recruitment_task")
    .select("*")
    .eq("owner_id", a.id);
  expect(result.error).toBeNull();
  return result.data ?? [];
}
async function caseState(c: Awaited<ReturnType<typeof fixture>>) {
  const result = await c.client
    .from("recruitment_case")
    .select("status,current_stage,case_revision")
    .eq("id", c.id)
    .single();
  expect(result.error).toBeNull();
  expect(result.data).not.toBeNull();
  return result.data!;
}
async function closeForm(page: Page) {
  await page
    .getByRole("button", { name: "Zakończ sprawę", exact: true })
    .click();
  await page
    .getByLabel("Wynik zakończenia", { exact: true })
    .selectOption({ label: "Inny" });
  await page
    .getByRole("button", { name: "Pokaż podgląd zmian", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Podgląd zmian", exact: true }),
  ).toBeVisible();
}
async function confirmClose(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
}

test("DEC060 empty Tasks and general task without deadline survive reload and appear on Dashboard", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await expect(
    page.getByRole("heading", { name: "Zadania", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  const title = `Ogólne ${randomUUID()}`;
  await add(page, `  ${title}  `);
  await expect(taskArticle(page, title)).toContainText("Do zrobienia");
  const rows = await taskRows(c);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    title,
    description: null,
    due_on: null,
    case_id: null,
    status: "Do zrobienia",
  });
  await page.reload();
  await expect(taskArticle(page, title)).toBeVisible();
  await page.goto(`${target.appOrigin}/dashboard`);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  expect((await caseState(c)).status).toBe("Zapisane");
});

test("DEC060 edit, future day, explicit completion/cancellation/restore and visible audit", async ({
  page,
}) => {
  const c = await fixture();
  const before = await caseState(c);
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  const title = `Działanie ${randomUUID()}`;
  await add(page, title, "Pierwszy opis syntetyczny", "2999-12-31");
  let row = taskArticle(page, title);
  await expect(row).toContainText("2999");
  await row
    .getByRole("button", { name: "Edytuj zadanie", exact: true })
    .click();
  await page
    .getByLabel("Opis (opcjonalnie)", { exact: true })
    .fill("Poprawiony opis syntetyczny");
  let holdReads = false;
  let observedHeldReads = 0;
  let releaseRead = () => {};
  let barrier: Promise<void> = Promise.resolve();
  const holdListRead = () => {
    holdReads = true;
    observedHeldReads = 0;
    barrier = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
  };
  const releaseListRead = () => {
    holdReads = false;
    releaseRead();
  };
  await page.route("**/tasks/commands?**", async (route) => {
    const url = new URL(route.request().url());
    if (
      holdReads &&
      route.request().method() === "GET" &&
      !url.searchParams.has("caseOptions") &&
      !url.searchParams.has("taskId") &&
      !url.searchParams.has("requestId")
    ) {
      observedHeldReads++;
      await barrier;
    }
    return route.continue();
  });
  holdListRead();
  try {
    const edited = page.waitForResponse(
      (response) =>
        response.url().endsWith("/tasks/commands") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON().operation === "edit",
    );
    await page
      .getByRole("button", { name: "Zapisz zmiany", exact: true })
      .click();
    const reply = await edited;
    expect(reply.status()).toBe(200);
    expect((await reply.json()).task.revision).toBe(1);
    await expect(
      page.getByRole("form", { name: "Edycja zadania", exact: true }),
    ).toHaveCount(0);
    await expect.poll(() => observedHeldReads).toBeGreaterThan(0);
    await expect(
      row.getByRole("button", { name: "Oznacz jako wykonane", exact: true }),
    ).toBeDisabled();
    await expect(
      row.getByRole("button", { name: "Edytuj zadanie", exact: true }),
    ).toBeDisabled();
  } finally {
    releaseListRead();
  }
  await expect(
    row.getByText("Poprawiony opis syntetyczny", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("button", { name: "Oznacz jako wykonane", exact: true }),
  ).toBeEnabled();
  holdListRead();
  try {
    const changed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/tasks/commands") &&
        response.request().method() === "POST" &&
        response.request().postDataJSON().operation === "set-status",
    );
    await row
      .getByRole("button", { name: "Oznacz jako wykonane", exact: true })
      .click();
    const reply = await changed;
    expect(reply.request().postDataJSON().expectedRevision).toBe(1);
    expect(reply.status()).toBe(200);
    expect((await reply.json()).task.revision).toBe(2);
    await expect.poll(() => observedHeldReads).toBeGreaterThan(0);
    await expect(
      row.getByRole("button", { name: "Oznacz jako wykonane", exact: true }),
    ).toBeDisabled();
    await expect(
      row.getByRole("button", { name: "Edytuj zadanie", exact: true }),
    ).toBeDisabled();
  } finally {
    releaseListRead();
  }
  await expect(row).toContainText("Wykonane");
  await row
    .getByRole("button", { name: "Przywróć do zrobienia", exact: true })
    .click();
  await expect(row).toContainText("Do zrobienia");
  await row
    .getByRole("button", { name: "Anuluj zadanie", exact: true })
    .click();
  await expect(row).toContainText("Anulowane");
  await row
    .getByRole("button", { name: "Przywróć do zrobienia", exact: true })
    .click();
  await expect(row).toContainText("Do zrobienia");
  await row
    .getByRole("button", { name: "Pokaż audyt zadania", exact: true })
    .click();
  await expect(
    page.getByText("Pierwszy opis syntetyczny", { exact: false }).first(),
  ).toBeVisible();
  expect(await caseState(c)).toEqual(before);
  const rows = await taskRows(c);
  expect(rows[0]).toMatchObject({
    due_on: "2999-12-31",
    description: "Poprawiony opis syntetyczny",
    status: "Do zrobienia",
  });
  await page.reload();
  row = taskArticle(page, title);
  await expect(row).toContainText("Do zrobienia");
});

test("DEC060 common form presets only case context and task is the same record across views", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await expect(
    page.getByRole("heading", { name: "Zadania sprawy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  await expect(page.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Opis (opcjonalnie)", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Termin (opcjonalnie)", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Powiązanie ze sprawą", { exact: true }),
  ).toHaveValue(c.id);
  const title = `Powiązane ${randomUUID()}`;
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(title);
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  await expect(taskArticle(page, title)).toBeVisible();
  await page.goto(`${target.appOrigin}/tasks`);
  await expect(taskArticle(page, title)).toContainText(c.title);
  expect((await taskRows(c)).filter((row) => row.title === title)).toHaveLength(
    1,
  );
  expect((await taskRows(c))[0].case_id).toBe(c.id);
});

test("DEC060 closure requires each choice and atomically cancels, keeps and detaches with accessible audit", async ({
  page,
}) => {
  const c = await fixture();
  const titles = [
    "Anulowane działanie",
    "Zachowane działanie",
    "Odłączone działanie",
  ].map((title) => `${title} ${randomUUID()}`);
  const tasks = await Promise.all(titles.map((title) => taskFixture(c, title)));
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await closeForm(page);
  for (const title of titles) {
    const group = page.getByRole("group", { name: title, exact: true });
    for (const name of ["Anuluj", "Zachowaj", "Odłącz"])
      await expect(
        group.getByRole("radio", { name, exact: true }),
      ).not.toBeChecked();
  }
  await page
    .getByRole("checkbox", {
      name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({
      hasText:
        "Wybierz Anuluj, Zachowaj albo Odłącz dla każdego otwartego zadania.",
    }),
  ).toHaveText(
    "Wybierz Anuluj, Zachowaj albo Odłącz dla każdego otwartego zadania.",
  );
  expect((await caseState(c)).status).toBe("Zapisane");
  expect(
    (
      await c.client
        .from("recruitment_case_lifecycle")
        .select("id")
        .eq("case_id", c.id)
    ).data,
  ).toHaveLength(0);
  for (const [index, label] of ["Anuluj", "Zachowaj", "Odłącz"].entries())
    await page
      .getByRole("group", { name: titles[index], exact: true })
      .getByRole("radio", { name: label, exact: true })
      .check();
  await page
    .getByRole("checkbox", {
      name: "Potwierdzam zakończenie sprawy i wskazany wynik.",
      exact: true,
    })
    .check();
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/recruitments/lifecycle-commands") &&
      request.method() === "POST" &&
      request.postDataJSON().action === "confirm",
  );
  const replied = page.waitForResponse(
    (response) =>
      response.url().endsWith("/recruitments/lifecycle-commands") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON().action === "confirm",
  );
  await page
    .getByRole("button", { name: "Zatwierdź zakończenie", exact: true })
    .click();
  const closingIntent = (await sent).postDataJSON() as Record<string, unknown>;
  const response = await replied;
  const receipt = await response.json();
  expect(
    response.status(),
    JSON.stringify({ kind: receipt.kind, error: receipt.error }),
  ).toBe(200);
  expect(receipt.kind).toBe("created");
  await expect(
    page.getByRole("button", { name: "Wznów sprawę", exact: true }),
  ).toBeVisible();
  await expect(taskArticle(page, titles[0])).toContainText("Anulowane");
  await expect(taskArticle(page, titles[1])).toContainText("Do zrobienia");
  await expect(taskArticle(page, titles[2])).toHaveCount(0);
  const {
    expectedTaskSnapshot: _snapshot,
    taskResolutions: _resolutions,
    ...omittedIntent
  } = closingIntent;
  void _snapshot;
  void _resolutions;
  for (const payload of [
    omittedIntent,
    { ...omittedIntent, expectedTaskSnapshot: [], taskResolutions: [] },
  ]) {
    const replay = await page.request.post(
      `${target.appOrigin}/recruitments/lifecycle-commands`,
      { headers: { Origin: target.appOrigin }, data: payload },
    );
    expect(replay.status()).toBe(409);
    expect((await replay.json()).kind).toBe("conflict");
  }
  const rows = await taskRows(c);
  expect(rows.find((row) => row.id === tasks[0].id)).toMatchObject({
    status: "Anulowane",
    case_id: c.id,
  });
  expect(rows.find((row) => row.id === tasks[1].id)).toMatchObject({
    status: "Do zrobienia",
    case_id: c.id,
  });
  expect(rows.find((row) => row.id === tasks[2].id)).toMatchObject({
    status: "Do zrobienia",
    case_id: null,
  });
  await page.goto(`${target.appOrigin}/tasks`);
  const detached = taskArticle(page, titles[2]);
  await detached
    .getByRole("button", { name: "Pokaż audyt zadania", exact: true })
    .click();
  await expect(page.getByText(c.title, { exact: false }).last()).toBeVisible();
});

test("DEC060 lost three-choice closure reply recovers the original receipt and resolves every task once", async ({
  page,
}) => {
  const c = await fixture();
  const titles = [
    "Anulowanie po utracie odpowiedzi",
    "Zachowanie po utracie odpowiedzi",
    "Odłączenie po utracie odpowiedzi",
  ].map((title) => `${title} ${randomUUID()}`);
  const tasks = await Promise.all(titles.map((title) => taskFixture(c, title)));
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await closeForm(page);
  for (const [index, name] of ["Anuluj", "Zachowaj", "Odłącz"].entries())
    await page
      .getByRole("group", { name: titles[index], exact: true })
      .getByRole("radio", { name, exact: true })
      .check();
  let requestId = "";
  let confirms = 0;
  await page.route("**/recruitments/lifecycle-commands", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().action === "confirm"
    ) {
      confirms++;
      requestId = route.request().postDataJSON().requestId;
      const reply = await route.fetch();
      expect(reply.status()).toBe(200);
      expect((await reply.json()).kind).toBe("created");
      return route.abort("failed");
    }
    return route.continue();
  });
  await confirmClose(page);
  const form = page.getByRole("form", {
    name: "Zakończenie sprawy",
    exact: true,
  });
  await expect(
    form.getByRole("alert").filter({ hasText: "Wynik zapisu jest nieznany." }),
  ).toBeVisible();
  expect((await caseState(c)).status).toBe("Zakończone");
  const pendingKey = `jobs-crm.lifecycle.pending.${c.id}`;
  const originalPending = await page.evaluate(
    (key) => sessionStorage.getItem(key),
    pendingKey,
  );
  expect(originalPending !== null).toBe(true);
  page.on("dialog", async (dialog) => {
    expect(dialog.type()).toBe("beforeunload");
    await dialog.accept();
  });
  let recoveryGets = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname === "/recruitments/lifecycle-commands" &&
      url.searchParams.get("requestId") === requestId
    )
      recoveryGets++;
  });
  const guardWarning =
    "Zachowane dane operacji zmieniły się. Nie potwierdzono wyniku ani nie wysłano ponowienia. Zachowano bieżący zapis oczekujący.";
  let holdRecoveryReply = false;
  let recoveryReplyHeld = false;
  let releaseRecoveryReply = () => {};
  let recoveryBarrier: Promise<void> = Promise.resolve();
  await page.route("**/recruitments/lifecycle-commands?**", async (route) => {
    const url = new URL(route.request().url());
    if (
      holdRecoveryReply &&
      route.request().method() === "GET" &&
      url.searchParams.get("requestId") === requestId
    ) {
      holdRecoveryReply = false;
      const reply = await route.fetch();
      expect(reply.status()).toBe(200);
      const receipt = await reply.json();
      expect(receipt.entry.request_id).toBe(requestId);
      expect(receipt.entry.task_resolutions).toHaveLength(3);
      recoveryReplyHeld = true;
      await recoveryBarrier;
      return route.fulfill({ response: reply });
    }
    return route.continue();
  });
  const changedPending = (
    variant:
      | "null-command"
      | "invalid-action"
      | "changed-valid"
      | "changed-action"
      | "changed-snapshot",
  ) => {
    const pending = JSON.parse(originalPending!) as {
      command: Record<string, unknown> | null;
    };
    if (variant === "null-command") pending.command = null;
    else if (variant === "invalid-action")
      (pending.command!.taskResolutions as { action: string }[])[0].action =
        "not-approved";
    else if (variant === "changed-action") {
      const choices = pending.command!.taskResolutions as { action: string }[];
      choices[0].action = choices[0].action === "keep" ? "cancel" : "keep";
    } else if (variant === "changed-snapshot") {
      pending.command!.expectedTaskSnapshot = [
        ...(pending.command!.expectedTaskSnapshot as string[]),
      ].reverse();
    } else pending.command!.outcome = "Brak odpowiedzi";
    return JSON.stringify(pending);
  };
  const storePending = (value: string) =>
    page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
      key: pendingKey,
      value,
    });
  const lateReply = async (
    trigger: ReturnType<Page["getByRole"]>,
    altered: string,
  ) => {
    holdRecoveryReply = true;
    recoveryReplyHeld = false;
    recoveryBarrier = new Promise<void>((resolve) => {
      releaseRecoveryReply = resolve;
    });
    try {
      await trigger.click();
      await expect.poll(() => recoveryReplyHeld).toBe(true);
      const received = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/recruitments/lifecycle-commands" &&
          response.request().method() === "GET" &&
          new URL(response.url()).searchParams.get("requestId") === requestId,
      );
      await storePending(altered);
      releaseRecoveryReply();
      expect((await received).status()).toBe(200);
      await expect(page.getByText(guardWarning, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          ({ key, value }) => sessionStorage.getItem(key) === value,
          { key: pendingKey, value: altered },
        ),
      ).toBe(true);
      await expect(
        page.getByText("Potwierdzono wcześniejszy zapis.", { exact: false }),
      ).toHaveCount(0);
      expect(confirms).toBe(1);
    } finally {
      holdRecoveryReply = false;
      releaseRecoveryReply();
    }
  };
  await lateReply(
    form.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
    changedPending("null-command"),
  );
  for (const variant of [
    "omitted",
    "explicit-empty",
    "only-snapshot-omitted",
    "only-resolutions-omitted",
    "invalid-action",
    "null-command",
    "legacy-envelope",
  ] as const) {
    const modified = JSON.parse(originalPending!) as {
      command?: Record<string, unknown> | null;
    };
    const command = modified.command!;
    if (variant === "omitted") {
      delete command.expectedTaskSnapshot;
      delete command.taskResolutions;
    } else if (variant === "explicit-empty") {
      command.expectedTaskSnapshot = [];
      command.taskResolutions = [];
    } else if (variant === "only-snapshot-omitted") {
      delete command.expectedTaskSnapshot;
    } else if (variant === "only-resolutions-omitted") {
      delete command.taskResolutions;
    } else if (variant === "invalid-action") {
      (
        command.taskResolutions as { taskId: string; action: string }[]
      )[0].action = "not-approved";
    } else if (variant === "null-command") {
      modified.command = null;
    } else {
      delete modified.command;
    }
    const getsBefore = recoveryGets;
    const altered = JSON.stringify(modified);
    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, value),
      { key: pendingKey, value: altered },
    );
    await page.reload();
    const recover = page.getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    });
    await expect(recover).toBeVisible();
    if (variant === "invalid-action" || variant === "null-command") {
      await expect(recover).toBeDisabled();
      await expect(
        page.getByText(
          "Nie można bezpiecznie odtworzyć danych wcześniejszej operacji. Zachowano oczekujący zapis; nie potwierdzimy go ani nie ponowimy.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Ponów wcześniejszy zapis cyklu",
          exact: true,
        }),
      ).toHaveCount(0);
      expect(recoveryGets).toBe(getsBefore);
    } else {
      const queried = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname === "/recruitments/lifecycle-commands" &&
          url.searchParams.get("requestId") === requestId
        );
      });
      await recover.click();
      expect((await queried).status()).toBe(200);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Nie potwierdzono wyniku." }),
      ).toHaveText(
        "Nie potwierdzono wyniku. Pusty odczyt nie oznacza cofnięcia zapisu. Zachowano ten sam zamiar.",
      );
      expect(recoveryGets).toBe(getsBefore + 1);
      if (variant === "legacy-envelope")
        await expect(
          page.getByRole("button", {
            name: "Ponów wcześniejszy zapis cyklu",
            exact: true,
          }),
        ).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        ({ key, value }) => sessionStorage.getItem(key) === value,
        { key: pendingKey, value: altered },
      ),
    ).toBe(true);
    await expect(recover).toBeVisible();
    await expect(
      page.getByText("Potwierdzono wcześniejszy zapis.", { exact: false }),
    ).toHaveCount(0);
  }
  for (const variant of [
    "null-command",
    "invalid-action",
    "changed-valid",
    "changed-action",
    "changed-snapshot",
  ] as const) {
    await storePending(originalPending!);
    await page.reload();
    const recover = page.getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    });
    await expect(recover).toBeEnabled();
    await lateReply(recover, changedPending(variant));
  }
  for (const action of [
    "Sprawdź wcześniejszy zapis cyklu",
    "Ponów wcześniejszy zapis cyklu",
  ] as const) {
    await storePending(originalPending!);
    await page.reload();
    const trigger = page.getByRole("button", { name: action, exact: true });
    await expect(trigger).toBeEnabled();
    const altered = changedPending("changed-valid");
    const getsBefore = recoveryGets;
    await storePending(altered);
    await trigger.click();
    await expect(page.getByText(guardWarning, { exact: true })).toBeVisible();
    expect(recoveryGets).toBe(getsBefore);
    expect(confirms).toBe(1);
    expect(
      await page.evaluate(
        ({ key, value }) => sessionStorage.getItem(key) === value,
        { key: pendingKey, value: altered },
      ),
    ).toBe(true);
  }
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), {
    key: pendingKey,
    value: originalPending!,
  });
  await page.reload();
  await page
    .getByRole("button", {
      name: "Sprawdź wcześniejszy zapis cyklu",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Potwierdzono wcześniejszy zapis." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key) === null,
      pendingKey,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Wznów sprawę", exact: true }),
  ).toBeVisible();
  await expect(taskArticle(page, titles[0])).toContainText("Anulowane");
  await expect(taskArticle(page, titles[1])).toContainText("Do zrobienia");
  await expect(taskArticle(page, titles[2])).toHaveCount(0);
  const closures = await c.client
    .from("recruitment_case_lifecycle")
    .select("id,request_id")
    .eq("case_id", c.id);
  expect(closures.error).toBeNull();
  expect(closures.data).toHaveLength(1);
  expect(closures.data![0].request_id).toBe(requestId);
  for (const task of tasks) {
    const audit = await c.client
      .from("recruitment_task_command")
      .select("id,closure_id")
      .eq("task_id", task.id);
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(2);
    expect(
      audit.data!.filter((entry) => entry.closure_id === closures.data![0].id),
    ).toHaveLength(1);
  }
  expect(confirms).toBe(1);
  expect(
    (await taskRows(c)).find((row) => row.id === tasks[2].id),
  ).toMatchObject({ case_id: null, status: "Do zrobienia" });
});

test("DEC060 stale closure task snapshot requires refreshed preview and cannot silently close", async ({
  page,
}) => {
  const c = await fixture();
  const title = `Starszy podgląd ${randomUUID()}`;
  await taskFixture(c, title);
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await closeForm(page);
  await page
    .getByRole("group", { name: title, exact: true })
    .getByRole("radio", { name: "Zachowaj", exact: true })
    .check();
  await taskFixture(c, `Dodane po podglądzie ${randomUUID()}`);
  await confirmClose(page);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Sprawa lub zakończenie zmieniły się." }),
  ).toBeVisible();
  expect((await caseState(c)).status).toBe("Zapisane");
  const lifecycle = await c.client
    .from("recruitment_case_lifecycle")
    .select("id")
    .eq("case_id", c.id);
  expect(lifecycle.error).toBeNull();
  expect(lifecycle.data).toHaveLength(0);
});

test("DEC060 tasks added and restored at a closed case never reopen it", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${c.id}`);
  await closeForm(page);
  await confirmClose(page);
  await expect(
    page.getByRole("button", { name: "Wznów sprawę", exact: true }),
  ).toBeVisible();
  const before = await caseState(c);
  const title = `Po zakończeniu ${randomUUID()}`;
  await add(page, title);
  const row = taskArticle(page, title);
  await row
    .getByRole("button", { name: "Oznacz jako wykonane", exact: true })
    .click();
  await expect(row).toContainText("Wykonane");
  await row
    .getByRole("button", { name: "Przywróć do zrobienia", exact: true })
    .click();
  await expect(row).toContainText("Do zrobienia");
  expect(await caseState(c)).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Wznów sprawę", exact: true }),
  ).toBeVisible();
});

test("DEC060 failed task save preserves form and never reports a false success", async ({
  page,
}) => {
  const c = await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  const title = `Niepotwierdzony zapis ${randomUUID()}`;
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(title);
  await page.route("**/tasks/commands", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "unavailable",
          error: "Syntetyczny błąd zapisu",
        }),
      });
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Wynik zapisu jest nieznany." }),
  ).toBeVisible();
  await expect(page.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
    title,
  );
  expect(await taskRows(c)).toHaveLength(0);
});

test("DEC060 task forms remain usable by keyboard at 375, 768, 1024 and 1440", async ({
  page,
}) => {
  await fixture();
  await login(page);
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${target.appOrigin}/tasks`);
    const trigger = page.getByRole("button", {
      name: "Dodaj zadanie",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const title = page.getByLabel("Tytuł zadania", { exact: true });
    await expect(title).toBeVisible();
    await title.focus();
    await page.keyboard.type(`Klawiatura ${width}`);
    const submit = page.getByRole("button", {
      name: "Zapisz zadanie",
      exact: true,
    });
    await submit.focus();
    await expect(submit).toBeFocused();
    const box = await submit.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(901);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(taskArticle(page, `Klawiatura ${width}`)).toBeVisible();
  }
});

test("DEC060 saving another task preserves a new unsaved task draft", async ({
  page,
}) => {
  const c = await fixture();
  const existingTitle = `Istniejące ${randomUUID()}`;
  await taskFixture(c, existingTitle, null);
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  const draft = `Niezapisany szkic ${randomUUID()}`;
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(draft);
  await page
    .getByLabel("Opis (opcjonalnie)", { exact: true })
    .fill("Zachowaj wpisany opis");
  await taskArticle(page, existingTitle)
    .getByRole("button", { name: "Oznacz jako wykonane", exact: true })
    .click();
  await expect(taskArticle(page, existingTitle)).toContainText("Wykonane");
  await expect(page.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
    draft,
  );
  await expect(
    page.getByLabel("Opis (opcjonalnie)", { exact: true }),
  ).toHaveValue("Zachowaj wpisany opis");
  expect(await taskRows(c)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  await expect(taskArticle(page, draft)).toBeVisible();
  expect(await taskRows(c)).toHaveLength(2);
});

test("DEC060 another row save preserves an uncertain create and recovers its original request", async ({
  page,
}) => {
  const c = await fixture();
  const existingTitle = `Istniejące ${randomUUID()}`;
  await taskFixture(c, existingTitle, null);
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  const title = `Utracona odpowiedź ${randomUUID()}`;
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(title);
  let originalRequestId = "";
  let creates = 0;
  await page.route("**/tasks/commands", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.postDataJSON().operation === "create"
    ) {
      creates++;
      originalRequestId = request.postDataJSON().requestId;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  const form = page.getByRole("form", { name: "Nowe zadanie", exact: true });
  await expect(
    form.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
  ).toBeVisible();
  await taskArticle(page, existingTitle)
    .getByRole("button", { name: "Oznacz jako wykonane", exact: true })
    .click();
  await expect(taskArticle(page, existingTitle)).toContainText("Wykonane");
  await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
    title,
  );
  await expect(
    form.getByRole("button", { name: "Sprawdź wynik zapisu", exact: true }),
  ).toBeVisible();
  await form
    .getByRole("button", { name: "Sprawdź wynik zapisu", exact: true })
    .click();
  await expect(taskArticle(page, title)).toBeVisible();
  expect(creates).toBe(1);
  const audit = await c.client
    .from("recruitment_task_command")
    .select("id")
    .eq("request_id", originalRequestId);
  expect(audit.error).toBeNull();
  expect(audit.data).toHaveLength(1);
  expect(await taskRows(c)).toHaveLength(2);
});

test("DEC060 complete task pagination and pending or uncertain row recovery retain the same command", async ({
  page,
}) => {
  const c = await fixture();
  const marker = randomUUID();
  const created = [];
  for (let i = 0; i < 51; i++)
    created.push(await taskFixture(c, `Stronicowane ${marker} ${i}`, null));
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  const pagination = page.getByRole("navigation", {
    name: "Strony: Lista zadań",
    exact: true,
  });
  const next = pagination.getByRole("button", {
    name: "Następna strona",
    exact: true,
  });
  const previous = pagination.getByRole("button", {
    name: "Poprzednia strona",
    exact: true,
  });
  const seen: string[] = [];
  for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
    await expect(
      pagination.getByText(`Strona ${pageNumber}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(
      pageNumber < 3 ? 25 : 1,
    );
    seen.push(
      ...(await page
        .getByRole("article")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("aria-label")!),
        )),
    );
    if (pageNumber < 3) {
      await expect(next).toBeEnabled();
      await next.click();
    }
  }
  expect(new Set(seen).size).toBe(51);
  expect(seen).toHaveLength(51);
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(pagination.getByText("Strona 2", { exact: true })).toBeVisible();
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  const row = page.getByRole("article").first();
  const title = await row.getAttribute("aria-label");
  expect(title).not.toBeNull();
  let sentId = "";
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/tasks/commands", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().operation === "set-status"
    ) {
      sentId = route.request().postDataJSON().requestId;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await blocked;
      return route.abort("failed");
    }
    return route.continue();
  });
  await row
    .getByRole("button", { name: "Oznacz jako wykonane", exact: true })
    .click();
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  release();
  const recovery = row.getByRole("button", {
    name: "Sprawdź wynik zapisu",
    exact: true,
  });
  await expect(recovery).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await recovery.click();
  await expect(taskArticle(page, title!)).toContainText("Wykonane");
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();
  const audit = await c.client
    .from("recruitment_task_command")
    .select("id")
    .eq("request_id", sentId);
  expect(audit.error).toBeNull();
  expect(audit.data).toHaveLength(1);
  expect(await taskRows(c)).toHaveLength(created.length);
});

test("DEC060 case picker reaches an owned case beyond its first 25 options", async ({
  page,
}) => {
  const oldest = await fixture();
  for (let i = 0; i < 26; i++) await fixture();
  await login(page);
  await page.goto(`${target.appOrigin}/tasks`);
  await page
    .getByRole("button", { name: "Dodaj zadanie", exact: true })
    .click();
  const title = `Wybrana dalsza sprawa ${randomUUID()}`;
  await page.getByLabel("Tytuł zadania", { exact: true }).fill(title);
  const select = page.getByLabel("Powiązanie ze sprawą", { exact: true });
  await expect(select.locator("option")).toHaveCount(26);
  await expect(select.locator(`option[value="${oldest.id}"]`)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Następne sprawy", exact: true })
    .click();
  await expect(select.locator(`option[value="${oldest.id}"]`)).toHaveCount(1);
  await select.selectOption(oldest.id);
  await page
    .getByRole("button", { name: "Zapisz zadanie", exact: true })
    .click();
  await expect(taskArticle(page, title)).toContainText(oldest.title);
  expect((await taskRows(oldest))[0].case_id).toBe(oldest.id);
});

test("DEC060 BFF protects private Task list, ID, audit, request recovery and write origins", async ({
  page,
  browser,
}) => {
  const c = await fixture();
  const title = `Prywatne działanie ${randomUUID()}`;
  const task = await taskFixture(c, title);
  await login(page);
  const own = await page.request.get(
    `${target.appOrigin}/tasks/commands?taskId=${task.id}`,
  );
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toContain("no-store");
  expect((await own.json()).task).toMatchObject({ id: task.id, title });
  const audit = await c.client
    .from("recruitment_task_command")
    .select("request_id")
    .eq("task_id", task.id)
    .single();
  expect(audit.error).toBeNull();
  const requestId = audit.data!.request_id;
  const b = await account(target);
  const foreignContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const anonContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const foreign = await foreignContext.newPage();
    await login(foreign, b);
    for (const [query, expected] of [
      ["", { tasks: [], hasMore: false, page: 1 }],
      [`taskId=${task.id}`, { task: null }],
      [`taskId=${task.id}&audit=true`, { entries: [] }],
      [`requestId=${requestId}`, { task: null }],
      [`caseId=${c.id}`, { tasks: [], hasMore: false, page: 1 }],
    ] as const) {
      const response = await foreign.request.get(
        `${target.appOrigin}/tasks/commands?${query}`,
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(expected);
      expect(await response.text()).not.toContain(title);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const anonymous = await anonContext.request.get(
        `${target.appOrigin}/tasks/commands?${query}`,
      );
      expect(anonymous.status()).toBe(401);
      expect(await anonymous.text()).not.toContain(title);
    }
    const spoof = await foreign.request.get(
      `${target.appOrigin}/tasks/commands?expectedUserId=${a.id}`,
    );
    expect(spoof.status()).toBe(403);
    const body = {
      expectedUserId: a.id,
      requestId: randomUUID(),
      operation: "set-status",
      taskId: task.id,
      expectedRevision: task.revision,
      status: "Wykonane",
    };
    const foreignWrite = await foreign.request.post(
      `${target.appOrigin}/tasks/commands`,
      { headers: { Origin: target.appOrigin }, data: body },
    );
    expect(foreignWrite.status()).toBe(403);
    const crossOrigin = await page.request.post(
      `${target.appOrigin}/tasks/commands`,
      { headers: { Origin: "https://example.invalid" }, data: body },
    );
    expect(crossOrigin.status()).toBe(403);
    expect((await taskRows(c))[0].status).toBe("Do zrobienia");
  } finally {
    await foreignContext.close();
    await anonContext.close();
  }
});
