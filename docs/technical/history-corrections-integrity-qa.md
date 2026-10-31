# History Corrections & Integrity — QA

Data: 2026-10-31. Rola: `/root/history_qa_exec`, QA engineer; model/reasoning odziedziczone, dokładne wartości `NOT EXPOSED`. Podstawa: DEC-056, FR-LC-015/HE-001–003/AD-002, AC-LC-015/-01, AC-HE-002-01/-02, HE-003/-01 i nowe AC podzakresu korekt; regresje DEC-052/054/055, UC/TC-005/009/021 częściowo. Zastosowano plan-slice, implement-slice, verify-acceptance, rolę QA i delivery. Bez dalszej delegacji.

## Środowisko i izolacja

Kod w `/private/tmp/jobs-crm-history-integrity`, baza `8729e9e180d81eea1ef9adbeb0f8330243a6304a`. Runtime w `/private/tmp/jobs-crm-history-runtime`, Node **24.22.2** przez jawny PATH i executable procesu, pnpm **12.16.1**, lokalnie zainstalowany frozen lockfile. Syntetyczne konta A/B/anon i dane; rzeczywisty PostgreSQL/Auth/Data API/RLS oraz production build + HTTPS Chromium.

Istniejące porty 566xx były zajęte. Wyłącznie runtime snapshot używa adapterów **566xx → 572xx** w `scripts/recruitment/target.ts`, `validation.ts`, `cleanup-plan.ts`, `supabase/recruitment-config.toml`. Żadna zmiana tych adapterów nie trafia do produktu/PR. Własny target identyfikuje manifest, projectId, kontenery, loopback bind i checkpoint migracji; cleanup wyłącznie przez guard. Persistent DEV 567xx, inne projekty i pierwotny katalog pozostają nietknięte. Przed uruchomieniem zinwentaryzowano 44 wcześniejsze kontenery; po r3 wszystkie 44 ID nadal istniały.

## Pokrycie

- `history-corrections.test.ts`: immutable oryginały/czasy, dzień known/unknown, kierunek, stage name i snapshoty, preview bez zapisu, terminal void, deterministyczny stan oraz zależność A zaproszenie → B etap → C zaproszenie; retry/races/conflict/replay po void; monotoniczne case/stage revisions i ABA; A/B/anon list/direct ID/count/nested relation/recovery; spoofing pól audytu i bezpośrednie PATCH/DELETE. Rzeczywiste równoległe żądania korekty wobec wszystkich czterech rodzajów faktów; void aktywnej podstawy wobec stage-change.
- Rollback: błędny późniejszy element bulk oraz kontrolowany **AFTER UPDATE** probe wymuszający awarię już po zastosowaniu projekcji sprawy. Probe tworzy tylko QA na zweryfikowanym disposable targetcie, warunkowo dla dokładnego syntetycznego case ID, usuwa w finally. Sama próba korekty nadal wykonuje się prawdziwym JWT/Data API; administracyjne przygotowanie probe nie jest dowodem autoryzacji.
- `lifecycle-upgrade.ts`: fizyczny replay migracji 0000–0009 w osobnej własnej bazie, zachowanie pól/UUID/czasów/request keys 3A/3B i brak backfillu audytu; po 0009 nowa korekta starego faktu, nowa komenda etapu i replay pierwotnego zamiaru. Minimalny Auth substrate w tej bazie służy wyłącznie upgrade, nie stanowi proof Auth/RLS.
- `recruitment-history-corrections.spec.ts`: korekta i audyt, preview/confirm/void 1440/375, reload lista/detal, keyboard/cancel/focus, stale draft/new confirmation, utrata odpowiedzi po commit i jawne recovery, abort przed dostarczeniem i identyczny retry po reload, pagination lock/unlock, BFF Origin/account/spoof/anon. Dotychczasowe create/read/3A/3B testy pozostają regresją; stare ostrzeżenie append-only świadomie zastąpione zatwierdzonym tekstem korekt.

## Próby zachowane

