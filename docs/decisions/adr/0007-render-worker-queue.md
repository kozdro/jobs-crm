# ADR-0007 — Render Web+Worker i Supabase Queues

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.24 B / 1.34 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: FR-QC/FR-IM; NFR-008/009/010; OPEN-011/014.

## Rozważane warianty

Tylko synchroniczne HTTP; always-async dla każdego URL; Redis/BullMQ; VPS.

## Decyzja

Render dla Next.js oraz osobnego worker process, Supabase pgmq durable queue. Synchroniczny fast path i async heavy path; stan zadań i wyniki dostępne tylko uprawnionemu ownerowi.

## Konsekwencje i ryzyka

Dodatkowy koszt workera, at-least-once execution przy awarii; lease/retry, shutdown, obserwowalność, idempotencja; worker nie jest izolacją SSRF sam w sobie.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
