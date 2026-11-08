# Calendar Core — analiza SDD i plan kolejnego przyrostu

**Status:** P1 APPROVED w ustalonym zakresie, P2 częściowo APPROVED przez [DEC-062](../decisions/product-decisions.md); pozostałe kwestie P2/P3 OPEN. Analiza, bez autoryzacji implementacji. **Baza:** `f6785b9a4776de4e4e34b5037e830a2f8d9bbf0b`, merge PR #23; GitHub potwierdza `merged=true`. Data: 2026-11-05. Pozostałe rekomendacje nie są decyzjami PO ani nowymi ADR.

## Cel i najmniejszy sensowny przyrost

Jeden spójny przyrost: prywatne wydarzenie powiązane ze sprawą, dostępne w kontekście sprawy i Kalendarzu oraz jako nadchodzące na Dashboardzie; pełna integracja jego otwartych pozycji z zamykaniem sprawy obok istniejących Task. Zachować zatwierdzone przełożenie tego samego wydarzenia z odtwarzalnym terminem, świadome rozliczenie, propozycję rozliczenia po terminie, zapis odbytej rozmowy bez fikcyjnego planu oraz wielu rzeczywistych uczestników. Odłączenie przy close wymaga możliwości dalszego istnienia wydarzenia bez relacji do sprawy. Przełożenie nie jest nowym statusem, a samo wydarzenie nie zmienia statusu sprawy.

To granica przyrostu, nie redefinicja MVP. Nie obejmuje zewnętrznej synchronizacji kalendarza, automatycznej komunikacji, nowych przypomnień, Global Search ani importu; ich istniejące wymagania i bramki pozostają. W szczególności docelowe wyszukiwanie opisów wydarzeń pozostaje w ADR-0008, a odłożenie nie jest jego realizacją. Jeżeli PO wybierze mniejszy podzakres, należy jawnie wskazać brakujące zatwierdzone zachowania i nie raportować pełnego pokrycia odpowiednich AC/TC.

## Macierz zgodności i pochodzenie

| Źródło i status | Kontrakt dla planu | Dowód zachowania w przyszłym QA |
| --- | --- | --- |
| [Discovery i DEC](../decisions/product-decisions.md): DEC-013, 016, 017, 020–025, 043 i 058 APPROVED | BR-011: każdy otwarty element rozstrzygany jawnie; jedna historia, wiele rzeczywistych uczestników, brak automatycznego odbycia i inferencji udziału z relacji kontakt–sprawa. | Mieszany close Task/Event, jeden obiekt i wielu uczestników, brak fikcyjnej historii, test po upływie czasu. |
| [BR](../domain/business-rules.md): BR-011, 015–017, 019, 027 | Datę faktu odróżnij od daty zapisu; historyczna prawda i niezależność lifecycle. | TC-010/011/012/019/022/028, regresja statusu sprawy i osi czasu. |
| [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md): FR/AC-HE-006–013, DB-003, LC-018, TN-011 APPROVED | Wydarzenie, dashboard i rozstrzygnięcie przy close; szczegóły wskazane w OPEN poniżej. | Mapowanie każdego AC na test, częściowe pokrycie oznaczyć wprost. |
| [UX-011](../ux/screen-blueprints.md), [F08](../ux/flow-contracts.md), [wybory UX](../ux/blueprint-decisions.md) | Agenda i wariant kalendarzowy są rekomendacją pod delegacją, nie sztywną decyzją DEC; karta pokazuje tylko rzeczywisty kontekst. Formuły czasu i uczestników pozostają otwarte. | Stany, klawiatura, focus, realny viewport, puste i błędne dane; historia terminów i rozliczenie. |
| [Technical Discovery](discovery-decisions.md), [ADR-0001](../decisions/adr/0001-modular-nextjs.md), [ADR-0002](../decisions/adr/0002-relational-state-history.md), [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) ACCEPTED | Modularny monolit, relacyjny stan + historia biznesowa i osobny audyt; trusted Auth, RLS relacji i minimalne uprawnienia; transakcyjne komendy invoker. ADR-0012 zastępuje wskazany zakres ADR-0003. | Testy bezpośrednie A/B/anon, każda relacja i RPC, transakcja i audyt; niezależny security review. |

