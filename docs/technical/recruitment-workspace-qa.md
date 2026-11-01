# Recruitment Workspace — QA DEC-059

**Status: R9 LOCAL SELECTED PASS (build, 115/115 integracji, 20/20 browser, natural exit 0); pełny finalny exact-head CI 104 browser jest odrębną bramką PR (wynik CI publikuje orchestrator w PR). Historyczny R8 full FAIL 102/103 zachowany.** Bieżący kandydat aplikacji i testów: `0564b4c2326dbfb3288bb12441f6010047fc1ad1`, baza PR #19 `837257b5ecb5e9702b8158c49e9ebc19662d7dcd`.

Autor QA: `/root/workspace_qa_run`; rola `qa-engineer`, model/reasoning dziedziczone, dokładne wartości **NOT EXPOSED**. Zastosowano `plan-slice`, `implement-slice` i `verify-acceptance`. Podstawa: [zatwierdzony kontrakt 1A/2A](recruitment-workspace-analysis.md), DEC-059, FR/AC-RW-001–007/009, FR/AC-AD-002, BR-003/005/006/007/008/011/015/016/027/028/030, UC/TC-027 częściowo.

## Środowisko i tożsamość

- Własna kopia runtime: `/tmp/jobs-crm-workspace-qa`; własny świeży target R9 **workspace-r9** (po wykonaniu usunięty przez guard), projekt `jobs-crm-recruitment-364c51-a5be0b2fd3f4` (R8 używał osobnego świeżego projektu `jobs-crm-recruitment-09504e-f52c015a982e`). API 57421 / DB 57422 / mail 57424, wyłącznie loopback. Persistent DEV, F3 i cloud nietknięte.
- Kanoniczne porty 566xx były zajęte. Jedyny adapter źródła runtime: 5662x→5742x w `scripts/recruitment/target.ts`, `scripts/recruitment/cleanup-plan.ts`, `supabase/recruitment-config.toml`. Pliki kanoniczne pozostały bez zmian.
- [Manifest R9](evidence/recruitment-workspace/qa-source-manifest-r9.json) potwierdza **231 plików commit = source = normalized runtime**, obejmujących src/db/tests/scripts/supabase oraz główne konfiguracje. Dodatkowy diagnostyczny spec usunięto przed kolekcją finalnej suite.
- Rzeczywisty Node **24.22.2**: `/Users/kozdro/.volta/tools/image/node/24.22.2/bin`; pnpm **12.16.1**. Runtime używa fizycznej kopii istniejących zależności, bez instalacji lub zmiany lockfile.
- [27 artefaktów migracji](evidence/recruitment-workspace/qa-preexisting-migrations.json) jest byte-identical względem bazy; brak nowej migracji. Świeży target stosuje 13 istniejących migracji.
- Przed startem zinwentaryzowano 44 obce kontenery. [Preflight R8](evidence/recruitment-workspace/qa-r8-preflight.json) potwierdza zachowanie ich ID, nazw, obrazów i portów po usunięciu wyłącznie własnego zużytego R1 i starcie R8. [Końcowy cleanup](evidence/recruitment-workspace/qa-cleanup.json): **PASS 44/44 obce zasoby zachowane, zero własnych pozostałości**; osobne receipts R1/R8/R9 zachowane. Tożsamość wszystkich 231 plików source/runtime sprawdzono ponownie po wykonaniu.

Bieżąca komenda R9, cwd runtime — **jawnie wybrana lokalna diagnostyka**, nie pełny browser gate:

```sh
PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH \
RECRUITMENT_TARGET_ID=workspace-r9 NODE_OPTIONS='--import=/tmp/jobs-crm-workspace-select-r9.mjs' \
node scripts/recruitment/runner.ts
```

Runner pozostaje niezmieniony; wykonuje build, realne Auth/JWT/Data API integracje i produkcyjny HTTPS Chromium, następnie zamyka własny serwer/proxy. R8 nie miał preloadera ani równoległych mutacji. R9 używa wyłącznie zadeklarowanego preloadera selekcji: pełne integracje 115, Foundation 9 i szybkie Workspace 11. Lokalnie pomija tylko nowy 300 s expiry, wykonany już w pełnym R8; pełny hosted CI musi powtórzyć wszystkie 104 testy browser na dokładnym opublikowanym head. Bez zmian źródła runnera/testów i bez równoległych mutacji targetu. Jawnie wskazany własny target wymaga osobnego guarded cleanup po zakończeniu.

