# Recruitment Lifecycle 3B — Invitations & Stages

Data: 2026-10-30. **APPROVED zakres 1A/2A/3A — DEC-055**. Poniższa analiza zachowuje propozycje i warianty z etapu planowania; późniejsze zatwierdzenie PO obejmuje warianty A i punkty 1–7. B nie zostały zatwierdzone. Osobne zlecenie PO autoryzuje pełną implementację, testy, review i PR, bez merge/deploymentu.

## Baza i metoda

Analiza commita `94f962841cd3c669c320b8612ad2ab69aa68e2cd` (main). `git ls-remote origin refs/heads/main` zwrócił ten sam SHA. Jest to merge PR #15, z rodzicami `ac55059` i `af95184`, opisany w commit message jako Recruitment Lifecycle 3A. Potwierdzenie pochodzi z Git, nie z udanego odczytu API PR: connector GitHub zwrócił Internal error, a lokalny gh nie ma autoryzacji. Nie potwierdzano na nowo hosted CI.

Na początku working tree był czysty; podczas analizy pojawiły się zewnętrzne modyfikacje 17 śledzonych plików, także dokumentacji i schematu 3A. Pozostawiono je bez zmian; dalsze odczyty przez `git show 94f9628:<path>`. Ten dokument jest jedynym plikiem dodanym przez orchestratora. Przed przyszłą implementacją trzeba uzgodnić bazę i zakres tych zmian, bez reset/stash ani automatycznego odtwarzania plików. Jest to warunek operacyjny, nie nowa decyzja produktowa.

Zastosowano analyze-requirement, plan-slice i clarify-requirements oraz workflow harnessu. Spec-analyst analizował wymagania; QA zaprojektował testy bez ich uruchamiania. To analiza, nie niezależny code review ani runtime acceptance.

## Requirement i stan zatwierdzenia

