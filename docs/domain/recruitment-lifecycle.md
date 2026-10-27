# Cykl życia sprawy rekrutacyjnej

**Stan:** `BASELINED`. **Powiązania:** `DEC-001–013`, `BR-001–012`, [specyfikacja funkcji](../features/recruitment-lifecycle.md).

## Statusy

| Status | Znaczenie i istotne ograniczenie |
|---|---|
| **Zapisane** | Kontekst zapisany przed faktyczną aplikacją/kontaktem; URL sam w sobie nie oznacza kontaktu. |
| **Kontakt rozpoczęty** | Wykonano lub zarejestrowano kontakt / aplikację; samo potwierdzenie otrzymania aplikacji nie oznacza etapu kwalifikacyjnego. |
| **W rekrutacji** | Jest zaproszenie do konkretnego etapu kwalifikacyjnego (np. screening, HR, zadanie techniczne). |
| **Zakończone** | Sprawa zamknięta z wynikiem; historia i zakończenia pozostają. |

**Nie istnieje status Wstrzymane.** Status ogólny nie zastępuje szczegółowego etapu, a etap nie wymusza domyślnego statusu bez uwzględnienia `OPEN-018/OPEN-034`.

## Zatwierdzone akcje a skutki

| Akcja | Znaczenie biznesowe | Warunki / bramki |
|---|---|---|
| Zapisz ofertę/sprawę | Powstaje kontekst `Zapisane` bez faktu aplikowania. | `BR-001/BR-021`, `OPEN-002` |
| Oznacz jako aplikowane | Rejestruj rzeczywisty fakt wysłania aplikacji. | Nie ustawiaj `W rekrutacji` wyłącznie za wysłanie CV (`BR-004`). |
| Zarejestruj kontakt | Rejestruj faktyczny kontakt (także outbound bez CV lub inbound od rekrutera). | Kontakt wymaga sprawy (`BR-018`). |
| Zarejestruj zaproszenie / Rozpocznij rekrutację | Wejście do kwalifikacyjnego etapu. | Moment i zależność tych akcji: **`OPEN-018`**. |
| Zmień etap | Zmiana szczegółowego etapu z zachowaniem historii. | Szablon/propagacja: `OPEN-003/OPEN-027/OPEN-034`. |
| Zakończ sprawę | Zapisz wynik i rozstrzygnij otwarte działania. | Obowiązkowy wynik, `BR-008/BR-011`, `OPEN-001/OPEN-029`. |
| Wznów sprawę | Aktywuj kontynuację bez usuwania zakończeń. | Status docelowy i wybór nowej sprawy: `OPEN-019/OPEN-020`. |
| Skoryguj status | Napraw błędną klasyfikację bez tworzenia fikcyjnej akcji. | `OPEN-020`, `BR-007/BR-016`. |

To **nie jest zamknięta tabela wszystkich dozwolonych przejść**. W szczególności nie zakładamy, że każde przeciągnięcie w Kanbanie wolno zrealizować bez dialogu i bez danych uzupełniających.

## Inwarianty historyczne

- Każde zamknięcie posiada wynik, poprzednie zamknięcia pozostają po wznowieniu.
- Przeglądanie i wyszukiwanie spraw zamkniętych pozostaje możliwe.
- Reaplikowanie może być nową sprawą; decyzję o tym, kiedy, doprecyzować w `OPEN-019`.
- Rejestracja zdarzenia dziś może zawierać rzeczywistą datę zdarzenia w przeszłości i **osobno** datę wpisania go do CRM.
- Zmiana statusu przez korektę nie oznacza potwierdzenia faktów, których nie było.

## Przykłady

1. `Zapisane` + link do ogłoszenia → faktyczne wysłanie aplikacji → `Kontakt rozpoczęty` (nie `W rekrutacji`).
2. Spontaniczny kontakt z CTO bez CV → `Kontakt rozpoczęty`; brak ogłoszenia jest prawidłowy.
3. Rekruter zaprasza do kwalifikacyjnej rozmowy → istnieje podstawa do `W rekrutacji`; exact workflow `OPEN-018`.
4. Zakończenie + późniejszy powrót firmy → możliwe wznowienie bez kasowania poprzedniego wyniku.

## Brakujące decyzje blokujące implementację automatu stanów

`OPEN-001`, `OPEN-018`, `OPEN-020`, `OPEN-029` oraz powiązane `OPEN-002/OPEN-034`. Nie implementować domniemanego pełnego grafu przejść.
