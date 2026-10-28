# Przejście SDD/AIDD → implementacja Jobs CRM

**Status:** PROPOSED plan wdrożenia; PO zatwierdził stack i pominięcie prototypu, nie autoryzował jeszcze wygenerowania aplikacji. Zakres prac etapowych nie zastępuje pełnego publicznego MVP.

## Kolejność etapów

| Faza | Zakres | DoD / bramka |
|---|---|---|
| 0. Documentation merge / readiness | Review ADR i kontraktów, wybór minimalnego zestawu OPEN P0 dla pierwszego slice, decyzja o planie Supabase i kosztach | PR bez sprzeczności, zero niezatwierdzonych enumów/pól |
| 1. Technical foundation | Node/Next/React/TS, modular monolith, Drizzle migrations, local Supabase, Auth/BFF spike, role/RLS, CI, Render config bez prywatnych danych | typecheck/build/test, krytyczny test sesji HttpOnly i cross-account |
| 2. Vertical slice RecruitmentCase | Minimalny **zatwierdzony** model sprawy, Quick Capture ręczne, lista/karta, historia biznesowa vs audyt | AC dla slice, user A/B isolation, nie-fikcyjna historia |
| 3. Lifecycle + relacje | statusy/etapy (po OPEN-001/018/020/034), closure/reopen, firmy/kontakty, wydarzenia/zadania | testy BR i powiązań; bez auto-close |
| 4. Documents/Search | private Storage, immutable versions, autoryzacja, FTS | testy no cross-account, wysłane CV ≠ linked CV |
| 5. Imports/background | CSV/XLSX + atomowy RPC, import registry; pgmq worker; allowlisted URL adapters; bezpieczny fallback | rollback/idempotency/SSRF testy i świadoma akceptacja |
| 6. Public release readiness | Dashboard, komunikaty/powiadomienia, dostępność, account export/deletion, backup/restore, monitoring, regulamin/prywatność | wszystkie adekwatne P0/P1 zamknięte, RPO/RTO sprawdzone, security review, pełne AC/TC |

## Foundation Planning i najbliższe zadanie w odrębnym PR

[Foundation Plan](foundation-plan.md) doprecyzowuje fazę 1: PR-F1 scaffold/CI bez usług, PR-F2 lokalny syntetyczny DB/RLS, PR-F3 Auth HttpOnly BFF, PR-F4 atomowy RPC, PR-F5 worker/queue i config, PR-F6 przyjęcie dowodów i integracja zatwierdzonych adapterów Auth/BFF. F5 jest wymagany przed funkcją background; manualny slice może być osobno autoryzowany po F1–F4/F6 i bramkach domenowych. Plan obejmuje też przyszłe zadania DB+Storage restore przed publicznym uruchomieniem. **Najbliższy proponowany PR implementacyjny: PR-F1**, wyłącznie po osobnej autoryzacji PO na jego konkretną kartę. Możliwe późniejsze PoC używają danych syntetycznych, bez budowy pełnego produktu. Przed pierwszym kodem aplikacyjnym uzyskać osobną zgodę PO na zakres zadania i rozstrzygnąć powiązane OPEN. PoC nie mogą tworzyć użytkowników produkcyjnych ani włączać publicznej rejestracji.

## Wzorzec pracy agenta

Requirement (FR/AC/BR/DEC/OPEN) → impact analysis → plan → implementacja → testy (raport z wynikiem) → review → aktualizacja dokumentacji/traceability. 1 PR na jeden logiczny slice, bez niepowiązanych refactorów. Decyzje odwracające architekturę do osobnych ADR. W PR: zmienione pliki, zakres, testy wykonane i niewykonane, ryzyka, zależności i blokujące OPEN.

**Nie uruchamiaj pełnej produkcji bez** Auth PoC, DB/RLS, atomowych importów, zatwierdzonej domenowej allowlist URL, prywatnego Storage, planu kopiowania obiektów, formalizacji retencji/usunięć i testów odzyskiwania.