## Pokrycie i wyniki

| AC / ryzyko | Dowód | Stan |
| --- | --- | --- |
| RW-001–004 | Domyślny Kanban, cztery statusy, zwinięte Zakończone, osobny etap, brak draggable | R9 selected PASS; full CI odrębnie w PR |
| RW-005–007 | Lista i kolumny ponad 25 rekordów, stabilny sort/remisy, filtry przed range, presety/reset, brak zapisu konfiguracji | R9 integracja + selected browser PASS; full CI odrębnie w PR |
| M:N i pełność | 31 spraw spełniających org+person AND, stronicowanie listy i kolumny, status OR; profile wyboru ponad 25; aktywne relacje bez tranzytywnej inferencji | R9 integracja PASS |
| RW-009 / TC-027 częściowo | Dokładny ID, fragment historii, błąd/retry/wyścig odpowiedzi, drawer→detal→history page 2→powrót, query/page/scroll i reset sidebar | R9 selected PASS; full CI odrębnie w PR |
| Fragmenty podglądu | Ponad 5 organizacji, 25 kontaktów i 5 wpisów historii; jawne hasMore i droga do pełnych danych | R9 integracja PASS |
| AD-002 / BR-030 | Własny A; B/anon bez listy/ID/etykiet/liczników/opcji; real JWT i BFF z oficjalnymi SSR cookies; obcy expectedUserId | R9 integracja + selected browser PASS; full CI odrębnie w PR |
| Read-only | Snapshot spraw/faktów/closure/revisions/profili/relacji/command-audit przed i po; brak mutujących requestów od kontrolek Workspace | R9 integracja + selected browser PASS; full CI odrębnie w PR |
| Cache i sesje | HTML/RSC/API private/no-store, logout A→B/back/reload, rzeczywiste 300 s expiry/refresh, brak PII w dodatkowym storage | R9 selected PASS poza expiry; oba realne expiry R8 PASS; finalny full CI odrębnie w PR |
| UX / NFR-005 częściowo | 1440/1024/768/375/320, tekst 200% przy 375, klawiatura, widoczny focus, nonmodal desktop i fullscreen mobile | R9 selected PASS; full CI odrębnie w PR |
| Regresje | Istniejące create/read, lifecycle 3A/3B/3C, korekty historii i CC; unchanged negative RLS oracle | R9 integracje **115/115 PASS**, zero skips/cancel; pełny browser CI odrębnie w PR |

Nowe pliki: `tests/integration/recruitment/workspace.test.ts`, `tests/e2e/recruitment-workspace.spec.ts`. Integrację jawnie dodano do runnera; istniejący wzorzec browser config obejmuje `recruitment-*.spec.ts`. Developerzy zachowali własne unit testy; statyczne gate'y i niezależne review raportuje orchestrator osobno.

Dotychczasowe E2E dostosowano do zatwierdzonej nawigacji: explicit `view=list` dla globalnej listy 25+2 i renderingu listy; karta jest przyciskiem otwierającym preview, a jawny link prowadzi dopiero do detalu. Paginacja używa przycisków Dalsze wyniki/Poprzednia strona. Zachowano asercje prywatności, historii, statusów, dokładnej kolejności, liczby i braku duplikacji. Nie wyłączono testów ani asercji dla zielonego wyniku.

## Zachowana historia prób

