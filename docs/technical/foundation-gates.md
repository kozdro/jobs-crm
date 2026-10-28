# Foundation — decyzje, OPEN i pierwszy slice biznesowy

**Stan:** `PROPOSED`, 2026-10-28. Dokument pomocniczy do [Foundation Plan](foundation-plan.md); nie zmienia statusów źródłowych. Analiza: rola `spec-analyst`, natywny subagent ogólny z kanoniczną [definicją roli](../../harness/roles/spec-analyst.md), zgodnie z fallbackiem harnessu. Wybór nazwanego profilu został odrzucony przez API; nie deklarujemy załadowania adaptera TOML. Model/reasoning: `NOT EXPOSED`. Zakres autora: wyłącznie ten dokument. Zastosowano `analyze-requirement` i `plan-slice`.

## Podstawa i granice zatwierdzenia

[Technical Discovery 1.1–1.40](discovery-decisions.md) ma status `APPROVED` dla wybranych wariantów; 1.26 jest `SUPERSEDED` **w zakresie automatycznego pobierania** przez 1.40 B. Wszystkie [ADR-0001–0010](../decisions/adr/README.md) mają status `ACCEPTED`; implementacja pozostaje `NOT STARTED`. Plan nie otwiera ponownie tych wyborów.

| Podstawa | Status i zastosowanie w Foundation |
| --- | --- |
| TD 1.1–1.3; ADR-0002/0003 | `APPROVED / ACCEPTED`: SQL, stan/historia/audyt osobno, owner-scoped shared schema; techniczny model PoC nie jest RecruitmentCase. |
| TD 1.4–1.11, 1.33, 1.38; ADR-0003 | `APPROVED / ACCEPTED`: managed Auth, e-mail/hasło + Google, HttpOnly BFF, wiele urządzeń i granularne zakończenie sesji, email reset, bez własnego MFA, BFF + RLS, user JWT przez Data API. PoC ma dowieść wykonalności, nie zmienić model sesji. |
| TD 1.12–1.20; ADR-0004/0009 | `APPROVED / ACCEPTED`: private Storage, immutable versions, kontrolowane usuwanie, CSV/XLSX i osobne pliki, irreversible self-delete, niezależny deletion ledger, 7 dni retencji, cele RPO ≤ 1 h i RTO ≤ 24 h. Retencja szczegółowa i dowód restore nadal wymagane. |
| TD 1.21, 1.34–1.36; ADR-0007/0009/0010 | `APPROVED / ACCEPTED`: monitoring/logi/alerty, Render Web Service + Worker, pgmq, testy/CI, local + production; staging później. Koszty i zasoby bez autoryzacji nie powstają. |
| TD 1.22–1.27, 1.40; ADR-0006 | `APPROVED` z zastąpieniem 1.26: HTTP-first/headless warunkowo, wyłącznie zatwierdzona i przetestowana allowlista; inne adresy ręcznie, bez fetch; bez automatycznego scalania. Nie jest częścią początkowych PoC. |
| TD 1.28–1.30; ADR-0005 | `APPROVED / ACCEPTED`: preview/mapowanie w pamięci, jeden atomowy commit SQL, trwała idempotencja bez stagingu wierszy; wymaga RPC PoC. |
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
| OPEN-002 | B: schemat i formularz | Minimalne pola, obowiązkowość, formaty, limity, daty, relacje, walidacje. Nie blokuje syntetycznych tabel technicznych PoC; blokuje RecruitmentCase i jego migracje. |
| OPEN-003 | D → B: edycja etapów | Propagacja szablonów i konflikty; poza minimalnym save/read, przed implementacją konfiguracji etapów. |
| OPEN-004 | B: model historii/audytu | Korekta/edycja/usuwanie historii i ślad audytowy. Żaden techniczny log nie udaje aplikacji. |
| OPEN-005 | B: model relacji; R: delete | Usuwanie/archiwizacja/przywracanie i integralność relacji. Bramka modelu nie znika po schowaniu przycisku Usuń. |
| OPEN-006 | D → B: dokumenty; R | Retencja i uprawnienia usuwania plików/wersji; nie blokuje PoC RLS bez plików. Przed dokumentami i produkcyjnym restore. |
| OPEN-007 | D → B: dokumenty/import | Limity rozmiaru/liczby/typów i bezpiecznego przetwarzania; syntetyczny mały payload PoC nie ustala limitów użytkownika. |
| OPEN-008 | D → B: sugestie | Progi i wykluczenia follow-upu; bez automatycznego zamknięcia. |
| OPEN-009 | D → B: przypomnienia | Preferencje, zgody i deduplikacja; bez rzeczywistych wysyłek w Foundation. |
| OPEN-010 | P: RPC; D → B: import | Atomiczny commit zaakceptowanego wsadu już wybrany. Otwarte: kontrakt potwierdzenia, błędu i cofania. PoC rollback nie rozstrzyga undo importu. |
| OPEN-011 | D → B: Smart Import | Allowlista jako model wybrana, konkretnych domen brak. Żaden fetch testowanych lub nazwanych portali nie jest domyślnie dozwolony. |
| OPEN-012 | I: częściowo rozstrzygnięte; pozostałe D | Stack/architektura wybrane w TD; nie blokuje scaffold. Wersje i integracje weryfikuje Foundation, bez nowego wyboru stacku. |
| OPEN-013 | P: Auth/RLS; B/R: prywatne dane | Auth, BFF i RLS wybrane; wykonalność HttpOnly, granularna revocation, uprawnienia i privacy wymagają testów. Nie promować PoC do produktu bez SEC-01/02 i ustalonych szczegółów. |
| OPEN-014 | I: lokalne; R: operacje | Hosting i cele backup wybrane; koszty, konkretny mechanizm DB+Storage/restore i monitoring wymagają decyzji/dowodów przed produkcją. Nie blokuje local scaffold. |
| OPEN-015 | D | Nazwa/brand poza foundation; nie projektować nowego brandu przez shell. |
| OPEN-016 | D | Monetyzacja poza Foundation. |
| OPEN-017 | B: interakcje pierwszego slice'a | Finalny design system, stany błędów, responsywność; zatwierdzony UX Blueprint zachować. Doprecyzować tylko brakujący zakres, nie projektować od nowa. |
| OPEN-018 | B: model/lifecycle | Zaproszenie vs Rozpocznij rekrutację i kwalifikujący etap. Zachować źródłową bramkę modelu, bez implementacji tej akcji w save/read. |
| OPEN-019 | D → B: wznowienie/ponowna sprawa | Reguła nowa vs wznowienie; poza minimalnym utworzeniem/odczytem. |
| OPEN-020 | B: status/historia | Zakres korekty i audyt bez fikcyjnych akcji; źródłowa bramka modelu. Nie realizować dowolnego PATCH statusu. |
| OPEN-021 | D → B: wydarzenia | Potwierdzanie po terminie, daty rzeczywiste, uczestnicy; bez automatycznego uznawania spotkania za odbyte. |
| OPEN-022 | D → B: import | Nieznane słowniki i niespójna historia; brak cichego mapowania do domyślnych wartości. Syntetyczny RPC bez słowników nie wymaga tej decyzji. |
| OPEN-023 | D → B: CSV/XLSX | Arkusze/kodowania/daty/formuły/nagłówki; brak parsera plików w technicznym RPC PoC. |
| OPEN-024 | B: Quick Capture | Kryteria podobieństwa i UX człowieka. Obowiązku ostrzeżenia o potencjalnym duplikacie nie wolno po cichu wyłączyć z pierwszego capture. |
| OPEN-025 | B: jeśli pierwszy slice zapisuje URL; D: fetch | Normalizacja i identyfikacja publikacji. URL może pozostać poza pierwszym autoryzowanym zakresem, bez zamiany tego w ograniczenie MVP. |
| OPEN-026 | B: jeśli pierwszy slice zapisuje źródło/kanał/link | Słowniki; nie narzucać wymaganych wartości lub mieszać źródła z kanałem. |
| OPEN-027 | D → B: etapy | Domyślny zestaw i kolejność. Żadnego seedowania etapów w Foundation. |
| OPEN-028 | B: dokładny odczyt/lista; D: Kanban/DnD | Zatwierdzić minimalną projekcję, kolejność i ewentualną paginację listy; nie wymyślać kompletu filtrów. DnD wymaga pozostałych lifecycle gates. |
| OPEN-029 | B: model/zamknięcie | Skutki anuluj/zachowaj/odłącz i moment zamknięcia; zachować źródłową bramkę modelu bez wdrażania closure w pierwszym save/read. |
| OPEN-030 | D → B: relacje osób | Wersjonowanie uczestników i wiarygodność historii; bez kopiowania zdarzeń między sprawami. |
| OPEN-031 | D (`DEFERRED` zakres agenta) | Przyszłe autonomiczne działania AI poza MVP; harness deweloperski nie implementuje Career Agent. |
| OPEN-032 | P: bezpieczeństwo dowodów; B/R: prywatność | Polityka retencji/eksportu/usunięć i dokumentów; techniczne mechanizmy częściowo wybrane. Syntetyczne, usuwalne fixture nie wymagają prawdziwych CV/korespondencji. |
| OPEN-033 | B: docelowe QA UI; R | Wspierane urządzenia/przeglądarki, dostępność/lokalizacja. Playwright smoke nie jest dowodem kompletnej zgodności NFR-005. |
| OPEN-034 | B: gdy model zawiera etapy; D: lifecycle | Dozwolone kombinacje status/etap; nie tworzyć ograniczeń SQL z domysłów. |
| OPEN-035 | P: RPC; D → B: import | Idempotency key + rejestr + wykrycie pliku już wybrane. Otwarte: zakres klucza, celowe powtórzenie i UX. PoC na syntetycznym namespace sprawdza mechanizm, nie ustala reguł importu produktu. |
| OPEN-036 | D → B: dokumenty | Semantyka sent-version i usunięcia wysłanego CV; immutable versions już wybrane. |
| OPEN-037 | B: jeśli kontrakt zawiera daty realnych zdarzeń; D: kalendarz/import | Strefy i interpretacja dat; timestamp zapisu technicznego nie zastępuje daty zdarzenia. |
| OPEN-038 | D → B: Search/archiwum | Dopasowanie/ranking/paginacja/archiwum; PostgreSQL FTS wybrany, ale bez zatwierdzonych reguł rankingowych. |
| OPEN-039 | D → B: Dashboard | Statystyki i istotna aktywność; audit techniczny nie jest aktywnością biznesową. |
| OPEN-040 | D → B: zadania | Statusy zadań i rozliczanie przypomnień; poza save/read. |
| OPEN-041 | P: kontrolowane konta fixture; R: rejestracja | **Otwarta rejestracja już wybrana**; szczegóły aktywacji/abuse kontroli przed publicznym uruchomieniem. PoC używa kontrolowanych kont, bez publicznego signup. |
| OPEN-042 | P: Auth; B/R: sesje | Wielourządzeniowość i granularne zakończenie wybrane. Czas życia, wygasanie i wymagany efekt zakończenia w innych kontekstach nadal otwarte; pomiar opóźnienia revocation nie jest zatwierdzeniem tolerancji. |
| OPEN-043 | P: reset; R: odzyskiwanie | **Zweryfikowany e-mail reset już wybrany**; potwierdzenia, linki/callback, eliminacja wycieków i skutki dla innych sesji wymagają szczegółów. Lokalny mail sink w PoC; Google test wymaga osobno udostępnionej konfiguracji. |
| OPEN-044 | D → B: profil; R: jeśli udostępniony | Pola profilu/walidacje i wpływ na Auth; nie tworzyć profilu produktowego z przypadkowych metadanych Auth. |
| OPEN-045 | R | **CSV/XLSX + oddzielne dokumenty już wybrane**; zakres historii, ochrona/dostarczenie i analiza prawna pozostają; bez obietnicy pełnego spełnienia praw na tej podstawie. |
| OPEN-046 | R; P: operacyjny restore | **Nieodwracalne self-delete bez okresu cofnięcia już wybrane**; przebieg fizycznego usuwania, kopie, potwierdzenia, niezależny ledger i retencja nadal wymagają projektu. W restore testować brak przywrócenia usuniętych danych. |

