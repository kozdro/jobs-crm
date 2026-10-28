# ADR-0003 — Supabase Auth, Data API i izolacja RLS

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.3 A / 1.4 A / 1.5 B / 1.6 B / 1.7 A / 1.8 B / 1.9 A / 1.10 A / 1.11 A / 1.33 A / 1.38 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: BR-030; FR-AD-001–006; NFR-001/004; OPEN-013/041/042/043.

## Rozważane warianty

Osobny schemat/baza per konto; Auth0; custom Auth; Drizzle user-query z własnym kontekstem roli.

## Decyzja

Shared schema owner-scoped, email/password+Google OAuth, BFF HttpOnly cookies, self-signup, session management; Data API z user JWT i RLS; Drizzle schematy/migracje oraz wyjątkowe operacje serwerowe. MFA nie w MVP.

## Konsekwencje i ryzyka

Supabase SSR nie dowodzi HttpOnly-only; unieważnienie JWT może być opóźnione; PoC Auth oraz testy RLS i sesji warunkiem wdrożenia; migracja do innego Auth wymaga mapowania tożsamości.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
