# UI Foundation & UX Polish — plan i raport

Data: 2026-10-30. Status snapshotu: lokalna implementacja i QA PASS; niezależny frontend/security review oczekuje. Hosted CI NOT RUN na etapie tego zapisu; końcowy dokładny SHA i Checks w PR po publikacji.
Autoryzacja: bezpośrednie zlecenie PO, DEC-053 APPROVED. Baza: `aa496fc7c881b3af94a1982fac0353d2556c6a3f`, PR #13 potwierdzony jako merged przez GitHub; lokalny main identyczny z origin/main po fetch. Branch: `feat/ui-foundation-ux-polish`.

## Requirement i analiza wpływu

| Kontrakt | Status i zastosowanie |
| --- | --- |
| DEC-017/018, FR/AC-NV-001/003 | APPROVED struktura siedmiu modułów i Quick Capture; realizowane istniejące Dashboard/Rekrutacje, przyszłe moduły jawnie niedostępne. Pełne siedmiomodułowe AC nie stają się PASS. |
| FR/AC-NV-002 | Global Search poza zakresem; nie tworzymy atrap. |
| FR/AC-DB-001/007/008 | Landing, brak pełnego Kanbana/spisu ostatnich spraw i przymusowego onboardingu. DB-002–006 bez implementacji widgetów i fikcyjnych danych. |
| DEC-052; FR/AC-LC-001/004, QC-001/002/006/007/009/010, RW-005/009; UC/TC-001/029/034 | APPROVED tylko minimalny create/read i czterokrokowy manual Quick Capture; zachować walidację, duplikaty, idempotencję, retry/recovery. [Dokładna granica](recruitment-case-first-slice.md). |
| DEC-051, ADR-0012 ACCEPTED; FR/AC-AD-002; BR-030, NFR-001 | Niezmiennik prywatności; istniejące Auth/PKCE/logout local/global/others bez zmiany semantyki. Pełne AD-003–006 nadal PROPOSED. |
| BR-001/003/007/016/021/022/029 | Brak domniemanych danych/zdarzeń, zmian statusów i automatycznego merge; zapis pozostawia kontekst. |
| DEC-053, OPEN-015/017/033, NFR-005 | Delegacja visual language, WCAG 2.2 AA dla dotkniętych ekranów i czterech szerokości; częściowe rozstrzygnięcie, bez pełnej certyfikacji produktu. |

Wpływ: prezentacja, nawigacja, formularze i sesyjne UI. Ryzyko utraty focusu przy menu/dialogach, overflow długich danych, kontrastu, ujawnienia prywatnej treści po logout oraz regresji selektorów E2E. Brak wpływu na fizyczne dane/relacje i migracje; historia, import, wyszukiwanie i nowe moduły pozostają poza implementacją. OPEN-002/024 mają już rozstrzygnięcie create/read przez DEC-052; pozostałe lifecycle/retencja/branding/publiczne polityki Auth nadal OPEN i bez zmiany.

## Sekwencja i własność

1. Orchestrator: analiza kontraktów, potwierdzenie Git, zapis rzeczywistej decyzji PO; `analyze-requirement`, `plan-slice`, `record-decision`.
2. `visual_design` / ux-designer: rzeczywisty research → różne systemy → identyczne syntetyczne ekrany HTML/CSS → pomiary i ekspercka macierz → jeden werdykt. Własność research/visual-language i prototypów testowych. `component-spec`, `form-design` z referencjami vendor.
3. `ui_qa` / qa-engineer: plan testów już przed implementacją, własność E2E i fixtures; `design-qa-checklist`, `accessibility-audit`, `break-ui`, `verify-acceptance` z vendor i katalogiem. Syntetyczne izolowane targety, bez resetowania trwałego DEV.
4. `ui_frontend` / frontend-engineer: po werdykcie designera tokeny, shell i polish istniejącego UI; własność UI w src i unit testów UI. `implement-slice`; aktualne API przez Context7. Bez zmian domeny, endpointów i infrastruktury.
5. QA i orchestrator: testy jednostkowe/statyczne/F1/F2/F3/HTTP/RLS/E2E/build/harness; rzeczywisty render i screenshoty, klawiatura, reflow/zoom, kontrasty. Designer ocenia finalny render i zgłasza korekty autorowi.
6. Niezależny frontend-reviewer i security-reviewer przez `harness/scripts/review.py` z oddzielnym read-only parentem; `review-change`; kandydat zamrożony, snapshot przed/po. Autor naprawia findings i powtarza dotknięte testy/review.
7. Orchestrator: dokumentacja/traceability, autoryzowany commit/push/PR, exact-SHA hosted CI; stop na otwartym PR bez merge.