**Przed najbliższym PR scaffold:** brak konieczności zamykania OPEN; konieczna wyłącznie odrębna autoryzacja konkretnego kodowego zakresu. **Przed PoC:** zatwierdzić wąski eksperyment/fixture i środowisko; jeśli kryterium wymaga nieustalonej polityki (np. timeout sesji), oznaczyć tę część `BLOCKED`, mierzyć mechanizm i nie ogłaszać pełnego PASS. Żaden wynik eksperymentu nie zamyka OPEN automatycznie.

## Rekomendowane pakiety rozstrzygnięć — PROPOSED

1. **Przed Auth promotion:** dla OPEN-013/042/043 PO + Tech Lead ustalają zakres „zakończ tę/wybraną/pozostałe sesje”, wymagany moment odmowy dostępu i reakcję na reset hasła. Rekomendacja: opisać obserwowalne żądania po revocation i dopiero porównać z pomiarem PoC; nie przyjąć automatycznie opóźnienia JWT jako dopuszczalnego. Brak wyniku oznacza blokadę promocji, bez samodzielnej zmiany modelu sesji.
2. **Przed RecruitmentCase:** jeden pakiet pól i niezmienników OPEN-001/002/004/005/018/020/029 zgodnie z istniejącą DATA-01, plus OPEN-024 dla capture; także OPEN-034, jeśli projekt dotyka etapów. Rekomendacja: zatwierdzić dokładny minimalny write/read kontrakt, rozdzielenie stanu, historii i audytu oraz relacje/konflikty. Brak przycisku nie uzasadnia usunięcia istniejącej bramki modelu.
3. **Przed public release:** OPEN-013/014/032/041–046 w odpowiednich zakresach, koszty i DB+Storage DR, deletion ledger i legal/privacy. Nie pytać ponownie o dostawcę, otwarty signup, email reset, format eksportu ani irreversible delete.

