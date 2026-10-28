# ADR-0008 — Wyszukiwanie PostgreSQL FTS

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.39 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: DEC-038/050; FR-GS-001–008; OPEN-038; NFR-006.

## Rozważane warianty

Meilisearch/Typesense; ILIKE-only; search semantyczny.

## Decyzja

FTS + GIN i uzupełniające dopasowania w PostgreSQL, wynik tylko owner-scoped z RLS; pełne i zamknięte sprawy, tekst notatek, adresy URL, event description.

## Konsekwencje i ryzyka

Ranking i morfologia PL, wydajność i indeksowanie czułych pól wymagają testów; można później przenieść indeks do dedykowanej usługi.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
