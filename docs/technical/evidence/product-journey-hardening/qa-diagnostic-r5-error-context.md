# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recruitment-product-journey-navigation.spec.ts >> Case section fragment allowlist never accepts attacker Auth fragments or changes the owner
- Location: tests/e2e/recruitment-product-journey-navigation.spec.ts:171:1

# Error details

```
Error: Fragment scrubbing: detail/same-document-suffix; verified owner unchanged

Fragment scrubbing: detail/same-document-suffix; verified owner unchanged

expect(received).toBe(expected) // Object.is equality

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
        - heading "Fragment 0b829a43-d004-41c2-8a38-0c873878af92" [level=1] [ref=f2e79]
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
                    - time [ref=f2e104]: 1 lis 2026, 18:16
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
  150 |       .click();
  151 |     await form
  152 |       .getByRole("button", { name: "Odrzuć zmiany", exact: true })
  153 |       .click();
  154 |     await expect(form).toHaveCount(0);
  155 |     await page
  156 |       .getByRole("link", { name: "Wróć do listy spraw", exact: true })
  157 |       .click();
  158 |     await expect(page).toHaveURL(contextURL);
  159 |     await expect(
  160 |       page.getByRole("button", { name: "Lista", exact: true }),
  161 |     ).toHaveAttribute("aria-pressed", "true");
  162 |     await expect(
  163 |       page.getByRole("combobox", { name: "Sortowanie", exact: true }),
  164 |     ).toHaveValue("oldest");
  165 |     await expect(
  166 |       page.getByRole("button", { name: title, exact: true }),
  167 |     ).toBeVisible();
  168 |   });
  169 | }
  170 | 
  171 | test("Case section fragment allowlist never accepts attacker Auth fragments or changes the owner", async ({
  172 |   page,
  173 | }) => {
  174 |   const target = await readRecruitmentTarget(
  175 |     process.env.RECRUITMENT_TARGET_ID!,
  176 |   );
  177 |   const owner = await account(target);
  178 |   const attacker = await account(target);
  179 |   const { client } = await sdkLogin(target, owner);
  180 |   const { session } = await sdkLogin(target, attacker);
  181 |   const created = await client.rpc("create_recruitment_case", {
  182 |     p_request_id: randomUUID(),
  183 |     p_title: `Fragment ${randomUUID()}`,
  184 |   });
  185 |   expect(created.error).toBeNull();
  186 |   const ownDetail = `/recruitments/${created.data.case.id as string}`;
  187 |   await page.goto(`${target.appOrigin}/login`);
  188 |   await page.getByLabel("E-mail", { exact: true }).fill(owner.email);
  189 |   await page.getByLabel("Hasło", { exact: true }).fill(owner.password);
  190 |   await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  191 |   await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  192 |   const authFragment = new URLSearchParams({
  193 |     access_token: session.access_token,
  194 |     refresh_token: session.refresh_token,
  195 |     token_type: "bearer",
  196 |     expires_in: "60",
  197 |     type: "recovery",
  198 |   }).toString();
  199 |   for (const [caseLabel, path, fragment] of [
  200 |     ["detail/direct-entry", ownDetail, authFragment],
  201 |     ["detail/same-document-suffix", ownDetail, `case-history&${authFragment}`],
  202 |     ["account/direct-entry", "/account", authFragment],
  203 |     [
  204 |       "account/same-document-suffix",
  205 |       "/account",
  206 |       `case-history&${authFragment}`,
  207 |     ],
  208 |     ["account/noncase-anchor", "/account", "case-history"],
  209 |   ]) {
  210 |     const previousGeneration = await page.evaluate(
  211 |       () => performance.timeOrigin,
  212 |     );
  213 |     try {
  214 |       await page.goto(`${target.appOrigin}${path}#${fragment}`);
  215 |     } catch {
  216 |       throw new Error(
  217 |         "Synthetic fragment navigation failed; sensitive URL withheld",
  218 |       );
  219 |     }
  220 |     await expect(
  221 |       page.getByRole("button", { name: "Dodaj", exact: true }),
  222 |     ).toBeVisible();
  223 |     const response = await page.request.get(`${target.appOrigin}/auth/user`);
  224 |     expect(response.status()).toBe(200);
  225 |     const identity = await response.json();
  226 |     expect(identity.user.id).toBe(owner.id);
  227 |     const proof = {
  228 |       caseLabel,
  229 |       previousGeneration,
  230 |       currentGeneration: await page.evaluate(() => performance.timeOrigin),
  231 |       ownerUnchanged: identity.user.id === owner.id,
  232 |       hashPresent: Boolean(new URL(page.url()).hash),
  233 |     };
  234 |     await writeFile(
  235 |       test
  236 |         .info()
  237 |         .outputPath(`fragment-proof-${caseLabel.replaceAll("/", "-")}.json`),
  238 |       JSON.stringify(proof, null, 2),
  239 |     );
  240 |     await test
  241 |       .info()
  242 |       .attach(`fragment-proof-${caseLabel.replaceAll("/", "-")}`, {
  243 |         body: JSON.stringify(proof),
  244 |         contentType: "application/json",
  245 |       });
  246 |     await expect
  247 |       .poll(() => Boolean(new URL(page.url()).hash), {
  248 |         message: `Fragment scrubbing: ${caseLabel}; verified owner unchanged`,
  249 |       })
> 250 |       .toBe(false);
      |        ^ Error: Fragment scrubbing: detail/same-document-suffix; verified owner unchanged
  251 |   }
  252 |   const visible = await client
  253 |     .from("recruitment_case")
  254 |     .select("id")
  255 |     .eq("id", created.data.case.id);
  256 |   expect(visible.error).toBeNull();
  257 |   expect(visible.data).toHaveLength(1);
  258 | });
  259 | 
```