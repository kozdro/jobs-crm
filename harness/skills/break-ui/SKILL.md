---
name: break-ui
description: Sprawdź odporność istniejącego UI Jobs CRM na realistyczne skrajne dane syntetyczne, braki danych i małe ekrany; QA może przygotować zatwierdzone fixtures, reviewer raportuje bez zmian.
---

# Skrajne przypadki UI

Dla qa-engineer, frontend-reviewer, frontend-engineer i ux-designer. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md), [break-ui](../../vendor/emilkowalski-skills/skills/break-ui/SKILL.md) i wymagany [katalog](../../vendor/emilkowalski-skills/skills/break-ui/CATALOG.md).

**Wejście:** istniejący komponent/ekran, jego kontrakt danych, dozwolony zakres fixture/testów, AC i dostępność runtime. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [kontrakty](../../../docs/ux/flow-contracts.md), właściwe FR/AC, schemat zatwierdzony przez PO oraz [OPEN](../../../docs/decisions/open-questions.md).

1. Dla konkretnego zadania od razu analizuj powierzchnię danych; pomiń początkową odpowiedź upstream „I'm ready…” i oczekiwanie na kolejne pytanie. Bez wskazanego komponentu ustal tylko brakujący zakres.
2. Zmapuj wartości, źródła, limity i opcjonalność. Brak znanego limitu oznacz UNKNOWN/OPEN lub finding, nie nowy limit ani domyślną zgodę na nieograniczoną długość.
3. Dobierz syntetyczne dane katalogowe: długie/krótkie wartości, polskie znaki, braki, puste listy, jeden element i granice zatwierdzonego kontraktu. Nie używaj realnych CV, kont i wiadomości. Nie pobieraj URL z fixture.
4. QA lub frontend-engineer może przygotować fixture przy istniejącej granicy danych i kontrolkę testową wyłącznie w przydzielonym zakresie dev/test. Reviewer tylko raportuje i przekazuje potrzebę fixture QA; nigdy nie edytuje ocenianego kodu. Nie dodawaj produkcyjnego przełącznika.
5. Sprawdź rzeczywistą szerokość kontenera, mały ekran, zoom oraz stany wymagane przez produkt. Nie dodawaj dark mode/RTL czy paginacji jako nowej funkcji. Zachowaj dowody tego, co rzeczywiście wyrenderowano.

Brak aplikacji oznacza plan przypadków i runtime NOT RUN: nie twórz automatycznie samodzielnego HTML, prototypu ani scaffoldu. Dodatkowe odsyłacze upstream nie instalują skills.

**Wynik:** findings (istotność, pole, wartość, plik:linia, objaw, dowód, rekomendacja), działające przypadki i osobne NOT RUN. Naprawy wykonuje autor w zatwierdzonym zakresie; reviewer nie naprawia. **Stop:** naprawa zmieniająca domenę, dane, AC lub UX wymaga clarify-requirements. **DoD:** wykonane przypadki i ograniczenia są jawne; naprawa ma ponowną kontrolę zwykłych i skrajnych danych.
