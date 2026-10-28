# Agentic Harness Bootstrap v1 — wymagania, wpływ i plan

**Data:** 2026-10-28. **Autoryzacja:** zadanie właściciela „Jobs CRM — Agentic Harness Bootstrap v1” obejmuje implementację harnessu, commit, push i PR do `main`, bez merge. Nie obejmuje kodu produktu ani zamknięcia pytań `OPEN`.

## Podstawa i wymagane wejścia

Źródłem wymagań tego zadania jest polecenie właściciela, a nie nowe `FR` produktu. Poniższe istniejące identyfikatory służą analizie wpływu i próbom zachowania agentów; ich wskazanie nie oznacza implementacji ani wykonania AC aplikacji.

| Zakres próby | Podstawa i stan zatwierdzenia | Wymagane wejście / granica |
|---|---|---|
| A: model sprawy | DEC-001/002, BR-001, FR-LC-001/002 i odpowiadające AC: zatwierdzone znaczenie; OPEN-002: P0 | Zatwierdzony szczegółowy schemat nie istnieje. Bez migracji na podstawie modelu koncepcyjnego. |
| B: Smart Import | TD 1.40 B `APPROVED`, ADR-0006 `ACCEPTED`, DEC-030, BR-021, FR-QC-003/005/011, AC-QC-003/005/011; UC-016/TC-016 | OPEN-011: brak zatwierdzonych domen. Niedozwolony fetch, dostępny ręczny fallback; 1.26 A zastąpione w zakresie pobierania. |
| C: historia | DEC-009/022, BR-007/016, FR-LC-015/HE-003, AC-LC-015/015-01 i AC-HE-003: zatwierdzone; UC-021/TC-021 | OPEN-004/020 dotyczą szczegółów korekty i audytu, nie uchylają zakazu fikcyjnych faktów. |
| D: izolacja | FR-AD-002/AC-AD-002, BR-030: `APPROVED`; ADR-0003 `ACCEPTED`; UC-034/TC-034 | Owner authorization, RLS i testy A/B; właściwe szczegóły OPEN-006/013/032 pozostają otwarte. |
| E: formularz | UX-006, przepływy F02/F03, FR-QC i odpowiadające AC; wybory UX 1.1–1.32 podjęte przez PO | OPEN-002/017/026 nadal ograniczają pola, walidacje i szczegóły. Plan nie udaje zatwierdzonego formularza bez źródła akceptacji. |
| F: uczciwe wyniki | Standard dokumentacji; ADR-0010 `ACCEPTED`, TD1.35 B `APPROVED` | Vitest/PostgreSQL-RLS/Playwright są przyszłymi warstwami testów. Bez aplikacji: `NOT RUN`. |
| G: niezależność | AGENTS.md i bieżące zadanie właściciela | Osobna sesja reviewera, konkretny kandydat i ograniczone narzędzia; reviewer nie poprawia autora. |

