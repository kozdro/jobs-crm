# Szablon zadania dla agenta

- **Cel / wartość użytkowa:**
- **Etap pracy:** `Discovery | Design | Implementation | Verification | Review`
- **Model i poziom reasoning (jeśli dostępne):** do ustalenia dla danego zadania
- **Stan zatwierdzenia zadania przez PO:**
- **Zakres plików i granice (out of scope):**
- **Podstawa:** `DEC-*`, `FR-*`, `BR-*`, `AC-*`, `UC-*`, `OPEN-*`
- **Zależności i wpływ na inne moduły:**
- **Nierozstrzygnięte blokery:**
- **Plan małych kroków:**
- **Plan walidacji/testów:**
- **Definicja ukończenia (DoD):**
- **Raport:** pliki, wyniki testów, ryzyka, decyzje, nieukończony zakres.

Nie wpisuj fikcyjnych identyfikatorów. Agent ma najpierw zidentyfikować konkretne zapisy z repozytorium.

## Obowiązkowa zgodność kanoniczna

Przed implementacją orchestrator i autor wypełniają macierz; niezależny reviewer sprawdza ją ponownie na finalnym kandydacie. Sam brak źródła w task packecie nie oznacza braku obowiązującej decyzji.

| Źródło kanoniczne i lokalizacja | Status / dokładny zatwierdzony zakres | Plan i test zachowujący decyzję | Odstępstwo / źródło jawnej zgody PO albo BLOCKED |
| --- | --- | --- | --- |
| Product Discovery / DEC i provenance | | | |
| UX Blueprint / wybory UX / flow contracts | | | |
| Technical Discovery / obowiązujące ADR (z uwzględnieniem zastąpień) | | | |

Nie zmieniaj ani nie pomijaj zatwierdzonej decyzji pod pretekstem MVP, uproszczenia lub ograniczonego slice'a. Częściowa implementacja zachowuje jawny nieukończony zakres docelowego kontraktu. Konflikt, brak wejścia lub nowy kontrakt atomowego zapisu: przedstaw PO i zatrzymaj zależną część; kontynuuj niezależne poprawki. `Nie dotyczy` wymaga uzasadnienia. Rekomendacja, status review ani test nie zastępują zgody PO.

## Handoff harnessu

- **Rola / identyfikator sesji / autor:**
- **Właściciel zapisu i dozwolone pliki:**
- **Baza Git / kandydat (SHA albo identyfikowalny snapshot diffu):**
- **Niezależny reviewer / sesja (nie autor):**
- **Security review wymagany / uzasadnienie:**
- **Dowody:** komenda/procedura, środowisko, exit code/liczba testów, `PASS / FAIL / NOT RUN / BLOCKED`, powód niewykonania.

Routing i bramki: [workflow harnessu](../../harness/workflows/delivery.md).
