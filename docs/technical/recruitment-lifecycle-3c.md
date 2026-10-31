# Recruitment Lifecycle 3C — Closure & Reopening

Data: 2026-10-31. Status: APPROVED zakres i wykonanie przez DEC-057; wyniki wykonania raportowane oddzielnie. Baza: merge PR #17 `8dee66bcfefc91876e7651743a9f777255ac002a`.

## Źródło i analiza SDD/AIDD

Analiza w rozmowie po potwierdzonym merge PR #17, z udziałem spec-analyst i qa-engineer, wyznaczyła cztery pakiety decyzji. PO jawnie zatwierdził warianty 1A/2A/3A/4A oraz implementację, testy, niezależny review, aktualizację dokumentacji i osobny PR. Bez merge/deploymentu, persistent DEV i cudzych zmian. Orchestrator stosuje analyze-requirement, clarify-requirements, plan-slice, record-decision, implement-slice, verify-acceptance i review-change.

Podstawa APPROVED: DEC-010/011/012/013/054/055/056/057, BR-003–012/015/016/030, FR/AC-LC-016–021, FR/AC-HE-001/002/003, FR/AC-AD-002; UC/TC-013 oraz podzakres UC/TC-012. BR-011 i pełny TC-012 pozostają poza pokryciem, a nie uchylone. ADR-0002/0012 ACCEPTED, bez zmiany architektury.

## Zatwierdzony vertical slice

Własna istniejąca sprawa → Zakończ z wynikiem → lista/detal i historia → Wznów kontynuację → nowe aktywności → kolejne zakończenie. Każde zamknięcie tworzy odrębny ClosureRecord. Wznowienie i kolejne zakończenie nie nadpisują wcześniejszych wyników ani snapshotów. Rewizje są technicznym audytem, nie nowymi zdarzeniami biznesowymi.

### 1A — wynik i minimalne dane

Zatwierdzony słownik:

- Oferta przyjęta.
- Oferta odrzucona przez użytkownika.
- Odmowa firmy.
- Rezygnacja użytkownika.
- Brak odpowiedzi.
- Anulowanie procesu.
- Nie aplikowano.
- Inny.

Brak domyślnego wyniku. Wynik wybiera użytkownik; Brak odpowiedzi nigdy nie wynika automatycznie z upływu czasu ani braku wpisu CRM. Wyniki oferty wymagają jawnego potwierdzenia, że oferta rzeczywiście była (bez implementacji modułu ofert). Nie aplikowano wymaga braku ważnej aplikacji W ZAMYKANYM CYKLU, nie w całej sprawie. Wynik nie fabrykuje kontaktu, aplikacji, zaproszenia ani wysyłki CV.

Zakończenie i wznowienie mają opcjonalny rzeczywisty nieprzyszły dzień albo unknown oraz odrębny zaufany czas zapisu. Wznowienie jest jawną akcją wykonywaną teraz; dzień historyczny nie odtwarza stanu po dacie.

Cykl początkowy zaczyna się przy utworzeniu sprawy. Każde jawne wznowienie rozpoczyna kolejny cykl. Przynależność aplikacji do cyklu wynika z kolejności zastosowania komend, nie occurred_on, daty korekty ani sortowania UUID. Wsteczna aplikacja wpisana w cyklu należy do tego cyklu. Historyczne aplikacje nie blokują Nie aplikowano w kolejnym cyklu bez ważnej aplikacji. Korekta nie przenosi faktu między cyklami.

### 2A — kontynuacja, stan i etap

Zamknięcie z dowolnego wdrożonego aktywnego statusu zachowuje snapshot statusu/etapu; Zakończone nie ma bieżącego etapu. Wznowienie tej samej sprawy przywraca stan uzasadniony nadal ważnymi faktami, pokazany przed potwierdzeniem. Snapshot zakończenia pozostaje oryginalnym kontekstem, a nie arbitralnym poleceniem przywrócenia nieaktualnej klasyfikacji. W rekrutacji wymaga nadal ważnego zaproszenia i etapu. Poprzednie ważne fakty mogą stanowić podstawę kontynuacji; wznowienie nie wymaga wymyślenia nowego zaproszenia.

Rekomputacja aktywnego stanu zachowuje DEC-056: pierwotna kolejność komend etapowych, wcześniejsze ważne zaproszenie dla każdego przejścia, odmowa osierocenia bez kaskady. Bez ważnych zaproszeń/przejść: Kontakt rozpoczęty przy ważnej aplikacji/kontakcie, inaczej Zapisane. Zamknięcie jest barierą: korekta starych faktów nie otwiera sprawy. Replay zakończenia/wznowienia nie odtwarza dawnych skutków.

Automatyczne proponowanie nowej sprawy vs kontynuacji i Global Search poza slice’em. Zakończone sprawy pozostają dostępne na liście i po ID; pełne AC-LC-021 częściowe bez Search. Nowe fakty 3A/3B na Zakończone wymagają najpierw jawnego wznowienia.

### 3A — zadania i wydarzenia

