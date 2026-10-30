# Kwestie otwarte i bramki decyzyjne (OPEN)

**Stan:** `BASELINED` z aktualizacją po Technical Discovery 2026-10-28. Wiersze poniżej zachowują status **`OPEN` w zakresie nierozstrzygniętych szczegółów**, nie są propozycjami przyjętego rozwiązania. Właściciel rozstrzygnięcia: **PO** dla produktu/domeny/UX; **PO + Tech Lead** dla decyzji technicznych. Priorytet `P0` blokuje właściwy fragment implementacji; `P1` przed ukończeniem danej funkcji; `P2` późniejsze discovery.

| ID | Priorytet / bramka | Nierozstrzygnięte pytanie / wymagane rozstrzygnięcie |
|---|---|---|
| OPEN-001 | P0 · Lifecycle | Ostateczny zbiór wyników zamknięcia i reguły, w których można ich użyć. Omawiano: oferta przyjęta, odrzucona, rezygnacja, brak odpowiedzi, anulowanie, nie aplikowano, inny; **to nie jest przyjęty enum**. |
| OPEN-002 | P0 · Wszystkie formularze | **PARTIALLY RESOLVED** — [DEC-052](product-decisions.md), PO 2026-10-29: pierwszy create/read RecruitmentCase ma tytuł 1–160 po trim, opcjonalny opis do 2000 i jeden URL HTTP(S), status Zapisane, owner z Auth, techniczny czas i key zapisu. Pozostałe formularze, warianty, pola, daty, relacje i walidacje **OPEN**; [granica DATA-01](../technical/recruitment-case-first-slice.md). |
| OPEN-003 | P1 · Stages | Propagacja zmian globalnych szablonów etapów do istniejących spraw oraz konflikty z indywidualnymi zmianami. |
| OPEN-004 | P0 · Historia | Edycja/usuwanie/korekta historycznych wpisów i ślad audytowy bez fikcyjnych zdarzeń. |
| OPEN-005 | P0 · Dane | Usuwanie, archiwizacja, przywracanie i integralność powiązań spraw, firm, kontaktów. |
| OPEN-006 | P0 · Dokumenty | Usuwanie plików, wersji, retencja danych i załączników, prawa dostępu. |
| OPEN-007 | P1 · Dokumenty/import | Rozmiary, liczby plików, limity importów, obsługiwane typy i bezpieczne przechowywanie. |
| OPEN-008 | P1 · Sugestie | Konkretne progi follow-upu, reguły wykluczające i źródła sygnałów. |
| OPEN-009 | P1 · Powiadomienia | Domyślne preferencje i reguły przypomnień w aplikacji/e-mail, zgody i deduplikacja. |
| OPEN-010 | P0 · Import | Atomowy commit zaakceptowanego zbioru i rollback są zatwierdzone ADR-0005. Nadal OPEN: raportowanie niepewnego wyniku, konflikt preview/commit, potwierdzenia i zakres biznesowego cofania importu. |
| OPEN-011 | P1 · Smart Import | Portale/strony wspierane, standard odczytu, ograniczenia i komunikaty błędów. |
| OPEN-012 | P2 · Architecture | Frontend, backend i stack; dopiero po Technical Discovery/ADR. |
| OPEN-013 | P0 · Security | Supabase-native Auth/SSR + Data API/RLS zatwierdzone DEC-051/ADR-0012. Nadal OPEN: konkretna ochrona cookies/endpoints przed CSRF, XSS/token leakage, cache, ochrona operacji wrażliwych, testy i dopuszczenie publiczne. Bez bramki implementacji brokera ani HttpOnly-only. |
| OPEN-014 | P2 · Infrastructure | Hosting i cele backup częściowo wybrane w TD. Nadal OPEN: konfiguracja, sekrety serwerowe/provider credentials, monitoring, DB+Storage DR i koszty. Bez własnych kluczy AEAD sesji ani magazynu refresh tokenów (ADR-0012). |
| OPEN-015 | P2 · Brand | **PARTIALLY RESOLVED** — DEC-053 (PO 2026-10-30) deleguje visual language obecnej aplikacji po researchu. Docelowa nazwa, logo i branding marketingowy nadal **OPEN**. |
| OPEN-016 | P2 · Business | Model komercyjny i monetyzacja; nie rozstrzygać teraz bez potrzeby. |
| OPEN-017 | P1 · UX | **PARTIALLY RESOLVED** — DEC-053 autoryzuje jasny design system i polish istniejących ekranów, ich responsywność i stany błędów. Kontrakty przyszłych modułów i pełny finalny design system nadal **OPEN**; [zakres](../technical/ui-foundation-report.md). |
| OPEN-018 | P0 · Lifecycle | Moment zaproszenia vs „Rozpocznij rekrutację”: czy akcje są jednym krokiem, czy osobnymi; jak identyfikować kwalifikujący etap. |
| OPEN-019 | P1 · Lifecycle | Kiedy proponować nową sprawę, a kiedy wznowić istniejącą w przypadku kolejnej aplikacji. |
| OPEN-020 | P0 · Lifecycle | Zakres ręcznej korekty statusu i jej ślad administracyjny, bez podszywania się pod akcję. |
| OPEN-021 | P1 · Wydarzenia | Dokładne reguły potwierdzania po terminie, czasu rzeczywistego zdarzenia i edycji uczestników. |
| OPEN-022 | P0 · Import | Reguły mapowania nieznanych statusów/etapów/wyników i niespójnych historycznych rekordów. |
| OPEN-023 | P1 · Import | Warianty CSV/XLSX: arkusze, kodowania, daty, formuły, nagłówki, pusty rekord, import przykładowego szablonu. |
| OPEN-024 | P0 · Deduplication | **PARTIALLY RESOLVED** — [DEC-052](product-decisions.md): ten sam URL lub identyczna nazwa po prostej deterministycznej normalizacji, tylko u bieżącego właściciela; ostrzeżenie, otwarcie dopasowania albo świadoma nowa sprawa, bez merge/update. Zaawansowane podobieństwo, relacje, aktualizacja istniejącej sprawy i importowe rozstrzygnięcia nadal **OPEN**. |
| OPEN-025 | P1 · Links | Normalizacja URL, identyfikacja tej samej publikacji i zmiany linków; bez pobierania prywatnej korespondencji. |
| OPEN-026 | P1 · Metadata | Zatwierdzony słownik typów URL, źródeł i kanałów aplikacji/kontaktu. |
| OPEN-027 | P1 · Stages | Konkretna lista domyślnych etapów i ich domyślna kolejność. |
| OPEN-028 | P1 · Workspace | Dokładne filtry, sortowania i gotowe szybkie widoki oraz zachowanie DnD w stanach wymagających dodatkowych danych. |
| OPEN-029 | P0 · Close | Precyzyjne skutki „anuluj”, „zachowaj”, „odłącz” dla zadań/wydarzeń; walidacje i moment zamknięcia. |
| OPEN-030 | P1 · Contacts | Edytowalność i wersjonowanie powiązań uczestników oraz wiarygodność historii kontaktu. |
| OPEN-031 | P2 · Future AI | Uprawnienia, zgody i audyt przyszłych działań agenta AI; poza pierwszym MVP. |
| OPEN-032 | P0 · Privacy | Polityka prywatności, retencji, eksportu/usuwania danych i wrażliwych dokumentów. Dla operacji szczególnie wrażliwych określić reautoryzację, weryfikację bieżącego użytkownika lub stanu konta. Akceptacja ważności zwykłego JWT do expiry nie rozstrzyga tych polityk. |
| OPEN-033 | P1 · UI & QA | **PARTIALLY RESOLVED** — DEC-053 wymaga WCAG 2.2 AA i kontroli 1440/1024/768/375 dla dotkniętych ekranów. Pełna macierz urządzeń/przeglądarek, technologie asystujące i lokalizacja nadal **OPEN**; wykonanie testów nie jest domniemane. |
| OPEN-034 | P1 · Case model | W jakich wariantach etapy mogą być puste lub istnieć przy statusach innych niż „W rekrutacji”. |
| OPEN-035 | P0 · Import | Minimalny user-scoped key/registry/fingerprint dla retry zatwierdzony ADR-0005. Nadal OPEN: identyfikacja materiału i semantyka payloadu, celowe ponowienie, polityka utrzymania rekordu i UX. Bez globalnego frameworka exactly-once. |
| OPEN-036 | P1 · Files | Semantyka wersji CV: wersje edytowalne czy nie, usunięcie wersji już wysłanej i reprezentacja potwierdzenia wysłania. |
| OPEN-037 | P1 · Calendar | Strefy czasowe, interpretacja wydarzeń całodziennych, zmiana daty terminu i format historycznych dat. |
| OPEN-038 | P1 · Search | Szczegóły dopasowania, filtrowania, kolejności, zachowanie wobec archiwum i dużych wyników. |
| OPEN-039 | P1 · Dashboard | Definicje zwięzłych statystyk i zasad „ostatniej aktywności” bez mieszania z czysto technicznymi korektami. |
| OPEN-040 | P1 · Tasks | Zatwierdzony słownik statusów zadań i dokładne zasady rozliczenia przypomnień. |
| OPEN-041 | P0 · Konto / udostępnienie | Otwarta samoobsługowa rejestracja przez Supabase zatwierdzona (TD i DEC-051). Nadal OPEN: pola, aktywacja/potwierdzenia i ochrona przed nadużyciami przed publicznym udostępnieniem. Pełny FR-AD-003 pozostaje PROPOSED. |
| OPEN-042 | P0 · Sesja | Natywne scopes `local/global/others`, wielourządzeniowość i możliwość ważności access JWT do expiry zatwierdzone DEC-051/ADR-0012. Nadal OPEN: TTL, ustawienia sesji, komunikaty i polityka operacji wrażliwych. Bez wymagania target-by-session-id, własnego rejestru urządzeń i natychmiastowej revocation JWT. Pełne FR-AD-004/005 PROPOSED. |
| OPEN-043 | P1 · Odzyskiwanie konta | Reset hasła e-mailem przez Supabase zatwierdzony (TD i DEC-051). Nadal OPEN: komunikaty, potwierdzenia, bezpieczny cross-device flow, reautoryzacja i skutki dla pozostałych sesji. Pełny FR-AD-006 PROPOSED. |
| OPEN-044 | P1 · Profil | Zakres danych profilu, edytowalność, walidacje i wpływ zmian na uwierzytelnianie. `FR-AD-007 PROPOSED`. |
| OPEN-045 | P0 · Eksport danych | Czy i jaki eksport własnych danych jest wymagany w pierwszym wydaniu, jaki zakres (sprawy/historia/dokumenty/kontakty), format, sposób ochrony i dostarczenia? `FR-AD-008 PROPOSED`; por. `OPEN-032`. |
| OPEN-046 | P0 · Usunięcie konta | Nieodwracalne samoobsługowe delete bez okresu cofnięcia zatwierdzone w TD. Nadal OPEN: zakres/powiązania, retencja/backup, potwierdzenie i weryfikacja bieżącego użytkownika lub stanu konta. Wspierane mechanizmy, bez nieudokumentowanych zmian `auth.*`; bez obietnicy natychmiastowej fizycznej kasacji. Pełny FR-AD-009 PROPOSED; OPEN-005/006/032. |