Modele dziedziczone z runtime; konkretne identyfikatory modelu/reasoning NOT EXPOSED. Role natywne; brak dalszej delegacji. Root posiada decyzje, traceability, ten raport i Git. Autorzy zachowują rozłączne zakresy.

## Macierz weryfikacji i DoD

| Zakres | Autor / metoda | Wynik |
| --- | --- | --- |
| Kierunki i kontrasty | designer: źródła, render identycznej treści, jawna macierz; brak fikcyjnych opinii użytkowników | PASS — zakres wykonany, dowody poniżej |
| Shell i nawigacja | QA E2E: aktywna trasa, collapse, mobile menu, focus/klawiatura, brak aktywnych fikcyjnych linków | PASS — zakres wykonany, dowody poniżej |
| DEC-052 | istniejące unit/HTTP/RLS/E2E + QA visual stanów create/duplicate/retry/recovery | PASS — zakres wykonany, dowody poniżej |
| Auth i prywatność | F3 i RecruitmentCase A/B/anon, logout scopes, menu konta, PKCE/recovery | PASS — zakres wykonany, dowody poniżej |
| Responsywność i dostępność | QA: Chromium 1440/1024/768/375, długie dane/URL/PL, 200% tekst i reflow 320/720 CSS px, focus, pomiar kontrastu | PASS — zakres wykonany, dowody poniżej |
| Statyczne, F1, build, harness | orchestrator: przypięte Node/pnpm, lint/typecheck/format, boundaries/canary/build/browser, harness checks/unit | PASS — zakres wykonany, dowody poniżej |
| Niezależny frontend/security review | osobne read-only procesy, diff i render/screenshots, brak nierozwiązanych P0/P1 | NOT RUN |
| Finalne CI | GitHub workflow dokładnego finalnego SHA, wszystkie wymagane jobs | NOT RUN |

Wymagane screenshoty: Dashboard desktop/mobile, Rekrutacje desktop/mobile, detal, Quick Capture, duplikat, menu konta, login/signup. DoD wymaga finalnego rzeczywistego UI, korekt po ocenie designera i aktualnej dokumentacji. Fizyczne urządzenia i czytniki ekranowe pozostaną NOT RUN, jeśli niedostępne; brak deklaracji pełnej zgodności WCAG na podstawie samego kodu.

## Dowody i ograniczenia

Końcowy lokalny wynik podaje tabela poniżej; historia wcześniejszych prób jest zachowana osobno. Kontrole lokalne wymagają izolowanego targetu; istniejące środowiska i dane użytkownika pozostają zachowane. Kolizja portów lub niedostępny runtime jest jawnym ograniczeniem, nie PASS. Bez zmian architektury; brak potrzeby ADR dla palety.

## Końcowy lokalny wynik i dowody

Kandydat produktu/testów/migracji: **90 identycznych plików**, SHA256 grupy `06eb4681724862fcfc25d1a0fa675f30787c13346788eb60a07fe602f50bc4fe`. [Pełny manifest QA, hashe źródeł i screenshotów](../ux/assets/ui-foundation/qa-summary.json). macOS, Docker Desktop lokalny Unix socket, Node **24.22.2**, pnpm **12.16.1**, Chromium Playwright **1.64.1**. Źródła root porównano z kopią testową; finalny Git SHA powstanie przy autoryzowanym commicie. Logi tymczasowe i surowe targety nie są częścią repo.

