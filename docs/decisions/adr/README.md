# Architecture Decision Records (ADR)

**Stan:** 15 ADR: 14 **ACCEPTED**, ADR-0003 **SUPERSEDED** przez ADR-0012. ADR-0001–0010 dokumentują historyczne wybory TD z 2026-10-28, ADR-0011 osobne zlecenie F1, ADR-0012 decyzję PO „Supabase-native” z 2026-10-29, a ADR-0013 wybór transportu z 2026-11-09. F1/F2 mają odrębne dowody: [F1](../../technical/foundation-f1.md), [F2](../../technical/foundation-f2.md). Bieżący kontrakt w [rejestrze](../../technical/discovery-decisions.md).

- [ADR-0001](./0001-modular-nextjs.md)
- [ADR-0002](./0002-relational-state-history.md)
- [ADR-0003](./0003-supabase-auth-rls.md) — SUPERSEDED przez ADR-0012; historia zachowana.
- [ADR-0004](./0004-private-storage-versions.md)
- [ADR-0005](./0005-atomic-inmemory-import.md)
- [ADR-0006](./0006-allowlisted-smart-import.md)
- [ADR-0007](./0007-render-worker-queue.md)
- [ADR-0008](./0008-postgres-fulltext.md)
- [ADR-0009](./0009-backup-retention-deletion.md)
- [ADR-0010](./0010-quality-ci-environments.md)
- [ADR-0011](./0011-frontend-foundation.md) — rozszerzenie F1 zatwierdzone osobnym zadaniem PO 2026-10-29, poza baseline TD1.1–1.40.
- [ADR-0012](./0012-supabase-native-auth-sessions-rls.md) — ACCEPTED; Supabase-native Auth/SSR, sesje, RLS i minimalne transakcje RPC, zastępuje ADR-0003.
- [ADR-0013](./0013-reminder-email-transport.md) — ACCEPTED; wybór transportu Resend REST bez provisioningu.

- [ADR-0014](./0014-email-consent-context.md) — ACCEPTED w zakresie delegacji PO; niezależny fail-closed kontekst zgody e-mail, dowody osobno.

ADR zapisuje zatwierdzone wybory techniczne, nie stanowi dowodu wykonalności integracji ani zgody na domyślne rozstrzygnięcie OPEN. W przyszłości istotna zmiana architektury wymaga nowego ADR ze statusem ACCEPTED, a stary oznaczany jest SUPERSEDED z linkiem. Minimalna treść: data/status/PO, kontekst FR/NFR/BR/OPEN, warianty, decyzja, konsekwencje, testy, migracja i odwracalność.

- [ADR-0015](./0015-documents-storage-boundary.md) — ACCEPTED w zakresie DEC-065; granica Storage, walidacji, cleanup i kompensacji Documents Core.
