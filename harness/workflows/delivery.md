# Delivery — wspólny workflow SDD/AIDD

Główna sesja Codex albo Claude Code pełni rolę orchestratora. Źródłem prawdy są [AGENTS.md](../../AGENTS.md), [standard](../../docs/documentation-standard.md) i odpowiednie dokumenty produktu. Ten workflow steruje pracą; nie zastępuje FR/AC/BR/DEC/UX/ADR ani decyzji PO.

## Kontrakt delegacji

Każde zadanie korzysta z [szablonu zadania](../../docs/templates/agent-task.md). Przekaż cel, etap, rolę, model i reasoning (jeśli środowisko je ujawnia; inaczej „nieudostępnione”), źródło i zakres autoryzacji, konkretne ID/statusy, wymagane wejścia, dozwolone pliki, out of scope, plan testów i DoD. Dla implementacji/review dopisz identyfikator sesji autora i reviewera, bazę Git oraz dokładnego kandydata (commit lub diff z identyfikowalnym snapshotem).

Orchestrator przydziela rozłączne zakresy zapisu. Nie uruchamia równolegle autorów tych samych plików. Konflikt własności rozwiązuje przed następną zmianą. Jeżeli API Codex nie udostępnia wyboru profilu roli, użyj natywnego ogólnego subagenta z `task_name` snake_case i przekaż w zadaniu kanoniczny plik `harness/roles/<rola>.md`. To fallback, nie dowód załadowania TOML ani jego ograniczeń; właściwe uprawnienia musi zapewnić rodzic. Subagent nie deleguje dalej; zwraca wynik i blokery orchestratorowi. Modele dziedziczą ustawienia sesji, chyba że zadanie świadomie określa inne; model nie jest decyzją architektoniczną.

## Siedem etapów

1. **Requirement.** Odczytaj zadanie i minimalną ścieżkę źródeł z AGENTS.md. Użyj [analyze-requirement](../skills/analyze-requirement/SKILL.md), delegując `spec-analyst` przy potrzebie analizy. Wskaż rzeczywiste FR/AC/BR/DEC/UC, UX/ADR i OPEN wraz ze statusem. Dla zadania wyłącznie narzędziowego dopuszczalne „nie dotyczy” z uzasadnieniem; nie twórz fikcyjnych ID. Istotną niejasność obsłuż [clarify-requirements](../skills/clarify-requirements/SKILL.md).
2. **Impact Analysis.** Sprawdź moduły, dane, historię, błędy i przypadki brzegowe, import, wyszukiwanie, prywatność, granice zaufania i UX. Odróżnij zatwierdzony kierunek od otwartych szczegółów. Nie pytaj ponownie o już zatwierdzony wybór. Zatrzymaj tylko fragment zależny od blokującego OPEN; pozostały autoryzowany zakres może postępować.
3. **Implementation Plan.** Użyj [plan-slice](../skills/plan-slice/SKILL.md). Ustal małe kroki, właścicieli plików, ryzyka, out of scope i testy AC/UC/TC. `qa-engineer` uczestniczy teraz, projektuje testy i przygotowuje je przed implementacją tam, gdzie to praktyczne. Nie wymuszaj testów pozbawionych wartości dla redakcyjnych zmian. Wskaż potrzebnych reviewerów i warunki ponownej weryfikacji.
4. **Implementation.** Użyj [implement-slice](../skills/implement-slice/SKILL.md) tylko w zatwierdzonym zakresie i po spełnieniu właściwych bramek. Developerzy odpowiadają za własne unit testy, QA może pisać i zmieniać testy integracyjne/E2E/regresyjne w przydzielonym zakresie. Nie mutuj kodu zależnego od nierozstrzygniętego OPEN, nie dopowiadaj danych ani reguł. Przy zmianie decyzji zastosuj [record-decision](../skills/record-decision/SKILL.md) z rzeczywistym potwierdzeniem PO przed zależną implementacją.
5. **Verification.** Użyj [verify-acceptance](../skills/verify-acceptance/SKILL.md). Uruchom dostępne testy adekwatne do zmiany i powiąż wyniki z AC. Każdy wynik ma status `PASS`, `FAIL` albo `NOT RUN`, komendę lub procedurę, środowisko, kandydata i dowód; niewykonanie wymaga powodu. Brak aplikacji oznacza `NOT RUN` dla jej testów. Kontrola statyczna konfiguracji nie dowodzi zachowania CLI ani produktu.
6. **Review.** Użyj [review-change](../skills/review-change/SKILL.md) w niezależnej sesji na wskazanym kandydacie. Reviewer nie jest autorem ocenianych zmian i nie naprawia ich. Raportuje plik, lokalizację, istotność, skutek, podstawę wymagania i rekomendację. Autor usuwa blokery; QA ponawia dotknięte testy, a reviewer ponownie ocenia zmieniony zakres. Zmiana po review unieważnia jego pokrycie dla zmodyfikowanego fragmentu. Security review jest obowiązkowy dla granic zaufania, uprawnień, danych wrażliwych i ograniczeń samego harnessu.
7. **Documentation Update.** Zaktualizuj właściwe źródła wraz ze zmianą zachowania, następnie traceability i raport. Nie zamieniaj propozycji w zatwierdzoną decyzję. Przejrzyj finalny diff, kompletność testów i findings. Przygotuj PR według [szablonu](../../.github/pull_request_template.md); publikuj tylko w zakresie istniejącej autoryzacji. Brak uprawnień zgłoś wraz z przygotowanym lokalnym wynikiem. Nie wykonuj automatycznego merge.

