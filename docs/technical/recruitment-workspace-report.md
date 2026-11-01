# Recruitment Workspace — raport wykonania DEC-059

**Stan lokalny: implementacja, retest i niezależne review ukończone.** Pełny gate końcowego opublikowanego head CI jest oceniany odrębnie w PR. Implementacja zatwierdzonego 1A/2A; bez merge i deploymentu.

## Cel, kontrakt i kandydat

Kanban i lista przedstawiają ten sam właścicielski zbiór RecruitmentCase. Statusy OR, bezpośrednio aktywnie powiązana organizacja i osoba AND, filtrowanie przed paginacją, osobne strony kolumn, stabilny czas dodania/ID i gotowe widoki Wszystkie/Aktywne/Zakończone. Drawer jest read-only, pokazuje rzeczywiste relacje i podpisany fragment historii; pełna strona zachowuje istniejące operacje lifecycle. Bez DnD, reorder, edycji w drawerze i nowych komend biznesowych.

Podstawa: DEC-019/020/021/049/052–059; FR/AC-RW-001–007/009 oraz sufiksy RW-005-01, RW-006-01–03, RW-009-01–02; FR/AC-AD-002; BR-003/005/006/007/008/011/015/016/018/019/027/028/030; UC/TC-027 częściowo i regresje istniejącego lifecycle/CC. UX-002–005, F05, istniejący Visual Language; ADR-0002/0012. [Kontrakt i analiza wpływu](recruitment-workspace-analysis.md), [UX](../ux/recruitment-workspace-slice.md), [QA](recruitment-workspace-qa.md).

Baza: merge PR19 `837257b5ecb5e9702b8158c49e9ebc19662d7dcd`. Kandydat aplikacji/testów: **`0564b4c2326dbfb3288bb12441f6010047fc1ad1`**, gałąź `feat/recruitment-workspace`. Późniejsza dokumentacja i dowody nie zmieniają źródeł aplikacji/testów. Hosted CI musi być ocenione oddzielnie dla opublikowanego head PR.

## Autorzy i zakres zmian

- `/root`: decyzje, źródła SDD, koordynacja, statyczne gate, niezależne handoffy, raport i PR.
- `workspace_backend`: query/DTO, odczyt i GET `/recruitments/workspace-data`, własne unit.
- `workspace_frontend`: SSR Workspace, Kanban/lista, kontrolki, drawer, kontekst powrotu, paginacja historii, UX i własne unit.
- `workspace_qa_run`: integracje, produkcyjne HTTPS browser, runner, dostosowanie istniejących testów do zatwierdzonej nawigacji, izolowane targety i dowody.

Rozłączne zakresy zapisu, bez dalszej delegacji autorów. Model/reasoning dziedziczone, dokładne wartości runtime **NOT EXPOSED**. Niezależne review w osobnych rodzicach read-only przez harness, nie jako opinia autora.

Zmiany obejmują `src/modules/recruitment/{domain/workspace,application/workspace-read}.ts`, strony i GET w `src/app/recruitments/`, komponenty Workspace/nawigacji oraz ograniczoną integrację `case-history.tsx`. Dedykowane unit/integration/E2E i istniejące fixture nawigacyjne zachowują ścisłe asercje. Źródła DEC/OPEN/FR/AC/scenariuszy/traceability i UX zaktualizowane wraz z zachowaniem.

**Brak migracji, nowych zależności i zmian Auth.** Kanoniczne `db/` i `supabase/` identyczne względem bazy. Prywatny odczyt korzysta z istniejącej tożsamości i RLS; nonce nawigacyjny nie autoryzuje dostępu. Nie zmieniono importu, Search, relacji ani lifecycle. OPEN-017/028 tylko częściowo rozstrzygnięte przez DEC-059, pozostałe bramki zachowane.

## Weryfikacja

Node **24.22.2**, pnpm **12.16.1**, rzeczywisty executable przypięty. Dane syntetyczne; lokalny Auth/JWT/Data API/RLS i production HTTPS Chromium. Persistent DEV, cloud i wcześniejsze obce zasoby nietknięte. [Statyczne receipts](evidence/recruitment-workspace/static-checks.json); runtime i tożsamość plików w QA.

| Kontrola | Wynik |
| --- | --- |
| `pnpm --config.verifyDepsBeforeRun=error test:unit` | **PASS 386 aplikacyjnych + 87 skryptowych**, bez pominięć |
| `typecheck`, `lint`, `format:check` | **PASS**, pełny skonfigurowany zakres |
| `test:boundaries`, `test:canary` | **PASS**, ponowione na końcowym kodzie `0564b4c`; kontrola czułości, środowiska i granic |
| Lokalny pełny R8, `adf8a9e` | Build i integracje **PASS 115/115**; browser **FAIL 102/103**, natural exit1; oba rzeczywiste expiry PASS, jedyna regresja pustego stanu opisana poniżej |
| Lokalny retest R9, `0564b4c` | **PASS** build,115/115 integracji i jawnie wybrane20/20 browser, natural exit0; pełne104 browser są wymaganym gate CI |
| Tożsamość i cleanup | **PASS**231/231 commit/source/runtime;44/44 wcześniejsze kontenery zachowane, zero własnych pozostałości; [receipts QA](recruitment-workspace-qa.md) |
| Szybka diagnostyka rzeczywistego Workspace | **PASS 10/10** na tym samym kandydacie, bez zastępowania pełnej regresji |
| Niezależny backend/frontend/security review | **PASS_STATIC** na dokładnym `0564b4c`, brak otwartych findings; runtime oceniany osobno |
| Hosted CI exact PR head | Oddzielny obowiązkowy gate: pełna niezmieniona suite104 browser, integracje i pozostałe jobs. Dokładny head, status i link do workflow są w PR; ten lokalny raport nie nadaje CI PASS. |

