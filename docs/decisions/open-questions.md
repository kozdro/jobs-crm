# Kwestie otwarte i bramki decyzyjne (OPEN)

**Stan:** `BASELINED`. Wszystkie poniższe wiersze mają status **`OPEN`**, nie są propozycjami przyjętego rozwiązania. Właściciel rozstrzygnięcia: **PO** dla produktu/domeny/UX; **PO + Tech Lead** dla decyzji technicznych. Priorytet `P0` blokuje właściwy fragment implementacji; `P1` przed ukończeniem danej funkcji; `P2` późniejsze discovery.

| ID | Priorytet / bramka | Nierozstrzygnięte pytanie / wymagane rozstrzygnięcie |
|---|---|---|
| OPEN-001 | P0 · Lifecycle | Ostateczny zbiór wyników zamknięcia i reguły, w których można ich użyć. Omawiano: oferta przyjęta, odrzucona, rezygnacja, brak odpowiedzi, anulowanie, nie aplikowano, inny; **to nie jest przyjęty enum**. |
| OPEN-002 | P0 · Wszystkie formularze | Pełne schematy pól: obowiązkowość, formaty, limity, daty, relacje, dopuszczalne wartości, walidacje. |
| OPEN-003 | P1 · Stages | Propagacja zmian globalnych szablonów etapów do istniejących spraw oraz konflikty z indywidualnymi zmianami. |
| OPEN-004 | P0 · Historia | Edycja/usuwanie/korekta historycznych wpisów i ślad audytowy bez fikcyjnych zdarzeń. |
| OPEN-005 | P0 · Dane | Usuwanie, archiwizacja, przywracanie i integralność powiązań spraw, firm, kontaktów. |
| OPEN-006 | P0 · Dokumenty | Usuwanie plików, wersji, retencja danych i załączników, prawa dostępu. |
| OPEN-007 | P1 · Dokumenty/import | Rozmiary, liczby plików, limity importów, obsługiwane typy i bezpieczne przechowywanie. |
| OPEN-008 | P1 · Sugestie | Konkretne progi follow-upu, reguły wykluczające i źródła sygnałów. |
| OPEN-009 | P1 · Powiadomienia | Domyślne preferencje i reguły przypomnień w aplikacji/e-mail, zgody i deduplikacja. |
| OPEN-010 | P0 · Import | Transakcyjność (partial/full), potwierdzenie, reakcja na awarię i dokładny zakres cofania importu. |
| OPEN-011 | P1 · Smart Import | Portale/strony wspierane, standard odczytu, ograniczenia i komunikaty błędów. |
| OPEN-012 | P2 · Architecture | Frontend, backend i stack; dopiero po Technical Discovery/ADR. |
| OPEN-013 | P0 · Security | Sposób uwierzytelniania i autoryzacji, granice izolacji danych oraz ochrona danych osobowych. |
| OPEN-014 | P2 · Infrastructure | Hosting, baza danych, storage, monitoring, backup/recovery i koszty operacyjne. |
| OPEN-015 | P2 · Brand | Docelowa nazwa i identyfikacja wizualna produktu. |
| OPEN-016 | P2 · Business | Model komercyjny i monetyzacja; nie rozstrzygać teraz bez potrzeby. |
| OPEN-017 | P1 · UX | Finalny design system, szczegóły dostępności, responsywność, stany błędów. |
| OPEN-018 | P0 · Lifecycle | Moment zaproszenia vs „Rozpocznij rekrutację”: czy akcje są jednym krokiem, czy osobnymi; jak identyfikować kwalifikujący etap. |
| OPEN-019 | P1 · Lifecycle | Kiedy proponować nową sprawę, a kiedy wznowić istniejącą w przypadku kolejnej aplikacji. |
| OPEN-020 | P0 · Lifecycle | Zakres ręcznej korekty statusu i jej ślad administracyjny, bez podszywania się pod akcję. |
| OPEN-021 | P1 · Wydarzenia | Dokładne reguły potwierdzania po terminie, czasu rzeczywistego zdarzenia i edycji uczestników. |
| OPEN-022 | P0 · Import | Reguły mapowania nieznanych statusów/etapów/wyników i niespójnych historycznych rekordów. |
| OPEN-023 | P1 · Import | Warianty CSV/XLSX: arkusze, kodowania, daty, formuły, nagłówki, pusty rekord, import przykładowego szablonu. |
| OPEN-024 | P0 · Deduplication | Kryteria „potencjalny duplikat” i UX wyboru między nową a istniejącą sprawą. |
| OPEN-025 | P1 · Links | Normalizacja URL, identyfikacja tej samej publikacji i zmiany linków; bez pobierania prywatnej korespondencji. |
| OPEN-026 | P1 · Metadata | Zatwierdzony słownik typów URL, źródeł i kanałów aplikacji/kontaktu. |
| OPEN-027 | P1 · Stages | Konkretna lista domyślnych etapów i ich domyślna kolejność. |
| OPEN-028 | P1 · Workspace | Dokładne filtry, sortowania i gotowe szybkie widoki oraz zachowanie DnD w stanach wymagających dodatkowych danych. |
| OPEN-029 | P0 · Close | Precyzyjne skutki „anuluj”, „zachowaj”, „odłącz” dla zadań/wydarzeń; walidacje i moment zamknięcia. |
| OPEN-030 | P1 · Contacts | Edytowalność i wersjonowanie powiązań uczestników oraz wiarygodność historii kontaktu. |
| OPEN-031 | P2 · Future AI | Uprawnienia, zgody i audyt przyszłych działań agenta AI; poza pierwszym MVP. |
| OPEN-032 | P0 · Privacy | Polityka prywatności, retencji, eksportu/usuwania własnych danych i wrażliwych dokumentów. |
| OPEN-033 | P1 · UI & QA | Docelowe wymagania dostępności, urządzeń, przeglądarek i lokalizacji. |
| OPEN-034 | P1 · Case model | W jakich wariantach etapy mogą być puste lub istnieć przy statusach innych niż „W rekrutacji”. |
| OPEN-035 | P0 · Import | Ochrona przed powtórzeniem: zakres identyfikacji pliku/wsadu, idempotencja i reakcja na celowe powtórzenie. |
| OPEN-036 | P1 · Files | Semantyka wersji CV: wersje edytowalne czy nie, usunięcie wersji już wysłanej i reprezentacja potwierdzenia wysłania. |
| OPEN-037 | P1 · Calendar | Strefy czasowe, interpretacja wydarzeń całodziennych, zmiana daty terminu i format historycznych dat. |
| OPEN-038 | P1 · Search | Szczegóły dopasowania, filtrowania, kolejności, zachowanie wobec archiwum i dużych wyników. |
| OPEN-039 | P1 · Dashboard | Definicje zwięzłych statystyk i zasad „ostatniej aktywności” bez mieszania z czysto technicznymi korektami. |
| OPEN-040 | P1 · Tasks | Zatwierdzony słownik statusów zadań i dokładne zasady rozliczenia przypomnień. |
| OPEN-041 | P0 · Konto / udostępnienie | Czy i kiedy użytkownik sam tworzy konto? Rejestracja otwarta, zaproszenia czy konto zakładane przez właściciela; zasady aktywacji i kontroli dostępu. `FR-AD-003 PROPOSED`. |
| OPEN-042 | P0 · Sesja | Zasady wylogowania, czasu życia sesji, jej wygasania i zakończenia w innych kontekstach; bez wyboru technologii ani wartości domyślnych. `FR-AD-004/005 PROPOSED`. |
| OPEN-043 | P1 · Odzyskiwanie konta | Czy i jak użytkownik odzyskuje dostęp, jakie potwierdzenia są wymagane, jak uniknąć wycieku danych; bez narzucania e-maila/dostawcy. `FR-AD-006 PROPOSED`. |
| OPEN-044 | P1 · Profil | Zakres danych profilu, edytowalność, walidacje i wpływ zmian na uwierzytelnianie. `FR-AD-007 PROPOSED`. |
| OPEN-045 | P0 · Eksport danych | Czy i jaki eksport własnych danych jest wymagany w pierwszym wydaniu, jaki zakres (sprawy/historia/dokumenty/kontakty), format, sposób ochrony i dostarczenia? `FR-AD-008 PROPOSED`; por. `OPEN-032`. |
| OPEN-046 | P0 · Usunięcie konta | Zakres i skutki usuwania danych, historia, wersje dokumentów, kopie, retencja, potwierdzenie i nieodwracalność; bez zakładania natychmiastowej kasacji. `FR-AD-009 PROPOSED`; por. `OPEN-005/006/032`. |