## Routing

Uruchamiaj potrzebne role, nie cały katalog. QA i review mają niezależne cele; pozytywna opinia nie zastępuje testów.

| Rola | Kiedy delegować | Wynik / granica |
|---|---|---|
| [spec-analyst](../roles/spec-analyst.md) | Niejednoznaczny zakres, zależności, niespójność źródeł | Traceability, impact analysis, blokery; bez implementacji i decyzji za PO |
| [ux-designer](../roles/ux-designer.md) | Ekran, formularz, interakcja lub stany wymagające opracowania | Projekt w granicach Blueprintu; design skills nie dodają wymagań |
| [frontend-engineer](../roles/frontend-engineer.md) | Zmiana interfejsu | Implementacja i unit testy, bez samowolnej zmiany domeny/backendu |
| [backend-engineer](../roles/backend-engineer.md) | Domena, API/BFF, dane, auth, worker | Implementacja i unit testy w zatwierdzonej architekturze |
| [frontend-reviewer](../roles/frontend-reviewer.md) | Gotowa implementacja frontendu | Niezależne findings UX/accessibility/React/Next.js/AC; bez poprawek |
| [backend-reviewer](../roles/backend-reviewer.md) | Gotowa implementacja backendu | Niezależne findings domeny/transakcji/idempotencji/uprawnień; bez poprawek |
| [qa-engineer](../roles/qa-engineer.md) | Planowanie oraz weryfikacja slice’a | Implementuje i uruchamia testy, raportuje pokrycie i luki |
| [security-reviewer](../roles/security-reviewer.md) | Granice zaufania, dane wrażliwe, auth/RLS/Storage/import, uprawnienia harnessu | Niezależny threat model i findings; bez zmian ocenianego kodu |
| [platform-engineer](../roles/platform-engineer.md) | CI, środowiska, operacje i konfiguracja narzędzi | Implementacja operacyjna w zakresie zadania; osobna autoryzacja zasobów produkcyjnych/płatnych |

Backend-only: backend-engineer + QA + backend-reviewer. Frontend-only: frontend-engineer + QA + frontend-reviewer, z UX według potrzeb. Full-stack: obaj inżynierowie i obaj reviewerzy + QA. Auth/RLS/Storage: backend + QA + backend-reviewer + security-reviewer. Infrastruktura/harness: platform-engineer, QA oraz niezależny backend-reviewer dla konfiguracji/skryptów i security-reviewer przy zmianie granic zaufania; wybór doprecyzuj do rzeczywistego diffu. Niejednoznaczny wymóg: spec-analyst + clarify-requirements przed zablokowanym fragmentem.