| Kontrola | Wykonana komenda / środowisko | Wynik |
| --- | --- | --- |
| Unit | `pnpm test:unit`, root finalnego źródła; `/tmp/jobs-ui-unit-complete-final.log` | **PASS 152 Vitest + 87 node:test**, 12 plików Vitest, zero fail/skip |
| Statyczne | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; `/tmp/jobs-ui-{typecheck,lint,format}-reviewed.log` | **PASS**, wszystkie exit 0 |
| F1 boundaries | `pnpm test:boundaries` | **PASS 7 kontroli** |
| Production/F1 | `pnpm build`, `pnpm test:e2e:foundation`, izolowana źródłowa kopia bez env/sekretów | **PASS build + 3/3 browser**; ponowione po poprawkach wizualnych |
| Canary | `pnpm test:canary`, kopia źródeł | **PASS 3 kontrole**, exit 0; finalne auth-buildy dodatkowo skanują assets/HTML/RSC/logi |
| F2 | `pnpm test:integration:f2`, własne jednorazowe 564xx | **PASS 85/85** |
| F3 | `pnpm test:auth:f3`, osobna kopia `/tmp/jobs-crm-ui-f3-20261030`, 565xx; `/tmp/jobs-ui-foundation-f3-complete-final.log` | **PASS build, SDK 13/13, HTTPS browser 10/10** |
| RecruitmentCase | `pnpm test:recruitment` z `UI_SCREENSHOTS_DIR`, świeży target kopii na 569xx; `/tmp/jobs-ui-foundation-recruitment-fresh-final.log` | **PASS build, HTTP/RLS 25/25, HTTPS browser 29/29** (20 dotychczasowych + 9 nowych) |
| Harness | `sync.py --check`, `check.py`, unit w kopii źródeł; finalny `/tmp/jobs-ui-harness-final.log` | **PASS** struktura/linki/vendor + **20/20 unit**; harness bajtowo bez zmian |
| Final Design QA | designer obejrzał realne PNG, 3 P2 naprawione i ponownie ocenione | **PASS**, bez otwartych wizualnych findings |
| Independent review | osobne frontend/security sesje zgodnie z wrapperem | **NOT RUN na chwilę przygotowania kandydata**; wynik zostanie dopisany przed publikacją |
| Hosted CI | workflow dokładnego końcowego SHA po push/PR | **NOT RUN na chwilę zapisu**; nie jest zastępowane testami lokalnymi |

Finalny własny target RecruitmentCase: `run-b13e53df`, project `jobs-crm-recruitment-518c7c-72d95dc3e960`. Po sukcesie runner usunął wyłącznie swoje zasoby syntetyczne. Kopiowe remapy dotyczą tylko `scripts/recruitment/target.ts`, `scripts/recruitment/cleanup-plan.ts`, `supabase/recruitment-config.toml`: 5662x→5692x. Nie trafiły do repo. Wcześniejszy własny target 568xx i istniejące manual DEV 566xx / trwały DEV 567xx zachowano. F3 miał identyczny finalny `src` i wszystkie konsumowane testy Auth; dwie późniejsze różnice w kopii dotyczą wyłącznie niekonsumowanych Recruitment E2E, wskazane w manifeście.

### Screenshoty rzeczywistej aplikacji

**50 PNG** oraz 50 audytów computed style, syntetyczne konta i dane, bez produkcyjnych danych. Wszystkie wymagane stany obejmują 1440/1024/768/375; dodatkowo empty/error, duży tekst i reflow. Zrzuty dialogów są viewport-only, aby full-page capture nie pokazywało treści poza fizycznym viewportem pod fixed modalem. Pozostałe strony mają pełny dokument, w tym pełny długi opis w detalu.