[Scenariusze i traceability](../quality/scenarios.md) są planem testów, nie dowodem wykonania. Szczególnie UC/TC-010, 011, 012, 019, 022, 028 oraz zależne części UC-024 wymagają oceny według faktycznego zakresu. [DEC-060](tasks-core-analysis.md) rozstrzyga skutki dla Task, nie dla CalendarEvent.

## Decyzje wymagane od PO — PROPOSED

Poniższe pakiety są rozłączne tylko tam, gdzie pozwalają na to zależności; nie zamykają całych OPEN. Przed schematem i kodem należy utrwalić odpowiedź w rejestrze decyzji i doprecyzować AC/traceability.

**P1 — OPEN-021/029, atomowe zamknięcie.** Wariant A zatwierdzony w zakresie [DEC-062](../decisions/product-decisions.md): jawne anuluj z relacją, zachowaj otwarte z relacją albo odłącz otwarte z audytem wcześniejszej relacji; atomowo z wszystkimi otwartymi Task i close, z kontrolą współbieżności, idempotencją, audytem i bez częściowych skutków. Otwarte to powiązane zaplanowane i nierozliczone wydarzenie także po terminie lub przełożeniu; rozliczone jako odbyte/nieodbyte/anulowane oraz rozmowy zapisane od razu jako odbyte są poza zbiorem. Sam upływ czasu nie zmienia stanu. Skutki dla istniejących powiązań uczestników przy close i zachowanie przy wznowieniu zatwierdzono poniżej. Konkretna obsługa zmiany zbioru/wersji i ponownego podglądu pozostaje w planie QA, nie jest dodatkowym tekstem decyzji PO.

**P2 — OPEN-002/021/037, formularz, czas i rozliczenie.** PO zatwierdził w DEC-062 wymagany dzień i opcjonalną nieznaną godzinę planowanego wydarzenia bez domyślnej godziny i bez utożsamiania z całodniowością. Każde CalendarEvent ma jawną strefę IANA, także bez godziny, a interpretacja terminu jest niezależna od strefy urządzenia. Pozostają do decyzji m.in. pola i walidacja, DST, zmiana strefy, całodniowość, granica minionego wydarzenia bez godziny, dokładny rzeczywisty czas, zakres Dashboardu i miejsce propozycji rozliczenia. Zachować odtwarzalne poprzednie terminy, jawne rozliczenie i brak automatycznego odbycia. Bez kompletnego kontraktu nie tworzyć fizycznego schematu ani domyślnych statusów.

**P2 — strefa odniesienia, APPROVED DEC-062:** każde CalendarEvent ma jawnie określoną strefę IANA również bez godziny; interpretacja terminu nie zależy od aktualnej strefy urządzenia, a strefa nie nadaje godziny. Granica minionego dnia, DST, zmiana strefy i całodniowość pozostają OPEN.

**P2 — miniony termin bez godziny, PROPOSED:** A (rekomendowany): dzień D uznać za miniony dla propozycji rozliczenia, gdy bieżąca data w strefie IANA wydarzenia jest późniejsza niż D. Od tego momentu proponować rozliczenie, bez zmiany statusu i bez zapisu godziny `00:00`. Nie przesądza to reguł dla znanej godziny, całodniowości, zmiany strefy ani szczególnych przejść daty. QA: przed i po zmianie daty w strefie wydarzenia, różne strefy urządzeń, przełożenie, brak zmiany statusu i brak fikcyjnej godziny. Próg pozostaje OPEN do decyzji PO.

**P3 — OPEN-021/030, uczestnicy i historia.** Rekomendacja A: jawnie wybierane własne kontakty, wielu uczestników jednego wydarzenia; zmiany uczestnictwa z odtwarzalnym audytem i rozróżnieniem planowanego oraz rzeczywistego udziału zgodnie z decyzją PO. Historia kontaktu obejmuje tylko rzeczywistych uczestników, bez kopii zdarzenia. Alternatywa B: inny sposób jawnego potwierdzenia i wersjonowania udziału, który zachowa te same BR-019/027 i DEC-025. PO rozstrzyga dodawanie, usuwanie i korekty przed/po rozliczeniu oraz sposób potwierdzenia faktycznej obecności; sam związek kontaktu ze sprawą nią nie jest.

