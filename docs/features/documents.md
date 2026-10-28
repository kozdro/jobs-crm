# Feature: Documents

**Stan:** `BASELINED` (logika użytkowa `APPROVED`, retencja `OPEN`). **Aktor:** użytkownik. **FR:** `FR-DO-001`–`FR-DO-010`.

## Cel

Udostępniać bibliotekę dokumentów wielokrotnego użytku i prywatne załączniki spraw, w tym wiele wersji CV, z rozróżnieniem „powiązano ze sprawą” oraz „rzeczywiście wysłano”.

## Przebieg

1. Użytkownik otwiera centralną bibliotekę, może korzystać z dokumentów wielokrotnego użytku lub dodać załącznik do konkretnej sprawy.
2. Przy dodawaniu do sprawy wybiera istniejący dokument z biblioteki albo nowy plik tylko dla sprawy, albo zapisuje plik również w bibliotece.
3. Wersje CV pozostają rozróżnialne. Dla aplikacji, do której wysłano CV, można wskazać **konkretną** wersję faktycznie wysłaną.
4. Samo powiązanie dokumentu ze sprawą **nigdy nie stanowi potwierdzenia wysłania**.

## Przypadki brzegowe

- Zmiana używanej wersji CV nie może automatycznie przepisać historii wcześniej wysłanej wersji.
- Dodanie CV do biblioteki bez powiązanej aplikacji nie tworzy zdarzenia rekrutacyjnego.
- Usuwanie pliku powiązanego z historyczną aplikacją ma nierozstrzygnięte konsekwencje: `OPEN-006/OPEN-036`.
- Mechanizmy prywatności, polityki retencji i rozmiary plików: `OPEN-006/OPEN-007/OPEN-013/OPEN-032`.

## Powiązania

`DEC-039–041`, `BR-026/BR-030`, `NFR-001`, `FR-DO-*`, `AC-DO-*`, `UX-012/UX-005`, `UC-018`. Zależności: Lifecycle, Quick Capture, Company/Contact, security/storage Technical Discovery.

## Granica operacji historycznych

Operacje na wersji CV powiązanej z faktycznie wysłaną aplikacją nie mogą po cichu zmienić historycznej tożsamości wersji (`AC-DO-005-02`). Dokładna polityka usuwania, archiwizacji i retencji wciąż wymaga `OPEN-006/036`; nie narzuca się tutaj blokady usuwania ani soft delete.