| Ekran | Desktop 1440 | Mobile 375 |
| --- | --- | --- |
| Dashboard | [PNG](../ux/assets/ui-foundation/dashboard-1440.png) | [PNG](../ux/assets/ui-foundation/dashboard-375.png) |
| Rekrutacje | [PNG](../ux/assets/ui-foundation/recruitments-1440.png) | [PNG](../ux/assets/ui-foundation/recruitments-375.png) |
| Detal | [PNG](../ux/assets/ui-foundation/case-detail-1440.png) | [PNG](../ux/assets/ui-foundation/case-detail-375.png) |
| Quick Capture | [PNG](../ux/assets/ui-foundation/quick-capture-1440.png) | [PNG](../ux/assets/ui-foundation/quick-capture-375.png) |
| Duplikat | [PNG](../ux/assets/ui-foundation/duplicate-warning-1440.png) | [PNG](../ux/assets/ui-foundation/duplicate-warning-375.png) |
| Akcje duplikatu | [PNG](../ux/assets/ui-foundation/duplicate-footer-1440.png) | [PNG](../ux/assets/ui-foundation/duplicate-footer-375.png) |
| Menu konta | [PNG](../ux/assets/ui-foundation/account-menu-1440.png) | [PNG](../ux/assets/ui-foundation/account-menu-375.png) |
| Konto / scopes | [PNG](../ux/assets/ui-foundation/account-sessions-1440.png) | [PNG](../ux/assets/ui-foundation/account-sessions-375.png) |
| Login | [PNG](../ux/assets/ui-foundation/login-1440.png) | [PNG](../ux/assets/ui-foundation/login-375.png) |
| Signup | [PNG](../ux/assets/ui-foundation/signup-1440.png) | [PNG](../ux/assets/ui-foundation/signup-375.png) |

Pełna lista z rozmiarami i SHA znajduje się w manifeście QA; również [lista 768](../ux/assets/ui-foundation/recruitments-768.png), [nawigacja mobile](../ux/assets/ui-foundation/mobile-navigation-375.png) i [błąd logowania](../ux/assets/ui-foundation/login-error-375.png).

### Accessibility — wynik i granice

**PASS w sprawdzonym zakresie:** 1305 pomiarów tekstu, minimum **5.4146:1**; 30 pomiarów granic pól, minimum **3.6635:1**; cztery rzeczywiste pomiary focus-visible (konto i input przy desktop/mobile), outline **2 px solid / 7.1551:1** względem sąsiedniej powierzchni. [Computed focus](../ux/assets/ui-foundation/focus-measurements.json). Zero wykrytych błędów kontrastu i overflow. Kolor jest wsparty nazwą stanu/komunikatem; aktualny moduł ma `aria-current`, ikonowe kontrolki nazwy, pola etykiety i powiązane błędy. Sprawdzono klawiaturę, trap/powrót focusu, mobile nav, focus/scroll do wszystkich przycisków duplikatu oraz prywatność otwartego menu po native logout/obcej karcie/pagehide.

Reflow sprawdzono przy **320/720 CSS px** (odpowiedniki szerokości przy 400%/200% powiększeniu) i osobno **200% wielkości tekstu**. **NOT RUN:** rzeczywisty browser zoom, fizyczne urządzenia, czytniki ekranowe, usability z użytkownikami i komfort wielogodzinny. To nie pełna certyfikacja WCAG 2.2 AA: audyt computed colors pomija grupową opacity/gradienty wymagające pixel sampling; disabled controls są odrębnym stanem. Brak native bfcache restore z no-store w użytym Chromium pozostaje NOT RUN; sprawdzony jest faktyczny handler pagehide i back→SSR bez prywatnej treści po logout. Google OAuth i 24-godzinna stara sesja pozostają poza wykonanym zakresem.

### Wstępne dowody procesu

- `python3 harness/scripts/sync.py --check` i `python3 harness/scripts/check.py`: PASS w repo przed implementacją.
- `python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v`: PASS 20/20, exit 0 na źródłowej kopii `/var/folders/w2/3rw_38750zd_3jvcpl_nb_jm0000gp/T/jobs-ui-harness-yv3xdhmw/repo`; kopia bez node_modules/buildów/sekretów i lokalnych targetów. Pierwsze uruchomienie bezpośrednio w repo przerwano (exit 130), ponieważ setUp kopiuje również lokalne node_modules; nie było wynikiem PASS. Procedura testu nie zmieniona.
- Toolchain: `PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH pnpm exec node -p 'JSON.stringify({version:process.version,execPath:process.execPath})'`: rzeczywisty child `v24.22.2`, executable przypiętego Volta Node.
- Istniejący `.recruitment-local/manual-dev` zajmuje 566xx; nie zatrzymujemy i nie przejmujemy go. QA ma autoryzowany odwracalny workaround: osobna kopia źródeł w tmp, wyłącznie porty testowego profilu i odpowiadającego guarda 566xx→568xx. Kod produktu i testy mają być identyczne i porównane hashami. Nie jest to zmiana produkcyjnego profilu ani trwałego DEV.

