---
name: design-qa-checklist
description: Przygotuj i wykonaj checklistę zgodności implementacji Jobs CRM z zatwierdzonym UX i AC, ze stanami, responsywnością i oddzielnymi wynikami kontroli.
---

# QA zgodności z projektem

Dla qa-engineer, ux-designer, frontend-engineer i frontend-reviewer. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md) i [design-qa-checklist](../../vendor/designer-skills/design-ops/skills/design-qa-checklist/SKILL.md).

**Wejście:** dokładny zakres zmiany, zatwierdzony projekt, FR/AC oraz stan aplikacji. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [ekrany](../../../docs/ux/screen-blueprints.md), [kontrakty](../../../docs/ux/flow-contracts.md), [traceability](../../../docs/quality/traceability.md).

1. Przełóż właściwe AC i stany UX na checklistę; odnośniki zastępują kopiowanie specyfikacji. Uwzględnij wizualną zgodność, layout, interakcje, treść, błędy, accessibility i wymagane środowiska.
2. Wybierz reprezentatywne dane syntetyczne, przypadki puste/skrajne i błędne. Upstream „real content/data” nie upoważnia do używania prywatnych CV, korespondencji ani danych kont.
3. QA implementuje i uruchamia potrzebne testy w przydzielonych plikach; developer wykonuje własny self-check. Reviewer niezależnie ocenia wynik i nie edytuje kodu.
4. Każdy punkt oznacz PASS, FAIL lub NOT RUN, z dowodem i powodem niewykonania. Screenshot i ogląd kodu nie zastępują testu interakcji.

Progi upstream, np. 44 px, są heurystyką do oceny; nie zastępują zatwierdzonych AC ani samodzielnie nie zatwierdzają zmian design systemu. Rozbieżność dokumentuj, nie zmieniaj po cichu kontraktu.

**Wynik:** checklista i findings z plikiem/lokalizacją, istotnością, dowodem oraz rekomendacją. **Stop:** brak aplikacji oznacza plan testów i NOT RUN; sprzeczne wymagania blokują odpowiednią część. **DoD:** pokrycie AC jest jawne, brak fikcyjnych PASS, poprawki autora sprawdzono ponownie, jeśli wykonano.
