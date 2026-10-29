# Technical Discovery — pozostałe bramki i analiza wpływu

**Stan:** OPEN / VALIDATION REQUIRED dla szczegółów. Wybrane technologie są APPROVED, ale nie przesądzają odrębnych reguł domenowych. Identyfikatory OPEN zachowujemy i nie kasujemy.

## Mapa OPEN do zamknięcia

| Priorytet | OPEN | Kontrakt/bloker |
|---|---|---|
| P0 przed modelem sprawy | 001,002,004,005,018,020,029 | wynik zamknięcia, pola, korekta, kasowanie, kwalifikujące zaproszenie, skutki zamknięcia |
| P0 przed CSV import | 010 (częściowo technicznie ustalone),022,024,035 (mechanizm wybrany) | walidacja mapowań, duplikatów, retry; minimalne RPC w docelowym import slice, bez blokowania CRUD |
| P0 przed publiczną rejestracją | 013 (technologia wybrana),032,041 (samoobsługa wybrana),042 (model wybrany),045 (format wybrany),046 (tryb wybrany) | bezpieczeństwo Auth/SSR, natywne scopes sesji, zakres eksportu, retencja, zgodność prawna i kasowanie |
| P0/P1 pliki | 006,007,036 | metadane sent version, archiwizacja, prawnie uzasadniona retencja, rozmiary, formaty |
| P1 Smart Import | 011,025 | konkretne dopuszczone domeny, warunki pobierania, redirect i SSRF |
| P1 UX i moduły | 003,008,009,017,019,021,023,026,027,028,030,033,034,037,038,039,040,043,044 | dokładne przebiegi/pola/progi/słowniki/testy |
| P2 / architektura | 012,014 | stack/hosting wybrane, ale zatwierdzenie kosztów, backupów i operacyjnego planu nadal potrzebne |
| P2 odroczone | 015,016,031 | branding, monetyzacja, future Career Agent |

Nie uznajemy całych OPEN-010/013/014/032/042/045/046 za zamknięte: część technologiczna ma rozstrzygnięcie, ale polityka lub proof testów nie.

## Bramy techniczne przed produkcją

- **SEC-01:** standardowa integracja Supabase Auth/SSR według ADR-0012: browser/server SDK cookies i refresh, email/signup/reset, Google PKCE, local/global/others, zaufany user, XSS/token leakage, CSRF właściwy endpointom, cache A/B i redakcja. Testować odmowę niepoprawnej/wygasłej sesji i brak refresh po revoke; osobno udokumentować ważność wydanego JWT do expiry. Bez brokera, HttpOnly-only i target-by-id; brak live credentials = NOT RUN Google. Operacje wrażliwe wymagają dodatkowej ochrony według OPEN, a nie założenia natychmiastowej revocation.
- **SEC-02:** macierz RLS dla wszystkich tabel, Storage, views/RPC oraz worker; testy negatywne dwóch kont.
- **SEC-03:** allowlist domen zatwierdzona po testach dostępności i zasad pobierania; SSRF, redirects i Playwright subresources bez obejścia.
- **DATA-01:** logiczny schemat zatwierdzony po OPEN-002 i typach wyników/stage; brak fikcyjnych wydarzeń.
- **IM-01:** jedno minimalne atomic RPC PostgreSQL na zaakceptowany wsad + minimalny user-scoped key/registry i fingerprint, rollback, payload conflict, RLS/grants i podstawowe retry/concurrency. ADR-0005 ACCEPTED; przed importem, bez zależności zwykłego CRUD.
- **OPS-01:** realistyczne kosztorysy, RPO 1 h i retencja 7 dni dla DB **i** Storage, DR test, rejestr usunięć.
- **QA-01:** testy mapowane na FR/AC/TC; brak regresji zakończenia, przypomnień i historii.

## Zmiany w istniejących specyfikacjach

- DEC-029/030/FR-QC-003–005/AC-QC-003–005: Smart Import **best effort tylko w domenach dopuszczonych**, dla innych manual fallback, brak bulk.
- FR-IM-005–014/AC-IM-008/011/014: mapowanie/preview w pamięci, commit wyłącznie atomowy przy zaakceptowanym partial import, idempotency registry; zamknąć szczegóły OPEN.
- FR-AD-003–006/008–009/AC-AD-*: samorejestracja, sesje, reset, eksport i kasacja zostały **jawnie wybrane**; aktualizacja statusu wymaga finalizacji pozostałych pól/polityk, dlatego zachowane odpowiednie OPEN.
- DEC-040/FR-DO-* i FR-GS-*: wersjonowanie immutable z zachowaniem faktu wysyłki oraz PostgreSQL FTS; forma fizyczna i indeksy są ADR, nie nową domenową regułą.
- UX Blueprint sugeruje prototyp jako następny etap; **PO świadomie go pominął**. Walidacja UX następuje w trakcie slices z Playwright/testami manualnymi.
- Stara propozycja PoC importu ze stagingiem została zastąpiona przez zatwierdzony **in-memory + atomic SQL**.

## Efekty świadomie odłożone

Staging środowisko, osobny REST API/tRPC, mikroserwisy, semantic search, OCR dokumentów i career agent. Wybrany brak MFA MVP to decyzja bezpieczeństwa; nie mylić z brakiem CSRF/XSS/abuse protection.

## Uwaga prawna

CSV/XLSX może nie wystarczyć do realizacji wszystkich praw podmiotu danych; retencja usunięć i backupów wymaga osobnej analizy prawnej. Architektura nie składa deklaracji zgodności RODO bez takiej weryfikacji.

## Supersession 2026-10-29

[ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) zastępuje ADR-0003, TD1.7/1.8 w opisanym zakresie i poprzedni SEC-01. SEC-02 oraz IM-01 zachowują niezmienniki. OPEN-013/042 nie utrzymują anulowanej bramki brokera; TTL/reauth pozostają otwarte. F3 docelowo integruje Auth, F4 przy imporcie, F5 przed background, F6 jako kontrole każdego slice. [Karty i zależności](foundation-plan.md).

**Doprecyzowanie wykonania F3:** flaga local fixture i ukrycie formularzy kontrolują UI aplikacji, nie bezpośrednie Auth API. Przed wdrożeniem OPEN-013/041/043 wymagają decyzji i sprawdzenia konfiguracji dostawcy (signup, potwierdzenia, recovery, zabezpieczenia zmiany poświadczeń). Bramka BFF nie zastępuje ich. Lokalne ustawienia i pomiary w [raporcie F3](foundation-f3.md) nie ustanawiają polityki produkcyjnej.