## Uprawnienia i niezależny review

Instrukcja „read-only” nie jest zabezpieczeniem narzędzi. Claude Code reviewer ma allowlistę **Read/Grep/Glob**, bez Bash, Write, Edit ani mutujących MCP/plugins. Testy wymagające uruchomienia wykonuje QA w odpowiednim środowisku, a reviewer otrzymuje ich dowody.

Codex w użytym formacie roli nie zapewnia per-role `sandbox_mode`. Nie uruchamiaj reviewera jako dziecka rodzica z prawem zapisu. Najpierw użyj `python3 harness/scripts/review.py` z katalogu repozytorium zgodnie z [instrukcją](../../docs/harness/README.md): wrapper tworzy osobną sesję rodzica z sandboxem read-only i wyłącza MCP/plugins, następnie dopiero następuje natywne delegowanie review. Nie obchodź odmowy narzędzia eskalacją uprawnień. Jeżeli wrapper lub wymagane ograniczenia nie działają, review runtime jest `NOT RUN`; sama deklaracja roli nie spełnia tej bramki.

Przed review zamroź kandydata i przekaż zakres diffu oraz stan testów. Po review sprawdź, że reviewer nie zmienił kandydata; nie publikuj równolegle z zapisem autora. Ograniczenie narzędzi i izolowany proces zmniejszają ryzyko, lecz nie dowodzą poprawności oceny.

## Bramki i zamknięcie zadania

- **Autoryzacja:** wcześniejsza zgoda obowiązuje w swoim zakresie; nie wymagaj jej ponownie dla tego samego działania. Zmiana semantyki, schematu, bezpieczeństwa lub AC wymaga właściwej decyzji PO. Cisza i rekomendacja nie są zgodą.
- **Specyfikacja:** brak zależnej implementacji z blokującym OPEN; zachowaj `APPROVED / PROPOSED / OPEN / DEFERRED` oraz statusy ADR. Przy sprzeczności źródeł wyjaśnij tylko dotknięty zakres.
- **Domena i bezpieczeństwo:** sprawdź odpowiednie BR i [bramki techniczne](../../docs/technical/gates-and-impacts.md). Obowiązkowo obejmij testami właściwe ryzyka historii, duplikatów, RLS A/B, transakcji i idempotencji. Nie generuj migracji z niezatwierdzonego schematu ani fetch spoza zatwierdzonej allowlisty. Przy Smart Import przedstaw obowiązujący manual fallback i zachowaj wymagania SSRF również dla dopuszczonych domen (redirect/DNS/subresources), zgodnie z ADR-0006; allowlista nie zastępuje ochrony granicy sieciowej. Nie zapisuj sekretów, CV i prywatnej korespondencji do repozytorium ani raportów.
- **Dowody:** test nieuruchomiony nie jest `PASS`; nieudany nie staje się pozytywny po opinii agenta. Wymagana, niewykonana weryfikacja pozostaje otwartym warunkiem ukończenia. Testy harnessu nie certyfikują przyszłej aplikacji.
- **Review:** wymagany niezależny review implementacji; blokujące findings wracają do autora. Security review dla wrażliwego zakresu. Dokumentuj autora, reviewera i oceniony diff/commit.
- **Raport:** cel, zakres, ID/statusy, wpływ, pliki, decyzje PO/ADR, wyniki i dowody, findings, ograniczenia, OPEN i odłożony zakres. Nie deklaruj ukończenia niespełnionego DoD.

To **bramki procesu**, nie automatyczny system egzekwowania semantyki ani gwarancja dostępu. Kontrole skryptowe harnessu sprawdzają tylko wskazane własności; orchestrator i reviewer nadal odpowiadają za ocenę dowodów. Nie twórz domyślnie zielonego gate ani walidatora całej dokumentacji. Bootstrap v1 nie inicjalizuje aplikacji, migracji, produkcji ani pełnego CI produktu.