| Próba | Wynik i dowód |
|---|---|
| r1 DB smoke | Migracje 10/10 PASS. Integracja FAIL: nowe przypadki semantyki/replay/ABA przeszły; test direct view PATCH oczekiwał 4xx, a nieupdatable view zwracał PostgreSQL 55000/HTTP500. Backend dodał kontrolowany INSTEAD OF trigger z odmową 42501; test pozostał przy 4xx. Dotychczasowy katalog oczekiwał dwóch tabel zamiast zatwierdzonej trzeciej tabeli audytu; zaktualizowano dokładną allowlistę. Log `/private/tmp/jobs-crm-history-qa-evidence/integration-r1.log`. |
| r2 full | FAIL przed testami: Turbopack odrzucił node_modules symlink poza hermetycznym rootem. Zainstalowano frozen deps bezpośrednio w runtime; nie zmieniano produktu/Next config. Log `build-r2-diagnostic.log`; manifest r2 miał ujawniony drift podczas równoległej pracy autorów i nie jest finalnym dowodem. |
| r3 full | Build PASS; integracja **64/64 PASS**; browser **56 PASS / 1 FAIL**. Jedyny browser FAIL: test wysyłał konkurencyjny fakt przed potwierdzeniem zakończenia preview, więc poprawny preview mógł już uwzględnić fakt. Dodano oczekiwanie widocznego podglądu przed konkurencyjnym zapisem; nie osłabiono asercji konfliktu. Po review rozszerzono regresje i poprawiono wskazane defekty produktu — r3 pozostaje historycznym FAIL. |

r3 produkt/db/testy **117/117 SHA256 zgodne** z ówczesnym kandydatem; manifest `full-r3-manifest.json`. Dowody pod `/private/tmp/jobs-crm-history-qa-evidence/`: `full-r3.log`, `evidence-r3.json`, `r3-browser/` (error-context i screenshoty). Build skanował 19 plików browser i 15 HTML/RSC, bez canary/service-role leakage według runnera. Own r1/r2/r3 targety posprzątane guarded cleanup, dowody pozostają.

Ogląd 375px: before/after, wynik status/etap i potwierdzenie czytelne, brak horizontal overflow. Widoczny w fullPage screenshot skip-link sprawdzono osobno: rzeczywisty rect top=-80/bottom=-36, poza viewportem i bez focusu; innerWidth=scrollWidth=375. To artefakt fullPage capture stałego elementu, nie dowód zasłoniętego kontrolera. Fizyczne urządzenia/AT i pełny audyt WCAG: NOT RUN.

## Finalna weryfikacja

**PASS — finalny r5, naturalny exit 0.** Kandydat produktu `9afd75048f78fcc1508b6ee15404c2412e9834b9`. Polecenie: `PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH node scripts/recruitment/runner.ts` w izolowanym runtime. Nowy własny target `run-6558cb0c`, projectId `jobs-crm-recruitment-ad0cf5-014b95318412`, porty 572xx; migracje **10/10**, checkpoint `25fceb1331de9de8f63d70266ddc2d77c39201d7d8cf0cba3310735775f0ac86`.

| Kontrola finalnego r5 | Wynik |
|---|---|
| Production build | PASS, exit 0 |
| Real Auth/Data API/RLS integracja + fizyczny upgrade | **66/66 PASS**, 0 failed/cancelled/skipped |
| HTTPS Chromium pełna regresja i nowe korekty | **60/60 PASS**, 0 failures |
| Tożsamość src/db/tests | **117/117 SHA256** zgodne z `git show 9afd750:<path>`, 0 mismatch |
| Guarded cleanup | PASS; naturalny runner exit 0, własne kontenery/network usunięte, **44/44** wcześniejsze ID zachowane, 0 dodatkowych kontenerów pozostawionych |
| Redakcja output/build | PASS według runnera; 19 browser assets i 15 HTML/RSC zeskanowane, canary/service-role nie ujawniono |

