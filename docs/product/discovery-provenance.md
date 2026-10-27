# Pochodzenie i ograniczenia wiedzy discovery

**Data przeniesienia:** 2026-10-27. **Źródło:** przekazany przez właściciela projektu baseline Product / Functional / UX Discovery, w tym potwierdzone wybory Quick Capture i importu CSV/XLSX. Poprzednia pełna transkrypcja nie została załączona jako plik źródłowy do tego repozytorium.

## Zasady dowodowe

1. `APPROVED` otrzymują tylko te stwierdzenia, które baseline wprost przedstawia jako zatwierdzone. Tabela `DEC-*` jest mapą uzgodnień, **nie** protokołem podpisanej akceptacji wdrożenia.
2. Omawiane słowniki wyników zakończenia, wartości progów, technologie, dokładne schema pól i wygląd interfejsu nie są zatwierdzone — są `OPEN` lub `PROPOSED`.
3. Agent nie może powołać się na sugestię z wcześniejszej rozmowy jako „decyzję”, jeśli brak świadomego potwierdzenia właściciela produktu.
4. Dokumentacja funkcjonalna formalizuje istniejący zakres. W miejscu braku szczegółu zapisuje granicę wiedzy zamiast uzupełniać ją ukrytym założeniem.
5. Jeśli nowe materiały z discovery pojawią się w repozytorium, wymagają audytu przeciwko `DEC/BR/FR/AC/OPEN` przed włączeniem.

## Zakres przeniesienia

| Sekcja przekazanego baseline'u | Docelowy dokument |
|---|---|
| Geneza, wizja, rynek i strategia | [Wizja](vision-and-scope.md), [użytkownicy i JTBD](users-and-jtbd.md) |
| Model spraw i statusy/etapy | [Domena](../domain/glossary-and-model.md), [cykl](../domain/recruitment-lifecycle.md), [reguły](../domain/business-rules.md) |
| Dashboard, nawigacja, workspace, szczegóły | [UX](../ux/information-architecture.md), [specyfikacje modułów](../features/README.md) |
| Quick Capture i import | [Quick Capture](../features/quick-capture.md), [CSV/XLSX](../features/csv-xlsx-import.md) |
| Historia, zdarzenia, zadania, dokumenty, wyszukiwanie, kontakt | Odpowiednie [specyfikacje](../features/README.md) i [FR](../requirements/functional-requirements.md) |
| To, czego nie zatwierdzono | [OPEN](../decisions/open-questions.md), [NFR](../requirements/nonfunctional-requirements.md), [Technical Discovery](../technical/discovery-backlog.md) |
| Scenariusze weryfikacji | [UC/TC](../quality/scenarios.md), [traceability](../quality/traceability.md) |

**Uwaga:** repozytorium nie zawiera pełnej, dosłownej historii rozmów. Nie rościmy sobie prawa do szczegółów, których nie było w przekazanym baseline'ie.
