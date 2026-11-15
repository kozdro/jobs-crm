# ADR-0015 — Documents Core: granica Storage i kompensacje

**Status:** ACCEPTED w zakresie delegacji PO DEC-065; **data:** 2026-11-11. Nie jest dowodem wykonania ani provisioningu. Dotyczy FR/AC-DO, BR-026/030, NFR-001/002, częściowych OPEN-006/007/013/032/036. Uzupełnia ADR-0004/0009/0012.

## Kontekst i decyzja

PO zatwierdził [1A/2A/3A/4A](../../technical/documents-core-analysis.md#4-jeden-zbiorczy-pakiet-decyzji-po), w tym wąską zdolność zaufanej walidacji/finalize i cleanup bez szerokiego service-role ograniczonego jedynie w kodzie. Alternatywa szerokich uprawnień nie zapewnia zatwierdzonej granicy; signed download URL nie zapewnia bieżącej autoryzacji każdego odczytu.

Prywatny obiekt ma niejawny losowy klucz i odpowiada autoryzowanemu intentowi. Upload rezerwuje quota transakcyjnie, zapisuje ograniczone pending bytes, następnie zaufany walidator sprawdza faktyczną strukturę i rozmiar. Dopiero zaufany finalize udostępnia niezmienną wersję. Klient nie nadaje ready ani wyniku walidacji, nie zmienia sprawdzonych bajtów, nie podmienia intentu. Validator ma dostęp tylko potrzebny do walidacji pending, bez overwrite. Cleanup działa wyłącznie na zatwierdzonej kolejce, nie czyta treści ani nie usuwa dowolnego wskazanego path. Tożsamości i poświadczenia są serwerowe; uprawnienia rzeczywistych SQL i Storage API muszą zostać udowodnione, nie tylko zadeklarowane.

Storage i SQL nie tworzą wspólnej transakcji: przerwany upload/finalize pozostaje niedostępny i ma ponawialną kompensację; owner/request/payload oraz receipt obsługują idempotencję i nie przywracają usuniętych danych. Delete zapisuje trwały zamiar po aktualnej kontroli Auth i preview, blokuje nowe odczyty/relacje, następnie kasuje bytes przez Storage API i minimalizuje metadane. Nieudana kasacja pozostaje widoczna i jest ponawiana. Ledger i restore działają zgodnie z DEC-065 i ADR-0009; zakończone operacje mają siedmiodniową retencję z wyjątkiem aktywnego obejmującego restore.

## Konsekwencje i dowody

Nie wolno usuwać bytes przez bezpośredni SQL na metadanych Storage ani rozstrzygać sukcesu przed potwierdzeniem Storage API. Fizyczny cel 24 h nie jest gwarancją. Wymagane rzeczywiste testy owner A/B/anon, bezpośrednie Data/Storage API, zakresy obu tożsamości, race i recovery, quota, kasacji i restore ledgeru; macierz w [analizie](../../technical/documents-core-analysis.md#7-qa--macierz-i-dowody). Niespełniony dowód zakresu uprawnień blokuje akceptację. Migracje są addytywne w istniejącym ledgerze; rollback aplikacji nie kasuje nowych danych, preferowana poprawka forward. Produkcyjny provisioning oraz pełne DR wymagają osobnego dopuszczenia.
