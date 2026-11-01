# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: recruitment-product-journey-audit.spec.ts >> Product journey create to corrections across modules at 375px
- Location: tests/e2e/recruitment-product-journey-audit.spec.ts:8:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Kontakt rozpoczęty"
Received: "Zapisane"
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - alert [ref=f1e2]
  - generic [ref=f1e4]:
    - link "Przejdź do treści" [ref=f1e5] [cursor=pointer]:
      - /url: "#workspace-content"
    - main [ref=f1e6]:
      - generic [ref=f1e7]:
        - generic [ref=f1e8]:
          - button "Otwórz nawigację" [ref=f1e9] [cursor=pointer]
          - generic [ref=f1e11]: Jobs CRM
        - generic [ref=f1e12]:
          - button "Dodaj" [ref=f1e13] [cursor=pointer]
          - status [ref=f1e15]
          - button "Menu konta" [ref=f1e16] [cursor=pointer]
      - generic [ref=f1e22]:
        - heading "Journey 7ffa370f" [level=1] [ref=f1e24]
        - link "Wróć do listy spraw" [ref=f1e25] [cursor=pointer]:
          - /url: /recruitments
        - region "Zapisane dane sprawy" [ref=f1e26]:
          - generic [ref=f1e27]:
            - region [ref=f1e28]:
              - heading "Szczegóły sprawy" [level=2] [ref=f1e29]
              - generic [ref=f1e30]:
                - generic [ref=f1e31]:
                  - term [ref=f1e32]: Status
                  - definition [ref=f1e33]:
                    - generic [ref=f1e34]: Zapisane
                - generic [ref=f1e35]:
                  - term [ref=f1e36]: Bieżący etap
                  - definition [ref=f1e37]: Nie ustawiono etapu
                - generic [ref=f1e38]:
                  - term [ref=f1e39]: Dodano do CRM
                  - definition [ref=f1e40]:
                    - time [ref=f1e41]: 1 lis 2026, 16:13
            - region [ref=f1e42]:
              - heading "Kontekst sprawy" [level=2] [ref=f1e43]
              - paragraph [ref=f1e44]: Nie dodano dodatkowego opisu ani adresu źródłowego.
          - region "Powiązania" [ref=f1e46]:
            - heading "Powiązania" [level=2] [ref=f1e47]
            - paragraph [ref=f1e48]: Powiązanie osoby ze sprawą nie oznacza udziału w jej zdarzeniach. Powiązanie z firmą nie potwierdza zatrudnienia. Pracodawca może pozostać nieznany.
            - generic [ref=f1e49]:
              - button "Powiąż z firmą" [ref=f1e50] [cursor=pointer]
              - button "Powiąż z kontaktem" [ref=f1e51] [cursor=pointer]
            - paragraph [ref=f1e52]: Brak powiązań na tej stronie.
            - navigation "Strony powiązań" [ref=f1e53]:
              - button "Poprzednia strona" [disabled] [ref=f1e54]
              - generic [ref=f1e55]: Strona 1
              - button "Następna strona" [disabled] [ref=f1e56]
            - button "Audyt zmian" [ref=f1e58] [cursor=pointer]
          - region "Zadania sprawy" [ref=f1e60]:
            - generic [ref=f1e61]:
              - heading "Zadania sprawy" [level=2] [ref=f1e62]
              - button "Dodaj zadanie" [ref=f1e63] [cursor=pointer]
            - paragraph [ref=f1e64]: Nie ma jeszcze zadań w tym widoku.
            - 'navigation "Strony: Zadania sprawy" [ref=f1e65]':
              - button "Poprzednia strona" [disabled] [ref=f1e66]
              - generic [ref=f1e67]: Strona 1
              - button "Następna strona" [disabled] [ref=f1e68]
          - region [ref=f1e69]:
            - heading "Zakończenie i kontynuacja" [level=2] [ref=f1e70]
            - button "Zakończ sprawę" [ref=f1e71] [cursor=pointer]
          - region [ref=f1e72]:
            - heading "Działania w sprawie" [level=2] [ref=f1e73]
            - paragraph [ref=f1e74]: Odnotuj fakt, który już miał miejsce. Rejestracja nie wysyła wiadomości ani aplikacji.
            - status
            - form [ref=f1e75]:
              - heading "Zarejestruj aplikowanie" [level=3] [ref=f1e76]
              - paragraph [ref=f1e77]: Błędny wpis można skorygować lub unieważnić z zachowaniem oryginału i audytu. Sprawdź dane przed potwierdzeniem.
              - generic [ref=f1e78]:
                - generic [ref=f1e79]: Data zdarzenia (opcjonalnie)
                - paragraph [ref=f1e80]: Jeśli nie znasz daty, pozostaw pole puste. Zapiszemy „Data zdarzenia nieznana”, bez zastępowania jej dniem dodania do CRM. Przyszła data nie jest dozwolona.
                - textbox "Data zdarzenia (opcjonalnie)" [disabled] [ref=f1e81]: 2000-01-01
              - generic [ref=f1e83]:
                - checkbox "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce." [checked] [disabled] [ref=f1e84]
                - generic [ref=f1e85]: Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.
              - generic [ref=f1e86]:
                - button "Zapisywanie…" [disabled] [ref=f1e87]
                - button "Anuluj" [disabled] [ref=f1e88]
          - region [ref=f1e89]:
            - heading "Historia sprawy" [level=2] [ref=f1e90]
            - generic:
              - status
            - paragraph [ref=f1e91]: Nie zarejestrowano jeszcze zdarzeń biznesowych. Samo zapisanie sprawy nie oznacza aplikowania ani kontaktu.