| Próba | Wynik i fakty |
| --- | --- |
| R0 | **NOT RUN / launch FAIL:** operator uruchomił polecenie z kanonicznego cwd. Guard odmówił ENOENT manifestu przed migracją/build/testami. Skorygowano cwd. |
| R1 | **NOT RUN / launch FAIL:** pnpm `verifyDepsBeforeRun=error` odmówił w runtime z zewnętrznym symlinkiem node_modules (workspace structure changed). Bez reinstall lub wyłączenia guardu. |
| R2 | **Build FAIL / tests NOT RUN:** Turbopack nie rozwiązywał `next/package.json` poza filesystem root. Wyłącznie runtime node_modules zastąpiono fizyczną kopią istniejącej instalacji. |
| R3 | **PARTIAL:** build PASS, 113/113 integracji PASS; browser przerwany kontrolowanym SIGINT po 17 PASS, gdy niezależny review wykrył brak transportu tokenu przez paginację historii. Runner finally zwolnił własny serwer/proxy. |
| R4 | **PARTIAL / targeted FAIL:** build i 115/115 integracji PASS; diagnostyka Workspace 4 PASS / 6 FAIL. Dwa problemy harnessu: nested-label selector i odczyt tokenu przed nawigacją. Realne problemy: utrata scroll i focus poza viewportem na desktop. Mobile 375 tekst 200% i 320 PASS. Pełny browser przerwany jako zastąpiony kandydat, bez deklaracji PASS. |
| R5 | **PARTIAL / targeted FAIL:** build i 115/115 integracji PASS; wszystkie pięć szerokości/focus PASS, dwie regresje scroll nadal FAIL. Szeroka diagnostyka 7 PASS / 3 FAIL; dodatkowy problem harnessu: ponowny klik More przed zakończeniem ostatniej strony. Zachowano asercje i dodano oczekiwanie `aria-busy=false`. Trace dowiódł przyczyny utraty scroll, opis poniżej. |
| R6 | **Targeted PASS / full FAIL:** 10/10 targeted PASS (31.8 s, natural exit 0), 15 screenshotów. Pełne integracje 113 PASS / 2 FAIL z 115; browser full NOT RUN. Nie uznano diagnostyki za przyjęcie całej suite. |
| R7 | **Full FAIL, serial reproduction:** ten sam kandydat i identyczne 113/115 FAIL bez równoległego browsera. Bez tezy o winie współbieżności. Bezpieczny diagnostyczny preload poza źródłem ujawnił konkretny negative RLS oracle i umożliwił dowód przyczyny. |
| R8 | **Natural exit 1 / full FAIL:** świeży target, build i 115/115 integracji PASS; pełny browser **102 PASS / 1 FAIL**, brak skips. Jedyny FAIL: istniejący Foundation empty-owner nagłówek. Oba realne expiry i pozostałe Workspace przypadki PASS; nie zmieniono starej asercji. |
| R9 | **LOCAL SELECTED PASS, natural exit 0:** świeży target i dokładny 0564b4c. Build, pełne integracje **115/115**, jawnie wybrany browser **20/20** (Foundation 9 + Workspace 11), zero skips/cancel. Nowy test trzech pustych stanów i niezmieniony Foundation empty-owner test PASS. Pełna finalna suite 104 pozostaje do exact-head CI. |

Logi i receipts R0–R7 zachowano w [katalogu dowodów](evidence/recruitment-workspace/). Przerwane browser suite pozostają nieukończone; ich 17 PASS nie oznacza pełnego PASS.

## Dowiedzione przyczyny i korekty

**Powrót z detalu:** [techniczny trace R5](evidence/recruitment-workspace/qa-scroll-trace-r5.jsonl.log) potwierdził scrollY=180 podczas faktycznego kliknięcia pełnej strony, returnlink z fragmentem, Next push zachowujący fragment i późniejszy `getBrowserClient` usuwający dowolny fragment przed efektem Workspace. Brak restore scrollTo przy maxScroll=410 wykluczał objaśnienie wyłącznie clampem. Autor zmapował caller c_ do istniejącego `browser.ts:17–23`. Naprawa pozostała w Workspace: zweryfikowany query token zamiast fragmentu, bez zmiany ochrony Auth. R6 targeted dowiódł poprawnego powrotu z historią, query i niezerowymi scrollami.

Dla Kanbana trace pokazał browser auto-scroll o 3 px przy otwieraniu karty: przed podglądem 528, podczas faktycznego wyjścia 525, kolumna 480. Test porównuje powrót z rzeczywistym snapshotem momentu nawigacji, wymaga obu wartości niezerowych i dokładnej równości. Nie zmieniono oczekiwania na obserwowany wcześniej błędny wynik 0.

**R6/R7 negative RLS oracle:** [bezpieczny output R7](evidence/recruitment-workspace/qa-integration-r7-diagnostic.log) wskazuje `recruitment.test.ts:803`, „Disposable negative sensitivity: unchanged A/B assertion detects disabled RLS both directions”; drugi FAIL jest jego testem nadrzędnym. `assert.rejects` oczekiwał `/Cross-owner list leak/`, lecz helper `rows()` wcześniej odrzucił SELECT o statusie 206 zamiast 200. Diagnostyczny output został zweryfikowany istniejącym `captureAuthOutput`, dodatkowo sprawdzony na credential patterns i zredagowany przed utrwaleniem; [receipt](evidence/recruitment-workspace/qa-integration-r7-output-safety.json).

