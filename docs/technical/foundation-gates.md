# Foundation — decyzje, OPEN i pierwszy slice biznesowy

**Stan:** plan `PROPOSED`, aktualizacja 2026-10-29 po decyzji PO Supabase-native. Dokument pomocniczy do [Foundation Plan](foundation-plan.md); nie zmienia pełnych statusów FR/OPEN. Analiza rebaseline: spec-analyst, autor aktualizacji: orchestrator. Model/reasoning delegacji z runtime albo NOT EXPOSED. Zastosowano analyze-requirement i plan-slice.

## Podstawa i granice zatwierdzenia

[Technical Discovery 1.1–1.40](discovery-decisions.md) zachowuje historię wyborów APPROVED; 1.26 jest częściowo SUPERSEDED przez 1.40 B. Rebaseline 2026-10-29 zastępuje części TD1.7/1.8 i kontrakt ADR-0003 przez ACCEPTED [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md). Inne statusy ADR pozostają; F1/F2 wykonane zgodnie z ich raportami, F3 i import RPC NOT RUN. Nie otwieramy ponownie wybranych technologii.

| Podstawa | Status i zastosowanie w Foundation |
| --- | --- |
| TD 1.1–1.3; ADR-0002/0012 | `APPROVED / ACCEPTED`: SQL, stan/historia/audyt osobno, owner-scoped shared schema; techniczny model PoC nie jest RecruitmentCase. |
| TD 1.4–1.11, 1.33, 1.38 z aneksem; ADR-0012 | `APPROVED / ACCEPTED`: Supabase-native Auth/SSR, e-mail/hasło + Google PKCE, signup/reset e-mail, wiele urządzeń, local/global/others, JWT do expiry; user JWT/Data API/RLS i Drizzle. Bez HttpOnly-only, brokera i arbitrary-other-session revoke. Szczegóły polityk OPEN. |
| TD 1.12–1.20; ADR-0004/0009 | `APPROVED / ACCEPTED`: private Storage, immutable versions, kontrolowane usuwanie, CSV/XLSX i osobne pliki, irreversible self-delete, niezależny deletion ledger, 7 dni retencji, cele RPO ≤ 1 h i RTO ≤ 24 h. Retencja szczegółowa i dowód restore nadal wymagane. |
| TD 1.21, 1.34–1.36; ADR-0007/0009/0010 | `APPROVED / ACCEPTED`: monitoring/logi/alerty, Render Web Service + Worker, pgmq, testy/CI, local + production; staging później. Koszty i zasoby bez autoryzacji nie powstają. |
| TD 1.22–1.27, 1.40; ADR-0006 | `APPROVED` z zastąpieniem 1.26: HTTP-first/headless warunkowo, wyłącznie zatwierdzona i przetestowana allowlista; inne adresy ręcznie, bez fetch; bez automatycznego scalania. Nie jest częścią początkowych PoC. |
| TD 1.28–1.30; ADR-0005 | `APPROVED / ACCEPTED`: preview/mapowanie w pamięci, jeden atomowy commit SQL, trwała idempotencja bez stagingu wierszy; wymaga dowodu RPC/rollback/retry w slice importu; nie wymaga dużego osobnego PoC przed CRUD. |
| TD 1.31/1.32/1.37; ADR-0001 | `APPROVED / ACCEPTED`: modular monolith Next.js/React/TypeScript, App Router i natywne API, warstwy domain/application/infrastructure. |
| TD 1.39; ADR-0008 | `APPROVED / ACCEPTED`: PostgreSQL FTS/GIN. Nie oznacza zgody na projekt indeksów lub rankingu przed schematem i OPEN-038. |
| FR-AD-002, BR-030, NFR-001 | `APPROVED` niezmiennik prywatności: dowody techniczne A/B wspierają wymaganie, lecz syntetyczny PoC nie jest pełnym PASS AC-AD-002 dla przyszłej aplikacji. |
| FR-AD-003–009 | Źródłowe FR zachowują `PROPOSED`, mimo wybranych wariantów technicznych/samoobsługi. Nie podnosimy ich statusu i nie wdrażamy ich przez sam plan. |
| NFR-004/006–011 | W katalogu nadal `OPEN`; TD rozstrzyga określone mechanizmy i cele, nie wszystkie wartości/polityki ani runtime. NFR-005 pozostaje `OPEN`. |

