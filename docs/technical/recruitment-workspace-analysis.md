# Recruitment Workspace — analiza SDD i plan

**2026-10-31 · APPROVED 1A/2A — DEC-059.** PO zatwierdził warianty 1A/2A i pełną implementację, QA, niezależny review, dokumentację oraz osobny PR. Bez merge/deploymentu i bez persistent DEV. Pierwotna analiza poniżej zachowuje warianty jako historię; obowiązują wyłącznie 1A/2A. Wyniki wykonania raportowane osobno.

## Baza i źródła

GitHub potwierdził PR [#19](https://github.com/kozdro/jobs-crm/pull/19): `merged=true`, merge `837257b5ecb5e9702b8158c49e9ebc19662d7dcd`, 2026-10-31 18:57:27 UTC. Lokalny `main` wskazuje ten sam commit; przed analizą drzewo czyste. Treść opisu PR „bez merge” jest historyczna; status GitHub potwierdza późniejszy merge.

| Podstawa | Status i wpływ |
| --- | --- |
| [DEC-019/020/021](../decisions/product-decisions.md) | APPROVED: domyślny Kanban, lista, cztery statusy, zwinięte Zakończone, odrębny etap, drawer, pełna strona i jawne akcje lifecycle. Nie otwieramy ponownie tych wyborów. |
| DEC-049 | DEFERRED: własne zapisywane konfiguracje filtrów poza MVP. |
| DEC-052/053 | APPROVED: istniejący RecruitmentCase/create/read oraz Visual Language. |
| DEC-054–058 | APPROVED: istniejące fakty, zaproszenia/etapy, korekty, zakończenia/wznowienia i Companies & Contacts; zachowujemy ich kontrakty. |
| [FR/AC-RW-001–007/009](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md) | Kierunek zatwierdzony; dokładny pakiet RW-006 i ograniczony drawer wymagają decyzji poniżej. |
| FR/AC-RW-008/010/011 | DnD poza proponowanym wykonaniem; istniejąca centralna historia pozostaje. Kontekst detalu tylko w rzeczywiście wdrożonym zakresie; bez pełnego pokrycia RW-011. |
| [BR-003/005/006/007/008/011/015/016/018/019/027/028/030](../domain/business-rules.md) | Obowiązujące niezmienniki: stan i etap osobno, brak fikcyjnych faktów, prywatność i poprawna tożsamość relacji. Późniejsze aneksy lifecycle rozstrzygają lokalny podzakres historycznych OPEN. |
| [UC/TC-027](../quality/scenarios.md), [traceability RW](../quality/traceability.md) | Główny scenariusz przeglądania. Regresje UC/TC-001/005/008/012/013/021/034 w faktycznie wdrożonym zakresie; bez deklarowania pełnego TC-027/034. |
| [UX-002–005](../ux/screen-blueprints.md), [F05/F06](../ux/flow-contracts.md), [wybory 1.17–1.21](../ux/blueprint-decisions.md), [Visual Language](../ux/visual-language.md) | Istniejący kontrakt interakcji i wyglądu; nie nowy redesign. |
| [ADR-0002/0012](../decisions/adr/README.md) | ACCEPTED: zachowanie istniejącej architektury i zaufanego kontekstu użytkownika, bez rebaseline Auth. |

## Rekomendowany najmniejszy przyrost

**Workspace do przeglądania spraw:** wspólny odczyt istniejącego RecruitmentCase i jawnych relacji CC; Kanban/lista, filtry, sortowanie, gotowe widoki oraz podgląd tylko do odczytu. Operacje biznesowe pozostają na istniejącej pełnej stronie. Wartość: szybkie znalezienie sprawy i poznanie kontekstu bez zmiany lifecycle.

- Kanban ma cztery zatwierdzone kolumny; Zakończone początkowo zwinięte. Lista przedstawia ten sam filtrowany zbiór, niezależnie od sposobu stronicowania.
- Karta/wiersz: rzeczywisty tytuł, status, istniejący bieżący etap i jawne powiązania organizacji z rolami. Wiele organizacji nie oznacza jednego domyślnego pracodawcy; agencja nie jest domniemanym pracodawcą. Braki nie są uzupełniane fikcyjnymi wartościami.
- Drawer: tytuł, status/etap, istniejący opis/źródło, jawnie powiązane firmy/osoby, zwięzły podgląd prawdziwej historii według istniejącej chronologii, link do pełnej sprawy. Podgląd historii oznacza fragment, nie pełną oś ani ranking „ostatniej aktywności”. Bez edytora notatki, akcji lifecycle, edycji relacji i fikcyjnych zadań/terminów.
- Overlay desktop nie zwęża tablicy; przełączanie przez dostępne karty, X/Escape, puste tło nie zamyka. Mobile: pełnoekranowy podgląd z Wstecz. Powrót z detalu odtwarza reprezentację, filtry, sortowanie, rozwinięcie Zakończonych i scroll; drawer zamknięty. Wejście bezpośrednie nie fabrykuje poprzedniego kontekstu.
- Kontynuacja istniejącego jasnego shellu, tokenów, typografii i petrol; bez nowej palety per moduł, KPI i dekoracyjnych paneli. Status nie jest kodowany samym kolorem.
- Osobne stany: ładowanie, brak spraw, brak dopasowań, błąd odczytu, niedostępny rekord i zmiana danych podczas przeglądania. Stara odpowiedź nie może nadpisać podglądu nowszego wybranego ID.

## Dwie decyzje PO — warianty PROPOSED

### 1. Granica pierwszego wykonania

**1A — rekomendowane:** powyższy przyrost prezentacyjny, drawer read-only, bez DnD/reorder. Lifecycle dostępny na istniejącej pełnej stronie. To częściowe pierwsze pokrycie operacyjnego drawera; FR-RW-008 pozostaje do kolejnego slice'a, nie jest usuwany z produktu.

**1B:** dodatkowo kontekstowe akcje lifecycle i DnD jako wejście do istniejących procesów biznesowych. Większy zakres: macierz dozwolonych kierunków, potwierdzenia/preview, cancel, dirty state, konflikty, retry/recovery i równoważna obsługa klawiaturą. Wymaga osobnego doprecyzowania kontraktu przed implementacją tej części.

DnD nie jest prezentacyjnym sortowaniem: może inicjować komendę, ale nie dowolny PATCH statusu, automatyczne zaproszenie, zakończenie ani korektę administracyjną. Do W rekrutacji obowiązuje zatwierdzone kwalifikujące zaproszenie; do Zakończone jawny wynik i właściwe reguły 3C. Wznowienie ma istniejący preview ważnych faktów. Cancel/brak danych/konflikt nie zmieniają sprawy. Nieobsługiwany kierunek nie uzasadnia nowego zdarzenia. Nie pytamy ponownie o zatwierdzony słownik wyników lub atomowy krok 3B.

### 2. Dokładny pakiet OPEN-028

**2A — rekomendowane:**

- Filtry: statusy (OR wewnątrz wyboru), jedna wskazana organizacja, jedna wskazana osoba; między grupami AND. Organizacja/osoba oznaczają bezpośrednią aktywną relację ze sprawą, bez tranzytywnego wnioskowania przez organizację. Filtr organizacji obejmuje jej jawne role; pokazujemy je w kontekście.
- Sort: czas dodania `created_at` malejąco lub rosnąco, domyślnie od najnowszych; stabilne rozstrzygnięcie remisu po ID. To data techniczna dodania, nie data aplikacji ani aktywności. W Kanbanie ten sam porządek wewnątrz kolumn.
- Gotowe widoki: Wszystkie (domyślnie), Aktywne (trzy niezakończone statusy), Zakończone. Preset ustawia grupę statusów, zachowuje organizację/osobę i sort; ręczna zmiana statusów aktualizuje oznaczenie presetu. Jawne wyczyszczenie przywraca Wszystkie i domyślny sort. Wybór Zakończone rozwija tę kolumnę, aby wynik był dostępny.

**2B:** rozszerzenie o filtr etapu i wynik zakończenia; większy kontrakt dla identycznych nazw indywidualnych etapów, pustych wartości i wyniku ostatniego vs poprzednich zakończeń. Wymaga doprecyzowania tych znaczeń przed zależnym wykonaniem. „Ostatnia aktywność” nadal poza tym pakietem (OPEN-039); techniczne korekty nie są aktywnością biznesową.

## Wpływ i bramki

- **Odczyt i pełność:** obecne `src/modules/recruitment/application/cases.ts` zwraca 25+1 spraw od najnowszych. Nie wolno filtrować/grupować wyłącznie bieżących 25 jako całego Workspace. Filtry i sort działają przed paginacją na całym własnym zbiorze. Proponowany kontrakt: lista stronicowana; Kanban niezależnie stronicowany per status z jawnym Dalsze wyniki. Zmiana filtra/sortu resetuje strony. Nie dodajemy biznesowego limitu liczby spraw; liczniki, jeśli użyte, muszą oznaczać rzeczywisty zakres, nie wielkość pierwszej strony. Dobór technicznej wielkości strony jest odwracalnym wyborem wykonawczym.
- **Relacje:** M:N bez duplikowania spraw po joinach, bez N+1 na każdą kartę. Filtry i lookupy obejmują też profile poza pierwszą stroną katalogu. Brak relacji i błąd odczytu relacji mają różne znaczenie; nie przedstawiać błędu jako potwierdzonego braku.
- **Dane/historia:** brak nowych pól domenowych, zdarzeń, mutacji relacji, zamknięć i korekt. Snapshoty przed/po dowodzą, że prezentacja nie zapisuje danych. Nie oczekujemy migracji domenowej; ewentualny indeks/read RPC musi mieć wykazaną potrzebę, zachować RLS i przejść review.
- **Prywatność:** własne sprawy, profile, relacje, liczniki i podgląd po ID; brak ujawnienia cudzych filtrów/etykiet/metadanych. Zaufana tożsamość według istniejących ADR, bez service-role w ścieżce użytkownika. Prywatny cache HTML/RSC/API i czyszczenie kontekstu przy zmianie konta. Nie zapisywać treści spraw, nazw i historii w dodatkowym browser storage/logach. Powrót nie wymaga zapisanego widoku domenowego.
- **Import/Search:** bez fetch URL, importu, Global Search i lokalnego wyszukiwania historii. OPEN-038 nie blokuje prostych filtrów po ID; nie ustanawiamy semantyki pełnotekstowej.
- **OPEN:** OPEN-028 i dotknięty podzakres OPEN-017 wymagają wyborów 1/2. OPEN-033 nadal dla pełnej macierzy urządzeń/AT. OPEN-018/001/020/034 są już częściowo rozstrzygnięte przez 3B/korekty/3C; nie blokują ponownie istniejących operacji. OPEN-029 pozostaje dla przyszłych zadań/kalendarza. OPEN-005/013/032/041–046 nie są zamykane; publiczne wdrożenie poza zakresem.

## Plan po decyzji i odrębnej autoryzacji implementacji

Metadane: orchestrator `/root`; bieżąca analiza: `workspace_spec` (spec-analyst), `workspace_ux` (ux-designer), `workspace_qa` (qa-engineer), bez dalszej delegacji i zapisu przez agentów. Model/reasoning dziedziczone, dokładny identyfikator runtime **NOT EXPOSED**. Skills: analyze-requirement, plan-slice, clarify-requirements; pomocniczo supabase dla checklisty istniejącej granicy prywatnego odczytu. Nowe zadania zachowają te metadane lub podadzą ujawnione wartości.

| Krok / właściciel | Rozłączny zakres zapisu | DoD / przekazanie |
| --- | --- | --- |
| 1. Orchestrator/spec | DEC, OPEN, FR/AC, scenariusze/traceability, niniejszy plan | Zapisać rzeczywistą decyzję PO przez record-decision; doprecyzować mierzalne AC i częściowe pokrycie. Bez podnoszenia całych OPEN do RESOLVED. |
| 2. UX | Proponowany `docs/ux/recruitment-workspace-slice.md` | Stany, kontrakt desktop/mobile, focus i przywracanie kontekstu według Blueprintu; handoff przed frontendem. |
| 3. Backend engineer | `src/modules/recruitment/application/` (proponowany `workspace-read.ts`), własne unit; ewentualny jawny read endpoint, bez kolizji z frontendem | Walidowane query, pełność wyników, relacje, stabilny sort i RLS; brak nowych komend zapisu. Backend przekazuje kontrakt UI/QA. |
| 4. Frontend engineer | `src/app/recruitments/page.tsx`, komponenty recruitment/workspace, ograniczony powrót z `[id]/page.tsx`, własne unit | Kanban/lista, kontrolki, drawer, stany i dostępność; bez przepisywania lifecycle. Nowe pliki komponentów ustalić w task packet. |
| 5. QA | Nowe `tests/integration/recruitment/workspace.test.ts`, `tests/e2e/recruitment-workspace.spec.ts`; integracja z `scripts/recruitment/runner.ts`/config po uzgodnieniu własności | Pisze i uruchamia macierz poniżej, nie tylko opisuje testy. Developerzy zachowują własne unit. |
| 6. Niezależni reviewerzy | Brak zapisu; backend/frontend/security przez `harness/scripts/review.py` z osobnym rodzicem read-only | Oceniony zamrożony kandydat i brak zmian po review; autor poprawia findings, QA ponawia dotknięte testy. |
| 7. Orchestrator | Raport, QA, traceability i dokumentacja zachowania | Exact-SHA/manifest, natural exit 0, uczciwe statusy, brak blockerów. Git/PR/merge/deployment tylko według przyszłej jawnej autoryzacji. |

## Macierz QA — PLANNED / NOT RUN

| AC / ryzyko | Dowód do wykonania | Autor / reviewer / środowisko |
| --- | --- | --- |
| RW-001–004 | Kanban default, 4 kolumny, zwijanie Zakończonych, etap osobno, brak piątego statusu | QA browser / frontend / produkcyjny lokalny HTTPS |
| RW-005–007 | Równoważny pełny zbiór ID, kombinacje filtrów, presety/reset, oba sorty/remisy, brak zapisanych konfiguracji | Developer unit + QA integracja/browser / backend/frontend |
| Pełność i M:N | Ponad 25 spraw globalnie i w jednej kolumnie, wszystkie strony i profile filtrów, brak duplikacji; brak arbitralnej firmy/wnioskowania osoby przez firmę | QA real Auth/Data API / backend |
| RW-009, TC-027 częściowo | Dokładny ID, przełączanie i wyścigi odpowiedzi, error/retry, drawer→detal→powrót z kontekstem, wejście bezpośrednie | QA browser / frontend |
| RW-006, BR-007/016 | Snapshot statusu/etapu/historii/closure/relacji przed i po wszystkich kontrolkach; brak mutujących requestów Workspace | QA integracja/browser / backend/security |
| AD-002, BR-030 | A dostęp; B/anon brak listy/ID/relacji/etykiet/liczników; cudzy organization/contact ID jako filtr bez ujawnienia istnienia; także bezpośrednia granica RLS | QA real JWT/Data API + browser / security/backend |
| Prywatność/sesja | HTML/RSC/API private/no-store, expiry/refresh, logout→B/back/reload bez danych A, brak nowych PII w storage/logach | QA produkcyjny HTTPS / security |
| UX / NFR-005 częściowo | 1440/1024/768/375, 320 reflow, tekst 200%, klawiatura, widoczny focus i powrót; desktop niemodalny bez focus na zasłoniętych elementach, mobile pełny ekran | QA browser / frontend; fizyczne urządzenia/AT osobno |
| Regresje | Create/read, lifecycle 3A/3B/3C, korekty i relacje CC, bez zmiany semantyki lub duplikacji zdarzeń | QA istniejące suite / backend/frontend/security |

Istniejące komendy na przyszły gate: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment`. Runner obejmuje build i realne integracje/production HTTPS browser; nowy test musi być rzeczywiście do niego dołączony. Node 24.22.2 / pnpm 12.16.1, własny izolowany target i dane syntetyczne, bez resetu persistent DEV i naruszania cudzych zasobów. Przed wykonaniem aktualna dokumentacja wymaganych API przez Context7; ta analiza nie zmienia API ani konfiguracji bibliotek.

## Historyczny wynik etapu analizy

- Potwierdzenie merge i lokalnej bazy: **PASS** (GitHub metadata + Git).
- Analiza wymagań, UX i plan testów: wykonane; rekomendacja **PROPOSED / READY_FOR_OWNER_DECISION**.
- Testy nowego Workspace i niezależne review implementacji: **NOT RUN** — brak implementacji, etap SDD.
- Implementacja zależna od wyborów: **BLOCKED** do decyzji i osobnej autoryzacji wykonania. Nie oznacza to blokady zakończonej analizy.
- Zmienione pliki: niniejszy dokument i link w `docs/README.md`. Bez kodu, migracji, konfiguracji, commit/push/PR ani deploymentu. Nowy ADR nie jest potrzebny dla przedstawionej propozycji użycia istniejącej architektury.

## Autoryzacja wykonania — DEC-059

PO zatwierdził 1A/2A w kolejnym poleceniu i autoryzował wykonanie oraz osobny PR. Historyczne statusy analizy NOT RUN/BLOCKED powyżej nie opisują wyników późniejszej implementacji. OPEN-017/028 częściowo rozstrzygnięte, pozostałe granice zachowane.

## Documentation sources for implementation

Context7 resolve-library-id -> query-docs (2026-10-31): /vercel/next.js for Link/useSearchParams/router scroll:false; /supabase/supabase for joins and SSR cookie handling. Official references: https://nextjs.org/docs/app/api-reference/components/link, https://nextjs.org/docs/app/api-reference/functions/use-search-params, https://supabase.com/docs/guides/database/joins-and-nesting, https://supabase.com/docs/guides/auth/server-side/creating-a-client. Inner embeddings filter parent rows; left embeddings alone do not. Request-scoped clients propagate SDK cookies/cache headers. No library upgrade or auth architecture change.