Wyłącznie lokalny zakres bez otwartych Task/CalendarEvent. Obecny model tych obiektów nie implementuje; HistoryEntry nie jest CalendarEvent. Nie dodajemy fikcyjnych tabel, placeholderów ani komunikatu udającego wykonane sprawdzenie zadań. Przed dołączeniem takich modułów ich integracja musi atomowo objąć BR-011: wykrycie rzeczywiście otwartych elementów, jawne anuluj/zachowaj/odłącz, ponowna walidacja przy zapisie. Nie wolno uznać pełnego FR-LC-018/TC-012 za wykonane. OPEN-029/040 i zależny OPEN-021 zachowane.

### 4A — korekty zakończeń i zgodność z DEC-056

Korygowalne pola zakończenia: zatwierdzony wynik oraz dzień/unknown. Wynik oferty nadal wymaga potwierdzenia, a Nie aplikowano waliduje aplikacje w cyklu konkretnego zakończenia, także przy korekcie wcześniejszego zakończenia. Oryginał, każda rewizja, before/after, zaufany aktor/czas pozostają właścicielowi dostępne w audycie. Bez nowych obowiązkowych pól powodu, hard delete, void zakończeń, zmiany ich cyklu/sprawy lub kaskadowego cofania późniejszych cykli.

Korekta wyniku/dnia nie zmienia bieżącego statusu/etapu, nie usuwa zakończenia ani wznowienia i nie dodaje nowej aktywności biznesowej. Błędny fakt zakończenia nie może być fizycznie skasowany; szersze unieważnianie/retype/retencja nie są zatwierdzone. Istniejące korekty/void 3A/3B pozostają dostępne z podglądem wpływu; gdy sprawa Zakończone, nadal pozostaje zamknięta. Snapshoty wcześniejszych zakończeń i previous_stage pozostają oryginalnym kontekstem.

## Impact analysis

Dane: addytywna migracja Drizzle w istniejącym ledgerze, bez zmiany migracji 0000–0009, bez fikcyjnego backfillu. Rozszerzenie projekcji i guardów lifecycle musi objąć stare i nowe komendy, rewizje, monotoniczne konflikty i retry. Bez dowolnego PATCH statusu. Historia: odrębne zakończenia/wznowienia, korekty w audycie, zachowane paginacja i nieznane daty. Security: właściciel z zaufanego Auth, realne RLS A/B/anon list/ID/audit/recovery i relacje, bez service-role w user path. UX: istniejący detal/lista, jawny preview/confirm, cancel bez skutków, focus, stale konflikt bez cichego rebase, odzyskiwanie tego samego zamiaru. Import/Search/kalendarz/CV/kontakty/globalne etapy/komunikacja bez implementacji. Publiczne Auth/privacy/OPS pozostają bramkami.

## Plan, własność i DoD

Model/reasoning: inherited, NOT EXPOSED. Autorzy nie są reviewerami; bez dalszej delegacji.

1. Orchestrator: docs/** i integracja kontraktu. Utrwala DEC/OPEN/BR/FR/AC/UC/UX/traceability oraz raport.
2. Backend engineer: db/recruitment/**, src/modules/recruitment/**, src/app/recruitments/lifecycle-commands/** i inne istniejące command BFF; własne unit testy. DoD: transakcje, cykle, odczyty, rewizje, retry i odmowy również bez BFF.
3. Frontend engineer: src/components/recruitment/**, strony listy/detalu i własne unit; DoD: realny end-to-end przepływ, preview/audyt/recovery, brak wymyślonych działań.
4. QA engineer: tests/integration/recruitment/**, tests/e2e/recruitment-*.spec.ts, scripts/recruitment/runner.ts i własny raport QA. Testy projektuje przed implementacją, pisze i uruchamia na izolowanym lokalnym targetcie.
5. Backend/frontend/security reviewerzy: niezależni read-only rodzice przez harness/scripts/review.py, zamrożony kandydat i fingerprint, findings wracają do autorów.

Macierz QA: brak/nieznany wynik i brak potwierdzenia oferty; Nie aplikowano w początkowym i następnym cyklu oraz korekcie starego zakończenia; close/reopen/close bez nadpisania; korekta wyniku/dnia z audytem i bez dodatkowej aktywności; korekty/void przed i po zakończeniu/wznowieniu; rzeczywiste wyścigi close/close, close/reopen, close/correct i ABA; payload mismatch, stare retry i utrata odpowiedzi; forced rollback; upgrade z syntetycznymi starymi danymi; właściciel A, B/anon odmowa, bezpośrednie Data API i relacje; reload/list/detail, focus/klawiatura, 375/768/1024/1440, błędy i recovery. Pełny TC-012 i Global Search pozostają NOT RUN/out of scope.

Komendy: pnpm test:unit, typecheck, lint, format:check, test:boundaries, test:canary, test:recruitment (w tym production build i HTTPS browser). Przypięte Node 24.22.2 / pnpm 12.16.1. DoD: rzeczywiste dowody AC w zakresie, dokładny kandydat SHA, brak blokujących findings, dokumentacja aktualna i osobny otwarty PR. Wyniki nie wynikają z APPROVED; raport wykonania oddzielnie.