## Pierwszy biznesowy vertical slice — PROPOSED do osobnej autoryzacji PO

**Cel:** zalogowany właściciel świadomie zapisuje minimalną sprawę ręcznie i może odczytać wyłącznie swoje sprawy (lista i szczegół po ID). Przypadek startowy: „Zapisz tylko sprawę”, bez rejestrowania aplikacji lub innego zdarzenia, którego użytkownik nie potwierdził. Jest to etap wewnętrznej implementacji z DEC-047, nie redefinicja publicznego MVP.

| Zakres/kontrakt | Źródła i status | Ograniczenie oceny |
| --- | --- | --- |
| Minimalne utworzenie bez wymaganego ogłoszenia/stanowiska | FR-LC-001/AC-LC-001; FR-QC-002/AC-QC-002; DEC-001/002/029; BR-001 `APPROVED` | OPEN-002 przed fizycznym schematem. Brak znanego pracodawcy nie może blokować dopuszczonego wariantu BR-028. Pełne FR-LC-002/AC-LC-002 obejmuje pięć wariantów i pozostaje poza pełnym pokryciem tego kroku. |
| Świadomy zapis, zachowanie kontekstu i kolejny wpis | FR-QC-009/010, AC-QC-009/010; DEC-032, BR-029 `APPROVED` | Modal/kreator, podsumowanie i toast zgodnie z UX; brak samoczynnego przejścia do detalu. |
| Bez fikcyjnej aplikacji, połączenia lub korekty statusu | BR-004/007/016/021/022, DEC-009/022/031 `APPROVED`; FR-QC-007/AC-QC-007 | Powtórzony submit/retry nie może dać dwóch spraw; to idempotencja żądania, odrębna od produktu „potencjalny duplikat” OPEN-024. Nie twierdzić, że manual-only test wykonuje URL-specific AC-QC-011. |
| Ostrzeżenie o potencjalnym duplikacie i decyzja użytkownika | FR-QC-006/007, AC-QC-006/007; DEC-031, BR-022 `APPROVED` | OPEN-024 przed implementacją; aktualizacja istniejącej sprawy FR-QC-008 wymaga oddzielnego zatwierdzonego kontraktu i może być późniejszym krokiem po jawnej autoryzacji granicy slice'a. Brak automatycznego merge. |
| Odczyt listy i własnego ID | FR-RW-005 i FR-RW-009 jako powiązane `APPROVED`; AC-RW-005/009; BR-030/NFR-001; FR-AD-002/AC-AD-002 `APPROVED` niezmiennik | Lista i minimalny detal są częściami wymagań, nie pełnym Kanban/lista/drawer/detail AC. List-only nie staje się nowym domyślnym Workspace; domyślny Kanban pozostaje zatwierdzony. |
| Globalne wejście | FR-QC-001/AC-QC-001; DEC-017/029 `APPROVED` | Quick Capture w istniejącym shellu; pełny PASS wymaga siedmiu prawdziwych modułów. Nie tworzyć martwych ekranów w celu pozorowania AC. |

