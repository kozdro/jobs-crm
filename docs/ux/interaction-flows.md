# Główne przepływy interakcji UX

**Stan:** `BASELINED` na poziomie UX behavior. Szczegóły niezatwierdzone wskazano jako `OPEN`.

## A. Zapisanie oferty bez aplikowania

`UX-006 → UX-002/UX-003 → UX-004/UX-005`

1. Użytkownik wywołuje Quick Capture z dowolnego modułu.
2. Wybiera wpis ręczny lub Smart Import jednego URL, weryfikuje rozpoznane informacje.
3. W razie problemu z odczytem wpisuje dane ręcznie; rozpatruje potencjalne duplikaty.
4. Zapisuje sprawę jako kontekst oferty (bez potwierdzenia aplikacji); pozostaje w aktualnym widoku.
5. Opcjonalnie wybiera „Zapisz i dodaj kolejną” i rozpoczyna nowy wpis.

**Nie:** automatyczne przypisanie aplikacji lub wysłanego CV. **Weryfikacja:** `UC-001`, `UC-015/UC-016`.

## B. Rekrutacje — od kontaktu do kwalifikacji

`UX-002/UX-003 → UX-004/UX-005 → kalendarz/historia`

1. Na karcie albo stronie sprawy użytkownik wybiera jednoznaczną akcję biznesową.
2. Po rzeczywistym aplikowaniu/kontakcie rejestruje kontakt, bez wymuszania statusu `W rekrutacji`.
3. Rejestruje kwalifikujące zaproszenie; system umożliwia przejście do `W rekrutacji` zgodnie z semantyką do zatwierdzenia (`OPEN-018`).
4. Przejście etapów zachowuje historię, a działania zależne od statusu wymagają stosownych danych.

**Nie:** fikcyjne zdarzenie po ręcznej korekcie ani przeskok przy DnD. **Weryfikacja:** `UC-002–005`, `UC-009`, `UC-021`.

## C. Zamknięcie i wznowienie

`UX-005 → akcja zakończenia → [wynik + decyzje o zadaniach i wydarzeniach] → UX-002/UX-003`

1. Użytkownik wybiera „Zakończ sprawę”.
2. System wymaga wyniku i pokazuje otwarte zadania/wydarzenia do świadomego rozstrzygnięcia.
3. Po zatwierdzeniu powstaje zakończenie historyczne; sprawa pozostaje wyszukiwalna.
4. Wznowienie nie usuwa poprzednich zakończeń.

Dokładna lista wyników i zachowanie „zachowaj/odłącz” są `OPEN-001/OPEN-029`; nie rysuj jeszcze ekranów jakby były ustalone. **Weryfikacja:** `UC-012/UC-013`.

## D. Wydarzenie przełożone lub nierozliczone po terminie

`UX-005 lub UX-011 → wydarzenie → zmiana terminu / rozliczenie`

- Wydarzenie ma osobne stany: przełożenie, odbyte, anulowane, nieodbyte.
- Jeśli termin minął, brak oznaczenia „odbyte” nie powoduje samoczynnej zmiany: system proponuje rozliczenie.
- Można dodać rozmowę już odbytą bez jej wcześniejszego planowania.
- Wielu uczestników łączy wydarzenie z rzeczywistą historią odpowiednich kontaktów.

**Weryfikacja:** `UC-010/UC-011`.

## E. Import CSV/XLSX — bezpieczna sekwencja

`UX-007 → UX-008 → UX-009`

1. Wybór pliku lub szablonu i mapowanie kolumn oraz statusów/etapów/wyników.
2. Podgląd, walidacja, pokazanie wierszy problematycznych i potencjalnych duplikatów.
3. Użytkownik zatwierdza zakres; w razie częściowego importu świadomie potwierdza pominięcie części rekordów.
4. Zapis i raport wynikowy obejmujący powody pominięcia.

**Nie:** cichy partial import, wymyślanie historii, automatyczne zaległe sugestie, bezrefleksyjne powtórzenie wsadu. **Weryfikacja:** `UC-017`.

## F. Wyszukiwanie i kontekst

`UX-015 → grupa wyników → UX-005/UX-013/UX-014/inny kontekst`

Wpisanie fragmentu notatki lub URL znajduje odpowiednio powiązany wynik; użytkownik może otworzyć rekord/kontekst. Nie indeksujemy w pierwszym wydaniu treści CV ani semantyki. **Weryfikacja:** `UC-020`.

## Obszary wymagające projektowania, a nie zgadywania

Formaty komunikatów błędów, exact routing po imporcie, zaawansowane filtrowanie, uprawnienia, zachowanie ekranu podczas zmian współbieżnych i responsywność: `OPEN-002/OPEN-017/OPEN-028/OPEN-033`.