```

# Test source

```ts
  1   | /** Cross-module audit: DEC054-060, BR011; all business writes through actual UI. */
  2   | import { randomUUID } from "node:crypto";
  3   | import { expect, test, type Page } from "@playwright/test";
  4   | import { readRecruitmentTarget } from "../../scripts/recruitment/target.ts";
  5   | import { account, login as sdkLogin } from "../integration/auth/fixtures.ts";
  6   | 
  7   | for (const width of [1440, 375]) {
  8   |   test(`Product journey create to corrections across modules at ${width}px`, async ({
  9   |     page,
  10  |   }) => {
  11  |     test.setTimeout(180_000);
  12  |     const target = await readRecruitmentTarget(
  13  |       process.env.RECRUITMENT_TARGET_ID!,
  14  |     );
  15  |     const user = await account(target);
  16  |     const { client } = await sdkLogin(target, user);
  17  |     const mark = randomUUID().slice(0, 8);
  18  |     const title = `Journey ${mark}`;
  19  |     const history = page.getByRole("region", {
  20  |       name: "Historia sprawy",
  21  |       exact: true,
  22  |     });
  23  |     const button = (name: string) =>
  24  |       page.getByRole("button", { name, exact: true });
  25  |     const noOverflow = async () =>
  26  |       expect(
  27  |         await page.evaluate(() => ({
  28  |           inner: innerWidth,
  29  |           scroll: document.documentElement.scrollWidth,
  30  |         })),
  31  |       ).toEqual({ inner: width, scroll: width });
  32  |     const navigate = async (name: string) => {
  33  |       if (width < 768) await button("Otwórz nawigację").click();
  34  |       const nav = page
  35  |         .getByRole("navigation", { name: "Główna nawigacja", exact: true })
  36  |         .filter({ visible: true });
  37  |       await nav.getByRole("link", { name, exact: true }).click();
  38  |       if (width < 768)
  39  |         await expect(
  40  |           page.getByRole("dialog", { name: "Nawigacja", exact: true }),
  41  |         ).toHaveCount(0);
  42  |       await noOverflow();
  43  |     };
  44  |     const state = async () => {
  45  |       const result = await client
  46  |         .from("recruitment_case")
  47  |         .select("id,status,current_stage")
  48  |         .eq("title", title)
  49  |         .single();
  50  |       expect(result.error).toBeNull();
  51  |       return result.data!;
  52  |     };
  53  |     await page.setViewportSize({ width, height: 900 });
  54  |     await page.goto(`${target.appOrigin}/login`);
  55  |     await page.getByLabel("E-mail", { exact: true }).fill(user.email);
  56  |     await page.getByLabel("Hasło", { exact: true }).fill(user.password);
  57  |     await button("Zaloguj się").click();
  58  |     await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  59  |     await button("Dodaj").click();
  60  |     const manual = page.getByRole("menuitem", {
  61  |       name: "Dodaj ręcznie",
  62  |       exact: true,
  63  |     });
  64  |     if (await manual.count()) await manual.click();
  65  |     const dialog = page.getByRole("dialog");
  66  |     await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  67  |     await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
  68  |     await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  69  |     await dialog
  70  |       .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
  71  |       .check();
  72  |     await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
  73  |     await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  74  |     await expect(dialog).toHaveCount(0);
  75  |     const initial = await state();
  76  |     expect(initial.status).toBe("Zapisane");
  77  |     const caseId = initial.id;
  78  |     await page
  79  |       .getByRole("link", { name: "Otwórz sprawę", exact: true })
  80  |       .click();
  81  |     await button("Zarejestruj aplikowanie").click();
  82  |     await page
  83  |       .getByLabel("Data zdarzenia (opcjonalnie)", { exact: true })
  84  |       .fill("2000-01-01");
  85  |     await page
  86  |       .getByRole("checkbox", {
  87  |         name: "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
  88  |         exact: true,
  89  |       })
  90  |       .check();
  91  |     await button("Zapisz zdarzenie").click();
  92  |     await expect(button("Zapisz zdarzenie")).toHaveCount(0);
> 93  |     expect((await state()).status).toBe("Kontakt rozpoczęty");
      |                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  94  |     await button("Zarejestruj kontakt").click();
  95  |     await page
  96  |       .getByRole("radio", {
  97  |         name: "Kontakt przychodzący (inbound)",
  98  |         exact: true,
  99  |       })
  100 |       .check();
  101 |     await page
  102 |       .getByRole("checkbox", {
  103 |         name: "Potwierdzam, że to zdarzenie rzeczywiście miało miejsce.",
  104 |         exact: true,
  105 |       })
  106 |       .check();
  107 |     await button("Zapisz zdarzenie").click();
  108 |     await expect(button("Zapisz zdarzenie")).toHaveCount(0);
  109 |     for (const [action, stage, consent] of [
  110 |       [
  111 |         "Zarejestruj zaproszenie",
  112 |         "Screening",
  113 |         "Potwierdzam otrzymanie zaproszenia do etapu kwalifikacyjnego i ustawienie wskazanego etapu jako bieżącego.",
  114 |       ],
  115 |       [
  116 |         "Zmień etap",
  117 |         "Rozmowa techniczna",
  118 |         "Potwierdzam rzeczywiste przejście do wskazanego etapu i ustawienie go jako bieżącego.",
  119 |       ],
  120 |     ]) {
  121 |       await button(action).click();
  122 |       await page.getByLabel("Nazwa etapu", { exact: true }).fill(stage);
  123 |       await page.getByRole("checkbox", { name: consent, exact: true }).check();
  124 |       await button("Zapisz zdarzenie").click();
  125 |       await expect(button("Zapisz zdarzenie")).toHaveCount(0);
  126 |     }
  127 |     expect(await state()).toMatchObject({
  128 |       status: "W rekrutacji",
  129 |       current_stage: "Rozmowa techniczna",
  130 |     });
  131 |     for (const [module, trigger, label, name] of [
  132 |       ["Firmy", "Dodaj firmę", "Nazwa firmy", `Firma ${mark}`],
  133 |       ["Kontakty", "Dodaj kontakt", "Nazwa kontaktu", `Osoba ${mark}`],
  134 |     ]) {
  135 |       await navigate(module);
  136 |       await button(trigger).click();
  137 |       await page.getByLabel(label, { exact: true }).fill(name);
  138 |       await button("Zapisz profil").click();
  139 |       await expect(page).toHaveURL(/\/(companies|contacts)\/[0-9a-f-]+$/);
  140 |       const relations = page.getByRole("region", {
  141 |         name: "Powiązania",
  142 |         exact: true,
  143 |       });
  144 |       await relations
  145 |         .getByRole("button", { name: "Powiąż ze sprawą", exact: true })
  146 |         .click();
  147 |       await relations
  148 |         .getByLabel("Wybierz sprawę", { exact: true })
  149 |         .selectOption(caseId);
  150 |       if (module === "Firmy")
  151 |         await relations
  152 |           .getByLabel("Rola firmy w sprawie", { exact: true })
  153 |           .selectOption("employer");
  154 |       await relations
  155 |         .getByRole("button", { name: "Zapisz powiązanie", exact: true })
  156 |         .click();
  157 |       await expect(
  158 |         relations.getByRole("heading", {
  159 |           name: "Nowe powiązanie",
  160 |           exact: true,
  161 |         }),
  162 |       ).toHaveCount(0);
  163 |       await expect(relations).toContainText(title);
  164 |     }
  165 |     await navigate("Rekrutacje");
  166 |     await page.getByRole("button", { name: title, exact: true }).click();
  167 |     const preview = page.getByRole("dialog", {
  168 |       name: "Podgląd sprawy",
  169 |       exact: true,
  170 |     });
  171 |     await expect(preview).toContainText("W rekrutacji");
  172 |     await preview
  173 |       .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
  174 |       .click();
  175 |     const relations = page.getByRole("region", {
  176 |       name: "Powiązania",
  177 |       exact: true,
  178 |     });
  179 |     await expect(relations).toContainText(`Firma ${mark}`);
  180 |     await expect(relations).toContainText(`Osoba ${mark}`);
  181 |     const titles = ["Anuluj", "Zachowaj", "Odłącz"].map((x) => `${x} ${mark}`);
  182 |     for (const taskTitle of titles) {
  183 |       await button("Dodaj zadanie").click();
  184 |       await page.getByLabel("Tytuł zadania", { exact: true }).fill(taskTitle);
  185 |       await button("Zapisz zadanie").click();
  186 |       await expect(
  187 |         page.getByRole("article", { name: taskTitle, exact: true }),
  188 |       ).toBeVisible();
  189 |     }
  190 |     await navigate("Dashboard");
  191 |     for (const taskTitle of titles)
  192 |       await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
  193 |     await navigate("Zadania");
```