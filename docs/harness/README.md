# Agentic Engineering Harness v1

Harness przygotowuje pracę Codex i Claude Code przed inicjalizacją produktu. Źródłem prawdy pozostaje dokumentacja Jobs CRM; konfiguracje opisują role i sposób pracy. Autoryzacja bootstrapu nie zamyka OPEN i nie uruchamia Next.js, Supabase, Drizzle ani Render.

## Architektura i obsługa

- [AGENTS.md](../../AGENTS.md) zachowuje reguły domenowe i kieruje główną sesję do [delivery](../../harness/workflows/delivery.md).
- [Role](../../harness/roles/) są kanoniczne; `registry.json` utrzymuje opis, profil dostępu i polecane skills. Pliki `.codex/agents/*.toml` oraz `.claude/agents/*.md` są cienkimi adapterami generowanymi z rejestru, odsyłającymi do wspólnej roli.
- [Skills](../../harness/skills/) zawierają jedną kopię procedury. `.agents/skills/<name>` i `.claude/skills/<name>` to względne symlinki do niej. Linki wewnątrz skills rozwiązuje się względem kanonicznego pliku (`realpath`), a zapisane ścieżki repo względem root.
- [Vendor](../../harness/vendor/README.md) zawiera wyłącznie wybrane, przypięte oryginały i licencje. Lokalny skill jest adapterem polityki, który wyraźnie ogranicza upstream.
- [Evals](../../harness/evals/README.md) oddzielają zachowanie agentów od kontroli struktury. [Plan bootstrapu](bootstrap-plan.md) dokumentuje wymagania, statusy i wpływ; [raport](verification.md) podaje rzeczywiste wyniki.

Bez frameworka agentowego i zależności runtime projektu. Skrypty utrzymaniowe wymagają Python 3.9+; frontmatter YAML dodatkowo sprawdzono lokalnie przez Ruby `YAML.safe_load` (nie jest to zależność skryptów harnessu). Symlinki wymagają ich obsługi przez Git/system (na Windows Developer Mode lub odpowiednie uprawnienia). Nie zastępuj ich ręcznie rozbieżnymi kopiami.

## Role i skills

| Rola | Odpowiedzialność |
|---|---|
| spec-analyst | FR/AC/BR/DEC/UX/ADR/OPEN, traceability, impact, niespójności; bez kodu |
| ux-designer | Ekrany, komponenty, stany i interakcje zgodne z Blueprintem |
| frontend-engineer | UI, kontrakty backendu, formularze, a11y i własne unit testy |
| backend-engineer | Domena, BFF, dane, RLS, Storage, transakcje, worker i unit testy |
| frontend-reviewer | Niezależny frontend/UX/a11y/performance review; bez poprawek |
| backend-reviewer | Niezależny review domeny, SQL, migracji, kontraktów i regresji |
| qa-engineer | Projektuje, **pisze i uruchamia** testy integracyjne, RLS, E2E i regresje |
| security-reviewer | Niezależny threat model i review granic zaufania/danych wrażliwych |
| platform-engineer | CI/CD, środowiska, operacje, obserwowalność, backup/restore/DR |

Wspólne skills SDD/AIDD: `analyze-requirement`, `clarify-requirements`, `plan-slice`, `implement-slice`, `verify-acceptance`, `review-change`, `record-decision`.

Skills designowe: `component-spec`, `form-design`, `state-machine`, `accessibility-audit`, `design-qa-checklist`, `break-ui`, `mobile-native`. Zalecane role to UX, frontend, frontend review i QA; ich dostępność w discovery nie rozszerza uprawnień. `break-ui` może tworzyć fixture tylko w delegowanym zakresie QA; reviewer raportuje potrzebę testu. `emil-design-eng` nie jest zainstalowany; ewentualne dodanie wymaga odrębnej inspekcji, pinowania, licencji i wrappera.

## Natywne adaptery