Źródła: [DEC](../decisions/product-decisions.md), [OPEN](../decisions/open-questions.md), [BR](../domain/business-rules.md), [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [UC/TC](../quality/scenarios.md), [traceability](../quality/traceability.md), [wybory UX](../ux/blueprint-decisions.md), [Technical Discovery](../technical/discovery-decisions.md), [ADR](../decisions/adr/README.md).

`FR-AD-003–009` i ich AC zachowują zapisany status `PROPOSED`, mimo późniejszego zatwierdzenia kierunku części funkcji w Technical Discovery. Agent zestawia oba źródła, nie podnosi sam statusów i nie pyta ponownie o wybrany wariant. Nierozstrzygnięte szczegóły nadal wymagają decyzji w odpowiednim zadaniu produktowym. Rekomendacje UX oznaczone `RECOMMENDED UNDER DELEGATION` nie są nowymi `DEC APPROVED`.

## Analiza wpływu

Zmiany obejmują instrukcje agentowe, odkrywanie skills, ograniczenia narzędzi, delegowanie, kontrolę pochodzenia zewnętrznych materiałów, dowody prób oraz raportowanie i szablon PR. Dokumentacja domeny pozostaje źródłem prawdy. Nie zmieniają się dane ani wydarzenia historyczne, import, wyszukiwanie, model autoryzacji czy UX produktu.

Ryzyka: rozbieżne adaptery, instrukcje vendor sprzeczne z Blueprintem, pozorne uprawnienia read-only, błędne deklaracje kompatybilności oraz `PASS` bez wykonania. Odpowiedzią są wspólne źródła, przypięte commity i licencje, kontrola konfiguracji, izolowany review oraz próby rzeczywistych zachowań z rozdzieleniem od statycznych kontroli.

Żadne domenowe `OPEN` nie blokuje samego harnessu. Nie wolno wykorzystywać tej obserwacji jako zgody na późniejsze slice’y. Brak licencji albo nieobsługiwany format narzędzia blokuje wyłącznie daną integrację, do czasu bezpiecznego rozwiązania lub jawnego wykazania ograniczenia.

## Plan implementacji i weryfikacji

1. Sprawdzić stan Git, zachować cudze zmiany, bezpiecznie zsynchronizować `main` i utworzyć `chore/agentic-harness-v1`.
2. Zweryfikować aktualne formaty Codex i Claude Code w dokumentacji oraz dostępność obu CLI. Zapisać źródła i granicę między dokumentowanym formatem a wykonanym runtime.
3. Zbudować dziewięć kanonicznych ról, siedem procedur SDD/AIDD, wspólny workflow i cienkie adaptery. QA projektuje testy przed implementacją, gdzie ma to sens; osobny reviewer ocenia gotowego kandydata.
4. Przejrzeć siedem wskazanych skills designowych, licencje i zależne pliki. Włączyć tylko dopuszczone materiały, przypiąć commit i atrybucję. Brainstorming dostosować do istniejących decyzji; nie uruchamiać skryptów vendor.
5. Wprowadzić ograniczenia review: Claude używa wyłącznie Read/Grep/Glob; Codex uruchamia review przez osobną sesję rodzica read-only, bez mutujących MCP/plugins. Nie polegać na nieobsługiwanym per-role `sandbox_mode`.
6. Sprawdzić parsery konfiguracji, odnośniki, zgodność adapterów i kopii vendor. Przeprowadzić dostępne próby A–G; zapisany oczekiwany wynik nie zalicza próby. Weryfikować brak nieautoryzowanych plików oraz obserwowalne zachowanie agentów.
7. Wykonać niezależny review i security review ograniczeń harnessu, naprawić blokujące findings, ponowić właściwe kontrole; uzupełnić dokumentację i raport. Sprawdzić diff, utworzyć logiczny commit, wypchnąć branch i otworzyć PR, jeśli uprawnienia pozwalają. Bez merge.

**Poza zakresem:** inicjalizacja Next.js/React/Supabase/Drizzle, migracje, Render, płatne zasoby, produkcyjne sekrety, pełne CI aplikacji, walidator całej dokumentacji, zmiany zatwierdzonych decyzji.

## DoD i stan dowodów

DoD: dziewięć ról z granicami, siedem wspólnych skills SDD/AIDD, dostępne natywne adaptery, skontrolowane integracje designowe, workflow z QA i niezależnym review, scenariusze A–G, dokumentacja po polsku oraz raport faktycznie wykonanych kontroli. Nieobecna funkcja CLI jest ograniczeniem, nie symulowaną kompatybilnością.

Ten plik jest planem, **nie dowodem `PASS`**. Raport wykonania musi wskazać komendę/próbę, wersję narzędzia, kandydata, wynik `PASS / FAIL / NOT RUN`, powód niewykonania i odpowiedni artefakt. Testy aplikacji pozostają `NOT RUN`. Główny proces: [delivery](../../harness/workflows/delivery.md); instrukcja użytkowania i wyniki: [README](README.md).