## Aktualizacja Technical Discovery (2026-10-28)

Wybory technologiczne i część polityk określono w [rejestrze 1.1–1.40](../technical/discovery-decisions.md) oraz [ADR](adr/README.md). **Nie należy interpretować poniższych pytań, szczególnie OPEN-012/013/014/041/042/043/045/046, jako całkowitego braku decyzji:** są *częściowo rozstrzygnięte*; pozostają OPEN dla wskazanych szczegółów operacyjnych, prawnych i technicznych oraz weryfikacji. Konkretnie: OPEN-041 — otwarta rejestracja; OPEN-043 — reset przez e-mail; OPEN-045 — podstawowy CSV/XLSX plus osobne pliki; OPEN-046 — nieodwracalne self-service delete bez okresu na cofnięcie; OPEN-012 — Next.js/Supabase/Render; OPEN-014 — kierunek hostingu i cele backup; OPEN-011 — allowlista domen bez zatwierdzonych pozycji. Nie wolno ponownie zadawać PO tych samych pytań o *już zatwierdzone warianty*.

## Rebaseline Supabase-native (2026-10-29)

**Źródło:** decyzja PO w zadaniu „Jobs CRM — Supabase-native Architecture Rebaseline”, [DEC-051](product-decisions.md) i [ADR-0012](adr/0012-supabase-native-auth-sessions-rls.md). Wiersze OPEN zachowują stabilne ID i status dla pozostałych szczegółów. Historia częściowych rozstrzygnięć TD powyżej pozostaje; zakres starszych pytań o model sesji zastępuje ADR-0012.

