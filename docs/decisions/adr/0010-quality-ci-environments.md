# ADR-0010 — Warstwowe QA, CI i środowiska dev+prod

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.35 B / 1.36 A (ze stagingiem później). **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: NFR-001–011; FR/AC/UC/TC; OPEN-017/033.

## Rozważane warianty

Lekki unit-only CI; rozbudowany preview per PR; stały staging od początku.

## Decyzja

TypeScript ESLint Prettier Vitest, Postgres/RLS integration, Playwright E2E, GitHub Actions required checks; local dev + prod. Środowisko staging można dodać bez zmiany kodu domeny.

## Konsekwencje i ryzyka

Większa odpowiedzialność za release bez stagingu; synthetic test data, migration smoke/rollback, wymuszony review/CI; późniejszy staging przez osobną konfigurację.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
