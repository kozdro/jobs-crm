# ADR-0005 — CSV/XLSX bez stagingu, atomowy import i idempotencja

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.28 A / 1.29 A / 1.30 B / 1.38 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: BR-021–025; FR-IM-001–014; NFR-008; OPEN-010/022/023/024/035.

## Rozważane warianty

Trwały staging danych; zapis wiersz-po-wierszu; batch commits; hash jako wyłączny klucz.

## Decyzja

Mapowanie i preview w pamięci, brak trwałych wierszy stagingowych; zaakceptowane wiersze w jednej transakcji PostgreSQL z idempotency registry i fingerprint; przy Data API wymagane pojedyncze RPC.

## Konsekwencje i ryzyka

Duże pliki i długi commit; retry HTTP i zmiana danych między preview a commit; konieczny PoC atomic RPC, RLS, rollback, idempotency; alternatywa po nowym ADR.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