**P1 — skutki dla uczestników, APPROVED DEC-062:** PO zatwierdził wariant A: każda z trzech akcji zachowuje jawne powiązania osób z tym samym wydarzeniem i ich dotychczasowy charakter, bez potwierdzania ani zaprzeczania rzeczywistej obecności; odłączenie zmienia wyłącznie bieżącą relację wydarzenia ze sprawą i zachowuje poprzednią w audycie. Osobne relacje kontakt–sprawa pozostają bez zmiany; komunikacja ani fikcyjne fakty nie powstają. Ten podzakres nie rozstrzyga modelu udziału, edycji/korekt ani prezentacji rzeczywistych faktów w historii (`OPEN-021/030`). Przyszłe QA obejmuje wielu uczestników, wszystkie trzy akcje, brak inferencji obecności i komunikacji, relacje kontakt–sprawa, audyt i rollback.

**P1 — wznowienie sprawy, APPROVED DEC-062:** samo wznowienie nie zmienia statusów ani bieżących powiązań CalendarEvent, nie reaktywuje anulowanych i nie przyłącza ponownie odłączonych; nie odtwarza stanu z close ani nie nadpisuje późniejszych świadomych zmian. Poprzednie zakończenia i pełny audyt pozostają. Nie rozstrzygnięto dopuszczalności zmian wydarzeń przy zamkniętej sprawie. QA: trzy rozstrzygnięcia close, ewentualne późniejsze zmiany tylko jeśli dopuszczone, zachowanie historii, retry i kolejne close.

Pozostałe OPEN, w tym OPEN-004/020 dotyczące korekt i OPEN-032 dotyczące polityk danych, nie są zamykane tym pakietem. Ustalić wpływ ich pozostałych części na zatwierdzony zakres przed wykonaniem; publiczne bramki pozostają niezależne.

## Wpływ i obecna baza

- CalendarEvent różni się od istniejącego faktu historii i zaproszenia; nie wolno tworzyć fikcyjnego zaproszenia lub faktu odbytej rozmowy z samego planowania. Oś sprawy i historia kontaktu wymagają spójnej projekcji, bez duplikacji.
- [Guard close](../../db/recruitment/migrations/0013_tasks_core.sql) nadal fail-closed dla nieobsłużonego Calendar; nie wolno obchodzić go inną nazwą tabeli. Integracja musi zabezpieczyć wszystkie dostępne ścieżki close, również bezpośrednie RPC/Data API i starsze ścieżki, a nie tylko formularz. Zachować istniejące rozstrzygnięcia Task, audyt i replay.
- Dashboard i Calendar wymagają jawnych stanów ładowania, błędu i pustej listy oraz prawdziwych relacji. [Sidebar](../../src/components/workspace/sidebar.tsx) obecnie nie stanowi działającego modułu Calendar.
- Import nie zmienia się w przyroście; należy sprawdzić, że nie powstaje fikcyjne wydarzenie lub zaległa sugestia. Wyszukiwanie pozostaje przyszłą zależnością, nie wolno deklarować jego pokrycia. Zmiany w relacjach wymagają owner isolation na wszystkich końcach, łącznie z historią, audytem i recovery.
- Migracje wyłącznie addytywne z weryfikacją istniejącej historii; bez resetu persistent DEV, backfillu fikcyjnych danych ani naruszenia cudzych worktree i zasobów.

## Plan wykonania po decyzjach i osobnym zleceniu implementacji

