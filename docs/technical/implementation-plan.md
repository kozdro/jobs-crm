# Przejście SDD/AIDD → implementacja Jobs CRM

**Status:** PROPOSED plan wdrożenia; PO zatwierdził stack, pominięcie prototypu i Supabase-native rebaseline (ADR-0012); F1/F2 wykonane. F3 wykonano w zmergowanym PR #11; DEC-052 osobno autoryzuje minimalny pierwszy biznesowy create/read. Pozostałe implementacje wymagają osobnych zleceń. Zakres prac etapowych nie zastępuje pełnego publicznego MVP.

## Kolejność etapów

| Faza | Zakres | DoD / bramka |
|---|---|---|
| 0. Documentation merge / readiness | Review ADR i kontraktów, wybór minimalnego zestawu OPEN P0 dla pierwszego slice, decyzja o planie Supabase i kosztach | PR bez sprzeczności, zero niezatwierdzonych enumów/pól |
| 1. Technical foundation | Node/Next/React/TS, modular monolith, Drizzle migrations, local Supabase, docelowa integracja Supabase Auth/SSR, role/RLS, CI, Render config bez prywatnych danych | typecheck/build/test, testy natywnych sesji SDK/SSR i cross-account, SEC-01/02 |
| 2. Vertical slice RecruitmentCase | **APPROVED zakres DEC-052:** minimalny create/read, Quick Capture ręczne, własna lista i detal, idempotencja i ostrzeżenie; bez tabel historii/audytu | AC dla slice, A/B/anon HTTP, retry/concurrency/conflict, brak fikcyjnej historii, niezależny review i CI exact SHA |
| 3. Lifecycle + relacje | statusy/etapy (po OPEN-001/018/020/034), closure/reopen, firmy/kontakty, wydarzenia/zadania | testy BR i powiązań; bez auto-close |
| 4. Documents/Search | private Storage, immutable versions, autoryzacja, FTS | testy no cross-account, wysłane CV ≠ linked CV |
| 5. Imports/background | CSV/XLSX + minimalny atomowy RPC i user-scoped registry; pgmq worker dopiero przed pierwszą funkcją background; allowlisted URL adapters; bezpieczny fallback | rollback/idempotency/SSRF testy i świadoma akceptacja |
| 6. Public release readiness | Dashboard, komunikaty/powiadomienia, dostępność, account export/deletion, backup/restore, monitoring, regulamin/prywatność | wszystkie adekwatne P0/P1 zamknięte, RPO/RTO sprawdzone, security review, pełne AC/TC |

## Foundation Planning i najbliższe zadanie w odrębnym PR

[Foundation Plan](foundation-plan.md) zawiera wykonaną bazę F1/F2 i kompletną kartę **PR-F3 — Supabase-native Auth Integration**. Następny krok po akceptacji rebaseline to odrębna autoryzacja F3: browser/server SDK od razu w docelowym App Router, bez brokera ani osobnej dużej aplikacji PoC.

**Rekomendacja PROPOSED kolejności:** F3 → wymagane decyzje domenowe i ręczny RecruitmentCase/Quick Capture/own read. Minimalne F4 RPC i jego testy dołączyć do docelowego import slice po zatwierdzeniu kontraktu domenowego; mały osobny test tylko przy konkretnej luce. F5 dopiero przed pierwszym background. F6 oznacza bieżące sprawdzanie integracji/release w każdym slice, bez przepisywania F3 i bez sztucznej bramki CRUD. Nie anuluje to zatwierdzonych funkcji, idempotencji ręcznego zapisu ani publicznych SEC/DATA/IM/OPS/QA gates.

Rebaseline autoryzuje dokumentację, review i PR bez merge; nie instalację SDK, Auth/RPC, migracje ani usługi. F3 testuje lokalne kontrolowane signup, publiczne uruchomienie dopiero po politykach OPEN-041/013. [Bramki i zakres OPEN](foundation-gates.md); historyczne raporty F1/F2 bez zmian.

## Wzorzec pracy agenta

Requirement (FR/AC/BR/DEC/OPEN) → impact analysis → plan → implementacja → testy (raport z wynikiem) → review → aktualizacja dokumentacji/traceability. 1 PR na jeden logiczny slice, bez niepowiązanych refactorów. Decyzje odwracające architekturę do osobnych ADR. W PR: zmienione pliki, zakres, testy wykonane i niewykonane, ryzyka, zależności i blokujące OPEN.

**Nie uruchamiaj pełnej produkcji bez** zweryfikowanej integracji Auth/SSR, DB/RLS, atomowych importów, zatwierdzonej domenowej allowlist URL, prywatnego Storage, planu kopiowania obiektów, formalizacji retencji/usunięć i testów odzyskiwania.


## Autoryzowane wykonanie pierwszego biznesowego slice'a — 2026-10-29

Powyższy opis rebaseline pozostaje historią etapu planowania. Późniejsze zlecenie PO „First Business Vertical Slice” i [DEC-052](../decisions/product-decisions.md) autoryzują dokumentację, minimalne migracje produktu, lokalny kod/testy/CI, review, commit/push i PR z `feat/recruitment-case-first-slice`, bez merge/cloud. Baza F3: PR #11, `cd92648fd4c579cb4be57a962cd88b6e3d537583`; nie zastępuje to nowej regresji.

[Kontrakt DATA-01](recruitment-case-first-slice.md), [analiza i plan delegacji](recruitment-case-first-slice-analysis.md), [raport wykonania](recruitment-case-first-slice-report.md). Etapy: formalizacja/przegląd modelu → niezależne ownership backend/frontend/platform/QA → migracje i implementacja → unit + real local PostgreSQL/Auth/Data API + Playwright → niezależne backend/frontend/security review → aktualna traceability i final-SHA CI → otwarty PR. F4 importu, F5 worker, lifecycle, historia, relacje i publiczne wydanie pozostają poza zleceniem.


## Lokalny przyrost Lifecycle 3B — 2026-10-30

PO zatwierdził warianty 1A/2A/3A i pełne wykonanie w osobnym PR, bez merge/deploymentu: [DEC-055](../decisions/product-decisions.md), [kontrakt, wpływ i delegacja](recruitment-lifecycle-3b-analysis.md). Baza 94f9628 (merge PR #15), prace izolowane od cudzych zmian oryginalnego worktree. Zaproszenia + W rekrutacji + indywidualne etapy z historią; globalne/default etapy, zamknięcia, wznowienia, korekty i kalendarz pozostają osobnymi zakresami. Publiczne udostępnienie wymaga OPEN-004 i pozostałych zależnych bramek.

## History Corrections & Integrity — DEC-056

PO 2026-10-31 zatwierdził 1A/2A i pełne wykonanie [analizy/planu](history-corrections-integrity-analysis.md), QA, niezależny review i osobny PR. Baza merge PR #16 8729e9e; prace w izolowanym worktree. Bez merge/deploymentu, ingerencji w persistent DEV i cudze zmiany.
