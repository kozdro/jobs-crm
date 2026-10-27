# Feature: Tasks & Notifications

**Stan:** `BASELINED` (możliwości bazowe `APPROVED`, progi i preferencje `OPEN`). **Aktor:** użytkownik. **FR:** `FR-TN-001`–`FR-TN-011`.

## Cel

Organizować kolejne działania i przypomnienia dotyczące spraw lub pracy ogólnej bez zastępowania decyzji użytkownika autonomicznymi akcjami systemu.

## Główny scenariusz

1. Utwórz zadanie z tytułem, opcjonalnym terminem, opisem i statusem; powiąż ze sprawą albo pozostaw ogólne.
2. Zadania pojawiają się w module Zadania, na Dashboardzie oraz w odpowiednich kontekstach spraw.
3. System może przypomnieć o zadaniu wewnątrz aplikacji; kanał e-mail jest opcjonalny. Nie ma push w pierwszej wersji.
4. Reguły czasu mogą wygenerować **sugestię** follow-upu, lecz nie tworzą automatycznie zadania, maila ani zamknięcia.
5. Przy zamykaniu sprawy użytkownik rozstrzyga otwarte zadania i wydarzenia (anuluj/zachowaj/odłącz).

## Przypadki brzegowe

- Brak terminu jest dozwolony dla zadania.
- Brak informacji o odpowiedzi nie dowodzi milczenia adresata; sugestia nie może twierdzić, że odpowiedź na pewno nie przyszła.
- Sugestia follow-upu może być nieaktualna po imporcie historycznych rekordów; import nie tworzy zaległych sugestii.
- Sprawa zakończona z otwartymi zadaniami wymaga decyzji; nie usuwać ich domyślnie.
- Nie zakładać progu „7 dni” ani domyślnego włączenia e-maili.

## Podstawa

`DEC-013/DEC-026–028/037`, `BR-009/BR-011/BR-020/BR-024`, `FR-TN-*`, `AC-TN-*`, `UX-001/UX-010/UX-011`, `UC-011/UC-012/UC-017`. Zależności: History & Events, Dashboard, Lifecycle, import.

## OPEN

`OPEN-008/OPEN-009/OPEN-029/OPEN-040` — wartości progów, preferencje, dokładne statusy i efekty rozwiązania zadań; kanał e-mail wymaga także Technical Discovery/security.
