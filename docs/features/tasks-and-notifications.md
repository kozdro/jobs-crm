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

- Brak terminu jest dozwolony; sam brak terminu nie wyzwala zaległości ani przypomnienia. Przypomnienie wymaga konfiguracji/reguły (`OPEN-009`), sugestia jest osobnym bytem.
- Brak informacji o odpowiedzi nie dowodzi milczenia adresata; sugestia nie może twierdzić, że odpowiedź na pewno nie przyszła.
- Sugestia follow-upu może być nieaktualna po imporcie historycznych rekordów; import nie tworzy zaległych sugestii.
- Sprawa zakończona z otwartymi zadaniami wymaga decyzji; nie usuwać ich domyślnie.
- Nie zakładać progu „7 dni” ani domyślnego włączenia e-maili.

## Podstawa

`DEC-013/DEC-026–028/037`, `BR-009/BR-011/BR-020/BR-024`, `FR-TN-*`, `AC-TN-*`, `UX-001/UX-010/UX-011`, `UC-011/UC-012/UC-017`. Zależności: History & Events, Dashboard, Lifecycle, import.

## OPEN

`OPEN-008/OPEN-009/OPEN-029/OPEN-040` — wartości progów, preferencje, dokładne statusy i efekty rozwiązania zadań; kanał e-mail wymaga także Technical Discovery/security.

## Recruitment Lifecycle 3C — DEC-057

[Zatwierdzony kontrakt i plan](../technical/recruitment-lifecycle-3c.md): jawne zakończenie z wynikiem, wznowienie kontynuacji i kolejne odrębne zakończenia. Nie aplikowano dotyczy cyklu konkretnego zakończenia. Audytowane korekty wyniku/dnia zachowują oryginały bez fikcyjnych zdarzeń. Zakończone bez bieżącego etapu, snapshot zachowany; wznowienie ma preview ważnej podstawy. Korekta 3A/3B nie otwiera sprawy. UI: wymagany wynik bez domyślnego, świadome potwierdzenie oferty, opcjonalny dzień/unknown, cancel bez skutków, konflikt wymaga nowego podglądu, odzyskanie identycznego zamiaru, audyt przy zakończeniu. Tylko lokalny zakres bez otwartych Task/CalendarEvent; BR-011 pozostaje wymagana dla przyszłych modułów. Pełny TC-012/Global Search i publiczne bramki poza pokryciem. Addytywny ledger, bez resetu persistent DEV. Implementacja i osobny PR autoryzowane, bez merge/deploymentu; wyniki weryfikacji raportowane osobno.
