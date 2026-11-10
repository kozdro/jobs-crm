# Global Search — wykonanie i historia dowodów

**Podstawa:** [DEC-064](../decisions/product-decisions.md), [zatwierdzony kontrakt i macierz](global-search-analysis.md), [UX](../ux/global-search-slice.md). Implementacja jest autoryzowana wraz z jednym osobnym PR, bez merge/deploymentu/provisioningu. Wyniki są dowodami dla wskazanego kandydata, nie automatycznie dla jego następców.

## Historyczne próby weryfikacji

| Kandydat / etap | Wynik | Wyjaśnienie i granica dowodu |
| --- | --- | --- |
| Stan roboczy, unit | FAIL | Vitest 626/626 PASS; 101/102 testów Node — historyczna asercja ledgeru oczekiwała 22 migracji, dodana migracja jest 23. Oczekiwanie poprawiono z zachowaniem testów prefixów i guardów; osobne ponowienie 102/102 PASS. |
| Stan roboczy, frontend typecheck | FAIL | Pierwsza próba po dodaniu testów konfliktu wykryła błąd typu fixture. Autor poprawił fixture i osobna próba typecheck przeszła; wyniki dotyczą stanów roboczych. |
| `3a87211`, production build QA | FAIL | Turbopack nie rozwiązał zależności przez symlink wychodzący poza QA worktree. Zastąpiono go lokalną instalacją; nie stanowi to wyniku produktu. |
| `4a6275a`, integracje | FAIL: 195/199 PASS | Diagnostyka wskazała wymagające aktualizacji historyczne asercje liczby migracji oraz katalogu obiektów. Dane i pierwotny wynik zachowane niezależnie od poprawek. Browser NOT RUN w tym runnerze. |
| `b2c025c`, integracje | FAIL: 200/202 PASS | Historyczna asercja wymagała braku tabeli `case_link`, którą DEC-064 wprowadza. Oczekiwanie zaktualizowano, zachowując kontrole RLS/grants/invoker. Pełny browser runnera NOT RUN; osobny diagnostyczny browser przerwany: 17 PASS, jeden INTERRUPTED, pozostałe NOT RUN. |
| `e1c763d`, integracje | FAIL: 201/203 PASS | Fixture pomiaru pozostawił 10 000 syntetycznych spraw, przez co negatywny test czułości RLS otrzymał HTTP 206 przed asercją przecieku. Odtworzono przyczynę i dodano sprawdzane sprzątanie fixture; obie asercje A/B zachowano. Osobny browser: 15 PASS / 3 FAIL. |
| `9a297bf` | Integracje PASS 204/204; browser INTERRUPTED z 198 PASS i 16 FAIL przed przerwaniem | Bezpieczny reporter zachował kategorie i linie; przyczyny wszystkich błędów nie zostały ustalone. Przerwanie nie anuluje wcześniejszych FAIL. |
| `2ae8205` | Integracje PASS 205/205; browser FAIL 198 PASS / 18 FAIL | Odtworzono m.in. overflow i niejednoznaczny lokator reorder; nie przypisano tym przyczynom wszystkich pozostałych błędów. |
| `017c099` | Integracje PASS 206/206; browser FAIL 204 PASS / 16 FAIL | Potwierdzono m.in. historyczny test braku Search, overflow paginacji i helper Tab z limitem 30, podczas gdy nowy trigger wymagał 32 kroków. Celowany retry Calendar PASS nie wyjaśnił pierwotnego timeoutu. Pozostałe błędy bez potwierdzonej przyczyny nie są nazwane flaky. |
| `85458ff` | Build i integracje PASS 206/206; browser w toku w chwili zapisu | Review statyczne wskazało potrzebę ścieżki konfliktu rewizji i kanonikalizacji URL; wynik browser należy raportować oddzielnie. |

Próba preflight na porcie 57021 była BLOCKED przed stworzeniem targetu, ponieważ port należał do innego projektu. Przy syntetycznym upgrade pierwszy odczyt nowego RPC dał FAIL 404/PGRST202: funkcja była w PostgreSQL, lecz PostgREST jeszcze odświeżał schema cache. Po dodatnim, uwierzytelnionym preflightcie RPC ponowny syntetyczny upgrade i replay przeszły; pierwszy FAIL pozostaje zapisany.

Niezależne review `4a6275a`, `b2c025c`, `e1c763d`, `9a297bf`, `2ae8205`, `aa9d8b9` i `85458ff` wykazały findings w odpowiednim zakresie. Poprawki zostały przekazane autorom i wymagają ponownego review na kolejnym kandydacie. Ocena statyczna nie zastępuje testów bazy, browser ani exact-SHA CI.

## Aktualna bramka

Pełny browser końcowego kandydata, zamknięcie wszystkich dotkniętych findings przez niezależnych reviewerów i hosted CI dokładnego końcowego SHA pozostają do wykazania. Nie deklarować READY/pełnego PASS przed uzyskaniem tych dowodów. Historyczne wyniki, przerwania i nieustalone przyczyny pozostają w tym rejestrze także po ewentualnej zielonej próbie.
