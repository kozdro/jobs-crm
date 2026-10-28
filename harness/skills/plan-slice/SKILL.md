---
name: plan-slice
description: Przygotuj mały plan wykonania zatwierdzonego slice'a Jobs CRM z delegacją, planem testów QA i niezależnymi review.
---

# Plan slice'a

**Wejście:** cel, wynik analizy wymagania, zgoda na etap i zakres, konkretne FR/AC/BR/DEC/UC/OPEN oraz stan repozytorium. Jeśli analizy brakuje, użyj `analyze-requirement`.

**Źródła:** [szablon zadania](../../../docs/templates/agent-task.md), [delivery](../../workflows/delivery.md), [plan techniczny](../../../docs/technical/implementation-plan.md), [bramki](../../../docs/technical/gates-and-impacts.md), [strategia QA](../../../docs/quality/test-strategy.md), [AC](../../../docs/quality/acceptance-criteria.md), [scenariusze](../../../docs/quality/scenarios.md), odpowiedni moduł, UX i ADR.

1. Sprawdź rzeczywisty zakres autoryzacji i blokujące OPEN. Nie żądaj ponownie zgody na prace już zlecone. Nie traktuj zgody na plan jako zgody na kod produktu.
2. Wyznacz najmniejszy przeglądalny rezultat, listę plików, zależności, ryzyka, odwracalność oraz obszary poza zakresem.
3. Dobierz role według delivery. Angażuj `qa-engineer` teraz: AC → przypadki pozytywne, negatywne, brzegowe i regresje → poziom testu → środowisko i komenda, o ile już istnieje. QA pisze testy; developer zachowuje odpowiedzialność za testy jednostkowe własnego kodu.
4. Przydatny test regresji lub kontraktu zaplanuj przed implementacją. Nie narzucaj TDD prostym zmianom redakcyjnym; nie twórz pustej infrastruktury testowej tylko po to, by raportować sukces.
5. Ustal właściciela zapisu każdego pliku i kolejność przekazań. UX wyprzedza frontend przy zmianach interakcji; QA uczestniczy w planowaniu i wykonaniu; reviewer ocenia po implementacji. Nigdy dwóch równoczesnych autorów jednego pliku.
6. Zaplanuj niezależny frontend/backend review stosownie do zmiany; dla granic zaufania i danych wrażliwych także security review. Dla infrastruktury wskaż kompetentnego niezależnego reviewera.
7. Ustal mierzalne DoD, wymagane dowody, aktualizacje dokumentacji i warunki publikacji. Uwzględnij wcześniejszą autoryzację Git, bez automatycznego merge.

Dla dostępu do prywatnych danych plan QA musi rozdzielić: pozytywny dostęp właściciela A, odmowę kontu B, brak wycieku danych/metadanych i granice relacji. Uwzględnij listę oraz odczyt po bezpośrednim ID, jeśli objęte zadaniem; jeśli zakres endpointu jest niejasny, pokaż wariant warunkowy i zaznacz zależność zamiast cicho wykluczać istotną ścieżkę. Źródłem mechanizmu pozostają ADR i security-and-privacy, nie ta lista.

**Wynik:** plan małych kroków i delegacji z metadanymi model/reasoning (lub „niedostępne”), rola, pliki, ID i DoD; macierz AC/test/autor/reviewer/środowisko. Przy nieistniejącej aplikacji testy aplikacyjne pozostają `NOT RUN`.

**STOP:** blokująca decyzja lub brak autoryzacji zatrzymuje jej część planu wykonawczego. Nie projektuj migracji z niezatwierdzonych pól ani alternatywnej architektury jako faktu.

**DoD:** każdy krok ma właściciela, zakres i sposób oceny; QA i niezależny review są uwzględnione; niewykonalne dziś kontrole mają wskazaną przyczynę.