### Wykonane kontrole przed renderem produktu

| Komenda / środowisko | Wynik i dowód |
| --- | --- |
| `node scripts/ui-candidates.mjs` (przypięty Node, Chromium) | PASS 90 renderów: 3 systemy × 5 ekranów × 6 szerokości (1440/1024/768/375 + 320/720 dla reflow). 30 PNG desktop/mobile, computed contrast i focus, geometria oraz SHA źródła w [dowodach](../ux/evidence/candidates/). Warianty są prototypami, nie testem zapisu/menufocus aplikacji. |
| `pnpm test:unit` przed zmianami | PASS 148 Vitest + 87 node:test; log `/tmp/jobs-ui-foundation-unit.log`. To baseline, nie finalny nowy UI. |
| `pnpm test:integration:f2` | PASS 85/85, zero fail/skip, exit 0, 219.18 s; lokalny Docker, izolowane własne targety 564xx, log `/tmp/jobs-ui-foundation-f2.log`. RLS A/B, rollback, idempotent migracje, odmowy manipulacji przed DDL i sensitivity z celowo wyłączonym RLS. Własne targety posprzątane przez istniejący guard. |
| `pnpm typecheck` | PASS, exit 0; `/tmp/jobs-ui-typecheck.log`. |
| `pnpm lint` R1 / R2 | R1 FAIL: nazwa lokalnej zmiennej `module` i jawne przekazanie children w teście SSR naruszały lint. Autor poprawił dwa pliki. R2 PASS exit 0; `/tmp/jobs-ui-lint-r2.log`. |
| `pnpm format:check` | PASS exit 0; `/tmp/jobs-ui-format-check.log`. |
| `pnpm test:boundaries` | PASS 7 kontroli, exit 0; `/tmp/jobs-ui-boundaries.log`. |

Nieudana pierwsza próba izolowanego RecruitmentCase: FAIL na production-build (zewnętrzny symlink node_modules niedopuszczony przez Turbopack; diagnostyka „Could not find the Next.js package”). Browser nie został wtedy uruchomiony. Własny target i dowody zachowano; następna próba używa klonu zależności zgodnie z istniejącym `scripts/test-fixture.mjs`, bez osłabiania konfiguracji frameworka ani środowiska użytkownika.

### Build i F1 po implementacji

`PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH node /tmp/jobs-ui-f1-run.mjs` wykonał kolejno `pnpm build`, `pnpm test:e2e:foundation`, `pnpm test:canary` na kopii źródłowej bez sekretów i lokalnych targetów: `/private/var/folders/w2/3rw_38750zd_3jvcpl_nb_jm0000gp/T/jobs-crm-f1-L9C0mk`. Zależności sklonowano istniejącą funkcją snapshot; bez nowej instalacji. **PASS** build Next 16.4.3/Turbopack, browser **3/3**, canary **3 kontrole**, wszystkie exit 0. Log `/tmp/jobs-ui-f1.log`. Po wykonaniu porównano SHA256 wszystkich 74 plików src/tests z repo: zero różnic. Publiczny techniczny scaffold `/` zachowuje dotychczasowy kontrakt F1; właściwa aplikacja startuje po Auth na Dashboardzie.

### Wykryta i poprawiona regresja runtime

Druga próba RecruitmentCase: build i HTTP/RLS **PASS 25/25**, browser **FAIL (21 nieudanych testów)**, ponieważ Dashboard po loginie nie montował się. Diagnostyka rzeczywistej przeglądarki: Base UI production error 32; zainstalowany `MenuPortalContext` wymaga `Menu.Portal`. Sam build i SSR jednostkowe bez otaczającego menu nie wykryły tego błędu.

Autor dodał test regresji SSR (najpierw rzeczywisty FAIL „Menu.Portal is missing”), następnie wymagany `Menu.Portal` z `container` wskazującym host wewnątrz zweryfikowanego poddrzewa `AccountSession`. Zachowuje to synchroniczne ukrywanie popupu razem z prywatnym UI; domyślny portal do body nie spełniałby tej własności. QA rozszerza test otwartego menu i SIGNED_OUT. Własne testy UI po poprawce **17/17 PASS**. Aktualne API sprawdzono przez Context7 Base UI 1.9.0. Późniejsze pełne wyniki nie nadpisują tej nieudanej próby.

