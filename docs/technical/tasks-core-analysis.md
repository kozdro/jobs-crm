# Tasks Core + integracja zamykania spraw

Data: 2026-11-01. Status: **APPROVED 1A/2A/3A/4A — DEC-060**, wykonanie autoryzowane osobnym poleceniem PO w tej rozmowie. Wyniki weryfikacji są odrębne od zatwierdzenia.

Baza: aktualne main/origin/main `910582aa220594f51db70869e3d6e6a166b18766`, potwierdzony merge [PR #20](https://github.com/kozdro/jobs-crm/pull/20). Izolowany worktree `/private/tmp/jobs-crm-tasks-core`, gałąź `feat/tasks-core`; bez mutacji persistent DEV, cloud i cudzych zasobów. Autoryzowane commit/push/osobny PR, bez merge/deploymentu.

## Requirement i statusy

| Podstawa | Status / znaczenie |
|---|---|
| DEC-026, FR/AC-TN-001–003 | APPROVED zadania ogólne i powiązane, pola oraz konteksty; DEC-060 doprecyzowuje kontrakt lokalnego slice'a |
| DEC-013/057/060, BR-011, FR/AC-LC-018 i TN-011 | APPROVED świadome rozstrzygnięcia otwartych zadań atomowo z zamknięciem; CalendarEvent nadal poza implementacją |
| AC-AD-002, BR-030, SEC-02 | Własność z zaufanego Auth, prywatność danych/relacji/audytu/recovery, także bez BFF |
| UC/TC-030, UX-010/005/001, F09 | Zadania bez terminu, lista i kontekst; neutralny podgląd otwartych na Dashboardzie |
| UC/TC-012 | Częściowy zakres Tasks; pełny scenariusz wymaga także przyszłego wydarzenia i pozostaje NOT RUN |
| DEC-027/028/037, BR-009/020/024 | Bez push, automatycznej komunikacji, zamknięć i utożsamiania sugestii z zadaniem; brak implementacji sugestii/przypomnień |
| OPEN-002/029/037/040 | Częściowo rozstrzygnięte przez DEC-060 tylko dla Tasks Core; brak nowych progów, preferencji i polityk powiadomień |
| OPEN-008/009/021 | Nadal OPEN dla przyszłych sugestii, przypomnień i kalendarza; nie blokują zatwierdzonego core |

## Kontrakt zatwierdzony przez PO

- Tytuł po trim: 1–160 znaków Unicode; opis opcjonalny do 2000 znaków. Termin opcjonalny, rzeczywisty dzień kalendarzowy także przyszły, bez godziny, strefy alarmu i przypomnienia. Brak terminu jest poprawny, nie oznacza zaległości.
- Początkowy status **Do zrobienia**. Jawne wykonanie do **Wykonane**, anulowanie do **Anulowane**, jawne przywrócenie statusu terminalnego do **Do zrobienia**. Brak automatycznych przejść po upływie czasu.
- Zadanie ogólne albo powiązane z jedną własną sprawą. Dostępne tworzenie, odczyt, edycja, wykonanie/anulowanie/przywrócenie i audyt. Bez hard delete, priorytetów, cykliczności i przypomnień.
- Przy zakończonej sprawie można tworzyć i obsługiwać zadania bez wznowienia sprawy. Wznowienie sprawy nie przywraca automatycznie anulowanych/wykonanych zadań.
- Zamknięcie wymaga jawnej decyzji dla każdego otwartego zadania: **anuluj** zmienia status na Anulowane i zachowuje relację; **zachowaj** utrzymuje otwarte z relacją; **odłącz** pozostawia otwarte jako ogólne. Audyt zachowuje wcześniejszą relację oraz wybór, również gdy bieżące wartości się nie zmieniły.
- Wybory zadań i zamknięcie stanowią jedną transakcję. Zmiana zbioru lub wersji zadań od podglądu wymaga konfliktu i ponownego potwierdzenia. Retry zgodnego zamiaru nie powiela skutków; odmienny payload nie może użyć tego samego klucza. Utrata odpowiedzi nie oznacza automatycznie błędu zapisu.
- Istniejący guard 3C wykrywa obecność tabel Tasks/CalendarEvent (`0010_recruitment_lifecycle_3c.sql`). Nowa addytywna migracja zastępuje wyłącznie część Tasks realną obsługą BR-011. Dla przyszłych CalendarEvent/recruitment_calendar_event pozostaje fail-closed; nie zmieniamy starej migracji ani nie obchodzimy guarda nazwą tabeli.

## UX i wpływ

Lista Zadania, wspólny formularz ogólny/kontekstowy (kontekst wypełnia wyłącznie sprawę), sekcja na pełnym detalu i neutralny Dashboard z istniejącymi otwartymi zadaniami. Bez deklarowania pełnego AC-DB-002 „wymaga uwagi”, progów zaległości i fikcyjnych pustych wyników przy awarii. Zachować focus, klawiaturę, draft przy błędzie i konflikcie, prawdziwy sukces i owner-scoped recovery bez PII w dodatkowym storage. Istniejący drawer Workspace pozostaje read-only.

Dane: addytywny Drizzle ledger i upgrade starych danych bez backfillu zdarzeń. Nowe owner-scoped zadania, rewizje/audyt i intencje zapisów; kontrola relacji z case. Historia RecruitmentCase nie otrzymuje fikcyjnych aplikacji/kontaktów od operacji Task. Ryzyko krytyczne: wyścigi close/create/edit/restore, pominięty element po preview, stare replay oraz bypass bezpośrednim Data API. Wszystkie wejścia muszą respektować ten sam kontrakt.

Import, Global Search, Calendar, dokumenty i komunikacja: bez zmian zachowania; ich brak nie oznacza akceptacji pełnych scenariuszy. Sugestie oraz przypomnienia in-app/e-mail to osobne przyszłe przyrosty. Nie dodajemy workera ani nowych zależności. Istniejąca architektura pozostaje; brak nowej decyzji architektonicznej wymagającej ADR. Publiczne bramki Auth/privacy/OPS nadal obowiązują.

## Plan wykonania i własność

Role według harness/workflows/delivery.md; model i reasoning dziedziczone, NOT EXPOSED. Brak dalszego poziomu delegacji. Autorzy nie są reviewerami.

1. Orchestrator: docs/**, DEC/OPEN/FR/AC/UC/UX/traceability, integracja i raport. DoD: zgodność z rzeczywistą decyzją PO bez zamykania pozostałych OPEN.
2. Backend engineer: db/recruitment/**, src/modules/recruitment/**, task BFF i lifecycle BFF, własne unit tests. DoD: walidacja, odczyt, audyt, transakcje, RLS/grants, replay/conflict i Calendar guard.
3. Frontend engineer: src/components/tasks/**, strona Tasks, sekcje sprawy i Dashboardu, shell, lifecycle UI i własne unit. DoD: realny przebieg, dostępność, błędy/recovery i zgodność UX.
4. QA engineer: nowe tests/integration/recruitment/tasks*.ts, tests/e2e/recruitment-tasks*.spec.ts i rejestracja runnera. Projektowanie/implementacja testów przed lub wraz z kodem, własny izolowany target i syntetyczne dane.
5. Niezależni backend/frontend/security reviewerzy: oddzielni rodzice read-only przez harness/scripts/review.py, zamrożony kandydat i fingerprint. Findings wracają do autorów; po poprawkach retest i ponowna ocena dotkniętego zakresu.

## Macierz QA i DoD

| AC / ryzyko | Metoda / autor / środowisko |
|---|---|
| TN-001/002, TC-030 | Unit developerów i integracja/E2E QA: ogólne/sprawa, tytuł/limity/Unicode, opis, brak/przyszły/niepoprawny termin, statusy i restore |
| TN-003, UX-010/005/001 | HTTPS browser QA: wspólny formularz, lista/detal/Dashboard, empty/loading/error, reload, focus/klawiatura, 375/768/1024/1440 |
| TN-011, LC-018, BR-011 | Integracje/E2E QA: wszystkie trzy wybory, każdy element, cancel bez skutków, stale zbiór/wersja, forced rollback, zamknięte sprawy, zachowany Calendar guard |
| AD-002, BR-030 | Rzeczywisty Auth/JWT/Data API/RLS: A create/list/ID/edit/audit/recovery, B/anon odmowy bez metadanych/count, cudze relacje/spoof ownera, direct write bypass |
| Retry/concurrency/regresje | Integracje QA: zgodny replay, mismatch, utrata odpowiedzi, stare retry/ABA, close/create/update/status/close, upgrade; brak automatycznych faktów/komunikacji i regresji 3A–3C/Workspace |

Istniejące komendy: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment` (production build, realne lokalne Auth/Data API i production HTTPS browser). Przypięte Node 24.22.2 / pnpm 12.16.1. Nigdy persistent DEV; runner chroni własność targetu i sprząta tylko własne zasoby.

DoD: wymagane AC w zakresie mają wykonane dowody PASS na identyfikowalnym kandydacie; zero blokujących findings; pełna regresja i hosted CI dla exact head; aktualne dokumenty i osobny otwarty PR. Wyników nie nadaje samo APPROVED. Pełny TC-012/Calendar, przypomnienia/sugestie, publiczne wdrożenie, realne urządzenia i technologie asystujące pozostają poza wykonaniem, o ile raport nie dokumentuje inaczej.
