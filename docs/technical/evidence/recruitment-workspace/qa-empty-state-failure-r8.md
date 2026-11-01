# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recruitment-ui-foundation.spec.ts >> UI foundation empty state and responsive keyboard navigation restore focus
- Location: tests/e2e/recruitment-ui-foundation.spec.ts:266:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Nie masz jeszcze spraw', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Nie masz jeszcze spraw', exact: true }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Nie masz jeszcze spraw', exact: true })

```

```yaml
- link "Przejdź do treści":
  - /url: "#workspace-content"
- complementary "Panel boczny":
  - link "Jobs CRM — Dashboard":
    - /url: /dashboard
    - text: Jobs CRM
  - navigation "Główna nawigacja":
    - link "Dashboard":
      - /url: /dashboard
    - link "Rekrutacje":
      - /url: /recruitments
    - text: Zadania Niedostępne Kalendarz Niedostępne Dokumenty Niedostępne
    - link "Firmy":
      - /url: /companies
    - link "Kontakty":
      - /url: /contacts
  - button "Zwiń nawigację" [expanded]
  - paragraph: Prywatna przestrzeń pracy
- main:
  - paragraph: Moja przestrzeń Rekrutacje
  - button "Dodaj"
  - status
  - button "Menu konta": Konto
  - heading "Rekrutacje" [level=1]
  - paragraph: Przeglądaj sprawy i ich kontekst. Zmiany wykonasz na pełnej stronie sprawy.
  - region "Ustawienia widoku rekrutacji":
    - group "Widok spraw":
      - button "Kanban" [pressed]
      - button "Lista"
    - group "Szybkie widoki":
      - button "Wszystkie" [pressed]
      - button "Aktywne"
      - button "Zakończone"
    - group "Status sprawy":
      - text: Status sprawy
      - checkbox "Zapisane" [checked]
      - text: Zapisane
      - checkbox "Kontakt rozpoczęty" [checked]
      - text: Kontakt rozpoczęty
      - checkbox "W rekrutacji" [checked]
      - text: W rekrutacji
      - checkbox "Zakończone" [checked]
      - text: Zakończone
    - text: Organizacja
    - combobox "Organizacja":
      - option "Wszystkie" [selected]
    - text: Osoba kontaktowa
    - combobox "Osoba kontaktowa":
      - option "Wszystkie" [selected]
    - text: Sortowanie
    - combobox "Sortowanie":
      - 'option "Data dodania: od najnowszych" [selected]'
      - 'option "Data dodania: od najstarszych"'
    - button "Wyczyść filtry"
    - paragraph: Filtry i sortowanie zmieniają wyłącznie prezentację spraw.
  - status: Widok spraw zaktualizowany.
  - heading "Brak spraw na tej stronie" [level=2]
  - paragraph: Jeśli nie masz jeszcze spraw, wybierz „Dodaj”. Możesz też wrócić do poprzedniej strony wyników.
  - region "Tablica rekrutacji":
    - paragraph: Kolumny przedstawiają statusy. Karty służą do podglądu; zmiany sprawy są dostępne na pełnej stronie.
    - 'region "Kolumna: Zapisane"':
      - heading "Zapisane" [level=2]
      - list
      - paragraph: Brak spraw na tej stronie.
      - 'navigation "Strony: Zapisane"': Strona 1
    - 'region "Kolumna: Kontakt rozpoczęty"':
      - heading "Kontakt rozpoczęty" [level=2]
      - list
      - paragraph: Brak spraw na tej stronie.
      - 'navigation "Strony: Kontakt rozpoczęty"': Strona 1
    - 'region "Kolumna: W rekrutacji"':
      - heading "W rekrutacji" [level=2]
      - list
      - paragraph: Brak spraw na tej stronie.
      - 'navigation "Strony: W rekrutacji"': Strona 1
    - 'region "Kolumna: Zakończone"':
      - heading "Zakończone" [level=2]
      - button "Rozwiń zakończone"
