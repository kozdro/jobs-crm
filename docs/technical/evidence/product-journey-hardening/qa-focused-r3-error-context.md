# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recruitment-product-journey-navigation.spec.ts >> Case section fragment allowlist never accepts attacker Auth fragments or changes the owner
- Location: tests/e2e/recruitment-product-journey-navigation.spec.ts:170:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - generic [ref=f2e3]:
    - link "Przejdź do treści" [ref=f2e4] [cursor=pointer]:
      - /url: "#workspace-content"
    - complementary "Panel boczny" [ref=f2e5]:
      - link "Jobs CRM — Dashboard" [ref=f2e6] [cursor=pointer]:
        - /url: /dashboard
        - text: Jobs CRM
      - navigation "Główna nawigacja" [ref=f2e8]:
        - link "Dashboard" [ref=f2e9] [cursor=pointer]:
          - /url: /dashboard
        - link "Rekrutacje" [ref=f2e16] [cursor=pointer]:
          - /url: /recruitments
        - link "Zadania" [ref=f2e22] [cursor=pointer]:
          - /url: /tasks
        - generic [ref=f2e27]:
          - generic [ref=f2e30]: Kalendarz
          - generic [ref=f2e31]: Niedostępne
        - generic [ref=f2e32]:
          - generic [ref=f2e37]: Dokumenty
          - generic [ref=f2e38]: Niedostępne
        - link "Firmy" [ref=f2e39] [cursor=pointer]:
          - /url: /companies
        - link "Kontakty" [ref=f2e45] [cursor=pointer]:
          - /url: /contacts
      - generic [ref=f2e51]:
        - button "Zwiń nawigację" [expanded] [ref=f2e52] [cursor=pointer]
        - paragraph [ref=f2e57]: Prywatna przestrzeń pracy
    - main [ref=f2e58]:
      - generic [ref=f2e59]:
        - paragraph [ref=f2e61]:
          - generic [ref=f2e62]: Moja przestrzeń
          - generic [aria-hidden] [ref=f2e63]: /
          - generic [ref=f2e64]: Rekrutacje
        - generic [ref=f2e65]:
          - button "Dodaj" [ref=f2e66] [cursor=pointer]
          - status [ref=f2e68]
          - button "Menu konta" [ref=f2e70] [cursor=pointer]:
            - generic [ref=f2e74]: Konto
      - generic [ref=f2e77]:
        - heading "Fragment 6fab4ce4-ff2c-4dc5-8246-22648e32d065" [level=1] [ref=f2e79]
        - link "Wróć do listy spraw" [ref=f2e80] [cursor=pointer]:
          - /url: /recruitments
        - navigation "Sekcje sprawy" [ref=f2e81]:
          - link "Dane sprawy" [ref=f2e82] [cursor=pointer]:
            - /url: "#case-details"
          - link "Powiązania" [ref=f2e83] [cursor=pointer]:
            - /url: "#case-relations"
          - link "Zadania" [ref=f2e84] [cursor=pointer]:
            - /url: "#case-tasks"
          - link "Zakończenie i kontynuacja" [ref=f2e85] [cursor=pointer]:
            - /url: "#case-lifecycle"
          - link "Działania" [ref=f2e86] [cursor=pointer]:
            - /url: "#case-actions"
          - link "Historia" [ref=f2e87] [cursor=pointer]:
            - /url: "#case-history"
        - region "Zapisane dane sprawy" [ref=f2e88]:
          - generic [ref=f2e90]:
            - region [ref=f2e91]:
              - heading "Szczegóły sprawy" [level=2] [ref=f2e92]
              - generic [ref=f2e93]:
                - generic [ref=f2e94]:
                  - term [ref=f2e95]: Status
                  - definition [ref=f2e96]:
                    - generic [ref=f2e97]: Zapisane
                - generic [ref=f2e98]:
                  - term [ref=f2e99]: Bieżący etap
                  - definition [ref=f2e100]: Nie ustawiono etapu
                - generic [ref=f2e101]:
                  - term [ref=f2e102]: Dodano do CRM
                  - definition [ref=f2e103]:
                    - time [ref=f2e104]: 1 lis 2026, 18:11
            - region [ref=f2e105]:
              - heading "Kontekst sprawy" [level=2] [ref=f2e106]
              - paragraph [ref=f2e107]: Nie dodano dodatkowego opisu ani adresu źródłowego.
          - region "Powiązania" [ref=f2e109]:
            - heading "Powiązania" [level=2] [ref=f2e110]
            - paragraph [ref=f2e111]: Powiązanie osoby ze sprawą nie oznacza udziału w jej zdarzeniach. Powiązanie z firmą nie potwierdza zatrudnienia. Pracodawca może pozostać nieznany.
            - generic [ref=f2e112]:
              - button "Powiąż z firmą" [ref=f2e113] [cursor=pointer]
              - button "Powiąż z kontaktem" [ref=f2e114] [cursor=pointer]
            - paragraph [ref=f2e115]: Brak powiązań na tej stronie.
            - navigation "Strony powiązań" [ref=f2e116]:
              - button "Poprzednia strona" [disabled] [ref=f2e117]
              - generic [ref=f2e118]: Strona 1
              - button "Następna strona" [disabled] [ref=f2e119]
            - button "Audyt zmian" [ref=f2e121] [cursor=pointer]
          - region "Zadania sprawy" [ref=f2e123]:
            - generic [ref=f2e124]:
              - heading "Zadania sprawy" [level=2] [ref=f2e125]
              - button "Dodaj zadanie" [ref=f2e126] [cursor=pointer]
            - paragraph [ref=f2e127]: Nie ma jeszcze zadań w tym widoku.
            - 'navigation "Strony: Zadania sprawy" [ref=f2e128]':
              - button "Poprzednia strona" [disabled] [ref=f2e129]
              - generic [ref=f2e130]: Strona 1
              - button "Następna strona" [disabled] [ref=f2e131]
          - region [ref=f2e133]:
            - heading "Zakończenie i kontynuacja" [level=2] [ref=f2e134]
            - button "Zakończ sprawę" [ref=f2e135] [cursor=pointer]
          - region [ref=f2e137]:
            - heading "Działania w sprawie" [level=2] [ref=f2e138]
            - paragraph [ref=f2e139]: Odnotuj fakt, który już miał miejsce. Rejestracja nie wysyła wiadomości ani aplikacji.
            - status
            - generic [ref=f2e140]:
              - button "Zarejestruj aplikowanie" [ref=f2e141] [cursor=pointer]
              - button "Zarejestruj kontakt" [ref=f2e142] [cursor=pointer]
              - button "Zarejestruj zaproszenie" [ref=f2e143] [cursor=pointer]
          - region [ref=f2e145]:
            - heading "Historia sprawy" [level=2] [ref=f2e146]
            - generic:
              - status
            - paragraph [ref=f2e147]: Nie zarejestrowano jeszcze zdarzeń biznesowych. Samo zapisanie sprawy nie oznacza aplikowania ani kontaktu.
  - alert [ref=f2e148]