Zakres dowodów: ponad 25 wyników po filtrze organizacja+osoba, lista i niezależne kolumny, profile filtrów poza pierwszą stroną, M:N bez duplikacji/inferencji, ograniczone podglądy z hasMore, snapshoty bez zapisów, A/B/anon po liście/ID/relacjach/metadanych. Browser obejmuje filtry/presety/reset, wyścigi podglądu, błędy/retry, powrót przez paginację historii z niezerowym scroll strony/tablicy/kolumn, własne strony kolumn, cache/logout, 1440/1024/768/375/320 i tekst 200% przy375.

Wybrane rzeczywiste klatki desktop1440 i mobile375 tekst200 zostały obejrzane przez orchestratora; to ograniczona inspekcja wizualna, nie pełny audyt accessibility ani akceptacja urządzeń.

## Review, naprawy i zachowane FAIL

[Receipts niezależnych review](evidence/recruitment-workspace/review-runs.json) wiążą role, kandydatów, sesje, oceny, natural exit i identyczne fingerprinty przed/po. Każdy rodzic read-only uruchomił dokładnie jednego generic subagenta + canonical role; nie deklarujemy typed profile. Review nie wykonywało testów.

- P2 z pierwszego frontend review: paginacja historii gubiła token Workspace. Naprawiono obie strony linków i walidację UUID, z regresją unit/browser; zamknięcie ocenione niezależnie.
- Rzeczywiste R4/R5 browser wykryły fokus poza viewportem i brak odtwarzania scrolla. Fokus uwzględnia viewport, clipping i overlay, zachowując dostęp do niezasłoniętych kart. Ślad wykonania dowiódł, że istniejący guard Auth usuwa fragment URL przed efektem Workspace. Guard pozostał bez zmian; techniczny nonce wraca w query, wymaga zgodności ownera, pamięciowego kontekstu i destynacji, po odtworzeniu znika z URL. R6 szybkie 10/10 potwierdziło zachowanie runtime; końcowa pełna regresja pozostaje osobnym gate.
- Zachowane błędy QA: selektory zagnieżdżonych etykiet zastąpiono role+name, lookup czeka na zakończenie ładowania, token jest sprawdzany po zakończeniu nawigacji. Scroll tablicy porównuje rzeczywistą pozycję w chwili opuszczenia (3px zmiany podczas kliknięcia wykazane śladem), nadal z wymaganą niezerową wartością i ścisłą równością po powrocie. Nie osłabiono asercji prywatności, scrolla ani fokusu.
- Wcześniejsze launch/build FAIL: niewłaściwy cwd, odmowa pnpm dla symlinku instalacji w kopii i Turbopack odrzucający zewnętrzny symlink. Kopia runtime dostała fizyczne, istniejące zależności; bez instalacji/zmiany lockfile i bez wyłączenia guardów produktu. Szczegóły i wszystkie próby w QA.
- Pełny R8 zakończył się naturalnym FAIL102/103 browser: pierwsze puste konto dostało komunikat pustej strony wyników. Poprawiono produkt, zachowując starą asercję Foundation. Dodany test rozróżnia puste konto w Kanbanie/liście, pustą dalszą stronę listy/kolumn oraz brak dopasowań. Lokalny R9 wybiera dotknięte Foundation i szybkie Workspace; pełna niezmieniona suite104, w tym oba realne expiry, pozostaje obowiązkowym gate dokładnego opublikowanego head CI. Nie nazywamy lokalnego wyboru pełną regresją.
- R6/R7 integracje113/115 FAIL odtworzono bez równoległej diagnostyki. Dowód na własnym targetcie:1819 skumulowanych syntetycznych spraw; przy celowym wyłączeniu RLS odpowiedź206 i zakres0–999/1819 zamiast oczekiwanego200. Stary helper kończył się przed oczekiwanym sygnałem „Cross-owner list leak”. Przywrócenie RLS dawało200 i wyłącznie własny rekord. To potwierdzona niezgodność ponownie użytego targetu z fixture testu czułości, bez ustanawiania limitu produktu. Asercji i kodu produktu nie zmieniono; końcowy gate wymaga świeżego izolowanego targetu. Nie przypisujemy błędu konkurencji.

Przerwane starsze browser suite są opisane jako nieukończone. Nie zastępują pełnego PASS i nie zostały ukryte. Dokładne wyniki/receipts oraz resource cleanup pozostają w QA.

## Ograniczenia

Bez DnD/AC-RW-008, edycji i komend w drawerze, pełnego RW-011/TC-027/034, Global Search/import, zadań/kalendarza i publicznego wdrożenia. Fizyczne urządzenia, technologie asystujące, pełny WCAG audit i rzeczywisty browser zoom **NOT RUN**; tekst200% oznacza zmianę html font-size. Publiczne Auth/privacy/OPS i pozostałe OPEN nie są zamykane.

Kontekst powrotu jest nietrwały i związany z kontem. Twarde przeładowanie dokumentu lub nowa karta bez rzeczywistego kontekstu w pamięci prowadzą do standardowego Workspace; nie odtwarzamy domniemanego poprzedniego stanu.

PR zawiera stan pełnego CI i dokładny publikowany head. Gotowość do owner review wymaga zakończenia tego gate sukcesem; lokalny wybrany zakres nie zastępuje pełnej suite. Bez merge/deploymentu.