- **Dokumentacja/przygotowanie F3:** nie wymagają ponownego wyboru Auth, brokera ani tolerancji JWT do expiry; te kwestie są rozstrzygnięte.
- **Implementacja F3:** wymaga osobnego zlecenia PO; OPEN-013/041/042/043 blokują wyłącznie faktycznie zależne polityki. Lokalne jawne fixtures nie ustanawiają TTL/polityki produkcyjnej. OPEN-002 blokuje nowe pola/profil i model CRM, nie samą integrację technicznego kontekstu Auth.
- **Publiczne udostępnienie:** właściwe SEC-01/SEC-02, polityki prywatności i aktywacji/recovery oraz wymagane testy muszą być spełnione. Brak credentials Google oznacza NOT RUN live OAuth.
- **Importer:** OPEN-010/022/023/024/035 przed zależnym CSV/XLSX slice i IM-01; nie blokują zwykłego ręcznego CRUD jako importer-specific zależność.
- **Eksport/delete i operacje/DR:** OPEN-014/032/045/046 oraz właściwe OPEN-013/042/043 pozostają bramką tych funkcji i wydania; nie są powodem blokowania całej lokalnej integracji F3.

## Kolejność decyzji

1. **Przed szczegółowym prototypowaniem:** `OPEN-017`, `OPEN-018`, `OPEN-024`, `OPEN-028` i dotknięte przepływy z `OPEN-001/OPEN-029` (można prototypować warianty bez przedstawiania ich jako gotowych).
2. **Przed implementacją danego modułu:** wszystkie powiązane `P0`, jego `P1` wpływające na testowalność oraz uzgodnione AC.
3. **Przed udostępnieniem właściwej funkcji konta:** `OPEN-013/OPEN-032/OPEN-041`–`OPEN-046` w jej zależnym zakresie; nie implementuj niezatwierdzonych polityk jako MVP. Lokalne F3 może realizować zatwierdzony podzakres bez wcześniejszego eksportu/delete/DR.
4. **Przed zmianą wybranego stacku lub provisioningiem infrastruktury:** `OPEN-013/OPEN-014` i backlog [Technical Discovery](../technical/discovery-backlog.md), z ADR dla decyzji istotnych.

