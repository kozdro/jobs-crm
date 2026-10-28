---
name: accessibility-audit
description: Oceń istniejący projekt lub implementację Jobs CRM pod kątem accessibility i zgłoś konkretne bariery, oddzielając analizę statyczną od testów przeglądarki i technologii asystujących.
---

# Audyt dostępności

Dla ux-designer, frontend-reviewer i qa-engineer; frontend-engineer używa jako self-check, który nie zastępuje niezależnego review. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md) i [accessibility-audit](../../vendor/designer-skills/design-systems/skills/accessibility-audit/SKILL.md).

**Wejście:** ekran/komponent, zakres, zatwierdzony UX/AC, dostępne przeglądarki i urządzenia. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [kontrakty](../../../docs/ux/flow-contracts.md), właściwe AC i [strategia testowa](../../../docs/quality/test-strategy.md).

1. Ustal przedmiot audytu: projekt, kod czy działający interfejs. Nie opisuj makiety jako przetestowanego produktu.
2. Sprawdź semantykę, nazwy, formularze, błędy, focus i klawiaturę, kontrast, reflow oraz reduced motion. Kryteria WCAG wskazuj precyzyjnie; w razie niepewności sprawdź źródło.
3. Gdy runtime istnieje, QA uruchamia dostępne kontrole automatyczne i manualne. Zapisz środowisko, komendy/kroki i wynik; nie zakładaj zgodności AT na podstawie samego HTML.
4. Zgłoś findings: istotność, plik:linia lub ekran/element, bariera, kryterium, dowód i rekomendacja.

**Wynik:** lista findings i pokrycie PASS / FAIL / NOT RUN z zakresem dowodów. Reviewer nie poprawia kodu; QA może tworzyć testy w osobno przydzielonym zakresie. **Stop:** brak środowiska blokuje tylko wykonanie testów; raportuj NOT RUN i kontynuuj analizę. Nowe zachowanie produktu wymaga clarify-requirements. **DoD:** brak deklaracji pełnej zgodności bez dowodów, a blokujące bariery trafiły do autora.
