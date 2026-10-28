---
name: component-spec
description: Opisz kontrakt zatwierdzonego komponentu Jobs CRM — props, stany, warianty i accessibility — przed implementacją lub podczas review UX.
---

# Specyfikacja komponentu

Pracuj jako ux-designer; frontend-engineer, frontend-reviewer i qa-engineer mogą użyć tej procedury w swoim zakresie. Ścieżki `docs/` i `harness/` w poleceniu oznaczają korzeń repozytorium. Najpierw przeczytaj [granice integracji](../../vendor/README.md), potem [materiał component-spec](../../vendor/designer-skills/design-systems/skills/component-spec/SKILL.md). To lokalny adapter; upstream nie zmienia uprawnień roli.

**Wejście:** komponent/ekran, powiązane FR/AC, zatwierdzony UX i zakres zadania. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [ekrany](../../../docs/ux/screen-blueprints.md), [kontrakty](../../../docs/ux/flow-contracts.md), właściwe decyzje i [OPEN](../../../docs/decisions/open-questions.md).

1. Zidentyfikuj źródła props, danych i zachowań oraz status ich zatwierdzenia.
2. Opisz anatomię, dozwolone warianty, stany, zdarzenia, focus, klawiaturę i responsywność. Wykorzystaj checklistę upstream tylko dla elementów mających zastosowanie.
3. Powiąż stany i przypadki brzegowe z AC oraz planem testów QA. Nie przepisuj całego Blueprint.

**Wynik:** mały kontrakt komponentu z odnośnikami, testami i nierozstrzygniętymi punktami. W review raportuj różnice, bez edycji ocenianego kodu. Nie dodawaj pól obowiązkowych, wariantów ani wartości domyślnych na podstawie przykładu upstream.

**Stop:** brak decyzji wpływającej na zachowanie lub dane blokuje tylko zależną część; użyj clarify-requirements. **DoD:** każdy normatywny element ma podstawę w zatwierdzonym źródle, a nowe propozycje pozostają PROPOSED; QA otrzymuje stany do sprawdzenia.