### Wstępne obszary konfliktów interpretacyjnych (nie są sprzecznymi decyzjami)

- `DEC-006/DEC-009` — rejestracja zaproszenia nie jest automatycznie tożsama z dowolnym wydarzeniem w kalendarzu: `OPEN-018`.
- `DEC-007/DEC-008` — niezależność statusu i etapu nie rozstrzyga wszystkich możliwych kombinacji: `OPEN-034`.
- `DEC-009/DEC-022` — korygowanie statusu i porządek historii muszą współistnieć bez fikcyjnych zdarzeń: `OPEN-004/OPEN-020`.
- `DEC-012/DEC-013` — ponowna sprawa vs wznowienie, a także zachowanie zadań po zamknięciu: `OPEN-019/OPEN-029`.
- `DEC-033–037` — atomowość i minimalna ochrona retry są doprecyzowane ADR-0005; pozostałe szczegóły raportu, mapowań i celowego powtórzenia: `OPEN-010/OPEN-022/OPEN-035`.

## Rejestrowanie rozstrzygnięcia

Po decyzji PO: odnotuj datę/źródło, zaktualizuj odpowiedni `DEC/BR/FR/AC/UC`, zmień status `OPEN` na `RESOLVED` z linkiem do nowej decyzji w historii rejestru (nie kasuj pytania), przeprowadź analizę wpływu. **Status `RESOLVED` jest stanem operacyjnym pytania, nie zastępuje statusu decyzji `APPROVED`.**

**Dowody lokalnego F3, bez zamykania OPEN:** [raport wykonania](../technical/foundation-f3.md) rozdziela konfigurację syntetycznego dostawcy od docelowych polityk. Flaga UI local fixture nie blokuje bezpośredniego Supabase Auth API; OPEN-013/041/043 przed wdrożeniem wymagają także właściwych ustawień u dostawcy. Sesje/TTL, skutki recovery i sensitive reauth pozostają OPEN-042/043.


## Pierwszy biznesowy create/read — 2026-10-29

Źródło: jawna decyzja PO wariant A w zadaniu „Jobs CRM — First Business Vertical Slice: RecruitmentCase + Manual Quick Capture”, [DEC-052](product-decisions.md). Jest to późniejsze częściowe rozstrzygnięcie, nie zamknięcie rejestru. [DATA-01 i dokładny kontrakt](../technical/recruitment-case-first-slice.md) dopuszczają minimalny model bez lifecycle, historii, audytu i usuwania. OPEN-001/004/005/018/020/029/034 nadal blokują ich przyszłe rozszerzenia; nie blokują ponownie autoryzowanego zakresu.

