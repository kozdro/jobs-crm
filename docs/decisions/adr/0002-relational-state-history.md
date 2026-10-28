# ADR-0002 — SQL oraz rozdzielenie stanu, historii i audytu

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.1 B / 1.2 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: BR-001/007/010/015/016/026; NFR-002; OPEN-002/004/005.

## Rozważane warianty

Zwykły CRUD z luźnymi logami; Event Sourcing; NoSQL; hybryda.

## Decyzja

Relacyjny PostgreSQL, stan agregatu osobno od historii biznesowej i technicznego audytu; FK/transakcje; historia korekt nie fabrykuje zdarzeń.

## Konsekwencje i ryzyka

Model historii wymaga OPEN-004/020; testy wznowień, zamknięć, importu starych dat; możliwość migracji relacyjnej bez event sourcing.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