Przed finalnym r5 wykonano r4: build PASS, integracja 66/66 PASS, browser 59/59 PASS, naturalny exit 0, guarded cleanup, 117/117 hashy zgodne z `fe6f07d4718faae9f3b6cb9b2a7dd5cbb56d1f70`. Późniejszy niezależny review ujawnił dodatkowy P2: opóźnione parsowanie JSON odpowiedzi starej instancji mogło usunąć nowszy pending intent po remount. Frontend dodał kontrolę lifetime/epoch po odczycie body oraz usuwanie tylko identycznej tożsamości zapisu. R5 dodaje deterministyczny browser regression: rzeczywisty zapis A → opóźnione zużycie rzeczywistego GET JSON A → remount przez pagination → recovery A w nowej instancji → niedostarczony POST B → spóźnione body A → B zachowane → reload i identyczny retry B zapisują dokładnie jeden audyt. Test opóźnia wyłącznie klientowe `response.json()`, nie fabrykuje Auth, odpowiedzi API ani faktów biznesowych.

R5 sprawdza również nowy kontrakt temporary sessionStorage: owner-bound envelope przechowuje **zamrożoną potwierdzoną komendę**, w tym dzień/kierunek/nazwę etapu i oczekiwane rewizje, aby niedostarczony zapis dało się powtórzyć identycznie po reload. Nie jest to zapewnienie braku danych formularza w tab storage. Envelope pozostaje przy nieznanym wyniku, jest walidowany i usuwany dopiero przy potwierdzonym wyniku lub zaufanej odmowie starego zamiaru; nie wolno usuwać nowszego zamiaru B na podstawie odpowiedzi A. Sesja i właściciel pozostają granicą użycia; brak dodatkowego tekstu powodu i korespondencji.

**Ujawniony timing formatowania:** podczas przejścia r5 integracja → browser, o `2026-10-31T12:48:59.178395Z`, doprowadzono `recruitment-history-corrections.spec.ts` do Prettier w kanonicznym i runtime katalogu. Była to wyłącznie zmiana whitespace, przed test collection/worker loading; shell formatowania PID 22362 poprzedził Playwright CLI PID 22371. Zaktualizowano hash w `full-r5-manifest.json`; końcowy test i porównanie Git obejmują finalne sformatowane bajty. Dodatkowo `sourcesContent` faktycznie skompilowanego Playwright source map ma dokładnie SHA256 finalnego pliku `7a99c1216c7a7a6a61e655512e9baeb252ac085377feef367614df02d36daf5b` — dowód `r5-playwright-executed-source-proof.json`. Nie zmieniano produktu ani testów po ich wykonaniu.

Dowody finalne: `/private/tmp/jobs-crm-history-qa-evidence/full-r5.log`, `evidence-r5.json`, `full-r5-manifest.json`, `full-r5-candidate-proof.json`, `containers-final-r5.txt`, `r5-browser/`. Poprzednie próby zachowane osobno; r1/r2/r3 FAIL nie zostały przemianowane na PASS. R4 ma własny komplet `full-r4*` / `evidence-r4.json` / `r4-browser/`.

Root potwierdził końcowe niezależne frontend/security review PASS na `9afd750`, backend review poprawki SQL PASS na `fe6f07d`; szczegóły sesji i fingerprintów w raporcie orchestratora. To oddzielne dowody od QA. QA nie nadaje review własnemu kodowi.

**Ograniczenia:** rzeczywiste równoległe żądania nie dowodzą wszystkich możliwych przeplotów. Specjalny synthetic nested-trigger bypass nie był uruchamiany; scenariusz pozostaje ograniczeniem runtime proof przy osobnym static security review bez blokujących findings. Fizyczne urządzenia, AT, pełny WCAG, live OAuth i publiczny release NOT RUN. Publiczne bramki retencji/privacy/OPS i pozostały lifecycle nadal otwarte. Hosted CI jest osobnym dowodem finalnego HEAD PR; merge/deployment poza autoryzacją.