```

# Test source

```ts
  115 |       draft,
  116 |     );
  117 |     const tasksLink = nav.getByRole("link", { name: "Zadania", exact: true });
  118 |     await tasksLink.focus();
  119 |     await page.keyboard.press("Enter");
  120 |     await expect(page).toHaveURL(`${detailURL}#case-tasks`);
  121 |     await page.goBack();
  122 |     await expect(page).toHaveURL(`${detailURL}#case-history`);
  123 |     await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
  124 |       draft,
  125 |     );
  126 |     await page.goForward();
  127 |     await expect(page).toHaveURL(`${detailURL}#case-tasks`);
  128 |     await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
  129 |       draft,
  130 |     );
  131 |     const stored = await client
  132 |       .from("recruitment_task")
  133 |       .select("id")
  134 |       .eq("owner_id", user.id);
  135 |     expect(stored.error).toBeNull();
  136 |     expect(stored.data).toEqual([]);
  137 |     expect(
  138 |       await page.evaluate(() => ({
  139 |         inner: innerWidth,
  140 |         scroll: document.documentElement.scrollWidth,
  141 |       })),
  142 |     ).toEqual({ inner: width, scroll: width });
  143 |     await page.screenshot({
  144 |       path: test.info().outputPath(`detail-navigation-${width}.png`),
  145 |       fullPage: true,
  146 |     });
  147 |     await form
  148 |       .getByRole("button", { name: "Anuluj edycję", exact: true })
  149 |       .click();
  150 |     await form
  151 |       .getByRole("button", { name: "Odrzuć zmiany", exact: true })
  152 |       .click();
  153 |     await expect(form).toHaveCount(0);
  154 |     await page
  155 |       .getByRole("link", { name: "Wróć do listy spraw", exact: true })
  156 |       .click();
  157 |     await expect(page).toHaveURL(contextURL);
  158 |     await expect(
  159 |       page.getByRole("button", { name: "Lista", exact: true }),
  160 |     ).toHaveAttribute("aria-pressed", "true");
  161 |     await expect(
  162 |       page.getByRole("combobox", { name: "Sortowanie", exact: true }),
  163 |     ).toHaveValue("oldest");
  164 |     await expect(
  165 |       page.getByRole("button", { name: title, exact: true }),
  166 |     ).toBeVisible();
  167 |   });
  168 | }
  169 | 
  170 | test("Case section fragment allowlist never accepts attacker Auth fragments or changes the owner", async ({
  171 |   page,
  172 | }) => {
  173 |   const target = await readRecruitmentTarget(
  174 |     process.env.RECRUITMENT_TARGET_ID!,
  175 |   );
  176 |   const owner = await account(target);
  177 |   const attacker = await account(target);
  178 |   const { client } = await sdkLogin(target, owner);
  179 |   const { session } = await sdkLogin(target, attacker);
  180 |   const created = await client.rpc("create_recruitment_case", {
  181 |     p_request_id: randomUUID(),
  182 |     p_title: `Fragment ${randomUUID()}`,
  183 |   });
  184 |   expect(created.error).toBeNull();
  185 |   const ownDetail = `/recruitments/${created.data.case.id as string}`;
  186 |   await page.goto(`${target.appOrigin}/login`);
  187 |   await page.getByLabel("E-mail", { exact: true }).fill(owner.email);
  188 |   await page.getByLabel("Hasło", { exact: true }).fill(owner.password);
  189 |   await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  190 |   await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  191 |   const authFragment = new URLSearchParams({
  192 |     access_token: session.access_token,
  193 |     refresh_token: session.refresh_token,
  194 |     token_type: "bearer",
  195 |     expires_in: "60",
  196 |     type: "recovery",
  197 |   }).toString();
  198 |   for (const [path, fragment] of [
  199 |     [ownDetail, authFragment],
  200 |     [ownDetail, `case-history&${authFragment}`],
  201 |     ["/account", authFragment],
  202 |     ["/account", `case-history&${authFragment}`],
  203 |     ["/account", "case-history"],
  204 |   ]) {
  205 |     try {
  206 |       await page.goto(`${target.appOrigin}${path}#${fragment}`);
  207 |     } catch {
  208 |       throw new Error(
  209 |         "Synthetic fragment navigation failed; sensitive URL withheld",
  210 |       );
  211 |     }
  212 |     await expect(
  213 |       page.getByRole("button", { name: "Dodaj", exact: true }),
  214 |     ).toBeVisible();
> 215 |     await expect.poll(() => Boolean(new URL(page.url()).hash)).toBe(false);
      |                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  216 |     const response = await page.request.get(`${target.appOrigin}/auth/user`);
  217 |     expect(response.status()).toBe(200);
  218 |     const identity = await response.json();
  219 |     expect(identity.user.id).toBe(owner.id);
  220 |   }
  221 |   const visible = await client
  222 |     .from("recruitment_case")
  223 |     .select("id")
  224 |     .eq("id", created.data.case.id);
  225 |   expect(visible.error).toBeNull();
  226 |   expect(visible.data).toHaveLength(1);
  227 | });
  228 | 
```