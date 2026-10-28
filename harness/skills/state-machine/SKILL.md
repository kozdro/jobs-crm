---
name: state-machine
description: Modeluj stany i przejścia UI Jobs CRM dla złożonego komponentu lub przepływu; nie służy do samodzielnego ustalania biznesowych statusów rekrutacji.
---

# Stany interfejsu

Używają ux-designer, frontend-engineer, frontend-reviewer i qa-engineer. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md) i [state-machine](../../vendor/designer-skills/interaction-design/skills/state-machine/SKILL.md).

**Wejście:** komponent/przepływ, dozwolone działania i AC. **Źródła:** [kontrakty UX](../../../docs/ux/flow-contracts.md), [cykl rekrutacji](../../../docs/domain/recruitment-lifecycle.md), [reguły BR](../../../docs/domain/business-rules.md), właściwe FR/AC/OPEN.

1. Oddziel stan prezentacji, stan operacji sieciowej i stan domeny. Przypisz każdemu zdarzeniu UI istniejący kontrakt.
2. Zapisz tabelę stan → zdarzenie → guard → stan docelowy → efekt. Dodaj błędy, anulowanie, powtórzenia i odpowiedź spóźnioną.
3. Wskaż niedozwolone przejścia, warunki autoryzacji oraz testy QA. Diagram jest pomocą, nie dowodem wykonania testu.

Timeout, korekta statusu, powiązanie CV i zmiana stanu UI nie tworzą faktów biznesowych. Nie wymyślaj wydarzeń, nie zamykaj spraw automatycznie i nie scalaj duplikatów. Upstream „every state has a way out” nie upoważnia do dopisania biznesowego wznowienia/usunięcia. Nie instaluj biblioteki maszyn stanów tylko dlatego, że wykorzystujesz tabelę stanów.

**Wynik:** tabela/diagram z odnośnikami do kontraktów i testami przejść. Reviewer zgłasza findings bez edycji. **Stop:** konflikt z domeną lub OPEN dotyczące grafu biznesowego; zatrzymaj zależny zakres. **DoD:** efekty mają zatwierdzoną podstawę, stany UI nie fabrykują historii, testy planowane są odróżnione od wykonanych.
