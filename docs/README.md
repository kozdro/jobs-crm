# Mapa dokumentacji — Jobs CRM

| Pytanie | Autorytatywny dokument |
|---|---|
| Po co i dla kogo? | [Wizja i zakres](product/vision-and-scope.md), [persony/JTBD](product/users-and-jtbd.md) |
| Skąd pochodzą ustalenia? | [Pochodzenie baseline'u](product/discovery-provenance.md) |
| Jak rozumiemy pojęcia? | [Słownik i model](domain/glossary-and-model.md) |
| Jakie są niezmienniki? | [Reguły BR](domain/business-rules.md), [cykl życia](domain/recruitment-lifecycle.md) |
| Co aplikacja musi robić? | [Wymagania FR](requirements/functional-requirements.md) |
| Co z jakością i bezpieczeństwem? | [NFR](requirements/nonfunctional-requirements.md), [strategia testowa](quality/test-strategy.md) |
| Co dokładnie oznacza akceptacja? | [Kryteria AC](quality/acceptance-criteria.md) |
| Jak użytkownik się porusza? | [Architektura informacji](ux/information-architecture.md), [przepływy](ux/interaction-flows.md) |
| Co dzieje się w poszczególnych modułach? | [Indeks funkcji](features/README.md), [specyfikacje funkcji](features/), [Account & Data Management](features/account-and-data-management.md) |
| Co zatwierdzono? | [Rejestr DEC](decisions/product-decisions.md) |
| Czego nie wiemy? | [Rejestr OPEN](decisions/open-questions.md) |
| Co testujemy? | [Scenariusze UC/TC](quality/scenarios.md), [traceability](quality/traceability.md), [audyt dokumentacji](quality/documentation-audit.md) |
| Jak będziemy podejmować decyzje techniczne? | [Backlog discovery](technical/discovery-backlog.md), [ryzyka/PoC](technical/risks-and-pocs.md), [ADR](decisions/adr/README.md) |
| Jak pracuje agent? | [AGENTS.md](../AGENTS.md), [szablon zadania](templates/agent-task.md) |
| Jak aktualizować dokumenty? | [Standard dokumentacji](documentation-standard.md) |

## Gdzie wprowadzać zmiany

- Decyzję użytkownika rejestruj w `decisions/product-decisions.md` albo `decisions/open-questions.md` (w zależności od stanu).
- Niezmiennik biznesowy modyfikuj w `domain/business-rules.md`; nie przepisuj go do każdej funkcji.
- Zachowanie i jego testowalność modyfikuj w `requirements/functional-requirements.md` oraz `quality/acceptance-criteria.md`.
- Sposób użycia konkretnego modułu modyfikuj w `features/<feature>.md` i, jeśli dotyczy, `ux/`.
- Zmienione zależności i pokrycie aktualizuj w `quality/traceability.md` oraz scenariuszach.

**Nie** nadawaj statusu `APPROVED` własnej propozycji agenta. Reguły dokumentacyjne nie zastępują osobnej zgody właściciela produktu.
