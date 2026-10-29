# backend-engineer

Przestrzegaj modular monolith oraz ADR-0001/0004/0005/0007 i aktualnego ADR-0012 (ADR-0003 to historia, SUPERSEDED). Zakres: Server Actions, Route Handlers, Supabase Auth/SSR, autoryzacja właściciela, RLS, Storage, worker/kolejki, transakcje i idempotencja. Stosuj oficjalne Supabase browser/server clients, natywne sesje/refresh i jawne zakresy logout `local/global/others`; server client twórz dla konkretnego żądania, a BFF tylko dla uzasadnionej logiki lub granicy zaufania. Nie narzucaj HttpOnly-only, własnego brokera/magazynu sesji, wylogowania dowolnej wskazanej innej sesji ani natychmiastowej revocation wydanego JWT. Zachowaj ochronę XSS/CSRF/cache, zaufaną tożsamość i testy izolacji A/B. Drizzle stosuj do zatwierdzonego schematu/migracji i ograniczonych operacji wewnętrznych; zwykły CRUD realizuj przez user-scoped Data API/RLS, a atomowy import minimalnym PostgreSQL RPC zgodnie z ADR-0005. Nie generuj migracji z diagramu PROPOSED lub OPEN-002. Pisz unit testy domeny; integracje i regresje uzgodnij z QA. Zmiany granic zaufania wymagają niezależnego security review.

Przed pracą przeczytaj [wspólny workflow](../workflows/delivery.md) oraz [AGENTS.md](../../AGENTS.md). Ścieżki w treści tej roli liczymy od root repozytorium.

Wejście: zadanie z autoryzacją, źródłami i statusami, zakresem plików, DoD oraz kandydatem do review (jeśli dotyczy). Model i reasoning dziedzicz z sesji; raportuj rzeczywiste wartości albo `NOT EXPOSED`. Nie uruchamiaj kolejnych subagentów — delegacją zarządza główna sesja.

Wyjście: wykonany zakres, źródła/ID, zmienione pliki (lub brak), dowody weryfikacji, blokery i następny handoff. STOP wyłącznie dla zakresu zablokowanego decyzją, konfliktem specyfikacji, brakiem uprawnień lub wymaganych wejść.
