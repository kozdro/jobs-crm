---
name: analyze-requirement
description: Analizuj wymaganie Jobs CRM, jego zatwierdzenie, traceability i wpływ przed planowaniem slice'a lub oceną sprzeczności specyfikacji.
---

# Analiza wymagania

**Wejście:** polecenie, zakres modułu i etap pracy; istniejące ID lub wskazanie zachowania. Brak ID oznacza potrzebę wyszukania ich, nie tworzenia nowych.

**Źródła:** [AGENTS.md](../../../AGENTS.md), [mapa dokumentacji](../../../docs/README.md), [standard](../../../docs/documentation-standard.md), [DEC](../../../docs/decisions/product-decisions.md), [OPEN](../../../docs/decisions/open-questions.md), właściwe BR/FR/AC/UC z mapy oraz odpowiednie UX i ADR. Zasady delegacji i bramek: [delivery](../../workflows/delivery.md).

1. Odczytaj istniejący kontekst według ścieżki AGENTS; rozszerzaj analizę tylko po wykryciu zależności.
2. Zestaw konkretne ID, ścieżki, znaczenie dla zadania i status zatwierdzenia. Rozróżnij APPROVED/PROPOSED/OPEN/DEFERRED, stan redakcyjny BASELINED oraz ACCEPTED dla ADR. Brak statusu wyjaśnij na podstawie źródła, nie dopowiadaj.
3. Sprawdź częściowe rozstrzygnięcia OPEN w Technical Discovery. Zatwierdzenie technologii nie zatwierdza pól, walidacji ani całego wymagania.
4. Określ wpływ na moduły, dane i relacje, historię, import, wyszukiwanie, granice dostępu, prywatność, UX oraz przypadki błędów. Zaznacz „nie dotyczy” z krótkim uzasadnieniem dla niezależnych obszarów.
5. Zmapuj wymagania na AC, UC/TC i istniejące testy, jeśli istnieją. Odróżnij brak testu od testu niewykonanego.
6. Zwróć wąski zakres gotowy do planowania, zakres zablokowany i konkretne niejasności dla `clarify-requirements`.

Przy żądaniu sprzecznym z zatwierdzoną regułą podaj źródło zakazu, już zatwierdzoną bezpieczną ścieżkę oraz nierozstrzygnięte szczegóły tej ścieżki. Nie proponuj nowej normatywnej reguły jako zamiennika. Wariant zastąpienia decyzji jest PROPOSED, a nie ponownym pytaniem o obowiązujący baseline.

**Wynik:** podstawa zadania: tabela ID/źródło/status/wpływ, wymagane wejścia, blokery i luki traceability. Dla zadania czysto narzędziowego wskaż brak produktowych FR w implementacji i wymagania domenowe używane jedynie jako scenariusze harnessu.

**STOP:** nie implementuj kodu; nie rozstrzygaj sprzecznych źródeł ani blokującego OPEN za PO. Zatrzymaj tylko zależny zakres. Przykładowo OPEN-002 blokuje fizyczny schemat RecruitmentCase, lecz pozwala przygotować listę brakujących decyzji.

**DoD:** każde stwierdzenie o wymaganiu ma źródło; zakres i statusy są jawne; plan może odróżnić zatwierdzone prace od decyzji nadal potrzebnych.