## Kolejność decyzji

1. **Przed szczegółowym prototypowaniem:** `OPEN-017`, `OPEN-018`, `OPEN-024`, `OPEN-028` i dotknięte przepływy z `OPEN-001/OPEN-029` (można prototypować warianty bez przedstawiania ich jako gotowych).
2. **Przed implementacją danego modułu:** wszystkie powiązane `P0`, jego `P1` wpływające na testowalność oraz uzgodnione AC.
3. **Przed dopuszczeniem wielu użytkowników lub implementacją samoobsługi konta:** `OPEN-013/OPEN-032/OPEN-041`–`OPEN-046` adekwatnie do zatwierdzonych funkcji; nie implementuj propozycji jako obowiązującego MVP.
4. **Przed wyborem stacku i infrastruktury:** `OPEN-013/OPEN-014` i backlog [Technical Discovery](../technical/discovery-backlog.md), z ADR dla decyzji istotnych.

### Wstępne obszary konfliktów interpretacyjnych (nie są sprzecznymi decyzjami)

- `DEC-006/DEC-009` — rejestracja zaproszenia nie jest automatycznie tożsama z dowolnym wydarzeniem w kalendarzu: `OPEN-018`.
- `DEC-007/DEC-008` — niezależność statusu i etapu nie rozstrzyga wszystkich możliwych kombinacji: `OPEN-034`.
- `DEC-009/DEC-022` — korygowanie statusu i porządek historii muszą współistnieć bez fikcyjnych zdarzeń: `OPEN-004/OPEN-020`.
- `DEC-012/DEC-013` — ponowna sprawa vs wznowienie, a także zachowanie zadań po zamknięciu: `OPEN-019/OPEN-029`.
- `DEC-033–037` — częściowy import i historyczna migracja nie definiują transakcji ani ochrony przed awarią: `OPEN-010/OPEN-022/OPEN-035`.

## Rejestrowanie rozstrzygnięcia

Po decyzji PO: odnotuj datę/źródło, zaktualizuj odpowiedni `DEC/BR/FR/AC/UC`, zmień status `OPEN` na `RESOLVED` z linkiem do nowej decyzji w historii rejestru (nie kasuj pytania), przeprowadź analizę wpływu. **Status `RESOLVED` jest stanem operacyjnym pytania, nie zastępuje statusu decyzji `APPROVED`.**
