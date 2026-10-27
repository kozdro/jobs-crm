# Standard dokumentacji i zarządzania zmianami

**Status dokumentu:** `BASELINED` — standard roboczy dla repozytorium dokumentacyjnego. **Data:** 2026-10-27.

## Statusy rozstrzygnięć

- `APPROVED` — zaakceptowane explicite w przekazanym Product Discovery lub późniejszą decyzją właściciela produktu.
- `PROPOSED` — sugestia, opcja, rekomendacja; nie staje się wymaganiem wykonawczym.
- `OPEN` — nierozstrzygnięty punkt wpływający na zakres, semantykę lub projekt.
- `DEFERRED` — odłożony świadomie, nie realizować w pierwszym wydaniu bez zmiany zakresu.

**Stan dokumentu** (`BASELINED`, `DRAFT`) opisuje redakcję dokumentu; **status wymagania/decyzji** opisuje zatwierdzenie. Dokument `BASELINED` może zawierać punkty `OPEN`. Nie wolno mieszać tych znaczeń.

## Stabilne identyfikatory

- `DEC-NNN` — decyzja produktowa, źródło zatwierdzenia.
- `OPEN-NNN` — kwestia do rozstrzygnięcia, właściciel i bramka.
- `BR-NNN` — reguła biznesowa, obowiązująca w domenie.
- `FR-XX-NNN` — wymaganie funkcjonalne, gdzie `XX` to moduł (`LC`, `RW`, `DB`, `QC`, `IM`, `HE`, `TN`, `DO`, `CC`, `GS`, `NV`).
- `AC-XX-NNN` — zachowane główne AC wymagania `FR-XX-NNN`; `AC-XX-NNN-01` itd. — dodatkowe niezależne kryteria tego samego FR. Każdy FR ma co najmniej jedno AC; każdy AC należy do jednego FR. Nie zmieniaj istniejących ID.
- `NFR-NNN` — wymaganie niefunkcjonalne; wartości otwarte są `OPEN`, nie domyślne.
- `UC-NNN` — scenariusz end-to-end na poziomie użytkownika; `TC-NNN` — planowany test danego scenariusza.
- `UX-NNN` — ekran lub przepływ w architekturze informacji.

Pełną listę dodatkowych AC wskazuje traceability; stan zatwierdzenia FR i wykonania TC są odrębne. `PLANNED / NOT EXECUTED` nie znaczy `PASSED`.

Nie zmieniaj znaczenia istniejącego identyfikatora po zatwierdzeniu, zamiast tego udokumentuj zmianę i jej wpływ. Nie używaj raz zwolnionych ID ponownie.

## Władza i lokalizacja danych

| Pytanie | Dokument rozstrzygający |
|---|---|
| Czy decyzję podjęto? | `decisions/product-decisions.md` oraz protokół potwierdzenia PO |
| Co oznaczają pojęcia? | `domain/glossary-and-model.md` |
| Co musi pozostać prawdziwe? | `domain/business-rules.md` |
| Co ma działać i jak to sprawdzić? | `requirements/functional-requirements.md` + `quality/acceptance-criteria.md` |
| Jak przebiega proces i interakcja? | `features/` + `ux/` (w granicach FR/BR) |
| Co nie zostało rozstrzygnięte? | `decisions/open-questions.md` |
| Jakie zadania obejmie testowanie? | `quality/scenarios.md` + `quality/traceability.md` |

W przypadku konfliktu nie stosuj ślepej hierarchii: zarejestruj defekt dokumentacji, wskaż odpowiednie identyfikatory i uzyskaj decyzję. Decyzja PO, której nie zapisano, powinna zostać utrwalona przed implementacją.

## Minimalny proces zmiany

1. Zidentyfikuj powiązane `DEC/OPEN/BR/FR/AC/UC` i zależne moduły.
2. Rozróżnij korektę redakcyjną od zmiany produktu; przy zmianie produktu uzyskaj potwierdzenie PO.
3. Zaktualizuj **najpierw** źródło prawdy, potem zależne specyfikacje, AC, scenariusze i traceability.
4. Dla decyzji architektonicznej po Technical Discovery zastosuj ADR (`decisions/adr/`). Nie twórz ADR dla niepodjętej decyzji.

## Konwencje

- Pliki `kebab-case.md`; wszystkie odnośniki do innych plików względne, a do punktów kotwiczących tylko kiedy jest to konieczne.
- Pisz normatywnie i testowalnie, oddzielając zatwierdzone zachowanie od opisanych opcji.
- `APPROVED` nie usprawiedliwia dopisania domyślnych progów, pól, stanów, powiadomień ani technologii.
- Nie duplikuj całego wymagania w dokumentach funkcji: cytuj ID i dodaj przebieg, wyjątek lub zależność.
- Brak danych to brak danych: nie dopowiadaj historii, wysłania CV ani rezultatów kontaktów.