Zweryfikowane narzędzia i dokumentacja źródłowa na 2026-10-28:

- Codex CLI **0.159.3**: samodzielne `.codex/agents/*.toml` z `name`, `description`, `developer_instructions`; `.codex/config.toml` włącza agentów i limit trzech jednoczesnych dzieci. Modele i reasoning są dziedziczone. Nie używamy przestarzałego `features.multi_agent` ani fikcyjnego per-role sandboxu. Źródło: [custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- Codex odkrywa `.agents/skills` i wspiera symlinki: [skills](https://learn.chatgpt.com/docs/build-skills). Wywołanie jawne: `$plan-slice`, automatyczne według opisu skillu. Konfiguracja projektu wymaga zaufania do checkoutu; po zmianach uruchom świeżą sesję.
- Claude Code **2.1.285**: frontmatter Markdown w `.claude/agents/` (`name`, `description`, `tools`, `model: inherit`, `permissionMode`, `skills`). Skills roli są preloaded. Źródło: [subagents](https://code.claude.com/docs/en/sub-agents).
- Claude odkrywa `.claude/skills`; jawnie `/plan-slice`, automatycznie według opisu. [Skills](https://code.claude.com/docs/en/skills). Minimalny [CLAUDE.md](../../CLAUDE.md) importuje `@AGENTS.md`, zgodnie z [memory imports](https://code.claude.com/docs/en/memory).

W lokalnym runtime Codex `spawn_agent` udostępnia `task_name`, bez parametru wyboru typu roli. Zweryfikowano natywnego ogólnego subagenta z kanoniczną rolą przekazaną w zadaniu; **ładowanie profilu TOML do dziecka: NOT RUN / niedostępne w tym API**. Nazwy zadań wymagają snake_case, np. `backend_reviewer`; identyfikator roli pozostaje `backend-reviewer`. Pliki TOML zachowują aktualny udokumentowany format dla klientów obsługujących custom profiles. Nie deklarujemy pełnej kompatybilności tego mechanizmu na podstawie nazwy zadania.

Nie zakładaj zgodności konfiguracji między wersjami. Nie kopiuj ustawień Codex do Claude. Wersje wskazują lokalny baseline weryfikacji, nie gwarancję każdej przyszłej wersji ani instalacji. Przy zmianie CLI ponów discovery, ograniczenia i evals. Kontekst7 wykorzystano do sprawdzenia dokumentacji; nie zapisujemy endpointów, tokenów ani osobistej konfiguracji MCP do repo.

## Zadanie i orchestracja

Uruchom wybrane CLI w root repo i przekaż [task packet](../templates/agent-task.md): cel, istniejącą autoryzację, etap, ID/statusy, dozwolone pliki, out of scope, plan testów i DoD. Model/reasoning raportuj z runtime lub jako `NOT EXPOSED`. Główna sesja deleguje zgodnie z delivery, nie każdy subagent uruchamia następnych. Wątpliwości rozstrzyga w minimalnym zakresie; drobne odwracalne wybory wykonawcze nie wymagają nowego Discovery.

QA uczestniczy w planie i może pisać testy przed implementacją. Test-first stosuj, gdy kontrakt i środowisko dają sensowny red/green. Inżynierowie zachowują unit testy własnego kodu. Po implementacji występuje niezależny review, poprawki autora i ponowna weryfikacja dotkniętego zakresu. Pełna kolejność: Requirement → Impact Analysis → Implementation Plan → Implementation → Verification → Review → Documentation Update.

Przykłady poleceń (symboliczne ID zastąp konkretnymi, istniejącymi zapisami):

- **Nowa funkcjonalność:** „Użyj analyze-requirement i plan-slice dla [FR/AC], ustal OPEN i zakres autoryzacji. Deleguj analizę spec-analyst oraz plan testów QA. Implementuj tylko zatwierdzony slice [zakres], potem niezależny review.”
- **Poprawka backendowa:** „Napraw [reprodukcja] w [pliki/FR/AC]. Backend-engineer + QA; regresja i idempotencja według wpływu; niezależny backend-reviewer, security-reviewer przy granicy zaufania.”
- **Poprawka frontendowa:** „Napraw [stan UI] zgodnie z [UX/AC], bez zmiany zachowania produktu. Frontend-engineer + QA i frontend-reviewer; ux-designer jeśli potrzebny projekt stanu.”
- **Testy:** „QA-engineer: napisz i uruchom testy [AC/TC] w [zakres plików], w tym negatywne przypadki A/B. Bez zmian produktu. Raportuj komendy i NOT RUN przy brakach środowiska.”
- **Code review:** „Backend-reviewer: oceń [commit/diff], autor [sesja], wymagania [ID], testy [dowody]. Bez poprawek; findings z plikiem i linią.” Uruchom przez wrapper poniżej.
- **Security review:** „Security-reviewer: oceń [kandydat] dla [Auth/RLS/Storage/import], threat model i testy granic zaufania. Autor [sesja]. Nie zmieniaj kodu.”
- **OPEN:** „Spec-analyst: przeanalizuj OPEN-002 dla RecruitmentCase. Użyj clarify-requirements; wskaż jedno najbliższe rozstrzygnięcie PO. Nie generuj schematu ani migracji.”

## Uprawnienia i approval gates

Obowiązują zatwierdzone decyzje i istniejąca autoryzacja. PO rozstrzyga wpływ na produkt/model danych/bezpieczeństwo/architekturę/AC, blokujące OPEN i nowy zakres. Nie interpretuj ciszy jako zgody. `record-decision` zapisuje faktyczne potwierdzenie w źródle prawdy; nie jest mechanizmem samodzielnego zatwierdzania przez agenta.

W Claude reviewerzy mają allowlistę **Read/Grep/Glob**, bez shell, Write/Edit i MCP. QA uruchamia potrzebne testy i przekazuje dowody. W Codex role dziedziczą uprawnienia rodzica; samo dodanie `sandbox_mode` do roli nie zapewnia read-only. Dlatego **nie deleguj review z sesji zapisywalnej**. Użyj niezależnej sesji nadrzędnej:

```sh
python3 harness/scripts/review.py codex backend-reviewer < /tmp/jobs-review-task.txt
python3 harness/scripts/review.py claude security-reviewer < /tmp/jobs-review-task.txt
```

Plik zadania przygotuj z konkretnym kandydatem, zakresem, autorem i dowodami; bez sekretów. Wrapper Codex uruchamia natywne `exec` z read-only, `approval_policy=never`, bez user config (auth pozostaje natywne), apps/plugins i rozszerzania uprawnień, a następnie zleca natywnego subagenta. Sprawdza zgodność wszystkich adapterów i symlinków, nieznane pliki konfiguracji oraz metadane skills. Po tym preflight nadaje jednorazowe zaufanie do kanonicznej ścieżki checkoutu w argumentach procesu (nie zapisuje go globalnie). Porównuje pliki, tryby i cele symlinków przed/po; zmiana oznacza niezerowy exit. Wrapper Claude ogranicza narzędzia również sesji głównej, wyłącza MCP i używa `--restricted`, ograniczając odczyt do katalogu pracy. Ten tryb pomija discovery agentów projektu, dlatego wrapper przekazuje sprawdzony adapter reviewera jawnie przez natywne `--agents` i wybiera go przez `--agent`. W tym trybie nie ma preload skills: prompt wymaga jawnego odczytu kanonicznego `review-change/SKILL.md`. Normalna sesja Claude nadal korzysta z `.claude/agents/` i preload skills. `--dry-run` drukuje argumenty bez modelu.

To ograniczenia lokalnego workflow, nie ochrona przed administratorem systemu, nadrzędną polityką organizacji ani dowolnym nieprzejrzanym środowiskiem CLI. Jeśli runtime nie potwierdzi ograniczeń, review oznacz `NOT RUN`; nie obchodź ich trybem bypass. Konfiguracji globalnej i zaufania użytkownika harness sam nie zmienia. Reviewera nie używa się do wykonywania testów ze skutkami zapisu. Przed/po review porównaj kandydata; późniejsze zmiany wymagają ponownego review dotkniętego zakresu.

## Weryfikacja i utrzymanie

```sh
python3 harness/scripts/sync.py --check
python3 harness/scripts/check.py
python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v
python3 harness/scripts/discover.py
python3 harness/scripts/evaluate.py codex A
python3 harness/scripts/evaluate.py claude A
```

`sync.py` bez `--check` odtwarza adaptery po świadomej zmianie kanonicznego rejestru. `check.py` kontroluje tylko harness: inventory, zgodność adapterów, symlinki, odnośniki i hashe vendor. `discover.py` korzysta z konfiguracji użytkownika; nie jest dowodem konfiguracji osobnej sesji review, którą weryfikuje G. Testy negatywne wykrywają dryf uprawnień, zmieniony vendor i uszkodzone linki. To nie walidator dokumentacji Jobs CRM. `discover.py` odczytuje natywne discovery Codex bez wywołania modelu; discovery Claude jest obserwowane w nagłówku runtime eval. `evaluate.py` zapisuje lokalny transcript i wynik procesu, ale **nie nadaje PASS zachowaniu modelu**. Ocena A–G wymaga sprawdzenia narzędzi, wyniku i braku niedozwolonych zmian według rubryki. Szczegóły: [evals](../../harness/evals/README.md).

Raw transcripts są w ignorowanym `.harness-runs/`; nie commituj metadata kont, sekretów ani prywatnych promptów. Raportuj tylko zredagowane dowody. PASS statyczny, PASS scenariusza harnessu i testy produktu to różne wyniki. Bez aplikacji Vitest/PostgreSQL/RLS/Playwright pozostają `NOT RUN`.

Aktualizacja vendor: [procedura i manifest](../../harness/vendor/README.md). Nowy dokładny commit → diff wybranych plików/licencji → inspekcja → zmiana pinów/hashów i wrapperów → kontrole + evals + niezależny review. Nie uruchamiaj upstream instalatorów, nie aktualizuj automatycznie z main.

## Ograniczenia v1

Bramki semantyczne są procedurami ocenianymi przez orchestratora, reviewerów i PO, nie nieomylnym automatem. Nie ma CI produktu, migracji, schematu ani działających testów aplikacji. Codex read-only nadal dopuszcza szeroki odczyt lokalnego systemu; nie używaj tego workflow do nieprzejrzanych zewnętrznych repozytoriów zawierających prompt injection bez dodatkowej izolacji OS. `access: read` dla spec-analyst w Codex jest kontraktem roli; wymuszenie sandboxu dotyczy oddzielnych sesji review. Zagnieżdżone pliki instrukcji i lokalna pamięć CLI mogą wpływać na odpowiedzi mimo ograniczenia narzędzi. Codex zapisuje historię w natywnym katalogu sesji użytkownika (potrzebną do dowodu parent/child); `.harness-runs/` nie jest jej jedyną kopią. Nie ma narzędziowej izolacji zakresu plików autora; kontroluje ją kontrakt delegacji i diff. Wspólne skills są dostępne szerzej niż polecana rola, a role nie mogą zmieniać swoich obowiązków przez załadowanie skillu. Jedna próba behawioralna nie gwarantuje deterministyczności modelu. Pozostałe ograniczenia runtime i dokładne wyniki znajdują się w [raporcie weryfikacji](verification.md).

Następny krok: zatwierdzić konkretny Foundation Plan z OPEN właściwymi dla slice’a i oddzielną autoryzacją inicjalizacji/PoC opisanych w [planie technicznym](../technical/implementation-plan.md).
