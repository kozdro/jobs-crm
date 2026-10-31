# History Corrections & Integrity — analiza SDD

Data: 2026-10-31. **DRAFT / PROPOSED — READY_FOR_OWNER_DECISION.** Autoryzowana wyłącznie analiza SDD; bez kodu, migracji, testów produktu i publikacji Git. Poniższe rekomendacje nie stanowią decyzji PO ani zgody na implementację.

## Baza i metoda

GitHub API dla [PR #16](https://github.com/kozdro/jobs-crm/pull/16) potwierdziło `state=closed`, `merged=true`, merge SHA `8729e9e180d81eea1ef9adbeb0f8330243a6304a`, head `56daf84a9bcceecfb25de1be40ac1ac976bef3d9`. Lokalny HEAD i `git ls-remote origin refs/heads/main` wskazały dokładnie merge SHA. Początkowy `git status --short` był pusty. Nie wykonywano ponownie CI 3B; zapisane wyniki PR są dowodem historycznym.

Zastosowano `analyze-requirement`, `plan-slice`, `clarify-requirements`, zasady raportowania `verify-acceptance` i [delivery](../../harness/workflows/delivery.md). Orchestrator jest jedynym autorem tego dokumentu. `spec-analyst` (/root/history_spec) przeanalizował wymagania i zależności, `qa-engineer` (/root/history_qa) przygotował macierz QA; obaj read-only, bez dalszej delegacji. Model/reasoning: odziedziczone, dokładne wartości nieudostępnione. Analiza nie jest niezależnym review implementacji ani runtime acceptance.

## Requirement — co już zatwierdzono

| ID / źródło | Status i znaczenie dla slice’a |
|---|---|
| DEC-009/022; BR-007/015/016 | APPROVED: korekta nie jest aplikowaniem, kontaktem ani zaproszeniem; data faktu odrębna od czasu zapisu, jedna historia biznesowa bez zalewu logami technicznymi. |
| FR-LC-015; AC-LC-015/-01; UC/TC-021 częściowo | Zatwierdzona możliwość poprawienia błędnego statusu bez fikcyjnych faktów. Zakres wykonawczy i audyt nadal OPEN-004/020. UC-021 obejmuje też DnD, którego tu nie planujemy. |
| FR-HE-001/002/003; AC-HE-002-01/-02 i HE-003/-01 | Zatwierdzona semantyka historii; korekta dnia zmienia chronologię i zachowuje pierwotny czas rejestracji. Edytowalność i audyt wymagają OPEN-004. |
| DEC-054/055; FR-LC-005/006/007/008/011/012/013/014 | APPROVED: istnieją cztery rodzaje faktów: application, contact, invitation, stage-change. Lokalny append-only to ograniczenie 3A/3B, a nie docelowa polityka korekt. |
| AC-LC-014-01/-02; AC-HE-001-01/002-03/002-04 | Istniejące kontrakty retry, konfliktów, paginacji, dnia/unknown i współbieżnego etapu. Nie dowodzą obsługi korekt. |
| BR-003/004/005/006; DEC-055 | Trzy aktualnie wdrożone statusy; aktywna rekrutacja wymaga kwalifikującego zaproszenia i indywidualnego etapu, wcześniejsze statusy bez etapu. Wsteczna data nie odtwarza bieżącego stanu. |
| BR-030; FR/AC-AD-002; ADR-0012; SEC-02 | APPROVED / ADR ACCEPTED: prywatność właściciela także poza BFF; audyt, rewizje i recovery muszą podlegać tej samej izolacji. |
| OPEN-004/020 | OPEN: korekta/unieważnienie/audyt i zakres ręcznej korekty statusu. OPEN-004 nadal bramką publicznego udostępnienia. |

Źródła: [DEC](../decisions/product-decisions.md), [OPEN](../decisions/open-questions.md), [BR](../domain/business-rules.md), [model](../domain/glossary-and-model.md), [lifecycle](../domain/recruitment-lifecycle.md), [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [UC/TC](../quality/scenarios.md), [traceability](../quality/traceability.md), [History & Events](../features/history-and-events.md), [UX flow contracts](../ux/flow-contracts.md), [3A](recruitment-lifecycle-3a.md), [3B](recruitment-lifecycle-3b-analysis.md). Stan dokumentu BASELINED nie zatwierdza nierozstrzygniętej semantyki.

## Najmniejszy sensowny vertical slice — PROPOSED

Własna istniejąca sprawa → wybór dowolnego wpisu 3A/3B, także wcześniejszego → korekta danych w obrębie rodzaju albo trwałe unieważnienie → podgląd różnic i skutku dla bieżącego statusu/etapu → potwierdzenie → atomowy zapis rewizji, audytu i uzgodnionego stanu → odczyt po reload na detalu i liście.

Slice obejmuje dzień faktu (także known ↔ unknown), kierunek kontaktu oraz docelową nazwę etapu zaproszenia/przejścia. Obowiązują dotychczasowe walidacje dnia i nazwy. Bez zmiany rodzaju faktu, właściciela, sprawy, pierwotnego czasu zapisu i technicznych wersji przez użytkownika. Zły rodzaj wymaga unieważnienia i osobnego zarejestrowania prawdziwego faktu, jeżeli faktycznie wystąpił.

Unieważnienie oznacza „ten wpis jest błędny”, a nie anulowanie realnego spotkania, zaproszenia lub procesu. Unieważniony wpis pozostaje widoczny z oznaczeniem, bez wpływu na bieżący stan; oryginał i kolejne rewizje są dostępne właścicielowi w szczegółach audytu. Korekty nie są nowymi biznesowymi aktywnościami. Bez fizycznego kasowania, przywracania unieważnionego wpisu, bulk i automatycznej kaskady.

To pełna pionowa ścieżka korekty wpisu i jej skutków, lecz tylko podzakres FR-LC-015: bez niezależnego dowolnego ustawiania statusu. Nie rozwiązuje całych OPEN-004/020 ani wszystkich publicznych bramek.

## Dwie niezbędne decyzje PO

### 1. OPEN-004 — zakres korekty i audytu

**A — rekomendowany, PROPOSED:** przyjąć powyższy zakres pól, korektę z zachowaniem oryginału i poprzednich wersji, terminalne unieważnienie, audyt obejmujący operację, wpis/sprawę, poprzednie i nowe wartości, zaufanego aktora i czas. Dostęp z kontekstu wpisu, bez osobnego strumienia technicznych zdarzeń w historii biznesowej. Bez nowego pola tekstowego „powód” w tym slice’ie; sam rodzaj operacji i diff są audytowalne. Nie ustala to retencji ani prawa do usunięcia danych.

**B — alternatywa:** wyłącznie unieważnianie i osobna rejestracja poprawnego faktu. Mniejszy formularz, lecz więcej pracy użytkownika i brak bezpośredniej korekty daty tego samego wpisu z AC-HE-002-01/-02. Wymaga jawnego odłożenia tej części kryteriów; nie rekomendujemy jako docelowego zamknięcia OPEN-004.

### 2. OPEN-020 i podzakres OPEN-034 — jak uzgadniać stan i zależności

**A — rekomendowany, PROPOSED:** system przedstawia deterministyczny wynik poniższych reguł; użytkownik potwierdza cały skutek. Nie wybiera arbitralnie statusu. Zapis bez aktualnego podglądu i potwierdzenia albo z osieroconą zależnością jest odrzucony bez częściowej zmiany.

| Pozostałe ważne fakty po operacji | Proponowany stan |
|---|---|
| Brak zaproszenia i przejść etapów, brak aplikacji/kontaktu | Zapisane, bez etapu. |
| Brak zaproszenia i przejść etapów, istnieje aplikacja/kontakt | Kontakt rozpoczęty, bez etapu. |
| Istnieje zaproszenie; każde zachowane przejście ma wcześniejsze zachowane zaproszenie w kolejności zastosowania | W rekrutacji; etap z ostatniego ważnego zaproszenia lub przejścia w pierwotnej kolejności zastosowania, z uwzględnieniem korekty jego nazwy. |
| Przejście etapu traci wcześniejszą ważną podstawę zaproszenia | Odmowa unieważnienia zaproszenia; wskazanie zależnych wpisów. Bez kaskady, dopisywania podstawy ani zmiany prawdziwych faktów. |

Kolejność zastosowania nie jest kolejnością `occurred_on`, czasem korekty ani arbitralnym sortem UUID. Dla istniejących komend etapowych 3B zachowano kolejność przez `expected_stage_version`. Trzeba ją zachować przy korektach; nie budować pełnego event sourcingu. Zmiana samego dnia nigdy nie zmienia bieżącego stanu. Korekta wcześniejszej nazwy nie zastępuje późniejszego bieżącego etapu. Unieważnienie najnowszego przejścia odsłania poprzednie ważne ustawienie dopiero po podglądzie i potwierdzeniu.

Przykład zależności: zaproszenie A → przejście B → zaproszenie C. Samo istnienie C nie wystarcza do unieważnienia A, bo B utraciłoby wcześniejszą podstawę. Jeśli B też było błędne, użytkownik może osobno unieważnić B, a potem A. Jeśli B było prawdziwe, trzeba najpierw wyjaśnić brakującą prawdziwą podstawę; system nie dopisuje jej sam. Ten slice świadomie nie oferuje zbiorowej naprawy ani rejestrowania dawnych etapów bez wpływu na bieżący stan.

Późniejsze `previous_stage` pozostają oryginalnymi snapshotami tego, co system widział podczas rejestracji. Nie są ponownie wykonywanymi warunkami ani polami edytowalnymi; UI rozróżnia je od skorygowanych danych i wskazuje powiązane korekty/unieważnienia. Zmiana starszej nazwy nie może po cichu przepisać całego łańcucha.

**B — alternatywa:** oddzielna ręczna korekta statusu/etapu po edycji wpisu. Wymaga szerszej macierzy legalnych stanów, obsługi okresu niespójności i reguł walidacji wobec zachowanych faktów. Większy zakres i ryzyko; rekomendujemy atomowy wariant A.

Nie pytamy ponownie o kwalifikację zaproszenia, trzy wdrożone statusy, walidację etapu/dnia ani owner isolation: to istniejący baseline. Oba pakiety są propozycjami; brak odpowiedzi nie jest zatwierdzeniem. Implementacja wymaga później osobnego zlecenia.

## Impact analysis i granice techniczne

- **Persystencja/DATA-01:** obecne migracje 0007/0008 i `db/recruitment/schema.ts` obsługują append-only fakty. Potrzebny addytywny model rewizji/unieważnień i atomowe uzgodnienie stanu; fizyczny schemat dopiero po decyzji. Zachować UUID, oryginalny payload, czas zapisu, request-id i historię. Bez edycji zastosowanych migracji, wymyślonych korekt/backfillu i resetu persistent DEV.
- **Integralność:** obecne `stage_version=0` dla wcześniejszych statusów wymaga szczególnej uwagi przy cofnięciu i ponownym wejściu: nie wolno ponownie uwiarygodnić starego zamiaru (ABA). Potrzebna monotoniczna kontrola współbieżności sprawy i wpisu obejmująca korekty oraz konkurencyjne fakty 3A/3B. Nie traktować obecnej wersji etapu jako gotowej rewizji całej historii. Dowolna zmiana wpływająca na preview unieważnia potwierdzenie. Stare komendy muszą też respektować nowy mechanizm; sam guard nowego formularza nie wystarczy.
- **Retry/recovery:** oryginalne klucze zamiaru pozostają zużyte po korekcie/void. Replay utworzenia zwraca oryginalny rezultat, bez przywrócenia wpisu lub stanu; UI osobno odczytuje aktualną wersję. Replay korekty po następnej korekcie również nie stosuje ponownie starego skutku. Ten sam klucz/inny payload konfliktuje. Rozdzielić potwierdzenie historycznego wyniku od komunikatu o aktualnym stanie.
- **Backend/BFF/DB:** `src/modules/recruitment/{domain,application}/case-events.ts`, odczyt spraw, commands/recovery, triggery i uprawnienia wymagają wspólnego kontraktu. Obecne guardy uzasadniają zmianę stanu realnym faktem; nie wolno ich po prostu wyłączyć ani otworzyć PATCH/DELETE. Nowa kontrolowana ścieżka musi zapewnić audyt+stan w jednej transakcji również poza UI/BFF.
- **Bezpieczeństwo/SEC-02:** audyt zawiera dawne wartości, więc jest prywatny tak samo jak historia. A own list/detail/audit/recovery, B/anon odmowa i brak count/ID/metadata leak. Walidować relacje owner–case–event–revision, chronić aktora/czas przed spoofingiem i redagować logi. Zachować ADR-0012 i obecne Origin/auth/account binding, bez service-role w user path. Uwzględniono skill Supabase jako kontrolę granic; nie zmieniamy architektury ani nie używamy cloud. Nowy istotny wybór architektoniczny wymagałby osobnego ADR, nie jest domyślnie zatwierdzony tym dokumentem.
- **UX:** menu wpisu, formularz zgodny z istniejącym Blueprintem/visual language, before/after i skutek status/etap, cancel/no-write, konflikt bez cichego rebase, utrata odpowiedzi, audyt i wyraźny void. Znane dni nadal sortują oś, unknown pozostaje oznaczone; paginacja nie może udawać kompletnej lub pustej historii po błędzie. Liczba aktywności nie rośnie od technicznych rewizji.
- **Import/Search/relacje:** brak implementacji i nowych integracji. Przyszłe moduły muszą rozróżniać ważne dane i audyt; nie propagować korekty do nieistniejących kontaktów/CV/kalendarza. Bez wysyłki komunikacji, auto-close, scalania duplikatów i automatycznego potwierdzania spotkań.

## Warunkowy plan wykonania — obecnie BLOCKED

Metadane: model/reasoning odziedziczone, dokładne wartości nieudostępnione; bez dalszej delegacji. Właściciele mają rozłączne zakresy zapisu. Po decyzjach plan należy doprecyzować względem aktualnego SHA, bez rozszerzania autoryzacji.

| Krok / rola | Zakres przyszłego zapisu | DoD |
|---|---|---|
| 1. Orchestrator | DEC/OPEN, BR/FR/AC, feature history/lifecycle, UX, scenarios/traceability, DATA-01 i kontrakt slice’a | Rzeczywiste decyzje PO utrwalone przez record-decision; częściowe domknięcie bramek, konkretne AC; osobna zgoda na kod. |
| 2. UX designer + QA (projekt teraz zaplanowany) | UX kontrakt przez orchestratora; QA wyłącznie testy jak niżej | Preview/audyt/void, zależności, recovery, mobile/focus; kontrakt testów przed implementacją. |
| 3. Backend engineer | db/recruitment/**, src/modules/recruitment/**, src/app/recruitments/commands/**; własne unit | Atomowość, immutable oryginały, odczyty i retry, monotoniczna współbieżność; bez zmiany wcześniejszych migracji. |
| 4. Frontend engineer | src/components/recruitment/**, src/app/recruitments/[id]/page.tsx i lista, własne unit | Pełna pionowa ścieżka z nowym potwierdzeniem po konflikcie i aktualnym stanem po recovery. |
| 5. QA engineer | tests/integration/recruitment/**, tests/e2e/recruitment-*.spec.ts; scripts/recruitment/runner.ts tylko jeśli potrzebne | Implementuje i uruchamia nowe testy, upgrade i regresje na własnym izolowanym targetcie. |
| 6. Backend/frontend/security reviewers | Bez zapisu; osobni rodzice read-only przez harness/scripts/review.py | Niezależne review dokładnego zamrożonego kandydata; poprawki wracają do autorów, potem dotknięte testy/review. |
| 7. Orchestrator | Raport, traceability i dokumentacja w powyższym zakresie | Rzeczywiste SHA/komendy/dowody/statusy, brak blokujących findings; Git/publication tylko po autoryzacji. |

## Macierz QA — PLANNED / NOT RUN

| Podstawa | Przypadki i poziom |
|---|---|
| AC-HE-002-01/-02/-03/-04 | Known ↔ unknown, poprawny/przyszły dzień, granice kalendarza; zmiana kolejności osi bez zmiany czasu zapisu i stanu. Unit + DB + E2E. |
| AC-HE-003/-01; BR-016 | Korekta direction/nazwy bez nowego faktu; odmowa retype/zmiany case/owner; audyt before/after i zaufane czasy. Unit + DB + E2E. |
| AC-LC-013/015/-01; UC/TC-021 częściowo | Void jedynego/jednego z wielu kontaktów, aplikacji, zaproszeń, najnowszego/starszego przejścia; trzy wyniki tabeli i jawne potwierdzenie. DB + E2E. |
| BR-005/006/007; DEC-055 | Invite A → stage B → invite C; odmowa void A przy osieroceniu B; brak kaskady; void błędnego B potem A. Korekta starej nazwy vs bieżący etap i nieprzepisywanie previous_stage. DB + E2E. |
| AC-LC-014-01/-02 + nowe AC po PO | Retry/konflikt payloadu/lost response, stare create/replay po void i korekcie, replay starszej korekty; żaden nie przywraca stanu. DB + E2E. |
| Nowe AC współbieżności po PO | Korekta–korekta, korekta–void, void–każdy nowy fakt 3A/3B, stale entry/case, ABA po cofnięciu i ponownym wejściu; konflikt bez częściowego audytu/stanu. Realne równoległe requesty DB. |
| FR/AC-AD-002; BR-030; SEC-02 | A own write/read/list/direct ID/audit/recovery; B/anon odmowa i brak wycieku przez count/relacje/metadata; spoofing, obce relacje i bezpośredni Data API/PATCH/DELETE. Real Auth/RLS + BFF. |
| DATA-01; regresje DEC-052/054/055 | Upgrade prawdziwego starego schematu z syntetycznymi danymi, zachowanie oryginałów/UUID/kluczy; rollback audyt+stan; create nadal Zapisane bez historii; brak komunikacji, auto-close i fikcyjnego backfillu. DB + E2E. |
| UX/DEC-053; AC-HE-001-01 | Reload list/detail, dostępność audytu, oznaczony void, cancel/no-write/return focus, draft po konflikcie, unknown result, paginacja po zmianie daty, klawiatura i małe ekrany. E2E + ogląd wizualny. |

Developerzy piszą unit, QA integrację/E2E/upgrade; niezależni reviewerzy nie zastępują wykonania testów. Istniejące polecenia do przyszłego rozszerzonego kandydata: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment`. Środowisko: przypięte Node 24.22.2 / pnpm 12.16.1, syntetyczne A/B/anon, izolowany lokalny runner Auth/Data API/PostgreSQL i przeglądarka, bez resetu persistent DEV. Samo przejście starych testów nie dowodzi korekt.

Luka traceability: UC/TC-021 i AC-LC-015/HE-002/HE-003 nie opisują jeszcze pełnych rewizji, void, zależności, audytu i recovery. Po decyzjach uzupełnić konkretne podkryteria i podscenariusze, bez zmiany znaczenia istniejących ID. Ostrzeżenia append-only AC-HE-003-02/-03 zachować jako historyczny kontrakt 3A/3B i opisać nowy przyrost oddzielnie.

## Status i odłożony zakres

- **PASS:** potwierdzenie merge PR #16, zgodność lokalnego HEAD i remote main; analiza źródeł i przygotowanie planu z udziałem spec/QA.
- **NOT RUN:** testy nowego zachowania, runtime, migracje i niezależne review implementacji — brak kodu i autoryzacji implementacyjnej. Historyczne wyniki 3B nie są PASS tego slice’a.
- **BLOCKED:** wykonanie zależne od dwóch pakietów decyzji PO i osobnego zlecenia implementacji. Sama analiza jest ukończona.
- Poza zakresem: niezależny PATCH statusu, Zakończone/wyniki/wznowienia OPEN-001/019/029, globalne/default etapy OPEN-003/027, pełne OPEN-034, kalendarz OPEN-021/037, import/Search/Kanban/DnD, kontakty/CV/notatki, hard delete/restore, retencja/kasacja kont, publiczne Auth/privacy/OPS i deployment. Te bramki nie blokują analizy, lecz pozostają przed właściwymi funkcjami lub udostępnieniem.

## Dopuszczenie wykonania — 2026-10-31

**APPROVED warianty 1A/2A — DEC-056.** Historyczne PROPOSED/BLOCKED powyżej opisuje etap analizy. PO w kolejnym poleceniu zatwierdził oba rekomendowane warianty i pełną implementację, QA, niezależne review, dokumentację i osobny PR; bez merge/deploymentu, persistent DEV i cudzych zmian. Wykonanie w izolowanym worktree `/private/tmp/jobs-crm-history-integrity`, branch `feat/history-corrections-integrity`, baza `8729e9e180d81eea1ef9adbeb0f8330243a6304a`. Oryginalny katalog i jego dwa dokumentacyjne zmienione pliki zachowane.