Pozostałe źródła: [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [BR](../domain/business-rules.md), [DEC](../decisions/product-decisions.md), [NFR](../requirements/nonfunctional-requirements.md), [bramki techniczne](gates-and-impacts.md). Rozbieżność redakcyjna starszych UX/FR z późniejszym TD nie jest zgodą na arbitralne dopisanie polityki: stosujemy jawne częściowe rozstrzygnięcia z [rejestru OPEN](../decisions/open-questions.md).

## Macierz wszystkich OPEN

Każdy poniższy identyfikator zachowuje **`OPEN` w nierozstrzygniętym zakresie**. Klasyfikacja opisuje zależność zadania, nie zmienia priorytetu źródłowego. Właściciel: PO dla produktu/UX/danych; PO + Tech Lead dla techniki/security/operacji.

- **I — inicjalizacja:** scaffold, statyczny shell i CI bez danych, logowania i cloud. Żaden istniejący OPEN nie blokuje tak ograniczonego PR; potrzebne jest odrębne zlecenie implementacji i zweryfikowane piny narzędzi.
- **P — PoC:** blokada wskazanego kontraktu lub przeniesienia wyniku do produktu. Izolowany eksperyment na danych syntetycznych można zaplanować i osobno autoryzować przed ustaleniem polityk produktu. Parametry testowe nie stają się ustawieniami produkcyjnymi.
- **B — biznes:** przed pierwszym RecruitmentCase/manual Quick Capture/odczytem, albo przed wskazanym rozszerzeniem biznesowym.
- **R — publiczne wydanie/rejestracja:** wymagane przed dopuszczeniem użytkowników do odpowiedniej funkcji. Lista nie znosi zakresu pełniejszego publicznego MVP (`DEC-047`).
- **D — odłożenie:** niezależne od inicjalizacji i pierwszego slice'a; nie oznacza zgody na pominięcie zatwierdzonej funkcji w publicznym MVP.

| OPEN | Klasa / najwcześniejsza zależność | Co pozostaje i warunek dalszej pracy |
| --- | --- | --- |
| OPEN-001 | B: fizyczny model sprawy/lifecycle | Słownik wyników i reguły użycia. Zachować bramkę przed modelem z gates-and-impacts; nie tworzyć domyślnego enuma. |
| OPEN-002 | B: schemat i formularz | **PARTIALLY RESOLVED DEC-052:** minimalny RecruitmentCase create/read i migracje autoryzowane. Pozostałe formularze, pola, relacje i lifecycle OPEN; nie blokuje syntetycznych PoC. |
| OPEN-003 | D → B: edycja etapów | Propagacja szablonów i konflikty; poza minimalnym save/read, przed implementacją konfiguracji etapów. |
| OPEN-004 | B: model historii/audytu | Korekta/edycja/usuwanie historii i ślad audytowy. Żaden techniczny log nie udaje aplikacji. |
| OPEN-005 | B: model relacji; R: delete | Usuwanie/archiwizacja/przywracanie i integralność relacji. Bramka modelu nie znika po schowaniu przycisku Usuń. |
| OPEN-006 | D → B: dokumenty; R | Retencja i uprawnienia usuwania plików/wersji; nie blokuje PoC RLS bez plików. Przed dokumentami i produkcyjnym restore. |
| OPEN-007 | D → B: dokumenty/import | Limity rozmiaru/liczby/typów i bezpiecznego przetwarzania; syntetyczny mały payload PoC nie ustala limitów użytkownika. |
| OPEN-008 | D → B: sugestie | Progi i wykluczenia follow-upu; bez automatycznego zamknięcia. |
| OPEN-009 | D → B: przypomnienia | Preferencje, zgody i deduplikacja; bez rzeczywistych wysyłek w Foundation. |
| OPEN-010 | D → B: import | Atomiczny wsad/rollback już wybrane ADR-0005; minimalne native RPC w slice importu. Otwarte: potwierdzenie, raport błędu/niepewnego wyniku, konflikty i undo. Brak zależności manualnego CRUD. |
| OPEN-011 | D → B: Smart Import | Allowlista jako model wybrana, konkretnych domen brak. Żaden fetch testowanych lub nazwanych portali nie jest domyślnie dozwolony. |
| OPEN-012 | I: częściowo rozstrzygnięte; pozostałe D | Stack/architektura wybrane w TD; nie blokuje scaffold. Wersje i integracje weryfikuje Foundation, bez nowego wyboru stacku. |
| OPEN-013 | F3: zależne wejścia; B/R: prywatne dane | ADR-0012 rozstrzyga Auth/SSR, browser/server i JWT expiry. Pozostają XSS/CSRF/cache, sensitive reauth i dowody SEC-01/02; żaden broker ani jego kryptografia nie są bramką. Nie blokuje niezależnych adapterów na kontrolowanych kontach. |
| OPEN-014 | F3: config secrets; R: operacje | Hosting/cele backup wybrane; koszty, DR i monitoring otwarte. Serwerowe/provider secrets chronione; brak nowych AEAD keys lub refresh-token store. Bez provisioningu w rebaseline. |
| OPEN-015 | D | Nazwa/brand poza foundation; nie projektować nowego brandu przez shell. |
| OPEN-016 | D | Monetyzacja poza Foundation. |
| OPEN-017 | B: interakcje pierwszego slice'a | Finalny design system, stany błędów, responsywność; zatwierdzony UX Blueprint zachować. Doprecyzować tylko brakujący zakres, nie projektować od nowa. |
| OPEN-018 | B: model/lifecycle | Zaproszenie vs Rozpocznij rekrutację i kwalifikujący etap. Zachować źródłową bramkę modelu, bez implementacji tej akcji w save/read. |
| OPEN-019 | D → B: wznowienie/ponowna sprawa | Reguła nowa vs wznowienie; poza minimalnym utworzeniem/odczytem. |
| OPEN-020 | B: status/historia | Zakres korekty i audyt bez fikcyjnych akcji; źródłowa bramka modelu. Nie realizować dowolnego PATCH statusu. |
| OPEN-021 | D → B: wydarzenia | Potwierdzanie po terminie, daty rzeczywiste, uczestnicy; bez automatycznego uznawania spotkania za odbyte. |
| OPEN-022 | D → B: import | Nieznane słowniki i niespójna historia; brak cichego mapowania do domyślnych wartości. Syntetyczny RPC bez słowników nie wymaga tej decyzji. |
| OPEN-023 | D → B: CSV/XLSX | Arkusze/kodowania/daty/formuły/nagłówki; brak parsera plików w technicznym RPC PoC. |
| OPEN-024 | B: Quick Capture | **PARTIALLY RESOLVED DEC-052:** owner-only identyczna nazwa lub URL, ostrzeżenie i świadoma nowa sprawa; bez merge/update. Zaawansowane podobieństwo i import nadal OPEN. |
| OPEN-025 | B: jeśli pierwszy slice zapisuje URL; D: fetch | Normalizacja i identyfikacja publikacji. URL może pozostać poza pierwszym autoryzowanym zakresem, bez zamiany tego w ograniczenie MVP. |
| OPEN-026 | B: jeśli pierwszy slice zapisuje źródło/kanał/link | Słowniki; nie narzucać wymaganych wartości lub mieszać źródła z kanałem. |
| OPEN-027 | D → B: etapy | Domyślny zestaw i kolejność. Żadnego seedowania etapów w Foundation. |
| OPEN-028 | B: dokładny odczyt/lista; D: Kanban/DnD | Zatwierdzić minimalną projekcję, kolejność i ewentualną paginację listy; nie wymyślać kompletu filtrów. DnD wymaga pozostałych lifecycle gates. |
| OPEN-029 | B: model/zamknięcie | Skutki anuluj/zachowaj/odłącz i moment zamknięcia; zachować źródłową bramkę modelu bez wdrażania closure w pierwszym save/read. |
| OPEN-030 | D → B: relacje osób | Wersjonowanie uczestników i wiarygodność historii; bez kopiowania zdarzeń między sprawami. |
| OPEN-031 | D (`DEFERRED` zakres agenta) | Przyszłe autonomiczne działania AI poza MVP; harness deweloperski nie implementuje Career Agent. |
| OPEN-032 | F3: redakcja fixture; B/R: prywatność | Retencja/eksport/delete/dokumenty i dodatkowa weryfikacja operacji wrażliwych otwarte. Akceptacja JWT do expiry nie rozstrzyga ich polityki. Nie blokuje zwykłej integracji login. |
| OPEN-033 | B: docelowe QA UI; R | Wspierane urządzenia/przeglądarki, dostępność/lokalizacja. Playwright smoke nie jest dowodem kompletnej zgodności NFR-005. |
| OPEN-034 | B: gdy model zawiera etapy; D: lifecycle | Dozwolone kombinacje status/etap; nie tworzyć ograniczeń SQL z domysłów. |
| OPEN-035 | D → B: import | Minimalny owner-scoped key/registry/fingerprint dla retry ADR-0005; otwarte: zakres, utrzymanie, identyfikacja materiału, celowe powtórzenie i UX. Bez uniwersalnego frameworka; brak zależności ręcznego CRUD. |
| OPEN-036 | D → B: dokumenty | Semantyka sent-version i usunięcia wysłanego CV; immutable versions już wybrane. |
| OPEN-037 | B: jeśli kontrakt zawiera daty realnych zdarzeń; D: kalendarz/import | Strefy i interpretacja dat; timestamp zapisu technicznego nie zastępuje daty zdarzenia. |
| OPEN-038 | D → B: Search/archiwum | Dopasowanie/ranking/paginacja/archiwum; PostgreSQL FTS wybrany, ale bez zatwierdzonych reguł rankingowych. |
| OPEN-039 | D → B: Dashboard | Statystyki i istotna aktywność; audit techniczny nie jest aktywnością biznesową. |
| OPEN-040 | D → B: zadania | Statusy zadań i rozliczanie przypomnień; poza save/read. |
| OPEN-041 | F3: zakres signup; R: publiczna rejestracja | Self-signup zatwierdzony. Pola/aktywacja/abuse przed udostępnieniem; lokalny kontrolowany signup w F3 bez publicznego otwarcia usługi. |
| OPEN-042 | F3: zależna polityka; R: sesje | Local/global/others i możliwość ważności JWT do expiry zatwierdzone. Otwarte TTL, ustawienia/komunikaty i sensitive operations. Brak selected-session/device registry i obowiązku ponownej akceptacji natywnego opóźnienia. |
| OPEN-043 | F3: reset; R: odzyskiwanie | Reset email Supabase zatwierdzony; otwarte potwierdzenia/komunikaty, bezpieczny cross-device i wpływ na inne sesje. Lokalny mail sink, live Google osobno NOT RUN bez credentials. |
| OPEN-044 | D → B: profil; R: jeśli udostępniony | Pola profilu/walidacje i wpływ na Auth; nie tworzyć profilu produktowego z przypadkowych metadanych Auth. |
| OPEN-045 | R | **CSV/XLSX + oddzielne dokumenty już wybrane**; zakres historii, ochrona/dostarczenie i analiza prawna pozostają; bez obietnicy pełnego spełnienia praw na tej podstawie. |
| OPEN-046 | D → B: delete; R: restore | Irreversible self-delete zatwierdzone; otwarte zakres, potwierdzenie/reauth, stan konta, powiązania/kopie/retencja i niezależny ledger. Wspierane mechanizmy, bez nieudokumentowanych auth.* mutations. |

**Przed F3:** akceptacja dokumentacyjnego rebaseline i odrębne zlecenie implementacji; wejścia według karty F3 w Foundation Plan. OPEN blokuje wyłącznie zależną politykę/operację, nie cały adapter. Parametry lokalnego fixture nie stają się produkcyjnym TTL. Nie zamknięto całych OPEN.

## Rekomendowane pakiety rozstrzygnięć — PROPOSED

1. **Przed zależną polityką Auth:** OPEN-013/041/042/043 rozstrzygają tylko pozostałe szczegóły signup, APP_ORIGIN/redirect/CSRF, TTL i reset/sensitive reauth. Supabase-native, scopes i JWT do expiry już zatwierdzone. Brak credentials = NOT RUN live Google, bez blokowania niezależnego lokalnego zakresu. Przed publicznym udostępnieniem potrzebne pełne adekwatne SEC-01/02.
2. **Przed pełnym RecruitmentCase:** pakiet OPEN-001/002/004/005/018/020/029 i OPEN-034 dla etapów nadal obowiązuje. Późniejszy DEC-052 jawnie zatwierdza minimalny write/read, DATA-01 i OPEN-024 tylko w podzakresie create/read, bez historii/lifecycle/relacji/delete. To źródło dopuszczenia minimalnego modelu, nie wniosek z ukrycia przycisków.
3. **Przed public release:** OPEN-013/014/032/041–046 w odpowiednich zakresach, koszty i DB+Storage DR, deletion ledger i legal/privacy. Nie pytać ponownie o dostawcę, otwarty signup, email reset, format eksportu ani irreversible delete.

## Pierwszy biznesowy vertical slice — zakres zatwierdzony później DEC-052

**Cel:** zalogowany właściciel świadomie zapisuje minimalną sprawę ręcznie i może odczytać wyłącznie swoje sprawy (lista i szczegół po ID). Przypadek startowy: „Zapisz tylko sprawę”, bez rejestrowania aplikacji lub innego zdarzenia, którego użytkownik nie potwierdził. Jest to etap wewnętrznej implementacji z DEC-047, nie redefinicja publicznego MVP.

| Zakres/kontrakt | Źródła i status | Ograniczenie oceny |
| --- | --- | --- |
| Minimalne utworzenie bez wymaganego ogłoszenia/stanowiska | FR-LC-001/AC-LC-001; FR-QC-002/AC-QC-002; DEC-001/002/029; BR-001 `APPROVED` | DEC-052 zatwierdza pola i minimalny schemat; reszta OPEN-002 pozostaje. Brak znanego pracodawcy nie może blokować dopuszczonego wariantu BR-028. Pełne FR-LC-002/AC-LC-002 obejmuje pięć wariantów i pozostaje poza pełnym pokryciem tego kroku. |
| Świadomy zapis, zachowanie kontekstu i kolejny wpis | FR-QC-009/010, AC-QC-009/010; DEC-032, BR-029 `APPROVED` | Modal/kreator, podsumowanie i toast zgodnie z UX; brak samoczynnego przejścia do detalu. |
| Bez fikcyjnej aplikacji, połączenia lub korekty statusu | BR-004/007/016/021/022, DEC-009/022/031 `APPROVED`; FR-QC-007/AC-QC-007 | Powtórzony submit/retry nie może dać dwóch spraw; to idempotencja żądania, odrębna od produktu „potencjalny duplikat” OPEN-024. Nie twierdzić, że manual-only test wykonuje URL-specific AC-QC-011. |
| Ostrzeżenie o potencjalnym duplikacie i decyzja użytkownika | FR-QC-006/007, AC-QC-006/007; DEC-031, BR-022 `APPROVED` | DEC-052 rozstrzyga minimalne ostrzeżenie; pozostały OPEN-024 trwa. Aktualizacja istniejącej sprawy FR-QC-008 wymaga oddzielnego zatwierdzonego kontraktu i może być późniejszym krokiem po jawnej autoryzacji granicy slice'a. Brak automatycznego merge. |
| Odczyt listy i własnego ID | FR-RW-005 i FR-RW-009 jako powiązane `APPROVED`; AC-RW-005/009; BR-030/NFR-001; FR-AD-002/AC-AD-002 `APPROVED` niezmiennik | Lista i minimalny detal są częściami wymagań, nie pełnym Kanban/lista/drawer/detail AC. List-only nie staje się nowym domyślnym Workspace; domyślny Kanban pozostaje zatwierdzony. |
| Globalne wejście | FR-QC-001/AC-QC-001; DEC-017/029 `APPROVED` | Quick Capture w istniejącym shellu; pełny PASS wymaga siedmiu prawdziwych modułów. Nie tworzyć martwych ekranów w celu pozorowania AC. |

**UX:** [Blueprint](../ux/blueprint.md), [decyzje UX](../ux/blueprint-decisions.md) 1.11–1.16, [flow contracts](../ux/flow-contracts.md) F02 i stosowna część F01/F05; UX-006, UX-003, UX-005. Zachować kreator Sytuacja → Dane → Działanie → Podsumowanie, opcję zapisu bez działania, minimalny formularz + Więcej szczegółów, toast z jawnym „Otwórz sprawę”. Nie nadawać propozycjom UX statusu DEC. Uzgodniony Dashboard jako pierwszy ekran po loginie (FR-DB-001) pozostaje obowiązującym kierunkiem; techniczny ekran fixture nie zastępuje go w produkcie.

**Wymagane wejścia danych:** zatwierdzony minimalny command utworzenia i read projection, pola/nullable/limity/walidacje, owner identity ze zweryfikowanego JWT, odtwarzana po stronie serwera dla jego operacji, stan początkowy i ewentualne relacje, zasady historii vs audytu, key i wynik ponowionego żądania, kontrakt błędów/konfliktu, kryteria duplikatu i jawnej decyzji, sortowanie/paginacja odczytu. Nie tworzymy nazw kolumn, enumów wyników ani migracji przed decyzjami. Brak daty rzeczywistego zdarzenia pozostaje brakiem; timestamp zapisu jest techniczny.

**Wpływ:** RecruitmentCase i Quick Capture zapisują stan; historia i audyt muszą pozostać odrębne. Company/Contact wyłącznie w zatwierdzonych relacjach minimalnego modelu, bez inferowania pracodawcy. Import, Search/FTS, dokumenty, zadania/wydarzenia, closure/reopen, wysyłka komunikacji i workerowe akcje biznesowe są poza tym krokiem; ich bramki pozostają. Bezpieczeństwo: każdy zapis/odczyt browser/server przez Data API z JWT użytkownika i selektywny BFF według ADR-0012, RLS także przy wywołaniu bez BFF; żadnego service-role w zwykłej ścieżce. UX musi pokazać prawdziwy błąd/pusty stan bez ujawniania cudzego rekordu.

**Właściciele przyszłej implementacji:** backend-engineer — zatwierdzony model/domain/application/repository/BFF i unit tests; frontend-engineer — istniejący shell, Quick Capture/lista/minimalny detal i unit tests; QA-engineer — integracyjne A/B, write/read, retries, konflikty i Playwright; niezależni backend-reviewer/frontend-reviewer oraz security-reviewer — właściwe granice; platform-engineer tylko CI/środowisko. Pliki i model/reasoning wpisać do konkretnego task packet po autoryzacji, z rozłączną własnością.

**Plan testów — wszystkie `PLANNED / NOT RUN`:** adaptacja manualnej ścieżki UC-001/TC-001 i „kolejnej sprawy” UC-029/TC-029; brak wymagania URL/stanowiska, brak automatycznego faktu aplikacji, brak zmyślonej daty; A zapisuje/odczytuje, B i anon nie odczytują ani nie modyfikują listy/ID/relacji A; owner z payloadu jest ignorowany lub odrzucany; retry/utrata odpowiedzi/równoległy submit zgodnie z zatwierdzonym kontraktem; błąd nie daje fałszywego toastu sukcesu; anulowanie nie zapisuje; kolejny wpis nie kopiuje działania; duplikat wymaga decyzji. UC-004/TC-004 obejmuje kontakt/korespondencję i nie jest w całości pokryty przez prosty save/read. UC-034/TC-034 jest źródłem scenariuszy izolacji, ale pełen zakres dokumentów pozostaje późniejszy. Komplet FR/AC/UC sprawdzić z [traceability](../quality/traceability.md) przy konkretnym planie implementacji.

**DoD przyszłego slice'a:** odrębna autoryzacja PO exact zakresu, wymagane OPEN i DATA-01 rozstrzygnięte, wykorzystywane techniczne gates F1/F2/F3 spełnione; importer-specific F4 i worker F5 nie są zależnością manualnego CRUD, brak arbitralnych pól i enumów; wykonane adekwatne unit/integration/RLS/Playwright/static/build/CI; niezależne review bez P0/P1; dokumentacja i traceability rozdzielają pełne i częściowe AC oraz NOT RUN. Nie ogłaszać całego FR-RW/FR-QC/FR-AD jako ukończonego na podstawie tego slice'a.

## Historyczny status rebaseline

Rebaseline dotyczy wyłącznie dokumentów i review/PR. Raporty F1/F2 i ich wcześniejsze PASS pozostają bez zmian; F3/Auth, F4/import RPC i nowe runtime testy są PLANNED / NOT RUN. Kontrole dokumentacji/harnessu i review raportowane osobno. Utworzono ADR-0012 i supersession ADR-0003; żaden OPEN nie został automatycznie zamknięty.


## Obecne zlecenie: DEC-052 / minimalny biznesowy create/read

PO 2026-10-29 zatwierdził wariant A i wykonanie [pierwszego slice'a](recruitment-case-first-slice.md). F3/ADR-0012 jest bazą po merge PR #11. OPEN-002/024 i DATA-01 mają **PARTIALLY RESOLVED** wyłącznie w tym podzakresie. Ze starszych opisów „przed decyzjami” nie wynika ponowna bramka PO dla już zleconych pól. OPEN-025/026/028 pozostają dla pozostałej semantyki; obecny slice ma jeden nietypowany HTTP(S) bez fetch, prostą deterministyczną normalizację i własną listę newest-first.

[Plan i analiza](recruitment-case-first-slice-analysis.md) utrzymują podział autorów, QA od początku i niezależnych reviewerów. **Weryfikacja:** NOT RUN na etapie formalizacji; rzeczywiste PASS/FAIL/NOT RUN i dokładny kandydat są w [raporcie wykonania](recruitment-case-first-slice-report.md). Pełne AC-LC/RW/QC/AD, siedem modułów, Kanban/drawer i UC/TC-001/029/034 pozostają częściowo pokryte. Historycznych raportów F1/F2/F3 nie zmieniamy.
