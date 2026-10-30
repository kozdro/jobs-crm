# Pierwszy RecruitmentCase — analiza wymagania i plan

**Etap:** Requirement → Impact Analysis → Implementation Plan; formalizacja PO przed migracjami. **Źródło:** PO 2026-10-29, „Jobs CRM — First Business Vertical Slice: RecruitmentCase + Manual Quick Capture”, wariant A, [DEC-052](../decisions/product-decisions.md). **Role:** spec-analyst, orchestrator; model/reasoning dziedziczone, dokładne identyfikatory NOT EXPOSED. Baza `cd92648fd4c579cb4be57a962cd88b6e3d537583`, branch `feat/recruitment-case-first-slice`. Zastosowano analyze-requirement, record-decision i plan-slice; bez delegowania kolejnego poziomu.

## Podstawa i statusy

| Źródła | Status | Znaczenie i granica |
| --- | --- | --- |
| DEC-001/002/003/004/009/017/018/029/031/032/047/052 | APPROVED | sprawa bez stanowiska/ogłoszenia/pracodawcy, cztery statusy domeny, minimalny create/read, jawny zapis i duplikaty |
| BR-001/002/003/004/007/016/021/022/028/029/030 | APPROVED | niezależność spraw, brak fikcyjnych akcji/historii/merge, prywatność i zachowanie kontekstu |
| FR/AC-LC-001/004; QC-001/002/006/007/009/010; RW-005/009; AD-002 | APPROVED w zakresie źródeł | implementujemy tylko create/read; pełne LC/RW/QC/AD i siedem modułów nie uzyskują PASS |
| UC/TC-001/029/034; UX-006/F02 | zatwierdzone scenariusze / plan testu | adaptacja manual create/read; PARTIAL COVERAGE, wykonanie NOT RUN na etapie formalizacji |
| ADR-0001/0002/0005/0012 | ACCEPTED | modular monolith, oddzielny stan/historia/audyt, Supabase JWT/RLS; importerowy ADR-0005/F4 nie jest implementowany |
| OPEN-002/024; DATA-01 | PARTIALLY RESOLVED przez DEC-052 | tylko zatwierdzony minimalny command/read/schema, pola i ostrzeżenie |
| OPEN-001/004/005/018/020/029/034 | OPEN | pozostałe lifecycle, wyniki/etapy, historia, edycja/usuwanie; nie dopisujemy ich do create/read |
| OPEN-025/026/028 i 013/032/041–046 | OPEN w pozostałym zakresie | minimalny HTTP(S)/newest-first określa zadanie; publiczne polityki, relacje/filtry nadal odrębne |

## Wpływ

RecruitmentCase, Manual Quick Capture, własna lista i pełny minimalny detal są jedynymi modułami produktu. Brak wymagań innych danych biznesowych. Nazwa „Rozmowa z CTO” nie jest udokumentowanym faktem rozmowy. Techniczny timestamp nie staje się datą aplikowania. URL nie uruchamia sieciowego odczytu; nie ma wpływu na allowlistę Smart Import. Import, Search/FTS, dokumenty, firmy/kontakty, historia/audyt, kalendarz/zadania, worker i lifecycle nie dostają tabel ani atrap.

Bezpieczeństwo obejmuje wszystkie realne ścieżki: user JWT, request-scoped clients, RLS/column grants/constraints, własne listy/ID/count/duplikaty, origin/CSRF i prywatny cache. Brak service-role w zwykłym użyciu. Migracje produktu mają własny profil i ledger; historyczny F2/foundation_poc pozostaje bez zmian. No cascade konta, no reset obcego targetu. Największe ryzyka to obejście BFF bezpośrednim API, utrata odpowiedzi po commicie, konflikt payloadu i race ostrzeżenia; wymagają testów rzeczywistego DB/HTTP.

## Plan i rozłączne ownership

1. Spec-analyst: DEC/OPEN, ten dokument i zależne źródła; root: [dokładny kontrakt](recruitment-case-first-slice.md), formalny przegląd modelu przed migracjami i [raport](recruitment-case-first-slice-report.md).
2. Backend-engineer: domain/application/infrastructure, Drizzle/SQL/RLS, minimalna komenda create/read i własne unit. DoD: Unicode/URL, niepodrabialny owner/status, atomowy idempotentny wynik i konflikt, owner-only duplikaty.
3. Frontend-engineer/UX: realny shell, Quick Capture Sytuacja→Dane→Działanie→Podsumowanie, własna lista/detal i unit. DoD: brak zapisu między krokami, warning/continue/cancel, toast/bez nawigacji, save-next, dirty/focus/mobile. Czwarty krok jest późniejszym doprecyzowaniem §13.2 zlecenia; historia wcześniejszych wyborów UX pozostaje.
4. QA-engineer od planowania: tests/integration/recruitment i business E2E. DoD: real PostgreSQL/Auth/Data API A/B/anon, concurrency/retry/conflict, browser, sensitivity na disposable targetcie; mock nie dowodzi RLS.
5. Platform-engineer: osobny guarded target/profile/ledger/runner, CI i cleanup tylko własnych zasobów. DoD: preflight przed mutacją, brak dryfu F2, wymagany business job oraz zachowane F1/F2/F3/harness, frozen install i build.
6. Niezależni backend/frontend/security reviewerzy: zamrożony kandydat i dowody przez read-only parent `harness/scripts/review.py`; findings bez zmian kodu. Autor usuwa blokery, QA ponawia zakres, reviewer ocenia deltę. Root finalizuje dokumentację, scoped commit/push i otwarty PR bez merge.

Konkretne pliki wykonawcze i sesje autorów/reviewerów dopisuje raport wraz z rzeczywistym SHA; ten plan nie udaje wykonania.

## Macierz testów przed implementacją

| AC/ryzyko | Poziom / autor | Wymagany dowód |
| --- | --- | --- |
| LC-001-01/02, QC-002-03 | unit backend + DB QA | 0/160/161, whitespace, 2000/2001, polskie/non-BMP, optional URL, złe schematy/składnia |
| LC-004-01, AD-002-01 | HTTP/SQL QA | owner/status spoof, column grants, A own/B denied/anon denied, ID/list/count/duplikaty |
| QC-002-02/04 | DB HTTP concurrent + browser QA | double-click, replay, response loss, parallel key, conflict payload, key A/B i zachowany pending key po refresh |
| QC-006-01/007-01 | HTTP + Playwright QA | own title/URL match, B isolation, explicit continue, cancel no write, no merge/update, check failure/race |
| QC-002-01/009-01/010-01 | Playwright QA + frontend unit | cztery kroki, podsumowanie, save only, toast/open, save-next empty/new key, dirty/focus/mobile |
| RW-005/009 częściowo; AD-002-01 | HTTP + Playwright QA | newest-first/tie-break/bounded list, własny detail, neutralne cudzy/missing ID, logout/privacy |
| F1/F2/F3/harness | istniejące komendy root/platform/QA | pełna regresja i final-SHA hosted CI; brak osłabienia tests |

**Stan tej analizy:** dokumenty sformalizowane; testy runtime i niezależne review implementacji **NOT RUN**. Przegląd modelu read-only wykazał zgodność autoryzowanego minimalnego kierunku; nie zastępuje review SQL ani rzeczywistych testów. Brak blokera PO dla zatwierdzonego create/read. Wymagane zależne dowody pozostają otwartym DoD, a wszystkie przyszłe moduły wymagają osobnej autoryzacji.