OPEN-025/026: pierwszy slice przyjmuje opcjonalny nietypowany HTTP(S), bez fetch, bez słownika kanałów i bez identyfikacji publikacji; minimalna techniczna kanonikalizacja opisana w kontrakcie nie rozstrzyga semantyki innych URL-i. OPEN-028: zatwierdzono tylko własną listę od najnowszych i minimalny detal; pozostałe filtry, Kanban/DnD i widoki OPEN. OPEN-013/032/041–046 pozostają bramkami publicznego udostępnienia i zależnych operacji.

## UI Foundation — częściowa delegacja PO 2026-10-30

[DEC-053](product-decisions.md) dopuszcza po researchu wybór jasnego visual language, App Shell i polish istniejących ekranów, przeniesienie natywnych logout scopes do menu/widoku konta oraz WCAG 2.2 AA i visual QA tego podzakresu. OPEN-015/017/033 nie blokują ponownie tych wprost zleconych prac. Docelowa nazwa/logo/branding, przyszłe moduły, pełna macierz urządzeń/przeglądarek/lokalizacji i nieprzetestowane technologie asystujące pozostają OPEN. Delegacja nie rozstrzyga modelu danych, polityk Auth ani innych blokujących OPEN. [Werdykt i system](../ux/visual-language.md), [rzeczywiste wyniki i ograniczenia](../technical/ui-foundation-report.md).

## Recruitment Lifecycle 3A — częściowe rozstrzygnięcie 2026-10-30

[DEC-054](product-decisions.md), jawne zatwierdzenie PO wariantów 1A/2A/3A, rozszerza [DATA-01 wyłącznie dla 3A](../technical/recruitment-lifecycle-3a.md):

- OPEN-002: RESOLVED tylko formularz trzech faktów na istniejącej sprawie (aplikowanie, kontakt inbound/outbound), opcjonalny rzeczywisty dzień albo brak daty, bez dodatkowych pól biznesowych. Pozostałe formularze i relacje OPEN.
- OPEN-026: kanały i ich słownik świadomie poza 3A; nie wyprowadzać kanału aplikowania z source_url. Sam słownik nadal OPEN.
- OPEN-037: RESOLVED tylko precyzja dnia bez godziny i odrzucenie przyszłej daty; Europe/Warsaw jest lokalnym wyborem wykonawczym granicy bieżącego dnia, nie polityką kalendarza/profilu. Czas wpisu nadawany oddzielnie przez DB. Pozostałe strefy, godziny, kalendarz OPEN.
- OPEN-004: jawnie zatwierdzony append-only bez edycji/usuwania w przyroście 3A. Korekta/unieważnienie błędnych wpisów i audyt pozostają **OPEN — bramka przed publicznym udostępnieniem tej funkcji**. Brak korekty nie jest docelową polityką retencji. OPEN-020 (ręczna korekta statusu) nadal OPEN.

OPEN-001/003/018/019/027/029/034 nie blokują tego wąskiego przyrostu bez etapów, zamykania i wznowień; nie są nim rozstrzygnięte. Publiczne bramki prywatności/Auth pozostają. Brak merge/deploymentu.


## Recruitment Lifecycle 3B — częściowe rozstrzygnięcie 2026-10-30

[DEC-055](product-decisions.md), jawne zatwierdzenie PO wariantów 1A/2A/3A z [analizy](../technical/recruitment-lifecycle-3b-analysis.md):

- OPEN-018: RESOLVED dla lokalnego 3B — jedna akcja kwalifikującego zaproszenia ustawia W rekrutacji i konkretny etap; kwalifikację potwierdza użytkownik, bez analizy korespondencji.
- OPEN-002/034: PARTIALLY RESOLVED — indywidualna nazwa 1–160 punktów kodowych po trim; opcjonalny nieprzyszły dzień faktu, unknown bez zastępowania datą zapisu; wcześniejsze statusy bez etapu, W rekrutacji z etapem; zmiana etapu tylko w W rekrutacji. Kolejne zaproszenia/zmiany ustawiają jawnie potwierdzony bieżący etap, bez automatycznego odtwarzania stanu z dat i bez cichego nadpisania konkurencyjnej zmiany. Kontakt/aplikacja w W rekrutacji nie cofają stanu. Pozostałe formularze i kombinacje (w tym Zakończone) OPEN.
- OPEN-004: PARTIALLY RESOLVED wyłącznie lokalne append-only 3B; korekty i audyt nadal OPEN przed publicznym udostępnieniem.
- OPEN-003/027 nadal OPEN dla globalnych szablonów i domyślnego zestawu; bez ich implementacji i seedowania w 3B. Pozostałe granice z analizy zachowane.
