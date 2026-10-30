# Feature: Recruitment Lifecycle & Stages

**Stan:** `BASELINED`, główne zachowanie `APPROVED`, wskazane detale `OPEN`. **Aktor:** użytkownik. **Zakres FR:** `FR-LC-001`–`FR-LC-025`.

## Cel i wejście

Utrzymać wiarygodną historię sprawy od zapisania oferty albo pierwszego kontaktu aż po zakończenie i ewentualne wznowienie, przy wielu sprawach jednej firmy, zmiennych etapach i braku obowiązku wskazania ogłoszenia/stanowiska. Sprawa może zaczynać się bez pracodawcy (agencja) i bez CV (kontakt z CTO).

## Główny scenariusz

1. Zapisz sprawę, z opcjonalną ofertą i identyfikacją organizacji/osoby. Nie twórz automatycznie faktu aplikowania (`BR-001/BR-021`).
2. Wykonaj akcję „Oznacz jako aplikowane” albo „Zarejestruj kontakt” tylko dla faktu, który miał miejsce. Pozostaje semantyka `Kontakt rozpoczęty`, a nie kwalifikacja (`BR-004`).
3. Zarejestruj zaproszenie do etapu kwalifikacyjnego, rozróżniając go od samego mailowego potwierdzenia. Wejście do `W rekrutacji` nie może pominąć `OPEN-018`.
4. Korzystaj z domyślnych, globalnych lub indywidualnych etapów, pomijaj zbędne i zachowuj zmiany etapu w historii (`BR-006`).
5. Zamknij sprawę z obowiązkowym wynikiem; dla każdego otwartego zadania/wydarzenia wybierz jedną z zatwierdzonych klas rozstrzygnięcia (`BR-008/BR-011`).
6. W razie wznowienia nie usuwaj poprzedniego wyniku; odrębna aplikacja może założyć nową sprawę (`BR-010/BR-012`).

## Alternatywy i błędy

- Spontaniczna kandydatura bez ogłoszenia i nawet bez określonego stanowiska jest prawidłowa.
- Kontakt inbound od agencji nie wymaga znanego pracodawcy.
- Kilka spraw dla jednego pracodawcy nie jest błędem ani automatycznym duplikatem.
- Brak odpowiedzi prowadzi najwyżej do sugestii, **nigdy** do automatycznego zamknięcia.
- Korekta błędnego statusu nie wstawia do historii „wysłano CV”, „zaproszono” itd.
- Próba zamknięcia bez wyniku musi zostać wstrzymana; przypadek z otwartymi działaniami wymaga decyzji użytkownika.
- Drag & drop w Kanbanie inicjuje logiczną akcję lub pytanie o wymagane dane, nie obchodzi walidacji.

## Reguły, decyzje i testy

- `DEC-001–013`, `BR-001–012`, [statusy i akcje](../domain/recruitment-lifecycle.md).
- `FR-LC-001`–`FR-LC-025`, odpowiadające `AC-LC-*` w [AC](../quality/acceptance-criteria.md).
- `UC-001`–`UC-009`, `UC-012`–`UC-014`, `UC-021` w [scenariuszach](../quality/scenarios.md).

## Zależności

Quick Capture, Companies & Contacts, Tasks/Events, History, Documents, Workspace, Import i Search. To są te same fakty domenowe niezależnie od punktu wejścia.

## Blokery i granice

`OPEN-001/OPEN-002/OPEN-003/OPEN-004/OPEN-018/OPEN-019/OPEN-020/OPEN-027/OPEN-029/OPEN-034/OPEN-040`; wyniki zamknięcia i dokładny automat statusów nie są w pełni rozstrzygnięte. **Nie** dopisuj pełnej macierzy przejść jako faktu.

## Niezmienniki przy powtórnym zamknięciu

Po wznowieniu następne zamknięcie nie nadpisuje wcześniejszych ClosureRecord (`AC-LC-017-01`, `AC-LC-019-02`). Brak wyniku i nierozstrzygnięte otwarte elementy blokują zakończenie (`AC-LC-016-01/02`, `AC-LC-018-01/02`); słowniki i efekty pozostają `OPEN-001/029`.

## Wykonywany przyrost 3A — DEC-054

[Zatwierdzony kontrakt](../technical/recruitment-lifecycle-3a.md) ogranicza pierwszy przyrost do istniejącej sprawy i aplikowania/kontaktu inbound/outbound. Dwa punkty wejścia na detalu, jawne potwierdzenie faktu, opcjonalny dzień lub data nieznana; jedna historia i atomowe przejście Zapisane → Kontakt rozpoczęty. Kolejne fakty dopisywane bez zmiany statusu. Bez kanałów, relacji osób/CV, etapów i pozostałych przejść. Brak edycji/usuwania historii jest świadomym ograniczeniem lokalnego 3A, z OPEN-004 przed publicznym udostępnieniem.


## Przyrost 3B — DEC-055

[Zatwierdzony zakres 1A/2A/3A](../technical/recruitment-lifecycle-3b-analysis.md): na istniejącym detalu rejestracja kwalifikującego zaproszenia ustawia atomowo W rekrutacji i konkretny indywidualny etap. Formularz odróżnia otrzymanie zaproszenia od terminu przyszłej rozmowy, wymaga potwierdzenia faktu i skutku ustawienia etapu jako bieżącego. Nazwa po trim 1–160 punktów kodowych, opcjonalny nieprzyszły dzień, brak daty zachowany. Bez wymagania wcześniejszej aplikacji/kontaktu, osoby, firmy i CV.

W W rekrutacji można zapisać kolejne zaproszenie lub świadomie zmienić etap, także pomijając pośrednie. Zmiana etapu nie generuje zaproszenia. Rzeczywisty kontakt/aplikowanie zachowują aktywny status i etap. Historia append-only przechowuje snapshoty nazw oraz osobno dzień faktu i czas rejestracji. Konflikt równoczesnej zmiany etapu wymaga odświeżenia; replay wcześniejszej operacji nie przestawia sprawy ponownie. Bez globalnego/default zestawu, konfiguratora, Kanbana, kalendarza, closure/reopen i korekt. FR/AC-LC-007/008/011/012/013/014 i UC/TC-005/009 mają wyłącznie pokrycie tego podzakresu.
