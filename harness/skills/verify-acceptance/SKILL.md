---
name: verify-acceptance
description: Zweryfikuj AC Jobs CRM na rzeczywistych dowodach i odróżnij PASS, FAIL oraz NOT RUN dla testów, review i brakującego środowiska.
---

# Weryfikacja akceptacji

**Wejście:** konkretny kandydat (commit albo identyfikowalny diff), plan testów, ID AC/UC/TC, dostępne środowisko i wyniki. Brak środowiska jest wejściem do uczciwego raportu, nie podstawą sukcesu.

**Źródła:** [delivery](../../workflows/delivery.md), [AC](../../../docs/quality/acceptance-criteria.md), [scenariusze](../../../docs/quality/scenarios.md), [traceability](../../../docs/quality/traceability.md), [operacje i jakość](../../../docs/technical/operations-and-quality.md) oraz [security](../../../docs/technical/security-and-privacy.md) dla dotkniętych granic.

1. Powiąż każde AC z testem lub uzasadnioną kontrolą manualną. `qa-engineer` projektuje, pisze i uruchamia brakujące testy w autoryzowanym zakresie; brak pokrycia oznacza lukę, nie PASS.
2. Sprawdź kandydata, konfigurację i środowisko. Używaj syntetycznych danych; nie uruchamiaj testów przeciw produkcji ani zasobom płatnym bez właściwej autoryzacji.
3. Uruchom istniejące komendy. Zapisz komendę, datę, środowisko, exit code, liczbę wykonanych testów i zwięzły wynik; dołącz bezpieczne lokalizacje dowodów bez sekretów i PII. Weryfikacja manualna wymaga zapisanych czynności oraz obserwacji.
4. Przy dostępie do danych sprawdź konto A/B, owner authorization i RLS; dla krytycznych zapisów transakcje, rollback, retry i idempotencję. Dobierz regresje historii, duplikatów i automatycznych działań według dotkniętych BR.
5. Nadaj status każdej kontroli: `PASS` tylko dla wykonanej i spełnionej; `FAIL` dla wykonanej niespełnionej; `NOT RUN` dla niewykonanej, z przyczyną. Błąd konfiguracji lub zero wykrytych testów nie dowodzi AC. Odrębnie wskaż blokadę decyzyjną.
6. Rozdziel testy automatyczne, kontrolę statyczną, obserwacje manualne i opinię reviewera. Review nie zastępuje testu. Po zmianie kandydata powtórz kontrole, których dowody straciły ważność.

**Wynik:** macierz ID → metoda → kandydat/środowisko → dowód → status → luka/następny krok. W v1 testy aplikacyjne bez aplikacji są `NOT RUN`; działający walidator harnessu nie zmienia tego statusu.

**STOP:** nieznany cel danych, brak autoryzacji nieodwracalnego testu, ryzyko ujawnienia sekretów lub niemożliwe do potwierdzenia wyniki. Nie deklaruj zakończenia akceptacji, gdy wymagana kontrola jest FAIL lub NOT RUN.

**DoD:** wszystkie AC w zakresie mają jawny stan i pokrycie; wyniki można odtworzyć; niewykonane kontrole i ograniczenia nie są ukryte w zbiorczym PASS.
