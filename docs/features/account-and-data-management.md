# Feature: Account & Data Management

**Stan dokumentu:** `BASELINED` (formalizacja zakresu i luk). **Status zachowań:** mieszany — `APPROVED` dla wejścia po zalogowaniu, prywatności i podzakresu Supabase-native DEC-051; pełne kontrakty samoobsługi pozostają `PROPOSED` z otwartymi szczegółami. **Aktor:** właściciel własnego konta; w testach izolacji również drugi, odrębny użytkownik. **FR:** `FR-AD-001`–`FR-AD-009`.

## Cel i granica zatwierdzenia

Jobs CRM jest osobistym workspace'em zawierającym prywatne CV, historię rekrutacji, notatki i dane kontaktowe. `DEC-018` zatwierdza Dashboard **po zalogowaniu**, a `BR-030/NFR-001` wymagają poufności danych. Późniejsze Technical Discovery i decyzja PO z 2026-10-29 [DEC-051](../decisions/product-decisions.md) zatwierdzają Supabase-native Auth/SSR: e-mail/hasło + Google OAuth/PKCE, self-signup, email reset i wiele urządzeń. Formalny kontrakt: [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md). Nie rozstrzyga to wszystkich ustawień, pól i polityk operacji „pobierz/usuń wszystko”.

| Zachowanie | Status | Wymagania | Blokada decyzji |
|---|---|---|---|
| Wejście do prywatnego workspace'u po logowaniu | APPROVED (rezultat + Supabase Auth) | FR-AD-001 | OPEN-013 |
| Dane i pliki użytkownika nie są dostępne innym kontom/nieuprawnionym kontekstom | APPROVED (niezmiennik prywatności) | FR-AD-002 | OPEN-006/OPEN-013/OPEN-032 |
| Samodzielna rejestracja | Pełny kontrakt PROPOSED; dostępność APPROVED | FR-AD-003 | OPEN-041 |
| Wylogowanie local/global/others | Pełny kontrakt PROPOSED; natywne scopes APPROVED | FR-AD-004 | OPEN-042 |
| Czas życia i obsługa sesji | Pełny kontrakt PROPOSED; SDK/SSR i JWT do expiry APPROVED | FR-AD-005 | OPEN-013/OPEN-042 |
| Odzyskiwanie dostępu | Pełny kontrakt PROPOSED; reset email APPROVED | FR-AD-006 | OPEN-043 |
| Edycja podstawowego profilu | PROPOSED | FR-AD-007 | OPEN-044 |
| Eksport własnych danych | PROPOSED | FR-AD-008 | OPEN-032/OPEN-045 |
| Żądanie usunięcia konta i danych | PROPOSED | FR-AD-009 | OPEN-005/OPEN-006/OPEN-032/OPEN-046 |

`PROPOSED` pełnego kontraktu nie unieważnia jawnie zatwierdzonego podzakresu TD/DEC-051. Pozostałe polityki wymagają właściwych OPEN, a implementacja osobnego zlecenia. Istniejące OPEN-013/032 pozostają otwarte.

## Scenariusze i warunki wejścia

**APPROVED — granice:**

1. Użytkownik, który przeszedł proces logowania Supabase Auth, otwiera swój Dashboard bez obowiązkowego onboardingu (`FR-AD-001`, `DEC-018`).
2. Zapisane sprawy, kontakty, notatki, wydarzenia i wersje dokumentów należą do prywatnego kontekstu. Odwołania, listy, wyszukiwarka, historia i pobieranie plików nie mogą ujawniać danych innemu nieuprawnionemu użytkownikowi (`FR-AD-002`, `BR-030`).
3. Uprawniony dostęp do własnego dokumentu pozostaje możliwy; szczegóły autoryzacji i uprawnień muszą zostać zatwierdzone (`OPEN-006/OPEN-013`).

