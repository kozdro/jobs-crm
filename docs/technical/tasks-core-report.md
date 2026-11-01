# Tasks Core — raport wykonania

2026-11-01. **DEC-060 APPROVED: 1A/2A/3A/4A**. [Kontrakt, analiza wpływu i plan](tasks-core-analysis.md). [PR #21 i końcowe CI](https://github.com/kozdro/jobs-crm/pull/21). Bez merge i deploymentu.

## Zakres i identyfikacja

Zadania ogólne lub związane z jedną własną RecruitmentCase: lista, utworzenie, edycja, wykonanie, anulowanie, jawne przywrócenie i audyt. Tytuł 1–160 znaków Unicode po trim, opis opcjonalny do 2000. Termin jest opcjonalnym dniem kalendarzowym, także przyszłym. Wspólny formularz, panel sprawy i neutralny podgląd otwartych zadań Dashboardu. Zadania przy zakończonej sprawie nie wznawiają sprawy.

Zamknięcie wymaga jawnego anuluj/zachowaj/odłącz dla każdego otwartego zadania. Jedna transakcja obejmuje zamknięcie, wybory i audyt poprzedniej relacji; snapshot i rewizje chronią współbieżność, pełna intencja chroni retry/recovery. Integracja obejmuje wyłącznie rzeczywistą tabelę recruitment_task. Nieobsługiwane task i przyszłe CalendarEvent nadal zatrzymują zamknięcie przez istniejący fail-closed guard BR-011.

Podstawa: DEC-013/026/057/060; FR/AC-TN-001–003/011, FR/AC-LC-018, AC-AD-002; BR-009/011/020/024/030; UC/TC-030 i część UC/TC-012; UX-010/005/001, F09. OPEN-002/029/037/040 rozstrzygnięto częściowo, bez zatwierdzania odłożonej automatyzacji. Bez nowej decyzji architektonicznej.

Baza main po merge PR #20: `910582aa220594f51db70869e3d6e6a166b18766`. **Końcowy kandydat kodu/testów: `ca9944de2df8cb794c956dc64e587dc597a22738`**. [Manifest](evidence/tasks-core/implementation-manifest.json). Następujący commit raportu zawiera wyłącznie dokumentację i dowody. Pełne CI dokładnego opublikowanego HEAD jest raportowane w PR, po publikacji tego dokumentu.

Wpływ: addytywna migracja Drizzle 0013, projekcja Task i append-only command audit, RLS/grants/invoker RPC, ochrona bezpośredniego DML, wspólny owner lock z lifecycle. BFF GET/POST Tasks i rozszerzenie preview/confirm/receipt zamknięcia; kontrola właściciela również dla powiązań i odzyskiwania wyniku. Bez fikcyjnych zdarzeń aplikacji/kontaktu, backfillu, zmian Auth, zależności, importu czy Global Search.

Autorzy: orchestrator (kontrakt, integracja, dokumentacja), tasks_backend, tasks_frontend, tasks_qa_implementation; rozłączne zakresy według planu. Model/reasoning dziedziczone, NOT EXPOSED. Zastosowano analyze-requirement, clarify-requirements, plan-slice, record-decision, implement-slice, verify-acceptance i review-change; pomocniczo form-design/mobile-native i Supabase/PostgreSQL. Dokumenty bibliotek zweryfikowano przez Context7.

## Wyniki i granice dowodów

Node 24.22.2, pnpm 12.16.1, syntetyczne dane, rzeczywiste Auth/JWT/Data API/PostgreSQL/RLS oraz production HTTPS Chromium. Wyłącznie własne disposable targety tasks-r1–r4. Persistent DEV i obce zmiany pozostawiono bez ingerencji. Zajęte porty wymagały kopii QA z trzema jawnymi adapterami 5662x→5752x. [Finalny manifest runtime](evidence/tasks-core/qa-source-manifest-r8.json), [powiązanie Git](evidence/tasks-core/qa-git-runtime-r8.json), [kontrola po testach](evidence/tasks-core/qa-runtime-r8-after.json): 250 plików Git i jeden generowany ignorowany next-env.d.ts, razem 251; adaptery zachowano osobno.

| Kontrola | Wynik i zakres |
|---|---|
| Unit | **PASS 474 aplikacyjne + 87 skryptowych**, bez skips, ca9944d |
| Typecheck, lint, format | **PASS**, ca9944d |
| Boundaries, canary | **PASS**, 2adf74a; późniejsza delta to dwie linie komunikatu i jego asercji, bez zmiany granic/build graph |
| Harness sync/structure | **PASS**, dowód harnessu, nie test aplikacji |
| Finalny production rebuild | **PASS**, ca9944d, natural exit 0 |
| Finalny focused browser | **PASS 15/15**, ca9944d, natural exit 0: wszystkie 14 Tasks + jedna zmieniona nawigacja UI Foundation; nie pełna suite |
| Pełne lokalne integracje R4 | **PASS 133/133**, 8e09b6d |
| Pełny lokalny browser R4 | **FAIL: 117/118 PASS**, 8e09b6d; wykryty stale revision naprawiony i pokryty finalnym focused run |
| Wizualne/focus | **PASS 6 kontroli**, 10 PNG, 2adf74a; [powiązanie copy-only z ca9944d](evidence/tasks-core/qa-visual-scope-r8.json) |
| Pełne hosted CI | Wynik i dokładny końcowy HEAD w PR; wymagane wszystkie jobs, 133 integracje i 118 browser |

[Komendy i logi lokalne](evidence/tasks-core/local-checks.json), [finalny browser](evidence/tasks-core/qa-browser-focused-r8.json), [receipt harnessu](evidence/tasks-core/qa-focused-harness-r8.json), [wizualne pomiary](evidence/tasks-core/qa-visual-receipt-r7.json). Szerokości 1440/1024/768/375, brak poziomego overflow i sprawdzony focus/hit-test. Dwie symulacje 200% przy 375: root font oraz wszystkie obliczone fonty i liczbowe line-height. To symulacje CSS, **nie rzeczywisty browser zoom**. Urządzenia fizyczne i AT: **NOT RUN**; brak deklaracji pełnej certyfikacji WCAG.

Macierz AC: TN-001/002 i TC-030 — ogólne/sprawa, limity/Unicode, daty, statusy, restore, audyt; TN-003 — lista/detal/Dashboard/formularz i błędy; TN-011/LC-018 — trzy wybory, stale taskset/rewizja, rollback, idempotencja i odzyskiwanie po utracie odpowiedzi; AD-002 — właściciel pozytywnie, obcy/anon odmowa list/ID/audytu/recovery i relacji, również Data API/RPC. Suite obejmuje 14 migracji, stare dane i brak backfillu Task. Recovery ma regresje niepełnych/niepoprawnych kopert, delayed GET i zmiany pełnej intencji; wiersz czeka na odczyt potwierdzonej rewizji przed następną mutacją.

## Niezależne review

Backend, frontend i security **PASS_STATIC R7** na pełnym diffie bazy → `2adf74a0b554bb560f22be6743733af129f0a7d6`. Frontend **PASS_STATIC R8** dokładnej dwuliniowej delty do ca9944d. Backend/security nie mają zmienionego zakresu kodu po R7; nie deklarujemy ponownego pełnego review tych ról na ca9944d.

Każde review: osobny rodzic read-only przez harness/scripts/review.py, jeden generic subagent z kanoniczną rolą, bez dalszej delegacji. Końcowe wrappery exit 0, changedFiles=[], identyczne fingerprinty przed/po: R7 `732ddc3ead3159d6647061258a584c7977c56a516f23ce8032f9a94253fcd0bd`, frontend R8 `3662fcedb72ac2565635d434749cbebd30e6e54235e07c556d0fc0caa24d4aec`. Metadane wrappera są autorytatywne. Wyniki wszystkich rund zachowano w katalogu dowodów. Review runtime: NOT RUN; akceptacja wymaga odrębnych testów.

## Historia FAIL i napraw

- R1 review: utrata draftu/uncertain przy zapisie innego wiersza/paginacji, nieodświeżone Tasks po close oraz replay pomijający Task arrays. Naprawiono scoped invalidation, ochronę pending i pełne porównanie intencji.
- R2 review: kolejność ACK w teście zamknięcia i błędne oczekiwanie disabled. Naprawiono test bez osłabienia walidacji/resetu ACK.
- R1 runtime: 95/123 integracji PASS, 28 FAIL — SQL42702, kolizja zmiennej z aliasem; poprawiono nową migrację i odtworzono świeży target. R2: 130/132 PASS, 2 FAIL — katalog testu nie uwzględniał dwóch zatwierdzonych tabel; zachowano ścisłe RLS wszystkich 10.
- R3: 133 integracje PASS, browser 115/117 PASS — selektor pustego route announcer i lista tras bez /tasks. Pierwszy focused 13/14 PASS wykrył rzeczywisty BFF503 po poprawnym commit: porównywanie JSON zależało od kolejności kluczy JSONB. Naprawiono kanoniczne pary ID/action; snapshot rewizji pozostał dokładnie uporządkowany. Oddzielny ponowny diagnostyczny run wybrał jeden test (FAIL), nie 14; [korekta zakresu](evidence/tasks-core/qa-focused-r3-selection-clarification.json).
- R4 pełny browser 117/118 PASS ujawnił okno mutacji na starej rewizji po ACK. Dodano synchroniczną barierę rewizji i deterministyczne RED dwóch regresji na starym artefakcie. R5 backend/frontend FAIL: niepoprawna obecna koperta mogła przejść do legacy IDs fallback. Jest teraz kwarantannowana; fallback dotyczy wyłącznie rzeczywiście nieobecnej koperty i bezpiecznego taskless receipt.
- R6 wszystkie trzy review FAIL: opóźniony GET mógł skonsumować podmienioną intencję z tym samym ID. Dodano ponowne sprawdzenie całej zamrożonej intencji przed GET/retry/ACK-clear. R7 wszystkie PASS_STATIC. R6 wizualny FAIL przy tekście 200% (scrollWidth 444 na 375); scoped wrapping przycisków Tasks daje R7 PASS scrollWidth 375.
- Pierwsze unit: 449 aplikacyjnych PASS, skrypty FAIL przez skrócony PATH bez Dockera i stare oczekiwanie liczby migracji; poprawiono PATH i dozwolony nowy ledger bez usunięcia starego prefixu. Format FAIL poprawiony samym formatowaniem. Końcowe wyniki powyżej.
- Pierwszy backend review NOT RUN wskutek zmiany kandydata; kolejne zamrożone checkouty i wrappery bez mutacji. Ostrzeżenia sandbox/cache zachowano w metadanych.

[Cleanup końcowy](evidence/tasks-core/qa-cleanup-final-classified.json): własne kontenery/volumes/networks **0**, wszystkie **44/44** bazowe zasoby zachowane. Globalna równość inventory **FAIL 47 vs 44**, ponieważ pojawiły się trzy obce kontenery; pozostawiono je nietknięte. Surowy receipt z obcymi nazwami pozostał poza repo, jego SHA-256 zachowano. Wcześniejsze błędne porównanie wszystkich kontenerów z tylko uruchomionymi zachowano z osobną korektą. Nie czyszczono obcych zasobów.

Sugestie, przypomnienia, e-mail, kalendarz, priorytety, cykliczność, hard delete i publiczne wydanie pozostają poza zakresem. Pełny TC-012 z CalendarEvent nie jest ukończony. Dashboard nie rozstrzyga pełnego AC-DB-002 „wymaga uwagi”. Publiczne bramki Auth/privacy/OPS nadal obowiązują. Brak merge/deploymentu.
