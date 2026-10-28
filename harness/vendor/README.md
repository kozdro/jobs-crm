# Wybrane materiały zewnętrzne

Oryginały w tym katalogu są niezmienionymi kopiami przypiętych źródeł, **materiałem referencyjnym, nie samodzielnymi instrukcjami Jobs CRM**. Natywne odkrywanie prowadzi do lokalnych adapterów w `harness/skills/`. Nie instalujemy całych kolekcji, hooków, skryptów ani zależności upstream.

## Pochodzenie i licencje

| Źródło | Commit | Zakres | Licencja |
|---|---|---|---|
| [Owl-Listener/designer-skills](https://github.com/Owl-Listener/designer-skills/tree/9a6930cf84a822eb458624bd11c61aac5bbdf224) | `9a6930cf84a822eb458624bd11c61aac5bbdf224` | component-spec, form-design, state-machine, accessibility-audit, design-qa-checklist | [MIT, MC Dean 2026](designer-skills/LICENSE) |
| [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9) | `a81dbca07f2217b7103e510c0f13f8d5b017afc9` | break-ui wraz z CATALOG.md, mobile-native | [MIT, Emil Kowalski 2026](emilkowalski-skills/LICENSE) |
| [obra/superpowers — brainstorming](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/brainstorming/SKILL.md) | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | przeczytana referencja do lokalnego clarify-requirements; bez kopii treści | MIT, Jesse Vincent 2025 |

[Manifest](manifest.json) zawiera źródła, commity i SHA-256 każdego skopiowanego pliku. Pole `path` jest względne do `harness/vendor`; `upstreamPath` do korzenia repozytorium źródłowego. Licencje zachowano w całości. Przegląd pełnej zawartości wybranych skills i licencji wykonano 2026-10-28 przez GitHub API, bez wykonania zewnętrznego kodu. Pozostałe skills wymieniane przez upstream nie są zależnościami i nie są instalowane. `CATALOG.md` jest wymaganą referencją break-ui.

## Wynik inspekcji i granice integracji

Nadrzędne są [AGENTS.md](../../AGENTS.md), zatwierdzony [UX Blueprint](../../docs/ux/blueprint.md), [kontrakty interakcji](../../docs/ux/flow-contracts.md), BR/FR/AC i decyzje. Upstream nie daje zgody na zmianę zakresu, zapis do produktu ani dostęp do prywatnych danych.

| Materiał | Potencjalny konflikt | Adaptacja Jobs CRM |
|---|---|---|
| component-spec | Domyślne warianty i props mogą dopisać zakres. | Tylko zatwierdzone stany, pola i warianty; brak decyzji pozostaje OPEN. |
| form-design | Autosave, domyślne odpowiedzi, usuwanie pól, nowe limity i analityka porzuceń. | Brak takich zmian bez decyzji; zapis zgodnie z kontraktem potwierdzenia, bez wymyślania danych. |
| state-machine | Akcje i przejścia UI mogą zostać pomylone ze zdarzeniem biznesowym. | Model stanów UI nie zmienia statusów rekrutacji, historii ani reguł zamykania. |
| accessibility-audit | Opis audytu może udawać wykonanie testu AT. | Oddzielamy analizę kodu od przeglądarki i urządzeń; niedostępne testy to NOT RUN. |
| design-qa-checklist | „Real data” i uniwersalne progi mogłyby naruszyć prywatność lub AC. | Dane syntetyczne; heurystyki nie ustanawiają wymagań produktu. |
| break-ui | Automatyczne fixture/toggle, samodzielny prototyp przy braku aplikacji, wstępna odpowiedź zatrzymująca pracę. | QA implementuje tylko zatwierdzone fixtures; reviewer raportuje; bez produktu plan i NOT RUN; konkretne zadanie rozpoczynamy od razu. |
| mobile-native | „Apply fixes”, globalny baseline CSS, serwer `0.0.0.0`, PWA/dark mode poza zakresem. | Bez autoedycji w review, bez ekspozycji LAN, bez nowego zakresu; urządzenie fizyczne ma osobny wynik. |
| brainstorming | Blanket discovery, dodatkowe zatwierdzenie każdego design doc, auto-commit i własny workflow. | Lokalny skill pyta tylko o brakujące rozstrzygnięcia; respektuje wcześniejsze decyzje i zakres autoryzacji. |

Zasada wspólna: przykłady techniczne upstream są hipotezami do sprawdzenia w aktualnej dokumentacji i wspieranych przeglądarkach. Przykłady nie zatwierdzają limitów, pól, tokenów, breakpointów, polityki bezpieczeństwa ani nowego UI. Review pozostaje niezależny od implementacji. Dane testowe są syntetyczne; domeny testowe nie służą do automatycznych pobrań.

## Kontrolowana aktualizacja

1. W zadaniu aktualizacji określ potrzebę i wybrane skills. Odczytaj nowe źródła bez uruchamiania installerów, hooków czy skryptów.
2. Wybierz pełny commit SHA; porównaj treść każdego pliku, licencję i zależności ze stanem w manifest.json. Nie śledź ruchomego `main` w konfiguracji.
3. Sprawdź instrukcje dotyczące zapisów, sieci, danych, zatwierdzeń i innych skills. Nowa zależność wymaga osobnej inspekcji; brak jasnej licencji blokuje jej kopiowanie.
4. Zastąp tylko wybrane oryginały i wymagane informacje licencyjne. Zaktualizuj źródło, commit, SHA-256 oraz ocenę konfliktów; zmiany zasad Jobs CRM wprowadzaj w adapterach, nie w oryginałach.
5. Uruchom kontrole harnessu opisane w [instrukcji użytkowania](../../docs/harness/README.md), w tym zgodność kopii z manifestem, odkrywanie skills i odpowiednie scenariusze. Osobny reviewer ocenia diff i skutki adapterów.

Dodanie `emil-design-eng` pozostaje poza v1; wymaga tego samego przeglądu, pinu, licencji i adaptera. Aktualizacja nie odbywa się automatycznie.