Po poprawce: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` **PASS**, logi `/tmp/jobs-ui-{typecheck,lint,format}-r3.log`; na zaktualizowanej izolowanej kopii F1 ponownie **PASS** build, browser **3/3**, canary **3 kontrole**, log `/tmp/jobs-ui-f1-r3.log`.

### Granice i powtórzenia QA

Po poprawce Menu.Portal dotychczasowe E2E ujawniły niejednoznaczne selektory `getByText('Sytuacja'/'Podsumowanie')`: nazwy są teraz widoczne zarówno w pasku postępu, jak i nagłówku etapu. QA zmienił cztery asercje na semantyczne `getByRole('heading', {name, exact:true})`, zachowując znaczenie testu, kroki i asercje zapisu. Nie zmieniono walidacji ani oczekiwanych wyników biznesowych. Próba ze starymi selektorami miała 19 FAIL / 2 PASS / 8 niewykonanych; zachowana jako historyczny FAIL.

Nowy fixture UI początkowo miał końcową spację w opisie. Bezpośredni insert zgodnie z istniejącym CHECK odrzucił nieznormalizowaną wartość. QA zastosował `trim()` w syntetycznym fixture; nie zmienił produktu ani CHECK. Dodatkowe uruchomienie focused suite zbiegło się z zakończeniem procesu aplikacji przez nadrzędny runner (ERR_CONNECTION_REFUSED), więc jest FAIL przygotowania środowiska, bez wniosku o zachowaniu UI. Końcowa kontrola używa jednego runnera zarządzającego całym cyklem build→HTTP→browser.

Pierwszą próbę F3 browser na starym bundle z błędem menu przerwano po 3 FAIL / 1 PASS; SDK 13/13 zachowano jako osobny wynik. Powtórzenie F3 używa poprawionego kodu i własnego izolowanego targetu. Fizyczne urządzenia, czytniki ekranowe, rzeczywisty Google OAuth, 24-godzinna stara sesja oraz formalny pełny odbiór całych FR/AC pozostają NOT RUN / poza tym podzakresem.

### Finalny zakres implementacji

- `src/app/globals.css`, `src/components/ui/styles.ts`: jeden jasny system OKLCH z semantycznymi rolami, przyciskami/polami/linkami, kontrastowym input border i widocznym focusem; bez nowych zależności. Warstwa modalna używa foreground/40%.
- `src/components/workspace/{app-shell,sidebar,account-menu}.tsx` i adapter `recruitment/workspace.tsx`: sidebar 232/64 px, zachowana preferencja zwinięcia, nazwy/tooltipy, aktualny moduł, dostępny mobile drawer, topbar i prawdziwe Quick Capture; niedostępne moduły bez href, brak fikcyjnego Search.
- `src/app/dashboard/page.tsx`: celowy stan wejściowy i wskazówki o faktycznie dostępnych funkcjach, bez fikcyjnych liczb, aktywności i terminów.
- `src/app/recruitments/**/page.tsx`, `recruitment/case-content.tsx`: kompaktowe wiersze, wizualny skrót opisu z pełnym tekstem w detalu, exact href i hostname, status/techniczna data, paginacja i uczciwe stany puste/błędne. Przy 768 px metadata pod tytułem; mobilny detal najpierw pokazuje status/datę, potem cały kontekst.
- `recruitment/quick-capture.tsx`, `saved-case-notice.tsx`: prezentacja czterech kroków, wspólne kontrolki, feedback i toast, pełnoekranowy mobile. State machine, walidacja, duplikaty, key, retry/recovery i zapis bez zmian.
- `auth/account-session.tsx`, `src/app/account/page.tsx`: ten sam lifecycle weryfikacji/hide/pagehide/SIGNED_OUT i handler native logout; kontekst współdzieli akcje z menu, portal osadzony w chronionym poddrzewie. Local w menu; wszystkie trzy scopes w realnym widoku konta. Feedback sesji jest w przepływie strony, nie zakrywa akcji.
- `auth/auth-shell.tsx`, `auth-form.tsx`, `feedback.tsx`, root metadata: spójny Auth, kompaktowy mobile, bez zmiany SDK/JWT/PKCE/callback/endpoints.
- `tests/unit/workspace-ui.test.ts`, `tests/e2e/recruitment-ui-foundation.spec.ts`, `ui-rendered-audit.ts`: nowe testy prywatnego initial hidden, menu Portal, truthful nav, projekcji danych, realnego renderu i menu/focus/privacy. Istniejący `recruitment-capture.spec.ts` otrzymał tylko semantyczne selektory oraz jawne oczekiwanie na kontraktowy asynchroniczny focus.

`git diff` potwierdza brak zmian `db/`, `supabase/`, `src/modules/`, `src/proxy.ts`, endpointów, package/lockfile, CI i harnessu. Bez zmian danych produkcyjnych, schematu, migracji lub architektury. Nie dodano Kanbana, filtrów, edycji, historii, innych modułów, AI ani dark mode.

### Finalna ocena designera

`visual_design` / ux-designer obejrzał rzeczywiste screenshoty aplikacji, a nie wyłącznie diff i prototyp. **PASS w ocenionym zakresie wizualnym**. Trzy potwierdzone P2 naprawił autor `ui_frontend` i designer ponownie obejrzał: gęstość listy przy 768 px, położenie metadanych przy długim detalu mobile i odstęp Auth mobile. Dowody poprzednich stanów: `docs/ux/evidence/corrections-before/`; finalne: `docs/ux/assets/ui-foundation/`. Paleta, typografia, nawigacja, formularze i komunikaty odpowiadają B; brak nierozstrzygniętych wizualnych P0/P1/P2. Nie jest to badanie z użytkownikami, certyfikat WCAG ani test wielogodzinnego komfortu. Końcowy QA potwierdził przewinięcie/focus wszystkich akcji dialogu; designer ponownie obejrzał finalne stopki przy 1440 i 375 px i zamknął także ten warunek dowodowy.

### Dalsze zachowane niepowodzenia testów

Kontrolowany przebieg 29 testów po zmianach UI dał 27 PASS / 2 FAIL: legacy invalid-input wykonywał kolejne fill przed zakończeniem istniejącego rAF przenoszącego focus na nazwę; screenshot reflow czytał width 0 podczas „Sprawdzanie sesji…”. QA wzmacnia oczekiwanie na rzeczywisty focus i widoczny main, zamiast mierzyć stan przejściowy. Wcześniejsze natychmiastowe asercje focus trap także oczekiwały na guard przed zakończeniem jego działania; `expect.poll` zachowuje ten sam warunek faktycznej obecności focusu w dialogu. Dwie wcześniejsze sondy privacy nie mogły odczytać niszczonego kontekstu nawigacji; zastąpiono je pasywnym obserwatorem DOM i synchroniczną obserwacją pagehide. Ostatni ich wykonany wynik był PASS.

Jedna późniejsza integracja HTTP miała 23/25 PASS przy niezmienionym backendzie. Odczyt guardowanego targetu QA wykazał 1144 syntetyczne rekordy po wielu ponowieniach. Potwierdzony błąd dotyczył negatywnej sensitivity, która po chwilowym wyłączeniu RLS nie otrzymała oczekiwanego 200 i diagnostyki wycieku. Hipoteza QA: przy profilu `max_rows=1000` i 1144 rekordach mogła otrzymać 206. **Nie przechwycono bezpośrednio statusu 206**; to wniosek z limitu i ścieżki błędu, nie potwierdzony pomiar. Read-only service-role probe zwrócił 403 zgodnie z minimalnymi ACL; nie poszerzano grants. RLS pozostaje włączone; nie naprawiano schematu, nie resetowano danych i nie zmieniono tego testu. Target 568xx i dowody zachowano. Końcowy przebieg ma świeży własny target na 569xx, z tymi samymi trzema kopiowymi remapami (target, cleanup guard, profil), identycznym kodem produktu/testów/migracji i bez równoległej ingerencji w lifecycle serwera.
