# ADR-0001 — Modular Monolith, Next.js i natywne API

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.31 A / 1.32 A / 1.37 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: FR-DB/FR-RW/FR-QC; NFR-005/006; OPEN-012/017.

## Rozważane warianty

Oddzielny SPA + API; mikrousługi; React Router/SvelteKit; tRPC/REST.

## Decyzja

Next.js React TypeScript App Router, BFF, moduły domain/application/infrastructure; Server Components/Actions/Route Handlers, bez dodatkowego tRPC.

## Konsekwencje i ryzyka

Wysoka zależność od Next/cache, ryzyko przecieku logiki w UI; testy granic modułów, typów i integracji; możliwy późniejszy REST facade.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
