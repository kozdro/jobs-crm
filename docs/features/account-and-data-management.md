# Feature: Account & Data Management

**Stan dokumentu:** `BASELINED` (formalizacja zakresu i luk). **Status zachowań:** mieszany — `APPROVED` wyłącznie dla wejścia po zalogowaniu i ochrony prywatnych danych; samoobsługa konta to `PROPOSED`, zależna od `OPEN`. **Aktor:** właściciel własnego konta; w testach izolacji również drugi, odrębny użytkownik. **FR:** `FR-AD-001`–`FR-AD-009`.

## Cel i granica zatwierdzenia

Jobs CRM jest osobistym workspace'em zawierającym prywatne CV, historię rekrutacji, notatki i dane kontaktowe. `DEC-018` zatwierdza Dashboard **po zalogowaniu**, a `BR-030/NFR-001` wymagają poufności danych. Nie wynika z tego zatwierdzony sposób rejestracji, mechanizm uwierzytelniania, dostawca usług, model sesji ani zakres operacji „pobierz/usuń wszystko”.

| Zachowanie | Status | Wymagania | Blokada decyzji |
|---|---|---|---|
| Wejście do prywatnego workspace'u po logowaniu | APPROVED (tylko rezultat) | FR-AD-001 | OPEN-013 |
| Dane i pliki użytkownika nie są dostępne innym kontom/nieuprawnionym kontekstom | APPROVED (niezmiennik prywatności) | FR-AD-002 | OPEN-006/OPEN-013/OPEN-032 |
| Samodzielna rejestracja | PROPOSED | FR-AD-003 | OPEN-041 |
| Wylogowanie i zakończenie sesji | PROPOSED | FR-AD-004 | OPEN-042 |
| Czas życia i obsługa sesji | PROPOSED | FR-AD-005 | OPEN-013/OPEN-042 |
| Odzyskiwanie dostępu | PROPOSED | FR-AD-006 | OPEN-043 |
| Edycja podstawowego profilu | PROPOSED | FR-AD-007 | OPEN-044 |
| Eksport własnych danych | PROPOSED | FR-AD-008 | OPEN-032/OPEN-045 |
| Żądanie usunięcia konta i danych | PROPOSED | FR-AD-009 | OPEN-005/OPEN-006/OPEN-032/OPEN-046 |

`PROPOSED` oznacza propozycję do decyzji PO, **nie** dorozumiany zakres zatwierdzonego MVP ani upoważnienie do implementacji. Istniejące `OPEN-013` i `OPEN-032` pozostają otwarte.

## Scenariusze i warunki wejścia

**APPROVED — granice:**

1. Użytkownik, który przeszedł nieokreślony jeszcze proces logowania, otwiera swój Dashboard bez obowiązkowego onboardingu (`FR-AD-001`, `DEC-018`).
2. Zapisane sprawy, kontakty, notatki, wydarzenia i wersje dokumentów należą do prywatnego kontekstu. Odwołania, listy, wyszukiwarka, historia i pobieranie plików nie mogą ujawniać danych innemu nieuprawnionemu użytkownikowi (`FR-AD-002`, `BR-030`).
3. Uprawniony dostęp do własnego dokumentu pozostaje możliwy; szczegóły autoryzacji i uprawnień muszą zostać zatwierdzone (`OPEN-006/OPEN-013`).

**PROPOSED — przepływy do zatwierdzenia:** rejestracja lub inny sposób założenia konta; wylogowanie i unieważnianie dostępu; zachowanie sesji; odzyskanie konta bez ujawniania cudzych danych; edycja profilu; przegląd zakresu eksportu; wniosek o usunięcie konta. Każdy przepływ wymaga wyboru polityki i walidacji w `OPEN-041`–`OPEN-046`. Nie definiujemy ekranów, pól ani domyślnych ustawień.

## Alternatywy, błędy i ochrona danych

- Brak zalogowania / błędne uprawnienie: **nie ujawniaj** prywatnych rekordów, metadanych, wyników wyszukiwania ani zawartości plików; dokładne komunikaty oraz przekierowania są `OPEN-013/OPEN-017`.
- Dwie osoby zapisujące tę samą nazwę firmy lub adres URL nie uzyskują prawa do swoich wzajemnych rekordów tylko przez podobieństwo danych.
- Dokument z biblioteki powiązany z wieloma sprawami nadal podlega uprawnieniom właściciela; link do dokumentu nie jest dowodem uprawnienia do odczytu.
- Dla eksportu nie zakładamy formatu, zakresu danych powiązanych, cyklu przygotowania, zabezpieczeń pobierania ani reguł usuwania eksportów (`OPEN-045`).
- Przy usunięciu konta nie zakładamy natychmiastowej fizycznej kasacji, okresu karencji, możliwości cofnięcia ani wpływu na historię i backupy (`OPEN-046`). Stare powiązania dokumentów/wysłanych wersji CV są chronione przed fikcyjną zmianą historii (`BR-026`).
- Brak wyboru dostawcy Auth, sposobu wysyłania e-maili, modelu danych lub polityki retencji.

## Kryteria i zależności

`AC-AD-001`–`AC-AD-009` w [katalogu AC](../quality/acceptance-criteria.md), `UC-033`–`UC-036` w [scenariuszach](../quality/scenarios.md), [traceability](../quality/traceability.md).

Zależności: `FR-DB-001`, `FR-DO-010`, `FR-GS-001`–`FR-GS-008`, `FR-IM-*`, `BR-030`, `NFR-001/NFR-004/NFR-007`, `UX-017`–`UX-019`. Istotne decyzje: `OPEN-005/OPEN-006/OPEN-013/OPEN-032/OPEN-041`–`OPEN-046`; analiza zabezpieczeń w [Technical Discovery](../technical/discovery-backlog.md).

**Warunek dla dalszych prac:** implementować można tylko zatwierdzony po rozstrzygnięciu `OPEN` zakres. Niniejszy dokument nie wybiera rozwiązania technicznego ani nie ustanawia nowej decyzji produktowej.
