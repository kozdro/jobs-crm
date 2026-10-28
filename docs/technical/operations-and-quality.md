# Operacje, niezawodność i jakość

**APPROVED — cele techniczne:** Render Web Service + worker, Supabase, dev+prod, 7 dni kopii, RPO ≤1h, RTO ≤24h, monitoring+alerty, warstwowy CI. **NOT VERIFIED**: koszt, backup Storage, rzeczywista wykonalność RPO/RTO.

## Infrastruktura

- Render: Next.js server i oddzielny proces worker; brak Redis na starcie.
- Supabase: zarządzane PostgreSQL, Auth, private Storage, pgmq basic durable queues; pgmq i schema nie są dostępne zwykłym użytkownikom bez jawnych grantów.
- Dev lokalnie z syntetycznymi danymi. Produkcja osobna, bez stagingu na start; konfiguracja deploymentu umożliwia późniejsze dodanie stagingu.
- Sekrety w bezpiecznej konfiguracji usługi, never git; osobne keys/env per environment. Wyłączenie workerów ani deploy nie może zgubić informacji o zadaniu.

## Kopie, RPO/RTO

- Retencja zatwierdzona **7 dni** (wyjątki prawne i czasy realnej kasacji danych: OPEN-032). Backup DB i kopie zawartości Storage muszą mieć spójną politykę odtwarzania i testy, z uwzględnieniem niezmiennych wersji i usuniętych plików.
- Supabase **Pro daily backups przez 7 dni nie zapewniają RPO ≤1h**. Rozważyć i wycenić PITR (dodatkowy koszt i minimalny compute wg aktualnej dokumentacji); gdy PITR jest włączony, **zastępuje** dzienne backupy DB. Obiekty w Storage **nie są w DB backupie**, więc osobny proces wersjonowania/kopii/replikacji jest obowiązkową bramką.
- RTO ≤24h to **cel**, nie SLA; odzyskanie obejmuje RLS, Auth, dokumenty, kolejkę i odtworzenie deletion ledger przed dopuszczeniem ruchu. Wyznaczyć operatora, runbook, scenariusz odcięcia dostępu/maintenance i procedurę weryfikacji.
- Rejestr usunięć (tombstones) musi przeżyć przywrócenie starszej DB; projektować minimalną retencję danych osobowych, trwałość poza odtwarzaną bazą i nieodwracalny replay. Zgodność i okres rejestru: OPEN-032/046.

## Obserwowalność

Ustrukturyzowane logi z correlation ID i technicznym job_id; bez zawartości CV/notatek/tokenów/passwordów, bez pełnych prywatnych URL jeśli mogą zawierać dane. Health checks + error tracking, alerty uptime/worker stale/failed jobs/nieudany backup/restore smoke. Logi techniczne nie są wpisami historii biznesowej. Wartości progów, dostawcy i retencji logów: PROPOSED/OPEN.

## Testy i pipeline

| Bramka | Technologia / wymaganie |
|---|---|
| Statyczne | ESLint, Prettier, TypeScript strict, build Next |
| Unit/domain | Vitest i testy invariantów BR |
| Integracyjne | PostgreSQL/Supabase Local, realne migracje, RLS A/B, RPC atomowość |
| E2E | Playwright, krytyczne przepływy UX, Auth, import, dokument, zamknięcie |
| Security | SSRF, upload, session revocation, privilege/RLS, log leaks |
| CI | GitHub Actions na PR: typy, lint, testy, build; wymagane kontrole przed merge (konfiguracja branch protection po włączeniu repo implementacji) |
| Release | Security gates + smoke+rollback+test restore; brak fikcyjnych statusów PASSED |

Nie narzucać progów coverage bez sensu biznesowego; mapować FR→AC→TC i raportować, co uruchomiono. Wprowadzanie funkcji etapami nie redukuje granicy publicznego MVP. Nie potrzebujemy dedykowanego preview per PR ani kosztownej HA przed potwierdzeniem potrzeb.

**Referencje do zweryfikowania podczas wdrożenia:** https://supabase.com/docs/guides/platform/backups ; https://supabase.com/docs/guides/queues ; https://render.com/docs/background-workers .
