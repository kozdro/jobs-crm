---
name: clarify-requirements
description: Rozstrzygaj istotną niejasność Jobs CRM po sprawdzeniu istniejących decyzji; zadawaj PO tylko brakujące pytania o produkt, dane, bezpieczeństwo, architekturę lub AC.
---

# Doprecyzowanie wymagania

Używaj, gdy wynik analizy pozostawia istotny wybór lub konflikt. Nie uruchamiaj pełnego Discovery dla jednego rozstrzygnięcia ani dla drobnego, odwracalnego szczegółu wykonania zgodnego ze specyfikacją.

**Wejście:** polecenie, dokładna niejasność, jej wpływ, znalezione ID i zakres już udzielonej autoryzacji.

**Źródła:** [standard](../../../docs/documentation-standard.md), [DEC](../../../docs/decisions/product-decisions.md), [OPEN](../../../docs/decisions/open-questions.md), [Technical Discovery](../../../docs/technical/discovery-decisions.md), [wybory UX](../../../docs/ux/blueprint-decisions.md), odpowiednie BR/FR/AC/UC/ADR oraz [delivery](../../workflows/delivery.md). Przed pytaniem przeczytaj właściwe zapisy i wcześniejsze decyzje z rozmowy.

1. Sformułuj najmniejszą nierozstrzygniętą kwestię. Rozróżnij brak informacji od sprzeczności źródeł i od propozycji nowej funkcji.
2. Sprawdź, czy odpowiedź już istnieje, również w częściowych rozstrzygnięciach OPEN. Nie pytaj ponownie o zatwierdzony stack, publiczną rejestrację, reset e-mail ani zasadę allowlisty tylko dlatego, że szerszy OPEN nadal jest otwarty. Zachowaj nierozstrzygnięte szczegóły.
3. Drobne, odwracalne decyzje wykonawcze bez wpływu na produkt, model danych, bezpieczeństwo, architekturę i AC podejmij samodzielnie w granicach delegacji. Odnotuj istotne założenie jako wybór wykonawczy, nie decyzję APPROVED. Nie nazywaj polem technicznym nowego obowiązkowego pola domenowego, aby obejść PO.
4. Jeśli potrzebny jest wybór PO, przygotuj 2–3 realne warianty mieszczące się w istniejących decyzjach, ich konsekwencje i własną rekomendację oznaczoną `PROPOSED`. Nie produkuj sztucznych opcji, gdy problem wymaga jednego brakującego faktu; wtedy poproś o ten fakt. Przy sprzeczności wskaż konkretne źródła i to, co decyzja zmieni.
5. Zadaj jedno konkretne pytanie naraz, z ID/bramką i krótkim wyjaśnieniem, dlaczego odpowiedź jest potrzebna. Nie proś o ponowne potwierdzenie całego projektu ani zadania już autoryzowanego.
6. Zatrzymaj wyłącznie prace zależne od tej decyzji; kontynuuj niezależną analizę, przygotowanie testów lub zatwierdzony zakres. Bez odpowiedzi nie wykonuj zależnej implementacji. Milczenie, upływ czasu, opcja domyślna i rekomendacja nie są zgodą.
7. Po odpowiedzi ustal dokładny zakres zatwierdzenia i utrwal go przez `record-decision` we właściwym źródle prawdy, zanim rozpocznie się zależna implementacja. Nie zamykaj całego OPEN odpowiedzią obejmującą tylko fragment. Następnie zaktualizuj analizę wpływu i `plan-slice`; wykorzystaj istniejącą autoryzację bez dodatkowej ceremonii.

Jeśli polecenie koliduje z jawną zatwierdzoną regułą, najpierw wyjaśnij konflikt i istniejącą dozwoloną ścieżkę. Nie pytaj, czy użytkownik chce zakazane zachowanie, ani nie zatrzymuj dostępnej analizy pytaniem o jej uruchomienie. Pytanie dotyczy wyłącznie rzeczywiście brakującej decyzji.

**Wynik:** odpowiedź znaleziona w źródłach, jawny odwracalny wybór wykonawczy albo pojedyncze pytanie do PO z wariantami i zakresem blokady; po decyzji — link do zapisu i pozostałe kwestie OPEN.

**STOP:** zależny zakres pozostaje zablokowany, gdy nie ma wymaganej decyzji lub potwierdzenie jest niejednoznaczne. „Zgadnij” nie zamienia niezatwierdzonego schematu, polityki danych ani nowej funkcji w APPROVED. Nie eskaluj błahych szczegółów tylko z powodu zastosowania tego skillu.

**DoD:** żadna znana decyzja nie została ponownie otwarta bez powodu; istotna luka ma odpowiedź z zapisem albo jawny status OPEN; niezależna część pracy nie została niepotrzebnie zatrzymana.

Materiał porównawczy: [obra/superpowers — brainstorming, commit 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/brainstorming/SKILL.md), MIT, Jesse Vincent. Ten skill jest lokalną procedurą Jobs CRM, bez kopiowania tekstu źródła. Wykorzystuje analizę kontekstu przed pytaniem i skupienie na istotnej niejasności; nie przejmuje obowiązkowego nowego dokumentu designu dla każdej pracy, automatycznych commitów, visual servera ani zależności od innych skills Superpowers.