[Kontrolowany dowód przyczyny](evidence/recruitment-workspace/qa-reused-target-rls-range-proof.json): wielokrotnie użyty własny R1 zebrał **1819 spraw**. Dwa realne konta A/B z jednym własnym rekordem: przy RLS odpowiedź 200, Content-Range `0-0/1`, wszystkie własne; po wyłączeniu RLS dokładnie jak w istniejącym negative probe — 206, `0-999/1819`, 1000 rekordów i `allOwned=false`; po obowiązkowym finally restore ponownie 200 i `0-0/1` dla obu. Wyciek spełniał niezmieniony warunek wykrywania, ale globalne obcięcie PostgREST zatrzymywało poprzedni helper na statusie. Nie zmieniono kodu produktu ani asercji, aby przyjąć 206. Guard usunął wyłącznie własny zużyty R1; świeży R8 przeszedł ten sam oracle. To nie ustanawia limitu produktu ani nie zastępuje testu pełnego filtrowania Workspace.

## Ograniczenia

AC-RW-008 (DnD), nowe operacje lifecycle, edytowalny drawer oraz pełne RW-011 pozostają poza slice'em. Pełne TC-027/034 nie otrzymują PASS. Fizyczne urządzenia, technologie asystujące, pełny audit WCAG i rzeczywisty browser zoom: **NOT RUN**; tekst 200% oznacza zmianę html font-size. Publiczne bramki Auth/privacy/OPS, Global Search i import nadal obowiązują. Review jest osobnym dowodem orchestratora, nie wykonaniem testów QA.

### R8 empty-state regression i następny gate

[Pełny R8 receipt](evidence/recruitment-workspace/qa-runtime-r8.json), [log](evidence/recruitment-workspace/qa-full-r8.log), [konkretny error-context](evidence/recruitment-workspace/qa-empty-state-failure-r8.md). Nowy Workspace zwracał „Brak spraw na tej stronie” także dla pustego właściciela na pierwszej stronie, łamiąc istniejącą asercję „Nie masz jeszcze spraw”. Autor przywrócił trzy odrębne stany, bez zmiany starego testu. QA dodało rzeczywistą regresję dla pustego B w Kanban/lista, A z danymi poza końcem listy i wszystkich kolumn oraz pustego filtra.

Pełne wykonanie R8 zostało zachowane jako FAIL, mimo 102 PASS; naturalny exit 1 i finally zamknęły tylko własny serwer/proxy. Guarded cleanup usunął wyłącznie własny R8 przed startem świeżego R9. R9 selection receipt zawiera dokładne args i wykluczony lokalnie test, bez przedstawiania 20/20 jako pełnego 104/104. Końcowy raport wymaga osobnego wyniku pełnego hosted CI dla dokładnego finalnego head.

## Końcowy lokalny handoff R9

- [R9 runtime receipt](evidence/recruitment-workspace/qa-runtime-r9.json), [wykonana komenda i wyniki](evidence/recruitment-workspace/qa-selected-r9.log), [jawny selection receipt](evidence/recruitment-workspace/qa-selection-r9.json): build PASS, pełne integracje 115/115 PASS, wybrany browser 20/20 PASS, natural exit 0. **To nie jest lokalny pełny PASS 104/104.**
- [Runtime identity](evidence/recruitment-workspace/qa-runtime-identity-r9.json) i manifest potwierdzają własny świeży projekt, wersje usług i ledger 13 migracji. [Cleanup](evidence/recruitment-workspace/qa-cleanup.json): wszystkie 44 wcześniejsze kontenery zachowały ID/nazwy/obrazy/porty; własne R1/R8/R9 kontenery, wolumeny i sieci usunięte wyłącznie przez manifest-guarded cleanup. Persistent DEV nietknięty.
- 15 końcowych screenshotów `qa-r9-workspace*.png` obejmuje listę/tablicę/drawer dla 1440/1024/768/375/320; 375 ma tekst 200%. To dowody wybranych stanów, nie pełny audit WCAG/AT.
- Orchestrator raportuje osobno unit/static i niezależne review. **Pełny Application CI na dokładnym opublikowanym head, z niezmienionym runnerem i wszystkimi 104 browser, pozostaje obowiązkowy przed końcowym przyjęciem zadania.** Lokalny selection receipt nie znosi tej bramki.
