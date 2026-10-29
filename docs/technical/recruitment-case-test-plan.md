# Pierwszy RecruitmentCase — plan QA

**Stan:** plan testów, `NOT RUN` przed wykonaniem. **Autoryzacja:** zadanie PO „First Business Vertical Slice: RecruitmentCase + Manual Quick Capture”, 2026-10-29, wariant A. **Rola:** qa-engineer, sesja `qa_first_slice`; model/reasoning dziedziczone, dokładne wartości `NOT EXPOSED`. Baza `cd92648fd4c579cb4be57a962cd88b6e3d537583`. Skills `plan-slice`, `verify-acceptance`; [delivery](../../harness/workflows/delivery.md).

Zakres zapisu QA: `tests/integration/recruitment/**`, `tests/e2e/recruitment-*.spec.ts` i ten plan. Developerzy piszą własne testy unit. Platforma odpowiada za osobny guarded Local target i obowiązkowy job CI; QA nie zmienia historycznych F2/F3 fixture. Review jest niezależny od autorów testów i produktu.

## Macierz zakresu i dowodu

| Kontrakt / powiązanie | Test i oczekiwany rezultat | Poziom / autor |
| --- | --- | --- |
| FR/AC-LC-001; FR/AC-QC-002; UC/TC-001 częściowo | Zapis samej nazwy, bez pracodawcy, stanowiska, daty aplikacji i URL; status `Zapisane`; brak zdarzenia aplikowania | unit developer + rzeczywisty HTTP QA + browser QA |
| FR/AC-LC-004 częściowo; BR-003 | DB pozwala utworzyć tylko `Zapisane`; klient nie zmienia statusu przez Data API; pozostałe trzy statusy i przejścia nie są realizowane | unit + HTTP + catalog |
| DATA-01 zatwierdzony podzakres | Nazwa po trim: brak, whitespace,160/161; opis pusty,2000/2001; polskie znaki i astral Unicode code points spójne z PostgreSQL; payload nie przyjmuje ownera ani statusu | unit developer + HTTP QA |
| FR/AC-QC-006/007; BR-022 | Identyczna znormalizowana nazwa lub URL ostrzega; inny payload nie daje fałszywego konfliktu; tylko własne rekordy; człowiek może otworzyć istniejący, anulować lub świadomie dodać nowy; samo sprawdzenie nic nie zmienia | HTTP + browser QA |
| Idempotencja ręcznego create | Double-click, równoległe żądania i retry po utracie odpowiedzi dają jeden ID; ten sam key/inny payload daje konflikt bez mutacji; ten sam key u A/B nie łączy rekordów; reload niedokończonego zamiaru zachowuje key | HTTP + browser QA |
| Atomowość | Niepoprawny opcjonalny URL nie zostawia sprawy; jedna tabela pozwala sprawdzić rollback pojedynczego zapisu; jeśli powstanie case_link, dodatkowo fault w linku, transakcja i brak orphan | HTTP + catalog QA |
| NFR-001; BR-030; FR/AC-AD-002 częściowo; UC/TC-034 częściowo | A widzi/zapisuje własne; B nie widzi przez listę, ID, count, duplikaty; anon nie czyta/pisze; spoof ownera/statusu, UPDATE/DELETE i RPC bez uprawnień odrzucone | rzeczywiste Auth JWT + HTTP Data API QA |
| RLS/grants/funkcja/ledger | Catalog dowodzi RLS każdej tabeli, minimalne SELECT/INSERT, brak UPDATE/DELETE/TRUNCATE, INVOKER i brak PUBLIC/anon EXECUTE, FK ownera bez cascade delete, izolacja ledgeru | PostgreSQL QA; nie zastępuje HTTP |
| Czułość security suite | Wyłącznie disposable target: celowe wyłączenie RLS powoduje niepowodzenie tej samej asercji izolacji A/B; przywrócenie i ponowna izolacja lub zniszczenie targetu | PostgreSQL + HTTP QA |
| URL / BR-021 | HTTP/HTTPS absolutne, brak URL poprawny, javascript/data/file/inne/niepoprawne odrzucone; query/hash zachowane; przeglądarka nie fetchuje źródła; link świadomy i bezpieczny | unit + HTTP + browser QA |
| UX-006 / F02; FR/AC-QC-009/010 częściowo; BR-029; UC/TC-029 częściowo | Sytuacja→Dane→Działanie→Podsumowanie bez DB write; tylko Zapisz sprawę; Zapisz zamyka i zostawia widok z toastem/Otwórz; Zapisz i dodaj kolejną daje pusty kreator/nowy key; błąd zachowuje dane | browser QA |
| UX dirty/a11y/mobile | Escape i X wymagają potwierdzenia dirty; backdrop nie gubi danych; focus i klawiatura; semantyczne label/status/alert; desktop i375px bez poziomego overflow | browser QA |
| FR/AC-RW-005/009 częściowo | Własna lista DESC created_at,ID, ograniczone pobieranie; szczegóły własnego ID; cudze i nieistniejące ID mają jednakowy brak dostępu; bez Kanbana/drawera | HTTP + browser QA |
| Prywatność UI | Brak cudzych danych w SSR/RSC; no-store; po logout brak prywatnej treści i ponowne wejście wymaga login | browser QA |
| F1/F2/F3/harness regresje | Wszystkie istniejące komendy i obowiązkowe CI joby pozostają, bez osłabienia asercji lub `continue-on-error` | platform/root uruchamia, QA ocenia dowody |

## Środowisko i wykonanie

Wszystkie dane syntetyczne; prawdziwy lokalny PostgreSQL17/Supabase Auth/Data API. Admin key służy wyłącznie provisionowaniu kont w pamięci testu. Żądania spraw używają anon key + JWT użytkownika. Bez cloud, resetu obcej bazy, sekretów/tokenów w output i screenshotach. Catalog/sensitivity mogą używać uprzywilejowanego połączenia wyłącznie po guarded preflight targetu; pozytywna próba `postgres` nie jest dowodem RLS.

Planowane komendy zostaną spięte przez platformę w `test:recruitment:first-slice`. Suite integracyjna eksportuje funkcję uruchamianą przez guard; Playwright wymaga jawnego guarded target ID. Zero tests, failures, skips albo brak wymaganej obserwacji nie daje PASS. Stan i liczby testów oraz command/target/source candidate zostaną zapisane w raporcie wykonania; ten plan sam nie potwierdza wykonania.

## Granice akceptacji

Wszystkie powyższe mapowania pełnych FR/AC/UC są `PARTIAL COVERAGE`, chyba że raport wyraźnie wskazuje pełny wąski AC. Globalne Dodaj z siedmiu modułów, pełny Dashboard, Kanban, lifecycle, historia, dokumenty, import, export/delete i publiczne polityki Auth pozostają poza zadaniem. Pełne UC/TC-001/029/034 nie otrzymują zbiorczego PASS na podstawie minimalnego create/read.
