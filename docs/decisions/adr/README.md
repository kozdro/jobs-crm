# Architecture Decision Records (ADR)

**Stan:** 11 decyzji architektonicznych **ACCEPTED** — ADR-0001–0010 na podstawie wyborów właściciela projektu Technical Discovery 1.1–1.40 z dnia 2026-10-28, ADR-0011 na podstawie osobnego zlecenia F1 z 2026-10-29. **Implementacja:** F1 autoryzowany 2026-10-29; bieżące dowody w [raporcie F1](../../technical/foundation-f1.md). Szczegóły w [rejestrze](../../technical/discovery-decisions.md).

- [ADR-0001](./0001-modular-nextjs.md)
- [ADR-0002](./0002-relational-state-history.md)
- [ADR-0003](./0003-supabase-auth-rls.md)
- [ADR-0004](./0004-private-storage-versions.md)
- [ADR-0005](./0005-atomic-inmemory-import.md)
- [ADR-0006](./0006-allowlisted-smart-import.md)
- [ADR-0007](./0007-render-worker-queue.md)
- [ADR-0008](./0008-postgres-fulltext.md)
- [ADR-0009](./0009-backup-retention-deletion.md)
- [ADR-0010](./0010-quality-ci-environments.md)
- [ADR-0011](./0011-frontend-foundation.md) — rozszerzenie F1 zatwierdzone osobnym zadaniem PO 2026-10-29, poza baseline TD1.1–1.40.

ADR zapisuje zatwierdzone wybory techniczne, nie stanowi dowodu wykonalności integracji ani zgody na domyślne rozstrzygnięcie OPEN. W przyszłości istotna zmiana architektury wymaga nowego ADR ze statusem ACCEPTED, a stary oznaczany jest SUPERSEDED z linkiem. Minimalna treść: data/status/PO, kontekst FR/NFR/BR/OPEN, warianty, decyzja, konsekwencje, testy, migracja i odwracalność.
