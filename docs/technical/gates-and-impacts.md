# Technical Discovery — pozostałe bramki i analiza wpływu

**Stan:** OPEN / VALIDATION REQUIRED dla szczegółów. Wybrane technologie są APPROVED, ale nie przesądzają odrębnych reguł domenowych. Identyfikatory OPEN zachowujemy i nie kasujemy.

## Mapa OPEN do zamknięcia

| Priorytet | OPEN | Kontrakt/bloker |
|---|---|---|
| P0 przed modelem sprawy | 001,002,004,005,018,020,029 | wynik zamknięcia, pola, korekta, kasowanie, kwalifikujące zaproszenie, skutki zamknięcia |
| P0 przed CSV import | 010 (częściowo technicznie ustalone),022,024,035 (mechanizm wybrany) | walidacja mapowań, duplikatów, retry; RPC/atomicity PoC |
| P0 przed publiczną rejestracją | 013 (technologia wybrana),032,041 (samoobsługa wybrana),042 (model wybrany),045 (format wybrany),046 (tryb wybrany) | bezpieczeństwo BFF, granularne sesje, zakres eksportu, retencja, zgodność prawna i kasowanie |
| P0/P1 pliki | 006,007,036 | metadane sent version, archiwizacja, prawnie uzasadniona retencja, rozmiary, formaty |
| P1 Smart Import | 011,025 | konkretne dopuszczone domeny, warunki pobierania, redirect i SSRF |
| P1 UX i moduły | 003,008,009,017,019,021,023,026,027,028,030,033,034,037,038,039,040,043,044 | dokładne przebiegi/pola/progi/słowniki/testy |
| P2 / architektura | 012,014 | stack/hosting wybrane, ale zatwierdzenie kosztów, backupów i operacyjnego planu nadal potrzebne |
| P2 odroczone | 015,016,031 | branding, monetyzacja, future Career Agent |

Nie uznajemy całych OPEN-010/013/014/032/042/045/046 za zamknięte: część technologiczna ma rozstrzygnięcie, ale polityka lub proof testów nie.

## Bramy techniczne przed produkcją

- **SEC-01:** Supabase Auth + HttpOnly BFF w OAuth i refresh; wymuszona revocation, cross-account tests.
- **SEC-02:** macierz RLS dla wszystkich tabel, Storage, views/RPC oraz worker; testy negatywne dwóch kont.
- **SEC-03:** allowlist domen zatwierdzona po testach dostępności i zasad pobierania; SSRF, redirects i Playwright subresources bez obejścia.
- **DATA-01:** logiczny schemat zatwierdzony po OPEN-002 i typach wyników/stage; brak fikcyjnych wydarzeń.
- **IM-01:** atomowa funkcja importu + trwała idempotencja, walidacja payloadu i race conditions w testach.
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
