/** Real HTTPS product UI; only disposable target accounts and records. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  readRecruitmentTarget,
  type RecruitmentTarget,
} from "../../scripts/recruitment/target.ts";
import { account, sdk, type Account } from "../integration/auth/fixtures.ts";
import { auditRenderedTextContrast } from "./ui-rendered-audit.ts";

let target: RecruitmentTarget;
let owner: Account;
let emptyOwner: Account;
let detailId: string;
const title =
  "Senior Product Design Engineer — Platform Infrastructure, dostępność i doświadczenie użytkownika w międzynarodowym zespole";
const sourceUrl =
  "https://example.invalid/rekrutacje/platform-infrastructure/senior-product-design-engineer?department=doswiadczenie-uzytkownika&location=Warszawa&reference=synthetic-visual-quality-assurance";
const description = (
  "Zażółć gęślą jaźń. Syntetyczny kontekst zapisany przez użytkownika, bez informacji o wysłaniu aplikacji.\n\n" +
  "Projektowanie narzędzi operacyjnych, współpraca z zespołem produktu i dbałość o dostępność. ".repeat(
    18,
  )
).trim();
const widths = [1440, 1024, 768, 375] as const;

test.beforeAll(async () => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id)
    throw new Error("UI QA requires the guarded disposable recruitment target");
  target = await readRecruitmentTarget(id);
  owner = await account(target);
  emptyOwner = await account(target);
  const client = sdk(target);
  const auth = await client.auth.signInWithPassword({
    email: owner.email,
    password: owner.password,
  });
  expect(auth.error === null).toBe(true);
  const inserted = await client
    .from("recruitment_case")
    .insert([
      { request_id: randomUUID(), title, description, source_url: sourceUrl },
      {
        request_id: randomUUID(),
        title: "J",
        description: null,
        source_url: null,
      },
      {
        request_id: randomUUID(),
        title: "Inżynierka oprogramowania — Łódź / zdalnie",
        description: "Dane syntetyczne. Nie odnotowano aplikowania.",
        source_url: "https://example.invalid/oferta",
      },
    ])
    .select("id,title");
  expect(inserted.error?.code, "Synthetic UI fixture INSERT").toBeUndefined();
  const row = inserted.data?.find((item) => item.title === title);
  expect(Boolean(row?.id)).toBe(true);
  detailId = row!.id;
});

async function login(page: Page, user: Account = owner) {
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dodaj", exact: true }),
  ).toBeVisible();
}
async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  const directory = process.env.UI_SCREENSHOTS_DIR ?? info.outputPath("visual");
  await mkdir(directory, { recursive: true });
  const contrast = await page.evaluate(auditRenderedTextContrast);
  expect(contrast.checked).toBeGreaterThan(0);
  expect(contrast.failures).toEqual([]);
  expect(contrast.controlFailures).toEqual([]);
  if (process.env.UI_SCREENSHOTS_DIR) {
    await writeFile(
      join(directory, `${name}-contrast.json`),
      JSON.stringify(contrast, null, 2),
    );
  }
  await page.screenshot({
    path: join(directory, `${name}.png`),
    fullPage: (await page.getByRole("dialog").count()) === 0,
    animations: "disabled",
  });
}
async function reflow(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  const sizes = await page.evaluate(() => ({
    innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: visualViewport?.width,
    main: document.querySelector("main")?.getBoundingClientRect().width,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.innerWidth);
  expect(sizes.main).toBeGreaterThan(0);
  return sizes;
}
async function openCapture(page: Page) {
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  const manual = page.getByRole("menuitem", {
    name: "Dodaj ręcznie",
    exact: true,
  });
  if (await manual.count()) await manual.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of widths) {
  test(`UI foundation real render ${width}px: shell, records, long content, account, capture, duplicate`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 960 });
    await login(page);
    const measurements: Record<string, unknown> = {};
    measurements.dashboard = await reflow(page);
    await expect(
      page.getByRole("button", { name: "Wyloguj wszędzie", exact: true }),
    ).not.toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await capture(page, `dashboard-${width}`, info);
    await page.getByRole("button", { name: "Menu konta", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Wyloguj tutaj", exact: true }),
    ).toBeVisible();
    await capture(page, `account-menu-${width}`, info);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Menu konta", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Menu konta", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Twoje konto", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/account`);
    for (const label of [
      "Wyloguj tutaj",
      "Wyloguj wszędzie",
      "Wyloguj pozostałe sesje",
    ]) {
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    measurements.account = await reflow(page);
    await capture(page, `account-sessions-${width}`, info);
    await page.goto(`${target.appOrigin}/recruitments?view=list`);
    await expect(
      page.getByRole("heading", { name: "Rekrutacje", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
    measurements.list = await reflow(page);
    await capture(page, `recruitments-${width}`, info);
    await page.getByRole("button", { name: title, exact: true }).click();
    await page
      .getByRole("dialog", { name: "Podgląd sprawy", exact: true })
      .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/recruitments/${detailId}(?:\\?|$)`),
    );
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    measurements.detail = await reflow(page);
    await capture(page, `case-detail-${width}`, info);
    const dialog = await openCapture(page);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await expect(
      dialog.getByLabel("Nazwa sprawy", { exact: true }),
    ).toBeFocused();
    await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
    await dialog
      .getByLabel("URL źródłowy (opcjonalnie)", { exact: true })
      .fill(sourceUrl);
    if (width === 375) {
      const bounds = await dialog.boundingBox();
      expect(bounds?.x).toBeLessThanOrEqual(1);
      expect(bounds?.y).toBeLessThanOrEqual(1);
      expect(bounds?.width).toBeGreaterThanOrEqual(width - 2);
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press("Tab");
        await expect
          .poll(() =>
            dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          )
          .toBe(true);
      }
    }
    measurements.capture = await reflow(page);
    await capture(page, `quick-capture-${width}`, info);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog
      .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Utwórz nową sprawę", exact: true }),
    ).toBeVisible();
    measurements.duplicate = await reflow(page);
    await capture(page, `duplicate-warning-${width}`, info);
    const duplicateAction = dialog.getByRole("button", {
      name: "Utwórz nową sprawę",
      exact: true,
    });
    await duplicateAction.scrollIntoViewIfNeeded();
    await duplicateAction.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(duplicateAction).toBeFocused();
    await expect(duplicateAction).toBeInViewport();
    await capture(page, `duplicate-actions-${width}`, info);
    for (const label of ["Wstecz", "Anuluj"]) {
      const footerAction = dialog.getByRole("button", {
        name: label,
        exact: true,
      });
      await footerAction.scrollIntoViewIfNeeded();
      await footerAction.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(footerAction).toBeFocused();
      await expect(footerAction).toBeInViewport();
    }
    await capture(page, `duplicate-footer-${width}`, info);
    const client = sdk(target);
    await client.auth.signInWithPassword({
      email: owner.email,
      password: owner.password,
    });
    const unchanged = await client
      .from("recruitment_case")
      .select("id", { count: "exact", head: true });
    expect(unchanged.error === null).toBe(true);
    expect(unchanged.count).toBe(3);
    if (process.env.UI_SCREENSHOTS_DIR) {
      await writeFile(
        join(process.env.UI_SCREENSHOTS_DIR, `measurements-${width}.json`),
        JSON.stringify(measurements, null, 2),
      );
    }
  });
}

test("UI foundation empty state and responsive keyboard navigation restore focus", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page, emptyOwner);
  const collapse = page.getByRole("button", {
    name: "Zwiń nawigację",
    exact: true,
  });
  await collapse.click();
  const navigation = page.getByRole("navigation", {
    name: "Główna nawigacja",
    exact: true,
  });
  for (const link of await navigation.getByRole("link").all()) {
    expect([
      "/dashboard",
      "/recruitments",
      "/companies",
      "/contacts",
    ]).toContain(await link.getAttribute("href"));
  }
  await expect(
    navigation.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("link", { name: "Rekrutacje", exact: true }),
  ).toHaveAccessibleName("Rekrutacje");
  await page
    .getByRole("button", { name: "Rozwiń nawigację", exact: true })
    .click();
  await page.goto(`${target.appOrigin}/recruitments`);
  await expect(
    page.getByRole("heading", { name: "Nie masz jeszcze spraw", exact: true }),
  ).toBeVisible();
  await capture(page, "empty-recruitments-1440", info);
  await page.setViewportSize({ width: 375, height: 812 });
  const trigger = page.getByRole("button", {
    name: "Otwórz nawigację",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Nawigacja", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Rekrutacje", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.contains(document.activeElement)),
      )
      .toBe(true);
  }
  await reflow(page);
  await capture(page, "mobile-navigation-375", info);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  for (const width of [320, 720]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto(`${target.appOrigin}/recruitments`);
    await reflow(page);
    await capture(page, `reflow-equivalent-${width}`, info);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  // Enlarged type is a separate check from browser/device scale emulation.
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await reflow(page);
  await capture(page, "large-text-375", info);
});

test("UI foundation Auth render and validation at all required widths", async ({
  page,
}, info) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["login", "signup"] as const) {
      await page.goto(`${target.appOrigin}/${path}`);
      await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
      await reflow(page);
      await capture(page, `${path}-${width}`, info);
    }
  }
  await page.goto(`${target.appOrigin}/login`);
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("synthetic-nonexistent@example.invalid");
  await page
    .getByLabel("Hasło", { exact: true })
    .fill("Synthetic-invalid-password!");
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await reflow(page);
  await capture(page, "login-error-375", info);
});

test("UI foundation account menu ends the native local session and protects history", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${detailId}`);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Wyloguj tutaj", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  expect(
    (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  ).toBe(401);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).not.toBeVisible();
  await page.goto(`${target.appOrigin}/recruitments/${detailId}`);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

type PopupObservation = {
  connected: boolean;
  hiddenByVerifiedAncestor: boolean;
  renderedRects: number;
  path: string;
};

test("UI foundation open account popup is hidden synchronously when another tab signs out", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto(`${target.appOrigin}/recruitments/${detailId}`);
  await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  const popup = page.getByRole("menu");
  await expect(popup).toBeVisible();
  let observed: PopupObservation | undefined;
  await page.exposeBinding(
    "__uiObserveHiddenAccountPopup",
    (_source, value: PopupObservation) => {
      observed = value;
    },
  );
  // Install passive observation before navigation; evaluating a handle after
  // the held navigation begins can wait for the next document instead.
  await popup.evaluate((element) => {
    const observer = new MutationObserver(() => {
      if (element.isConnected && element.getClientRects().length > 0) return;
      observer.disconnect();
      const observedWindow = window as unknown as Window & {
        __uiObserveHiddenAccountPopup(value: PopupObservation): Promise<void>;
      };
      void observedWindow.__uiObserveHiddenAccountPopup({
        connected: element.isConnected,
        hiddenByVerifiedAncestor: Boolean(element.closest("[hidden]")),
        renderedRects: element.getClientRects().length,
        path: location.pathname,
      });
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class"],
    });
  });
  let resumeNavigation: (() => void) | undefined;
  let navigationStarted = false;
  const gate = new Promise<void>((resolve) => {
    resumeNavigation = resolve;
  });
  await page.route("**/login", async (route) => {
    if (!route.request().isNavigationRequest()) return route.continue();
    navigationStarted = true;
    await gate;
    await route.continue();
  });
  const logoutTab = await context.newPage();
  try {
    await logoutTab.goto(`${target.appOrigin}/account`);
    await logoutTab
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await expect(logoutTab).toHaveURL(/\/login(?:\?|$)/);
    await expect.poll(() => navigationStarted).toBe(true);
    await expect.poll(() => observed).toBeDefined();
    expect(observed?.path).toBe(`/recruitments/${detailId}`);
    expect(observed?.connected).toBe(true);
    expect(observed?.hiddenByVerifiedAncestor).toBe(true);
    expect(observed?.renderedRects).toBe(0);
  } finally {
    resumeNavigation?.();
    await logoutTab.close();
  }
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("UI foundation pagehide hides an open account popup with its verified parent", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  const popup = page.getByRole("menu");
  await expect(popup).toBeVisible();
  await popup.evaluate((element) => {
    window.addEventListener(
      "pagehide",
      () => {
        // A binding response may be lost when the old document is destroyed;
        // retain only this synthetic visibility observation synchronously.
        sessionStorage.setItem(
          "jobs-crm.qa.account-pagehide",
          JSON.stringify({
            connected: element.isConnected,
            hidden: Boolean(element.closest("[hidden]")),
            renderedRects: element.getClientRects().length,
          }),
        );
      },
      { once: true },
    );
  });
  await page.goto(`${target.appOrigin}/account`);
  const observation = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem("jobs-crm.qa.account-pagehide") ?? "null",
    ),
  );
  expect(observation).toEqual({
    connected: true,
    hidden: true,
    renderedRects: 0,
  });
});