**UX:** [Blueprint](../ux/blueprint.md), [decyzje UX](../ux/blueprint-decisions.md) 1.11–1.16, [flow contracts](../ux/flow-contracts.md) F02 i stosowna część F01/F05; UX-006, UX-003, UX-005. Zachować kreator Sytuacja → Dane → Działanie → Podsumowanie, opcję zapisu bez działania, minimalny formularz + Więcej szczegółów, toast z jawnym „Otwórz sprawę”. Nie nadawać propozycjom UX statusu DEC. Uzgodniony Dashboard jako pierwszy ekran po loginie (FR-DB-001) pozostaje obowiązującym kierunkiem; techniczny ekran fixture nie zastępuje go w produkcie.

**Wymagane wejścia danych:** zatwierdzony minimalny command utworzenia i read projection, pola/nullable/limity/walidacje, owner identity z serwera, stan początkowy i ewentualne relacje, zasady historii vs audytu, key i wynik ponowionego żądania, kontrakt błędów/konfliktu, kryteria duplikatu i jawnej decyzji, sortowanie/paginacja odczytu. Nie tworzymy nazw kolumn, enumów wyników ani migracji przed decyzjami. Brak daty rzeczywistego zdarzenia pozostaje brakiem; timestamp zapisu jest techniczny.

