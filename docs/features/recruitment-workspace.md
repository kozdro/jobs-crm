# Feature: Recruitment Workspace

**Stan:** `BASELINED` (zachowanie główne `APPROVED`). **Aktor:** użytkownik. **FR:** `FR-RW-001`–`FR-RW-011`.

## Cel i granice

Zapewnić szybki przegląd i obsługę wielu spraw, ale nie zastąpić pełnej strony sprawy ani Dashboardu. Workspace ma dwie reprezentacje tej samej domeny, nie dwa niezależne zestawy danych.

## Wejście i scenariusz główny

1. Użytkownik otwiera moduł Rekrutacje i otrzymuje domyślny Kanban z kolumnami odpowiadającymi czterem zatwierdzonym statusom.
2. Kolumna `Zakończone` jest dostępna, lecz początkowo zwinięta. Karta może pokazywać indywidualny etap.
3. Użytkownik może przełączyć na listę, filtrować, sortować i używać szybkich widoków.
4. Kliknięcie sprawy pozwala skorzystać z lekkiego drawera albo przejść do pełnej strony z osią czasu i kontekstowymi sekcjami.
5. Przesunięcie karty wywołuje odpowiednią akcję biznesową/walidację; jeśli wymaga wyniku zamknięcia lub potwierdzenia zaproszenia, operacja nie może cicho przejść do innego statusu.

## Warianty błędów

- Przeciągnięcie do `W rekrutacji` bez kwalifikującego zaproszenia: brak uzasadnionej automatycznej zmiany (`BR-005`).
- Przeciągnięcie do `Zakończone` bez wyniku i decyzji o działaniach: wymagana interakcja (`BR-008/BR-011`).
- Korekta statusu nie jest business action wynikającą automatycznie z DnD (`BR-007`).
- Brak dopasowań filtrowania: pusty stan, bez modyfikowania rekordów.

## Wyłączenia

Nie zapisujemy własnych trwałych konfiguracji filtrów w MVP. Dashboard nie zawiera kopii Kanbana.

## Powiązania i ryzyka

`DEC-019/DEC-020/DEC-049`, `BR-003–008/011`, `FR-RW-*`, `AC-RW-*`, `UC-001/UC-005/UC-012`. UX: `UX-002–005`. Powiązania z Lifecycle i History. **OPEN:** `OPEN-017/OPEN-018/OPEN-028/OPEN-029/OPEN-034` (filtry, zachowanie DnD, responsywność).