1. Orchestrator zapisuje konkretne warianty PO, aktualizuje odpowiednie DEC/OPEN, FR/AC, UX i scenariusze; sprawdza macierz zgodności i finalny zakres. UX designer opracowuje interakcje w granicach Blueprintu. QA przygotowuje scenariusze i testy kontraktowe przed implementacją tam, gdzie praktyczne.
2. Backend engineer: właściciel obszarów migracji `db/recruitment/`, domeny/aplikacji `src/modules/recruitment/` i własnych unit testów; szczegółowe pliki wyznaczyć w task packecie po zatwierdzeniu. Transakcyjne komendy, relacje, historia, RLS i integracja close w jednej zgodnej granicy. Niezależnie utrzymać bezpieczne działanie wcześniejszych komend.
3. Frontend engineer: właściciel Calendar, kontekstu sprawy, Dashboardu i odpowiednich komponentów `src/`, z własnymi unit testami; dokładne pliki po projekcie UX. Bez równoczesnego zapisu tych samych plików przez backend/QA.
4. QA engineer: właściciel uzgodnionych integracyjnych i E2E plików `tests/`; środowisko izolowane i syntetyczne, osobne od persistent DEV. `pnpm test:recruitment` oraz właściwe unit, lint, typecheck i build uruchomić na dokładnym kandydacie, z wersją wykonywanego Node i dowodami. Nie zakładać aktualnych liczb ani wyniku.
5. Po zamrożeniu kandydata niezależny backend, frontend i security review przez read-only rodzica `harness/scripts/review.py`, osobne od autorów. Zamknięcie wymaga usunięcia blokujących findings, ponowienia dotkniętych testów/review oraz aktualizacji dokumentacji i traceability. Żadna analiza ani review nie zastępuje testu.

Role dziedziczą model sesji; dokładny model i reasoning środowisko analizy nie ujawnia. Przyszłe task packety podają dostępne metadane, źródła, właściciela zapisu, bazę, kandydata i DoD; wymagany security review wynika z danych prywatnych i RLS. PR, merge i deployment nie autoryzowane tym zadaniem.

## QA — macierz minimalnych dowodów

| Zakres / ID | Scenariusze i poziom |
| --- | --- |
| HE-007 / TC-010 | Integracja i browser: ten sam ID, odtworzenie wcześniejszego terminu, bez statusu przełożone i bez fikcyjnego odbycia. |
| HE-008/009/011/012 / TC-011/028 | Kontrolowany czas: upływ nie zmienia stanu, propozycja nie mutuje, świadome rozliczenie każdą zatwierdzoną opcją. |
| HE-010 / TC-022 | Faktyczna data i czas zapisu oddzielne; zapis odbytej rozmowy bez sztucznego planu, prawidłowa oś. |
| HE-013 / TC-019 | Dwie osoby i jedno wydarzenie; tylko rzeczywisty udział w historii, poprawki i audyt zgodnie z P3. |
| DB-003 / UX-001/011 | Własne przyszłe wydarzenie i kontekst, prawidłowe granice czasu według P2, empty/error, brak fikcyjnych osób, nawigacja i dostępność. |
| LC-018/TN-011 / TC-012 | Mieszany zbiór Task i Calendar; każdy wybór, anulowanie, równoczesna zmiana elementu/zbioru, stale preview, rollback, identyczny retry i konflikt zmienionego zamiaru, audyt i wszystkie ścieżki close. |
| Prywatność i regresje | A/B/anon na listach, ID, relacjach, audycie i RPC; cudze/niespójne ID, bez wycieku metadanych. Rekrutacja, Tasks, Quick Capture i historia bez zmiany niepowiązanego statusu. |
| Czas i UX | Testy DST, niejednoznacznych i nieistniejących godzin oraz granic dnia i całodniowych według P2. Browser 1440/1024/768/375, faktyczny viewport, Tab/Shift+Tab, focus, dialog, cancel, długie dane, overlay i błąd sieci. |

**Wyniki tej analizy:** potwierdzenie merge i statyczna analiza źródeł PASS; implementacja, testy aplikacji, runtime QA oraz niezależne review implementacji NOT RUN — brak kandydata i autoryzacji. P1 APPROVED w ustalonym zakresie, P2 częściowo APPROVED, P3 i pozostałe kwestie OPEN; przyszły zakres zależny BLOCKED do decyzji PO. Żaden ADR nie został dodany ani zmieniony.
