---
name: record-decision
description: Utrwal rzeczywistą decyzję PO Jobs CRM lub oznaczoną propozycję w właściwym rejestrze, zachowując źródło zatwierdzenia i analizę wpływu.
---

# Rejestrowanie decyzji

**Wejście:** treść rozstrzygnięcia albo propozycji, osoba i rola decyzyjna, data/źródło potwierdzenia, zakres oraz powiązane ID. Jeśli potwierdzenia nie ma, wolno zapisać wyłącznie PROPOSED/OPEN.

**Źródła:** [standard](../../../docs/documentation-standard.md), [DEC](../../../docs/decisions/product-decisions.md), [OPEN](../../../docs/decisions/open-questions.md), [rejestr techniczny](../../../docs/technical/discovery-decisions.md), [ADR](../../../docs/decisions/adr/README.md), [wybory UX](../../../docs/ux/blueprint-decisions.md) i [delivery](../../workflows/delivery.md).

1. Odszukaj istniejącą decyzję i wcześniejsze częściowe rozstrzygnięcia. Nie twórz duplikatu ani nowego ID dla tego samego znaczenia. Nie zmieniaj historycznej treści tak, aby ukryć poprzednie ustalenie.
2. Zweryfikuj, co dokładnie PO potwierdził i czy potrzebny jest udział Tech Leada według OPEN. Rekomendacja agenta, milczenie, zaznaczenie opcji domyślnej, PASS review i hash nie są potwierdzeniem.
3. Zapisz decyzję we właściwym źródle prawdy z datą, źródłem, zakresem i konsekwencjami. Istotna zatwierdzona zmiana architektury wymaga ADR zgodnie z jego indeksem; nie twórz ACCEPTED ADR dla niepodjętej decyzji.
4. Dla faktycznie rozstrzygniętego pytania oznacz odpowiedni zakres `RESOLVED`, zachowując pytanie i link do decyzji APPROVED. Częściowa odpowiedź nie zamyka całego OPEN; zachowaj pozostałą część i jej bramkę. Nie usuwaj DEFERRED ani nie zmieniaj go w MVP bez zgody.
5. Przeprowadź analizę wpływu i aktualizuj dotknięte BR/FR/AC/UC, moduły, UX i traceability spójnie z rozstrzygnięciem. Jeśli zakres odpowiedzi nie wystarcza, odnotuj brak i wróć do `clarify-requirements` tylko dla tej luki.

**Wynik:** mały diff dokumentacyjny z jednoznaczną ścieżką decyzji i pozostałymi OPEN. Nie zapisuj sekretów ani prywatnej korespondencji jako dowodu; wystarczy bezpieczny odnośnik/identyfikator i zwięzłe potwierdzenie zakresu.

**STOP:** niepewna autoryzacja, sprzeczne potwierdzenia lub decyzja wykraczająca poza przekazany zakres. Nie awansuj samodzielnie statusu. Zapis decyzji produktowej nie daje automatycznej zgody na deploy, migrację danych czy rozszerzenie zadania.

**DoD:** źródło i zakres zatwierdzenia są sprawdzalne, historia i stabilne ID zachowane, a dokumenty zależne oraz pozostałe blokady spójne.