**Zatwierdzony podzakres sesji:** standardowe browser/server clients `@supabase/supabase-js` + `@supabase/ssr`, wspierane przez SDK cookies i refresh. Bez HttpOnly-only, token brokera, opaque handles, własnego encrypted refresh store i rejestru urządzeń. `local` kończy bieżącą sesję; `global` wszystkie; `others` pozostałe, zachowując bieżącą. Nie wymagamy zakończenia dowolnej wskazanej innej sesji. Wydany access JWT może działać do expiry; komunikat logout ma rozróżniać wynik SDK od niewspieranej gwarancji natychmiastowego odcięcia każdej powierzchni Data API.

**Otwarte szczegóły:** aktywacja/abuse kontroli signup OPEN-041, TTL i ustawienia sesji OPEN-013/042, recovery cross-device i skutki resetu OPEN-043, profil OPEN-044, zakres i ochrona eksportu/delete OPEN-032/045/046. Operacje szczególnie wrażliwe (zmiana poświadczeń, eksport wrażliwych danych, delete) wymagają odpowiedniej reautoryzacji, weryfikacji bieżącego użytkownika lub stanu konta przez wspierane mechanizmy; `getClaims()` nie dowodzi świeżego stanu cofniętej sesji. Nie definiujemy nowych ekranów, pól ani ustawień domyślnych.

## Alternatywy, błędy i ochrona danych

- Brak zalogowania / błędne uprawnienie: **nie ujawniaj** prywatnych rekordów, metadanych, wyników wyszukiwania ani zawartości plików; dokładne komunikaty oraz przekierowania są `OPEN-013/OPEN-017`.
- Dwie osoby zapisujące tę samą nazwę firmy lub adres URL nie uzyskują prawa do swoich wzajemnych rekordów tylko przez podobieństwo danych.
- Dokument z biblioteki powiązany z wieloma sprawami nadal podlega uprawnieniom właściciela; link do dokumentu nie jest dowodem uprawnienia do odczytu.
- Dla eksportu wybrano w TD CSV/XLSX i osobne dokumenty; nadal nie zakładamy szczegółowego zakresu danych powiązanych, cyklu przygotowania, zabezpieczeń pobierania ani reguł usuwania eksportów (`OPEN-045`).
- Nieodwracalne self-delete bez okresu cofnięcia wybrano w TD; nadal nie zakładamy natychmiastowej fizycznej kasacji ani pełnych skutków dla historii i backupów (`OPEN-046`). Stare powiązania dokumentów/wysłanych wersji CV są chronione przed fikcyjną zmianą historii (`BR-026`).
- Supabase jest wybranym dostawcą Auth. Konfiguracja e-mail/OAuth, model danych i polityki retencji wymagają właściwych rozstrzygnięć i testów. Browser-accessible session tokens wymagają ochrony przed XSS/wyciekiem, CSRF odpowiedniego dla cookies/endpointów, bezpiecznych redirects/PKCE, cache A/B i redakcji logów; uproszczenie nie zastępuje RLS ani prywatnego Storage.

## Kryteria i zależności

`AC-AD-001`–`AC-AD-009` w [katalogu AC](../quality/acceptance-criteria.md), `UC-033`–`UC-036` w [scenariuszach](../quality/scenarios.md), [traceability](../quality/traceability.md).

Zależności: `FR-DB-001`, `FR-DO-010`, `FR-GS-001`–`FR-GS-008`, `FR-IM-*`, `BR-030`, `NFR-001/NFR-004/NFR-007`, `UX-017`–`UX-019`. Istotne decyzje: `OPEN-005/OPEN-006/OPEN-013/OPEN-032/OPEN-041`–`OPEN-046`; analiza zabezpieczeń w [security i privacy](../technical/security-and-privacy.md).

**Warunek dla dalszych prac:** implementować można tylko zatwierdzony po rozstrzygnięciu `OPEN` zakres. Niniejszy dokument odwzorowuje TD i DEC-051; nie ustanawia dalszych polityk ani nie autoryzuje kodu.