Źródła: [DEC](../decisions/product-decisions.md), [OPEN](../decisions/open-questions.md), [BR](../domain/business-rules.md), [cykl życia](../domain/recruitment-lifecycle.md), [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [scenariusze](../quality/scenarios.md), [traceability](../quality/traceability.md), [feature](../features/recruitment-lifecycle.md). Odczytano wersje z powyższego SHA; linki w working tree mogą obecnie pokazywać zewnętrzne zmiany.

| Podstawa | Obowiązujący sens / granica |
|---|---|
| DEC-004/005/006, BR-003/004/005; FR/AC-LC-004/007; UC/TC-005 | APPROVED: cztery statusy; aplikacja i automatyczne potwierdzenie nie kwalifikują. Szczegóły akcji OPEN-018. |
| DEC-007/008, BR-006; FR/AC-LC-008/011/012/013; UC/TC-009 | APPROVED: status odrębny od etapu, indywidualne etapy, pomijanie i zachowanie historii. Formularz i dozwolone kombinacje nadal OPEN. |
| FR/AC-LC-009/010; DEC-008 | Domyślne i globalnie personalizowane etapy zatwierdzone docelowo; nazwy/kolejność i propagacja OPEN-027/003. Nie są konieczne w pierwszym wewnętrznym przyroście. |
| DEC-009/022, BR-007/015/016; FR/AC-LC-014, FR/AC-HE-001/002/003 | Jawne akcje i historia faktów; korekta nie udaje zaproszenia, data faktu nie jest datą zapisu. |
| DEC-052/054, FR/AC-LC-005/006; UC/TC-001/002/003/004 | Zmergowany create/read i 3A są bazą regresji; DEC-054 zatwierdza append-only tylko w podzakresie 3A. |
| BR-030, FR/AC-AD-002; ADR-0012; SEC-02 | Prywatność i owner isolation również bez UI/BFF; rozszerzenie persystencji wymaga rzeczywistych testów i security review. |

Dokumenty BASELINED nie nadają statusu APPROVED nierozstrzygniętym szczegółom. UC/TC-005 i 009 będą pokryte częściowo: bez Kanbana, globalnej konfiguracji i pełnego modelu etapów.

## Najmniejszy sensowny vertical slice — rekomendacja

Istniejąca własna sprawa → jawne potwierdzenie otrzymania zaproszenia do konkretnego etapu → atomowy zapis faktu, etapu bieżącego i `W rekrutacji` → odczyt po reload na liście i detalu → późniejsza jawna zmiana indywidualnego etapu z historią, bez zmiany statusu.

1. Na istniejącym detalu akcja „Zarejestruj zaproszenie”. Użytkownik potwierdza, że chodzi o rzeczywiste zaproszenie do oceny kwalifikacji (rozmowa/screening/zadanie), a nie samo potwierdzenie odbioru aplikacji. System nie analizuje treści korespondencji ani nie klasyfikuje jej automatycznie.
2. Wymagana indywidualna nazwa etapu; propozycja walidacji: 1–160 punktów kodowych po trim. Bez obowiązkowych firmy, osoby, CV, kanału i terminu spotkania. Opcjonalny dzień otrzymania zaproszenia; nieznany pozostaje nieznany, data poprawna i nieprzyszła, jak w 3A (Europe/Warsaw). Nie jest to data przyszłej rozmowy.
3. Ze `Zapisane` lub `Kontakt rozpoczęty` jeden zapis ustawia `W rekrutacji` i etap. Bez tworzenia pośredniego kontaktu, aplikacji lub odbytej rozmowy. Bez osobnej pustej akcji „Rozpocznij rekrutację”.
4. W `W rekrutacji` kolejne rzeczywiste zaproszenie może zostać zapisane i ustawić wskazany etap, pozostawiając status. Osobna akcja „Zmień etap” rejestruje faktyczne przejście do dowolnego indywidualnego etapu, także z pominięciem pośrednich, bez wymyślania nowego zaproszenia. Bez globalnej listy i konfiguratora kolejności.
5. Formularz jawnie potwierdza ustawienie wskazanego etapu jako bieżącego. Data wsteczna porządkuje historię; nie służy do automatycznego odtwarzania aktualnego stanu. Rejestracja wyłącznie dawnych etapów bez zmiany bieżącego jest poza tym przyrostem. Współbieżna zmiana etapu wymaga konfliktu i odświeżenia zamiast cichego nadpisania.
6. Zapis historii zachowuje nazwy etapów z chwili faktu i rozróżnia zaproszenie od zmiany etapu. Pierwsze zaproszenie nie tworzy dwóch kopii tego samego faktu. Status i etap pokazane osobno; odczyt historii nadal paginowany i deterministyczny, z oznaczoną nieznaną datą.
7. Proponowane rozszerzenie 3A: dalszy rzeczywisty kontakt/aplikacja w `W rekrutacji` dopisuje fakt, pozostawiając status i etap. Replay wcześniejszych zamiarów po przejściu nadal zwraca wcześniejszy wynik, bez ponowienia skutków i cofania stanu.

Wszystkie nowe szczegóły powyżej są PROPOSED. Nie jest to redefinicja pełnego publicznego MVP.

## Rzeczywiste decyzje PO

| Pakiet / bramka | A — rekomendowany PROPOSED | B — realna alternatywa / koszt |
|---|---|---|
| 1. OPEN-018: zaproszenie i start | Jeden potwierdzony zapis zaproszenia do nazwanego etapu ustawia `W rekrutacji`, także bez wcześniejszej aplikacji/kontaktu. Kwalifikację potwierdza użytkownik. | Oddzielne zapisanie zaproszenia i rozpoczęcie rekrutacji; potrzebny stan oczekujący oraz zasady czasu pomiędzy akcjami. Większy slice. |
| 2. OPEN-002/034: minimalne etapy i dozwolone akcje | Kontrakt punktów 2–7 powyżej: indywidualna nazwa, etap wymagany przy wejściu; wcześniejsze statusy bez etapu; jawna zmiana tylko podczas `W rekrutacji`; kolejne zaproszenia i kontakt/aplikacja bez regresji statusu. | Pełne domyślne etapy i konfiguracja już teraz; wymaga nazw/kolejności OPEN-027, propagacji OPEN-003 i szerszej macierzy status–etap. |
| 3. OPEN-004: błędne wpisy | Jawne rozszerzenie lokalnego ograniczenia append-only z 3A na fakty 3B; ostrzeżenie przed zapisem; publiczne udostępnienie nadal zablokowane do ustalenia korekt. | Najpierw zaprojektować korekty/unieważnianie i audyt; większy zakres obejmujący też skutki dla bieżącego statusu/etapu. |

Pakiet 2 wymaga przyjęcia konkretnych pól i walidacji, nie tylko ogólnej zgody „etapy”. Nie zamykamy całych OPEN-002/034, a wyłącznie ten podzakres. OPEN-027/003 pozostają odłożone; nazwy przykładowe z dokumentacji nie stanowią zatwierdzonego słownika.

Nie są blokerami tego lokalnego slice'a: OPEN-001/019/020/029 (zamknięcie, wznowienie, korekta statusu), OPEN-021/037 w zakresie kalendarza, kanały OPEN-026, importer, Search, Kanban/DnD i globalne szablony. Nie wdrażamy tych zachowań. Publiczne Auth/privacy/retencja/backup pozostają bramkami udostępnienia, bez pozornego zamknięcia w tym planie.

## Impact analysis

- **Dane i historia:** addytywne rozszerzenie obecnego modelu, bez zmiany UUID, starych migracji, backfillu zaproszeń ani seedowania domyślnych etapów. Rozszerzenie DATA-01 dopiero po decyzji. Snapshot nazwy etapu chroni historię; nie projektujemy jeszcze fizycznego schematu niezatwierdzonych pól.
- **Backend i dostęp:** obecne parsery przyjmują dwa statusy i application/contact. Migracja 0007 ogranicza do nich DB i triggery; samo dodanie opcji UI nie wystarczy. Rozszerzyć kontrolowany zapis/status/etap we wszystkich ścieżkach, w tym bezpośrednim Data API, z atomowością i owner-scoped retry. Sprawdzić create/replay, listę, detal i ostrzeżenia duplikatów dla trzeciego statusu.
- **UX:** istniejący detal, formularz akcji i jedna historia; status i etap osobno, jawne potwierdzenie kwalifikacji i skutku dla bieżącego etapu. Błąd odczytu nie udaje pustej historii. Utrata odpowiedzi nie pozwala bez ostrzeżenia tworzyć nowego zamiaru.
- **Import/Search/relacje:** nie implementujemy ani nie zmieniamy kontraktów importera/wyszukiwarki, osób, organizacji i dokumentów. Nie dodajemy terminów, wydarzeń kalendarza ani komunikacji. Przyszłe moduły muszą respektować te same fakty; nie tworzymy teraz ich infrastruktury.
- **Bezpieczeństwo:** nowy stan i dane wymagają kontroli relacji właściciel–sprawa–historia/etap; owner i czas zapisu z zaufanego kontekstu. Bez nowych zależności, infrastruktury i service-role w user path. Zachować Origin/auth/account binding i redakcję błędów.

## Plan wykonania po decyzjach — nie uruchomiony

Metadane wszystkich ról: model i reasoning odziedziczone z sesji, dokładne wartości nieudostępnione. Brak dalszej delegacji. DoD wspólny: zatwierdzony podzakres FR/AC, brak blokujących findings, wymagane dowody rzeczywistych testów; żaden review Markdown nie zastępuje runtime.

| Kolejność / właściciel | Wyłączny zakres przyszłego zapisu | Wynik / DoD |
|---|---|---|
| 1. Orchestrator | DEC/OPEN, BR/FR/AC, feature/lifecycle, UX, scenariusze/traceability, kontrakt 3B | Utrwalone rzeczywiste decyzje PO i częściowe pokrycie; nie podnosić propozycji do APPROVED przed odpowiedzią. |
| 2. UX designer (projekt, bez plików kodu) | Kontrakt interakcji przekazany orchestratorowi | Zaproszenie vs zmiana etapu, dane/daty, skutki, potwierdzenie, unknown result, klawiatura; w granicach Blueprintu/visual language. |
| 3. Backend engineer | db/recruitment/**, src/modules/recruitment/**, src/app/recruitments/commands/route.ts; własne unit tests domeny/aplikacji | Atomowe inwarianty, odczyt i replay, addytywna migracja, brak obejścia przez API. FR/AC-LC-007/008/011/012/013/014, HE i AD w zakresie. Kontrakt transportu uzgodniony przed frontendem. |
| 4. Frontend engineer | src/components/recruitment/**, src/app/recruitments/[id]/page.tsx, src/app/recruitments/page.tsx; własne testy UI | Pełny przepływ na istniejących ekranach, niezależna prezentacja statusu/etapu, błędy i dostępność. Bez edycji domeny/backendu. |
| 5. QA engineer (uczestniczy od planu) | tests/integration/recruitment/**, tests/e2e/recruitment-lifecycle.spec.ts; scripts/recruitment/runner.ts tylko jeśli potrzebne rozszerzenie suite | Testy akceptacji/integracji/regresji i dowody z izolowanego targetu. Bez resetu persistent DEV. Test upgrade ze starymi sprawami/faktami. |
| 6. Niezależni backend/frontend/security reviewerzy | Bez zapisu, osobny read-only rodzic przez harness/scripts/review.py | Ocena zamrożonego kandydata, niezależna od autorów. Poprawki wracają do autora, dotknięte testy i review ponawiane. |
| 7. Orchestrator | Raport, traceability i dokumentacja w powyższym zakresie | SHA/diff, rzeczywiste wyniki, ryzyka i odłożony zakres; publikacja Git wymaga odrębnej autoryzacji, obecne zadanie jej nie udziela. |

## Macierz QA — PLANNED / NOT RUN

| Kontrakt / AC | Test i poziom | Autor / reviewer |
|---|---|---|
| LC-007/014, UC/TC-005 częściowo | Zaproszenie ze Zapisane i Kontakt rozpoczęty; odmowa automatycznej kwalifikacji potwierdzenia aplikacji, brak pośrednich fikcyjnych faktów; unit + DB + browser | Developer unit; QA integracja/E2E; backend/frontend/security review |
| LC-008/011/012/013, UC/TC-009 częściowo | Nazwa pusta/whitespace/Unicode/granice; pominięcie etapu, kolejne zaproszenie, zmiana bez nowego zaproszenia, snapshot historii, dwa oddzielne pola status/etap; unit + DB + E2E | Developer + QA; backend/frontend |
| HE-001/002/003, BR-015/016/017 | Znany/nieznany/wsteczny/przyszły dzień, rok przestępny i granica Warszawy; kolejność/paginacja mieszanej historii; brak automatycznej odbytej rozmowy; unit + DB + E2E | Developer + QA; backend/frontend |
| Atomowość / idempotencja | Rollback fakt+status+etap, identyczny replay i konflikt payloadu, lost response/recovery, same-key race; różne równoczesne zamiary i konflikt przestarzałego etapu bez częściowego zapisu; DB + browser failure recovery | QA; backend/security |
| AD-002 / BR-030 | A own read/write/list/direct ID; B/anon odmowa i brak wycieku danych/count/metadata; obce relacje, spoofing owner/czas/status/etap; bezpośredni REST/RPC/SQL, BFF Origin i zmiana konta | QA; security/backend |
| Regresje DEC-052/054 | Stare dane przeżywają migrację; create nadal Zapisane bez historii; replay create i faktów po aktywacji; dalszy kontakt/aplikacja nie cofa statusu/etapu; brak CV, backfillu, auto-close, merge i wysyłki | QA; backend/frontend/security |
| UX / DEC-053 | Potwierdzenie/anulowanie, naturalny Tab/Shift+Tab, focus/błędy, utrata odpowiedzi, reload lista/detal, długie nazwy i 1440/1024/768/375 | QA; frontend |

Istniejące komendy z main: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment`. Ostatni runner obejmuje izolowane lokalne DB/Auth/Data API i przeglądarkę na production build; trzeba rozszerzyć suite, a nie uznać stare testy za dowód 3B. Obecne testy odrzucające invitation należy zmienić świadomie wraz z kontraktem, zachowując testy odmowy niekwalifikującego inputu.

Środowisko planowane: przypięte w package.json Node 24.22.2 / pnpm 12.16.1, realny izolowany PostgreSQL/Auth/Data API i Playwright, syntetyczne dane A/B. Fizyczne AT i public release poza tym planem. Wszystkie testy 3B: **NOT RUN — brak implementacji**. Weryfikacja bazy Git: **PASS**. Implementacja zależna od trzech pakietów PO: **BLOCKED**. Nie wykonywano instalacji, migracji, testów produktu, commit/push/merge/deploy.


## Dopuszczenie wykonania i izolacja — 2026-10-30

Wszystkie 17 zewnętrznie zmienionych plików jest bajtowo identycznych z wersjami ac55059 (main sprzed 3A). Wyglądają na częściowe cofnięcie 3A; autor i zamiar są nieustalone. Nie jest to przesłanka do ich naprawienia. Zachowano patch i SHA256 w /private/tmp/jobs-crm-3b-isolation, a pierwotny katalog pozostaje nietknięty. Nowy worktree /private/tmp/jobs-crm-lifecycle-3b, branch feat/recruitment-lifecycle-3b, baza 94f962841cd3c669c320b8612ad2ab69aa68e2cd. Oryginał analizy skopiowano, bez przenoszenia lub usuwania go ze źródła.

DEC-055 utrwala zatwierdzenie 1A/2A/3A. Operacyjny warunek izolacji spełniony; wcześniejsze BLOCKED/NOT RUN powyżej są snapshotem planu. Nowe wyniki w osobnym raporcie 3B. Użycie nowych skills record-decision/implement-slice/verify-acceptance/review-change oraz Supabase/Context7. Istniejący ledger Drizzle ma pierwszeństwo przed ogólną procedurą Supabase CLI; bez równoległego ledgeru i mutacji persistent DEV.