**Wpływ:** RecruitmentCase i Quick Capture zapisują stan; historia i audyt muszą pozostać odrębne. Company/Contact wyłącznie w zatwierdzonych relacjach minimalnego modelu, bez inferowania pracodawcy. Import, Search/FTS, dokumenty, zadania/wydarzenia, closure/reopen, wysyłka komunikacji i workerowe akcje biznesowe są poza tym krokiem; ich bramki pozostają. Bezpieczeństwo: każdy zapis/odczyt przez BFF i Data API z JWT użytkownika, RLS także przy wywołaniu bez BFF; żadnego service-role w zwykłej ścieżce. UX musi pokazać prawdziwy błąd/pusty stan bez ujawniania cudzego rekordu.

**Właściciele przyszłej implementacji:** backend-engineer — zatwierdzony model/domain/application/repository/BFF i unit tests; frontend-engineer — istniejący shell, Quick Capture/lista/minimalny detal i unit tests; QA-engineer — integracyjne A/B, write/read, retries, konflikty i Playwright; niezależni backend-reviewer/frontend-reviewer oraz security-reviewer — właściwe granice; platform-engineer tylko CI/środowisko. Pliki i model/reasoning wpisać do konkretnego task packet po autoryzacji, z rozłączną własnością.

**Plan testów — wszystkie `PLANNED / NOT RUN`:** adaptacja manualnej ścieżki UC-001/TC-001 i „kolejnej sprawy” UC-029/TC-029; brak wymagania URL/stanowiska, brak automatycznego faktu aplikacji, brak zmyślonej daty; A zapisuje/odczytuje, B i anon nie odczytują ani nie modyfikują listy/ID/relacji A; owner z payloadu jest ignorowany lub odrzucany; retry/utrata odpowiedzi/równoległy submit zgodnie z zatwierdzonym kontraktem; błąd nie daje fałszywego toastu sukcesu; anulowanie nie zapisuje; kolejny wpis nie kopiuje działania; duplikat wymaga decyzji. UC-004/TC-004 obejmuje kontakt/korespondencję i nie jest w całości pokryty przez prosty save/read. UC-034/TC-034 jest źródłem scenariuszy izolacji, ale pełen zakres dokumentów pozostaje późniejszy. Komplet FR/AC/UC sprawdzić z [traceability](../quality/traceability.md) przy konkretnym planie implementacji.

**DoD przyszłego slice'a:** odrębna autoryzacja PO exact zakresu, wymagane OPEN i DATA-01 rozstrzygnięte, techniczne PoC/gates z Foundation spełnione, brak arbitralnych pól i enumów; wykonane adekwatne unit/integration/RLS/Playwright/static/build/CI; niezależne review bez P0/P1; dokumentacja i traceability rozdzielają pełne i częściowe AC oraz NOT RUN. Nie ogłaszać całego FR-RW/FR-QC/FR-AD jako ukończonego na podstawie tego slice'a.

## Status obecnego zadania

To analiza i plan, bez inicjalizacji produktu, migracji, DB, kont i cloud. Testy aplikacji oraz PoC: **`PLANNED / NOT RUN`**. Wykonane kontrole dokumentacji i niezależne review planu raportuje osobno orchestrator; nie są dowodem działania Auth, RLS, RPC ani restore. Żaden OPEN nie został zamknięty, żaden ADR utworzony lub zmieniony.
