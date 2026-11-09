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
