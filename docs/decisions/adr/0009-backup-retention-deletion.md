# ADR-0009 — Backupy, usunięcia i cele RPO/RTO

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.16 A / 1.17 A / 1.18 A / 1.19 B / 1.20 B / 1.21 B. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: FR-AD-008/009; NFR-007/010; OPEN-005/006/014/032/045/046.

## Rozważane warianty

7/30/90 dni; per-account backups; modyfikacja snapshotów; 24h RPO; 4h/72h RTO.

## Decyzja

Samoobsługowe nieodwracalne usunięcie, rotacyjne 7 dni, trwały deletion ledger i replay przed udostępnieniem restore; RPO 1h i RTO 24h jako cele; monitoring/alerty.

## Konsekwencje i ryzyka

Supabase daily backups nie realizują RPO, PITR jest płatne i nie obejmuje Storage objects; potwierdzić koszt, politykę obiektów, legal retention, test DR przed release.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