- alert
```

# Test source

```ts
  200 |         await page.keyboard.press("Tab");
  201 |         await expect
  202 |           .poll(() =>
  203 |             dialog.evaluate((element) =>
  204 |               element.contains(document.activeElement),
  205 |             ),
  206 |           )
  207 |           .toBe(true);
  208 |       }
  209 |     }
  210 |     measurements.capture = await reflow(page);
  211 |     await capture(page, `quick-capture-${width}`, info);
  212 |     await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  213 |     await dialog
  214 |       .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
  215 |       .check();
  216 |     await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  217 |     await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  218 |     await expect(
  219 |       dialog.getByRole("button", { name: "Utwórz nową sprawę", exact: true }),
  220 |     ).toBeVisible();
  221 |     measurements.duplicate = await reflow(page);
  222 |     await capture(page, `duplicate-warning-${width}`, info);
  223 |     const duplicateAction = dialog.getByRole("button", {
  224 |       name: "Utwórz nową sprawę",
  225 |       exact: true,
  226 |     });
  227 |     await duplicateAction.scrollIntoViewIfNeeded();
  228 |     await duplicateAction.focus();
  229 |     await page.keyboard.press("Shift+Tab");
  230 |     await page.keyboard.press("Tab");
  231 |     await expect(duplicateAction).toBeFocused();
  232 |     await expect(duplicateAction).toBeInViewport();
  233 |     await capture(page, `duplicate-actions-${width}`, info);
  234 |     for (const label of ["Wstecz", "Anuluj"]) {
  235 |       const footerAction = dialog.getByRole("button", {
  236 |         name: label,
  237 |         exact: true,
  238 |       });
  239 |       await footerAction.scrollIntoViewIfNeeded();
  240 |       await footerAction.focus();
  241 |       await page.keyboard.press("Shift+Tab");
  242 |       await page.keyboard.press("Tab");
  243 |       await expect(footerAction).toBeFocused();
  244 |       await expect(footerAction).toBeInViewport();
  245 |     }
  246 |     await capture(page, `duplicate-footer-${width}`, info);
  247 |     const client = sdk(target);
  248 |     await client.auth.signInWithPassword({
  249 |       email: owner.email,
  250 |       password: owner.password,
  251 |     });
  252 |     const unchanged = await client
  253 |       .from("recruitment_case")
  254 |       .select("id", { count: "exact", head: true });
  255 |     expect(unchanged.error === null).toBe(true);
  256 |     expect(unchanged.count).toBe(3);
  257 |     if (process.env.UI_SCREENSHOTS_DIR) {
  258 |       await writeFile(
  259 |         join(process.env.UI_SCREENSHOTS_DIR, `measurements-${width}.json`),
  260 |         JSON.stringify(measurements, null, 2),
  261 |       );
  262 |     }
  263 |   });
  264 | }
  265 | 
  266 | test("UI foundation empty state and responsive keyboard navigation restore focus", async ({
  267 |   page,
  268 | }, info) => {
  269 |   await page.setViewportSize({ width: 1440, height: 960 });
  270 |   await login(page, emptyOwner);
  271 |   const collapse = page.getByRole("button", {
  272 |     name: "Zwiń nawigację",
  273 |     exact: true,
  274 |   });
  275 |   await collapse.click();
  276 |   const navigation = page.getByRole("navigation", {
  277 |     name: "Główna nawigacja",
  278 |     exact: true,
  279 |   });
  280 |   for (const link of await navigation.getByRole("link").all()) {
  281 |     expect([
  282 |       "/dashboard",
  283 |       "/recruitments",
  284 |       "/companies",
  285 |       "/contacts",
  286 |     ]).toContain(await link.getAttribute("href"));
  287 |   }
  288 |   await expect(
  289 |     navigation.getByRole("link", { name: "Dashboard", exact: true }),
  290 |   ).toHaveAttribute("aria-current", "page");
  291 |   await expect(
  292 |     navigation.getByRole("link", { name: "Rekrutacje", exact: true }),
  293 |   ).toHaveAccessibleName("Rekrutacje");
  294 |   await page
  295 |     .getByRole("button", { name: "Rozwiń nawigację", exact: true })
  296 |     .click();
  297 |   await page.goto(`${target.appOrigin}/recruitments`);
  298 |   await expect(
  299 |     page.getByRole("heading", { name: "Nie masz jeszcze spraw", exact: true }),
> 300 |   ).toBeVisible();
      |     ^ Error: expect(locator).toBeVisible() failed
  301 |   await capture(page, "empty-recruitments-1440", info);
  302 |   await page.setViewportSize({ width: 375, height: 812 });
  303 |   const trigger = page.getByRole("button", {
  304 |     name: "Otwórz nawigację",
  305 |     exact: true,
  306 |   });
  307 |   await trigger.focus();
  308 |   await page.keyboard.press("Enter");
  309 |   const dialog = page.getByRole("dialog", { name: "Nawigacja", exact: true });
  310 |   await expect(dialog).toBeVisible();
  311 |   await expect(
  312 |     dialog.getByRole("link", { name: "Rekrutacje", exact: true }),
  313 |   ).toHaveAttribute("aria-current", "page");
  314 |   for (let index = 0; index < 12; index++) {
  315 |     await page.keyboard.press("Tab");
  316 |     await expect
  317 |       .poll(() =>
  318 |         dialog.evaluate((element) => element.contains(document.activeElement)),
  319 |       )
  320 |       .toBe(true);
  321 |   }
  322 |   await reflow(page);
  323 |   await capture(page, "mobile-navigation-375", info);
  324 |   await page.keyboard.press("Escape");
  325 |   await expect(dialog).not.toBeVisible();
  326 |   await expect(trigger).toBeFocused();
  327 |   for (const width of [320, 720]) {
  328 |     await page.setViewportSize({ width, height: 960 });
  329 |     await page.goto(`${target.appOrigin}/recruitments`);
  330 |     await reflow(page);
  331 |     await capture(page, `reflow-equivalent-${width}`, info);
  332 |   }
  333 |   await page.setViewportSize({ width: 375, height: 812 });
  334 |   // Enlarged type is a separate check from browser/device scale emulation.
  335 |   await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  336 |   await reflow(page);
  337 |   await capture(page, "large-text-375", info);
  338 | });
  339 | 
  340 | test("UI foundation Auth render and validation at all required widths", async ({
  341 |   page,
  342 | }, info) => {
  343 |   for (const width of widths) {
  344 |     await page.setViewportSize({ width, height: 900 });
  345 |     for (const path of ["login", "signup"] as const) {
  346 |       await page.goto(`${target.appOrigin}/${path}`);
  347 |       await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
  348 |       await reflow(page);
  349 |       await capture(page, `${path}-${width}`, info);
  350 |     }
  351 |   }
  352 |   await page.goto(`${target.appOrigin}/login`);
  353 |   await page
  354 |     .getByLabel("E-mail", { exact: true })
  355 |     .fill("synthetic-nonexistent@example.invalid");
  356 |   await page
  357 |     .getByLabel("Hasło", { exact: true })
  358 |     .fill("Synthetic-invalid-password!");
  359 |   await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  360 |   await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  361 |   await reflow(page);
  362 |   await capture(page, "login-error-375", info);
  363 | });
  364 | 
  365 | test("UI foundation account menu ends the native local session and protects history", async ({
  366 |   page,
  367 |   context,
  368 | }) => {
  369 |   await login(page);
  370 |   await page.goto(`${target.appOrigin}/recruitments/${detailId}`);
  371 |   await expect(
  372 |     page.getByRole("heading", { name: title, exact: true }),
  373 |   ).toBeVisible();
  374 |   await page.getByRole("button", { name: "Menu konta", exact: true }).click();
  375 |   await page
  376 |     .getByRole("menuitem", { name: "Wyloguj tutaj", exact: true })
  377 |     .click();
  378 |   await expect(page).toHaveURL(/\/login(?:\?|$)/);
  379 |   expect(
  380 |     (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
  381 |   ).toBe(401);
  382 |   await page.goBack();
  383 |   await expect(
  384 |     page.getByRole("heading", { name: title, exact: true }),
  385 |   ).not.toBeVisible();
  386 |   await page.goto(`${target.appOrigin}/recruitments/${detailId}`);
  387 |   await expect(page).toHaveURL(/\/login(?:\?|$)/);
  388 | });
  389 | 
  390 | type PopupObservation = {
  391 |   connected: boolean;
  392 |   hiddenByVerifiedAncestor: boolean;
  393 |   renderedRects: number;
  394 |   path: string;
  395 | };
  396 | 
  397 | test("UI foundation open account popup is hidden synchronously when another tab signs out", async ({
  398 |   page,
  399 |   context,
  400 | }) => {
```