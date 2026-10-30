# Mapa dokumentacji — Jobs CRM

| Pytanie | Autorytatywny dokument |
| --- | --- |
| Po co i dla kogo? | [Wizja i zakres](product/vision-and-scope.md), [persony/JTBD](product/users-and-jtbd.md) |
| Skąd pochodzą ustalenia? | [Pochodzenie baseline'u](product/discovery-provenance.md) |
| Jak rozumiemy pojęcia? | [Słownik i model](domain/glossary-and-model.md) |
| Jakie są niezmienniki? | [Reguły BR](domain/business-rules.md), [cykl życia](domain/recruitment-lifecycle.md) |
| Co aplikacja musi robić? | [Wymagania FR](requirements/functional-requirements.md) |
| Co z jakością i bezpieczeństwem? | [NFR](requirements/nonfunctional-requirements.md), [strategia testowa](quality/test-strategy.md) |
| Co dokładnie oznacza akceptacja? | [Kryteria AC](quality/acceptance-criteria.md) |
| Jak użytkownik się porusza? | [Architektura informacji](ux/information-architecture.md), [przepływy](ux/interaction-flows.md), [UX Blueprint v1](ux/blueprint.md), [ekrany](ux/screen-blueprints.md), [kontrakty interakcji](ux/flow-contracts.md), [rejestr wyborów UX](ux/blueprint-decisions.md) |
| Jak wygląda obecna aplikacja i dlaczego? | [Research i porównanie kierunków](ux/visual-design-research.md), [Visual Language](ux/visual-language.md), [UI Foundation — plan, QA i review](technical/ui-foundation-report.md) |
| Co dzieje się w poszczególnych modułach? | [Indeks funkcji](features/README.md), [specyfikacje funkcji](features/), [Account & Data Management](features/account-and-data-management.md) |
| Co zatwierdzono? | [Rejestr DEC](decisions/product-decisions.md) |
| Czego nie wiemy? | [Rejestr OPEN](decisions/open-questions.md) |
| Co testujemy? | [Scenariusze UC/TC](quality/scenarios.md), [traceability](quality/traceability.md), [historyczny audyt bootstrapu (snapshot, nieaktualne metryki)](quality/documentation-audit.md) |
| Jaką architekturę zatwierdzono? | [Technical Discovery — mapa](technical/README.md), [rejestr 40 decyzji](technical/discovery-decisions.md), [architektura](technical/architecture.md), [ADR](decisions/adr/README.md), [bramki](technical/gates-and-impacts.md) |
| Jak pracuje agent? | [AGENTS.md](../AGENTS.md), [szablon zadania](templates/agent-task.md) |
| Jak uruchamiać Codex i Claude Code? | [Agentic harness v1](harness/README.md) |
| Jak uruchamiać lokalne techniczne fundamenty? | [F1 — aplikacja bez usług](technical/foundation-f1.md), [F2 — syntetyczne Supabase/Drizzle/RLS](technical/foundation-f2.md) |
| Jak aktualizować dokumenty? | [Standard dokumentacji](documentation-standard.md) |

## Gdzie wprowadzać zmiany

- Decyzję użytkownika rejestruj w `decisions/product-decisions.md` albo `decisions/open-questions.md` (w zależności od stanu).
- Niezmiennik biznesowy modyfikuj w `domain/business-rules.md`; nie przepisuj go do każdej funkcji.
- Zachowanie i jego testowalność modyfikuj w `requirements/functional-requirements.md` oraz `quality/acceptance-criteria.md`.
- Sposób użycia konkretnego modułu modyfikuj w `features/<feature>.md` i, jeśli dotyczy, `ux/`.
- Zmienione zależności i pokrycie aktualizuj w `quality/traceability.md` oraz scenariuszach.

**Nie** nadawaj statusu `APPROVED` własnej propozycji agenta. Reguły dokumentacyjne nie zastępują osobnej zgody właściciela produktu.

## UX Blueprint v1 (2026-10-28)

Szczegółowy projekt UX i dokumenty pod prototypowanie znajdują się w `ux/blueprint.md`, `ux/screen-blueprints.md`, `ux/flow-contracts.md` i `ux/blueprint-decisions.md`. Wybory PO z rozmowy 1.1–1.32 są odróżnione od rekomendacji dobranych pod delegacją. Dokumenty **nie** zatwierdzają nierozstrzygniętych `OPEN-*`, technologii ani nie uruchamiają testów.

## Technical Discovery (2026-10-28)

PO zatwierdził wybory 1.1–1.40, w tym allowlistę domen dla Smart Import (1.40 B zastępuje 1.26 A w zakresie automatycznego pobierania). Nie przeprowadzano prototypu ani testów aplikacji. Szczegóły, ADR oraz blokady wdrożeniowe: [Technical Discovery](technical/README.md).

## Supabase-native rebaseline (2026-10-29)

Decyzja PO wariant A: [ADR-0012](decisions/adr/0012-supabase-native-auth-sessions-rls.md) zastępuje ADR-0003 i wskazany zakres TD1.7/1.8; oryginalne TD pozostają historią. F1/F2 wykonane, raporty nietknięte. [Foundation Plan](technical/foundation-plan.md) zawiera kartę następnego F3 i rekomendację F4 przy imporcie, F5 przed background oraz bieżących kontroli F6. Nowe Auth/RPC testy NOT RUN; rebaseline nie autoryzuje implementacji.

**Wykonanie F3 (osobne zadanie PO, 2026-10-29):** [Supabase-native Auth Integration](technical/foundation-f3.md) opisuje lokalną implementację w src/app, wyniki i granice akceptacji. Statusy powyżej dotyczą historycznego rebaseline; live Google i polityki publicznego signup/recovery pozostają otwarte.

## Recruitment Lifecycle 3A — 2026-10-30

[DEC-054](decisions/product-decisions.md) i [kontrakt/plan](technical/recruitment-lifecycle-3a.md) zatwierdzają lokalne rejestrowanie aplikowania i kontaktu inbound/outbound, Kontakt rozpoczęty oraz append-only historię na istniejącej sprawie. Korekty OPEN-004 przed publicznym udostępnieniem; bez merge/deploymentu.

Wyniki wykonania i ograniczenia 3A: [raport](technical/recruitment-lifecycle-3a-report.md).


## Recruitment Lifecycle 3B — 2026-10-30

[DEC-055](decisions/product-decisions.md) zatwierdza warianty 1A/2A/3A z [analizy i planu](technical/recruitment-lifecycle-3b-analysis.md): kwalifikujące zaproszenia, W rekrutacji i indywidualne etapy z historią. Lokalna implementacja i osobny PR autoryzowane, bez merge/deploymentu. OPEN-004 nadal przed publicznym udostępnieniem; globalne/default etapy poza przyrostem.
