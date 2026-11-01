# Product Journey — weryfikacja przeglądarkowa

> **Raport historyczny:** stan po merge PR #21 (`637f330`), przed Product Journey UX Hardening. Wyniki i findings dotyczą tamtego kandydata. Brak podsumowania błędów Task następnie naprawiono, a nawigację sekcji detalu dodano w PR #22. Aktualne wyniki: [raport hardeningu](../technical/product-journey-hardening-report.md). Historyczne FAIL pozostają zachowane.


Data: 2026-11-01. Kandydat produktu: `637f330f6dc1215ad2479dd699b8814397e5b5de` (merge PR #21), plus nowy test audytu. QA: natywny `qa-engineer`; model/reasoning NOT EXPOSED. Zakres zapisu: nowy test, ten raport i bezpieczne dowody; bez zmian produktu.

Zastosowano `plan-slice` i `verify-acceptance`, zasady AGENTS/delivery. Podstawa: DEC-054–060 APPROVED, FR/AC-QC, LC, HE, CC, RW oraz TN-001–003/011, AC-DB-001/008 i AC-TN-003-01; BR-009/011/020/024/030; UC/TC-001/012(task-only)/030 oraz ścieżki lifecycle/korekt. To audyt wykonanych przyrostów, nie potwierdzenie całego planowanego MVP.

## Plan i środowisko

[historyczny test audytu](../technical/evidence/product-journey-audit/recruitment-product-journey-audit.spec.ts.txt): dwie ciągłe podróże 1440×900 i 375×900. Syntetyczne osobne konto na przebieg. Wszystkie zapisy biznesowe przez rzeczywisty UI: czterokrokowy capture → aplikacja → inbound → zaproszenie Screening → zmiana etapu → utworzenie firmy i osoby oraz jawne powiązania → Workspace/drawer/full page → trzy zadania → Dashboard/Tasks → close z trzema rozstrzygnięciami → Tasks → reopen → korekta daty aplikowania → reload i odczyt oryginału z Data API. Nawigacja pomiędzy modułami przez prawdziwe linki, na mobile przez menu. Pomiar rzeczywistego innerWidth/scrollWidth w routach, detalach i podglądach formularzy. Istniejąca suite uzupełnia negatywne przypadki, retry/recovery, stale writes, owner A/B i izolację.

Runtime: `/private/tmp/jobs-crm-journey-audit-20261101`. Lokalna kopia źródeł i istniejących dependencies, bez install. Trzy jawne adaptery wyłącznie kopii: `scripts/recruitment/target.ts`, `scripts/recruitment/cleanup-plan.ts`, `supabase/recruitment-config.toml`: 5662x → 5762x, gdyż oryginalne porty zajmowały istniejące zasoby. Manifest SHA-256: `docs/technical/evidence/product-journey-audit/runtime-manifest.json`. Node jawny `/Users/kozdro/.volta/tools/image/node/24.22.2/bin/node`. Nowy własny disposable target `run-d1c0475b`, loopback, production build i HTTPS Chromium; prawdziwe Auth/JWT/PostgreSQL/RLS, bez cloud i persistent DEV.

## Wyniki

**Wynik audytu runtime: dwie kompletne podróże PASS; jeden defekt UX potwierdzony.** Pełna pierwsza suite pozostaje FAIL 118/120 z powodu dwóch błędów nowego testu; po poprawie synchronizacji i uwzględnieniu niezależnego review focused run 3/3 PASS (2 journey + 1 obserwacja defektu). Kod produktu pozostał identyczny z merge SHA.

| Kontrola | Status | Dowód |
|---|---|---|
| Migracje świeżego targetu | PASS 14/14 | checkpoint `5fe9332a33f023aeefc1cb3cce459e6ea5dd4a3d588e660111004b8b385427f0` |
| Production build | PASS exit 0 | output hash `34a697e854f076b32e4cf11f53be4a4c732f47379d092d7c2ae083bc9b24fc72` |
| Integracje całego produktu | PASS 133/133, exit 0, bez skips | output hash `71a82fb8c5dae9a6e23aac35b3e3a19f67e8a419692d4bfd669d86847ce5b3ad` |
| Pełny production HTTPS browser R1 | FAIL 118/120, exit 1 | `full-suite-evidence.json`; oba FAIL to transient button-name wait nowego testu |
| Finalny focused production HTTPS browser | PASS 3/3, exit 0, naturalne zakończenie | `focused-suite-evidence.json`; hash testu `8b18c1986834100185e55902a571d95a8683b37de61817071bd3a2a1b6bb644c` |
| Finalny rebuild i ponowione integracje | PASS build exit 0, integracje 133/133 exit 0 | focused receipt |
| Izolacja/cleanup | PASS; 44/44 bazowe kontenery, 227/227 volumes, 10/10 networks zachowane, bez dodatkowych zasobów | `resource-preservation.json`, `owned-cleanup-complete.json` |
| Fizyczne urządzenia, Safari/Firefox, AT, rzeczywisty zoom | NOT RUN | zakres dostępnego Chromium |
| CalendarEvent, reminders, DnD, pełny UC-012/TC-024 | NOT RUN / planowany zakres | wyłączone z DEC-059/060 |

Komenda w runtime: `RECRUITMENT_TARGET_ID=run-d1c0475b /Users/kozdro/.volta/tools/image/node/24.22.2/bin/node scripts/recruitment/runner.ts`. Pierwsza próba bez `RECRUITMENT_TARGET_ID` utworzyła świeży target; retry używał wyłącznie tego własnego targetu po błędzie build, bez wcześniejszych testowych danych biznesowych.

Zachowane setup FAIL: (1) `node` w kopii wybrał Volta Node 26.10.0 i pinned gate zatrzymał wykonanie przed zasobami; (2) pierwszy runner build exit 1, bo Turbopack nie rozwiązał Next przez node_modules będący symlinkiem poza root; osobny diagnostyczny build potwierdził tę przyczynę. Lokalna kopia dependencies i jawny bin Node rozwiązały setup. Żaden z tych wyników nie jest defektem produktu. Oryginalny redacted receipt: `docs/technical/evidence/product-journey-audit/failed-build-evidence.json`.

## Ograniczenia

Test 375px jest desktop Chromium ze zmienionym viewportem; nie dowodzi zachowania fizycznej klawiatury, safe areas ani touch. Odczyty danych wykonuje uwierzytelniony klient właściciela; kontrole obcego/anon zapewnia istniejąca suite. Nie wysyłano korespondencji, nie tworzono prawdziwych CV, nie zmieniano statusów testowanych funkcji planowanych na APPROVED.


## Ustalenia i luki

- **P3 — rzeczywisty defekt UX, FAIL wymogu Blueprint:** formularz Task pokazuje błędy wyłącznie obok pól, bez podsumowania wymaganego przez `docs/ux/blueprint.md:101`. Repro: Zadania → Dodaj zadanie → pusty tytuł i opis 2001 znaków → Zapisz zadanie. Widoczne oba błędy, focus wraca na tytuł, rekord nie powstaje; brak summary. Potwierdzone niezależnie statycznie oraz runtime, PNG `task-error-summary-375.png`. Diagnostic test PASS oznacza potwierdzenie obserwacji, nie zgodność formularza. Poprawka nie została wdrożona.
- **P2 — usprawnienie do rozważenia (PROPOSED):** na mobile pełny detal z dwoma powiązaniami i dwoma zadaniami ma 4864px wysokości; akcje lifecycle i historia są poniżej rozbudowanych sekcji. Brak overflow, podróż ukończona. Rozważyć skróty/zwijanie sekcji po osobnej ocenie UX; to nie defekt integralności ani dowód niedostępności.
- **Luka testowa usunięta:** wcześniej brakowało jednej ciągłej ścieżki obejmującej wszystkie przyrosty; nowy test sprawdza także Dashboard/Workspace po close, stan sprawy i trzech zadań po reopen, niezmieniony oryginał aplikacji, jedną rewizję i brak nowych fikcyjnych faktów. Negatywne korekty/void/orphan/closed-case oraz korekta zakończenia są pokryte osobnymi istniejącymi testami wykonanymi w pełnej suite, nie wszystkie w tej samej długiej podróży.
- **Zakres planowany:** Calendar, Reminders, DnD, Global Search, dokumenty, reguły pilności Dashboardu pozostają kolejnymi funkcjami; ich brak nie jest regresją DEC-059/060. Pełne UC-012 z CalendarEvent i TC-024 nie uzyskują PASS z tej weryfikacji.

Historia testów R1: po kliknięciu „Zapisz zdarzenie” nazwa przycisku zmienia się na „Zapisywanie…”, więc oczekiwanie braku starej nazwy przechodziło przed commitem. Snapshot obu FAIL potwierdza formularz disabled i nieukończony zapis. Poprawiono test, czekając na usunięcie całego formularza. Review dodatkowo wymusił pełne cross-state checks, deterministyczne porównanie rodzajów lifecycle i rozwinięcie domyślnie zwiniętych Zakończonych przed kliknięciem karty. Zachowano stary test i error-context; brak zmian produktu.

Finalny focused runner używał dodatkowego jawnego adaptera **wyłącznie w kopii** `playwright.recruitment.config.ts`: testMatch ograniczony do nowego pliku. `runtime-after-manifest.json`: 892 identyczne pliki, dokładnie 4 oczekiwane różnice harness/config; trzy portowe odwracalne do źródła, czwarta selekcja testów; finalny test root/runtime identyczny. Nowy raport SDD/agregacyjny powstawał równolegle i nie był kodem uruchamianego produktu.

Bezpieczne dowody: `docs/technical/evidence/product-journey-audit/` — pełny/focused receipt, manifest przed/po, stare error-context, PNG, metryki `visual-evidence.json` i zachowanie zasobów. Własny projekt `jobs-crm-recruitment-980577-c6301c0e561a` usunięto wyłącznie `stopRecruitmentTarget("run-d1c0475b")`, exit 0. Nie wykonywano merge, deploymentu ani poleceń persistent DEV.
