---
name: form-design
description: Projektuj układ i interakcje zatwierdzonego formularza Jobs CRM, zachowując istniejące pola, reguły zapisu oraz walidację; używaj także do review formularza.
---

# Formularz zgodny ze specyfikacją

Przeznaczenie: ux-designer, frontend-engineer, frontend-reviewer i qa-engineer. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md), następnie [form-design](../../vendor/designer-skills/interaction-design/skills/form-design/SKILL.md).

**Wejście:** konkretny formularz, FR/AC, lista zatwierdzonych pól i walidacji, stan decyzji PO. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [kontrakty interakcji](../../../docs/ux/flow-contracts.md), [ekrany](../../../docs/ux/screen-blueprints.md), [OPEN](../../../docs/decisions/open-questions.md).

1. Sprawdź czy pola, obowiązkowość i limity są rozstrzygnięte. Przy RecruitmentCase sprawdź szczególnie OPEN-002/026; nie traktuj makiety jako zatwierdzenia schematu.
2. Zaprojektuj kolejność i grupowanie, trwałe etykiety, komunikaty po polsku, powiązanie błędów z polami, focus oraz stany wysyłania/błędu/anulowania według kontraktu.
3. Uwzględnij klawiaturę, urządzenia dotykowe, zachowanie danych po błędzie oraz testy QA. Dane przykładowe muszą być syntetyczne.

Zalecenia upstream o autosave, domyślnych odpowiedziach, usuwaniu opcjonalnych pól, analityce porzuceń i walidacji on-blur **nie są zgodą na te zmiany**. Nie dodawaj limitów ani nowej zbiórki danych. Zapis wymaga potwierdzenia zgodnie z flow-contracts; brak danych pozostaje brakiem danych. Nie twórz trwałych automatycznych szkiców. Wyjątki muszą wynikać z aktualnej decyzji PO w źródle prawdy.

**Wynik:** projekt lub findings ze źródłami, stanami i planem testów. Reviewer nie poprawia ocenianego kodu. **Stop:** brak decyzji o danych, AC, walidacji lub zapisie; zatrzymaj zależną część i użyj clarify-requirements. **DoD:** nie rozszerzono schematu ani zachowania; pokryto błędy i accessibility; brak runtime oznaczono NOT RUN.
