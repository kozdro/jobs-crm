# Optional Email Reminders — task packet

**Baza:** `0806990807ca4faa8d4b5d46d7e4e0face600776`. **Autoryzacja:** PO 2026-11-09, DEC-027 1A–4A, następnie Resend REST; bez merge/deploymentu i provisioningu. DEC-063 pozostaje w mocy.

## Macierz zgodności

| Źródło/status | Wpływ i wymagany dowód |
|---|---|
| Discovery, DEC-027 i FR/AC-TN-005 APPROVED | Osobny świadomy wybór, zweryfikowany właściciel, neutralna treść, rewalidacja, 6h, bezpieczny retry, unknown i 30 dni; testy API, kolejki, fake transport i UI. |
| DEC-063 APPROVED, AC-TN-004 i BR-009/020/024 | Żadna zmiana statusu lub sugestia nie tworzy fikcyjnej komunikacji; regresja lifecycle, potwierdzenie, anulowanie, zmiana i odtworzenie. |
| UX Blueprint F09, UX-001/010 | Czytelny stan, osobny opt-in, właściciel, błędy i obsługa klawiatury; testy UI/browser. |
| TD 1.34 i ADR-0007 ACCEPTED; ADR-0013 ACCEPTED | Render Web + Worker, Supabase pgmq i Resend REST; odrębna rola, brak publicznych sekretów, testy migracji, współbieżności, awarii i redakcji. |
| BR-030, NFR-001, ADR-0012 ACCEPTED | Weryfikacja tożsamości, owner A/B/anon, RPC/Data API i granicy workera. |

OPEN-009/040 rozstrzygnięte tylko dla wskazanego cyklu; OPEN-013/014 oraz ogólna retencja, usuwanie i audyt zgody pozostają otwarte. Konto Resend, credentials, DNS, umowa, koszty i publiczne uruchomienie nie są autoryzowane. Dane i infrastruktura DEV pozostają chronione. Commit `5f9e7fb` na lokalnym main zawiera odrębną analizę Calendar; nie znaleziono w niej zależności e-mail/reminders/OPEN-009/040, nie jest przenoszony.

## Weryfikacja i review

Wyniki, kandydat i ograniczenia należy zapisać osobno po uruchomieniu. Fake transport nie dowodzi doręczenia, a przyjęcie dostawcy nie dowodzi dostarczenia do skrzynki. Wymagane niezależne backend/frontend/security review przez read-only harness, QA RLS i race oraz hosted CI na dokładnym SHA. Test PR #25 z timeoutem lifecycle zachowuje pierwotny FAIL i nieustaloną przyczynę; późniejszy PASS nie ustala przyczyny.

**Review kandydata `cd47594`:** frontend FAIL P1 — zgoda nie była związana z wersją wyświetlonego adresu; frontend FAIL P2 — odświeżenie ukrywało błąd zapisu. Backend FAIL P2 — stany terminalne były prezentowane jako zwykłe wyłączenie. Security review statyczny PASS bez findings, nie zastępuje runtime. Autorzy przygotowali poprawki, które wymagają nowego kandydata, testów i ponownego niezależnego review. Nie przypisywać wcześniejszego PASS poprawkom.

**Review `6859881`:** backend i security PASS statycznie, frontend zamknął powyższe findings statycznie, lecz zgłosił nowy P2: utrata sesji podczas odczytu przed retry powodowała pętlę zamiast przekierowania do logowania. Poprawka i test browser wymagają osobnego review oraz dowodów. Wyniki poprzednich kandydatów pozostają historyczne.


## PR #26 — Security Hardening, 2026-11-09

**Autoryzacja PO:** naprawa istniejącego PR w istniejącym izolowanym worktree; samodzielny wybór najmniejszej bezpiecznej implementacji i ocena niezależnego utrwalenia kontekstu. Bez nowego przyrostu, merge, deploymentu, provisioningu usług, eskalacji uprawnień ani zmian lokalnego main/`5f9e7fb`. Jednorazowe własne lokalne środowiska syntetyczne służą wyłącznie QA. Historyczna ocena i `42501` pozostają zachowane.

**Analiza wpływu:** FR/AC-TN-005 APPROVED, DEC-027/063 APPROVED, BR-009/020/024/030, UC/TC-023/037; prywatny kontekst zgody, publiczne RPC read/execute oraz dispatch prepare. UX F09 i istniejący token zgody zachowują kontrakt. ADR-0007/0012/0013 ACCEPTED pozostają właściwe; OPEN-013/014 i pozostałe polityki nie zostają rozstrzygnięte. Import, wyszukiwanie i fakty historii rekrutacji nie zmieniają zachowania.

**Plan i własność:** backend-engineer `backend_hardening` odpowiada za SQL/backend i własne testy jednostkowe; qa-engineer `qa_hardening` za testy integracyjne/regresyjne i dowody uruchomień; orchestrator `/root` za dokumentację i publikację istniejącego PR. Model i reasoning: dziedziczone, dokładny profil nieudostępniony. Agenci nie delegują dalej i nie nadpisują cudzych zmian. Niezależne backend/frontend/security review przez oddzielny read-only parent `harness/scripts/review.py`.

1. Niezależny prywatny snapshot dokładnego zweryfikowanego adresu i rewizji Auth wiąże wersję wyświetloną użytkownikowi, zatwierdzony zamiar i dispatch. Brak dowodu blokuje wysyłkę, również dla historycznych zamiarów bez snapshotu.
2. Porównanie pod istniejącymi blokadami Auth → owner → intent utrzymywanymi do końca przekazania transportowi. Bieżąca kontrola katalogu jest dodatkowa; niezależny snapshot musi wykrywać pominięte zmiany po cofnięciu dryftu. Sam katalog nie jest pełną ochroną.
3. QA: A→B, A→B→A (także w jednej transakcji), utrata weryfikacji, brak/wyłączenie/zmiana triggera i cofnięcie dryftu, współbieżność, stale UI/replay; regresje idempotencji, safe retry/unknown, prywatności i 6h. Symulacje oddzielnie od DDL. DDL Auth tylko we własnym jednorazowym target przy już dostępnych uprawnieniach; `42501` nie jest obchodzone. Pełne wymagane komendy QA, następnie trzy niezależne review i hosted CI końcowego SHA.
4. DoD: wykonane testy pokrywają fail-closed, brak otwartych findings blokujących, końcowy kandydat i dowody jednoznaczne. READY wymaga wszystkich bramek; wymagany test niewykonalny oznacza BLOCKED, nigdy domyślny PASS.

Wyniki bieżącego hardeningu: [raport](optional-email-security-hardening-report.md). Wcześniejsze wyniki powyżej są historyczne i nie certyfikują tej poprawki.
