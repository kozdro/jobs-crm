---
name: implement-slice
description: Wykonaj autoryzowany slice Jobs CRM według istniejącego planu i specyfikacji, z testami własnego kodu oraz przekazaniem do niezależnego review.
---

# Implementacja slice'a

**Wejście:** autoryzowany zakres i etap, plan, przydzielona rola, własność plików, ID wymagań i DoD. Samo istnienie planu lub ADR nie jest zgodą na rozpoczęcie produktu.

**Źródła:** [delivery](../../workflows/delivery.md), [AGENTS.md](../../../AGENTS.md), właściwe wymagania, AC, BR, moduły i UX wskazane w planie oraz [bramki techniczne](../../../docs/technical/gates-and-impacts.md).

1. Sprawdź gałąź, diff, stan plików i zakres zapisu przed zmianą. Zachowaj cudze zmiany. Potwierdź, że istotne źródła i OPEN nie zmieniły się od planowania.
2. Pracuj jako właściwy engineer, `ux-designer` albo implementujący testy `qa-engineer`. Przy API/bibliotekach pobierz aktualną dokumentację zgodnie z AGENTS, bez instalacji nowych niezatwierdzonych zależności.
3. Realizuj małe kroki. Dla uzasadnionego TDD uruchom test przed zmianą, sprawdź, że błąd dotyczy oczekiwanego zachowania, następnie implementuj i uruchom ponownie. Brak środowiska odnotuj; nie wymyślaj fazy czerwonej ani zielonej.
4. Zachowaj kontrakty i inwarianty. Jeśli implementacja wymaga nowej reguły, pola, domeny do pobierania lub zmiany architektury, przekaż tylko tę blokadę do `clarify-requirements`.
5. Uruchom dostępne testy własnego kodu i odpowiednie regresje; QA uzupełnia integracje/E2E/negatywne AC. Wyniki dokumentuj przez `verify-acceptance`.
6. Zaktualizuj zależną dokumentację wraz ze zmianą zachowania. Przekaż konkretne pliki/diff, ID i dowody nowemu reviewerowi; napraw jego blockery jako autor i poproś o ponowne review zmienionego zakresu.

**Wynik:** przeglądalny diff, lista zmian, komendy i wyniki testów, odstępstwa od planu oraz materiał do niezależnego review. Commit/push/PR tylko w granicach autoryzacji zadania.

**STOP:** blokujący OPEN, konflikt ze specyfikacją, zmiana cudzych plików poza przydziałem, wymagany sekret lub prywatne dane w repozytorium. Nie obchodź bramki fikcyjnym zdarzeniem historii, wyłączeniem RLS czy osłabieniem testu.

**DoD:** implementacja mieści się w zatwierdzonym zakresie, testy i dokumentacja są aktualne, a pozostałe kontrole jawne. Sam autor nie nadaje końcowego PASS niezależnemu review.
