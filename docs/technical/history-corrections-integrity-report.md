# History Corrections & Integrity — raport wykonania

Data 2026-10-31. **PASS — lokalna implementacja, końcowe QA i niezależne review zatwierdzonego slice’a.** Publiczne udostępnienie pozostaje poza zakresem. Podstawa DEC-056, zatwierdzone 1A/2A [kontraktu](history-corrections-integrity-analysis.md). Baza merge PR #16 `8729e9e180d81eea1ef9adbeb0f8330243a6304a`, izolowany worktree `/private/tmp/jobs-crm-history-integrity`, branch `feat/history-corrections-integrity`. Bez merge/deploymentu i mutacji persistent DEV.

Historyczne przebiegi i findings są zachowane poniżej; finalny wynik oraz ograniczenia opisuje końcowa sekcja. Hosted CI jest sprawdzane osobno dla finalnego HEAD PR.

## Autoryzacja, zakres i izolacja

PO jawnie zatwierdził 1A/2A i pełną implementację/QA/review/osobny PR; DEC-056. FR-LC-013/014/015, HE-001/002/003 i AD-002; AC-HE-002-05/003-04, LC-015-02/-03 i LC-014-03/-04 wraz z bazowymi kryteriami; BR-003–007/015/016/030, UC/TC-021 częściowo oraz regresje UC/TC-005/009. OPEN-004/020/034 tylko częściowo rozstrzygnięte. Bez zmiany architektury/nowych zależności/ADR, bez retencji, hard delete/restore, retype, dowolnego PATCH statusu, zamknięć/wznowień, globalnych etapów, kalendarza, importu/Search, komunikacji i publicznego release.

Źródłowy worktree zawierał wyłącznie dwa dokumentacyjne zmienione pliki z analizy (`docs/README.md` i analiza); skopiowano analizę do nowego worktree, bez usuwania lub zmiany źródła. Manifest SHA256 źródła: `/private/tmp/jobs-crm-history-source-manifest.json`. Nie użyto reset/stash/restore. Instalacja `PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH pnpm install --frozen-lockfile` zakończona exit0, bez zmiany lockfile.

## Metadane i plan przekazań

Orchestrator /root: DEC/OPEN, BR/FR/AC/UC/UX/traceability, raport i koordynacja. /root/history_backend: db/recruitment, moduł domeny/aplikacji i routes commands/history; własne unit. /root/history_frontend: komponenty i strony list/detail, własne unit. /root/history_qa_exec: integracja/E2E/upgrade i raport QA, odrębny target i dowody. Model/reasoning odziedziczone, dokładne wartości NOT EXPOSED. Brak dalszej delegacji implementatorów. Zastosowano record-decision, implement-slice, plan-slice; verify-acceptance/review-change przy właściwych bramkach. Własność plików rozłączna.

Research przed implementacją: Context7 resolve→query `/supabase/supabase` — [funkcje i uprawnienia](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/functions.mdx), `/vercel/next.js` — [router.refresh i zachowanie client state](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/04-functions/use-router.mdx). Odczytano skill Supabase i [changelog](https://supabase.com/changelog.md); nie zmieniano przypiętych wersji lub infrastruktury. Istniejący ledger Drizzle ma pierwszeństwo przed ogólnym workflow migracji CLI ze skillu; bez drugiego ledgeru.

## Weryfikacja i zachowane nieudane próby

Pierwszy kandydat `3fb6a7a68bd19ecfafd689de9681a0e00cf6bfe0`: pełny unit **255 aplikacyjnych +87 skryptowych PASS**, typecheck/lint/format PASS. Boundaries i canary PASS (wykonane przed ostatnią poprawką zgodności kształtu historycznej odpowiedzi; końcowy runtime/CI raportowane osobno). Logi root: `/private/tmp/jobs-crm-history-test-unit-r3.log`, `*-final.log`, `*-test-boundaries.log`, `*-test-canary.log`. Początkowy unit FAIL5/255 przez dodanie projection fields do historycznego acknowledgement; przywrócono dotychczasowy9-polowy wynik oryginalnego RPC, rozszerzenie wyłącznie dla efektywnej osi czasu, bez osłabienia starych asercji. Następny unit255PASS/86z87scriptFAIL: jawna liczba migracji9→10; zaktualizowano ją i dodano prefix3B w czystym teście planowania migracji DEV, bez uruchomienia persistent DEV. Format pierwszego przebiegu FAIL dla nowych metadanych/testu; sformatowano właściwe pliki i ponowiono PASS. Zachowane logi `*-r1-fail.log`, `*-r2.log`.

QA runtime w `/private/tmp/jobs-crm-history-runtime`, własne jawne porty572xx zamiast zajętych566xx. Adaptery tylko target.ts/validation.ts/cleanup-plan.ts/config, bez kanonicznej zmiany portów. R1 integracja8/9 nowych podtestów PASS, FAIL odmowy DML widoku jako55000/500; backend dodał jednoznaczną odmowę42501, test nadal wymaga4xx i braku mutacji. Pierwszy cleanup odmówił niezgodnego portu manifestu (bez usuwania); po dostosowaniu tylko runtime adaptera cleanup guard zakończony exit0. R2 build FAIL: hermetyczny Turbopack odrzucił node_modules symlink poza root; frozen install bezpośrednio w runtime rozwiązał konfigurację, bez zmiany produktu.

R3: production buildPASS, integracja **64/64 PASS**, browser **56PASS/1FAIL**. Test stale wysyłał równoległy fakt przed zakończeniem preview i nie gwarantował konfliktu; QA dodaje await gotowego podglądu przed faktem. Ten FAIL pozostaje historyczny. Produkt/db/tests117/117 SHA256 zgodne z zamrożonym źródłem; manifest i logi `/private/tmp/jobs-crm-history-qa-evidence/full-r3-manifest.json`, `full-r3.log`, `evidence-r3.json`, screenshoty/error-context `r3-browser/`. Root obejrzał375px preview: czytelne before/after, jawny skutek Zapisane/bez etapu i checkbox. Osobny pomiar focus375 potwierdził skip-link poza viewportem (top-80,bottom-36,focused=false) i scrollWidth=innerWidth375; pełnostronicowy screenshot nie był dowodem przesłonięcia kontrolki.

## Niezależne review — pierwszy kandydat

Wszystkie przez `python3 harness/scripts/review.py codex <role> --timeout 900`, osobny rodzic read-only, dokładnie jeden generic subagent + canonical role. Każdy wrapper exit0, changedFiles[], fingerprintBefore=After `70a664410639e0f516f9a8bf3c9b335d29cd0024c36caae081c07439e94a45f8`. Autorzy odrębni od reviewerów. Raporty i execution receipts: `/private/tmp/jobs-crm-history-review/`. Żaden reviewer nie wykonywał testów.

| Rola / sesja | Wynik i dalsza praca |
|---|---|
| Backend / 01a191f5-5784-7802-bc76-862fb133fdfb | FAIL1P2: stary stage-change po void zaproszenia dostaje invalid przed stale. Autor przeniósł kontrolę wersji przed status; QA dodaje regresję i wyścig. Luki dowodów upgrade/new command i rollback po AFTER trigger uzupełniane. |
| Frontend / 01a191f5-5768-78c1-967c-8ad178686870 | FAIL2P2: niewidoczny aktywny edytor po paginacji; niedostarczony POST+reload traci payload i blokuje recovery. Autor poprawia paginację i zachowuje zamrożony owner-bound zamiar w sessionStorage do identycznego retry. QA dodaje oba przypadki. |
| Security / 01a191f5-5770-7690-9a6b-f9a6d08a9a6e | PASS statyczny bez findings; luka jawnego testu sztucznie zagnieżdżonego triggera przekazana QA. Finalny runtime i review poprawionego zakresu wymagane osobno. |

Nie zamykamy findings pierwszego kandydata na podstawie samego opisu poprawki; wymagane ponowienie review i dowody QA.

## Druhý kandidát fe6f07d — runtime a re-review

Root full gates: **256app unit +87script PASS**, typecheck/lint/format PASS (`*-r4.log`). QA r4 natural exit0: buildPASS, **66/66 integracyjnych +59/59 HTTPS Chromium PASS**, bez fail/skip. Produkt/db/test117/117 SHA256 porównano także przez git show z `fe6f07d4718faae9f3b6cb9b2a7dd5cbb56d1f70`. Dowody `/private/tmp/jobs-crm-history-qa-evidence/{full-r4.log,evidence-r4.json,full-r4-manifest.json,full-r4-candidate-proof.json,r4-browser/}`. Własny target posprzątany guardem;44/44 wcześniejszych kontenerów zachowane, brak pozostałych własnych kontenerów. Root obejrzał375/1440 focused-preview PNG; checkbox jest widoczny, Tab dochodzi w1kroku, kontrolka nie przecina skip-linka, innerWidth=scrollWidth; dowód `focused-preview-proof-r4.json`.

Re-review osobnych read-only rodziców: backend sesja01a191fb-90cf-7ae0-96b7-bf3c54a55276 **PASS**, poprzedniP2 CLOSED i nowe testy zamykają wskazane luki kodu testów; security01a191fb-90cf-72b1-9b13-3873f6e8e88f **PASS** bez findings; frontend01a191fb-90cf-7282-bfe7-f80a0ef8012c **FAIL1nowyP2**, oba wcześniejszeP2 CLOSED. Nowy finding: stara odpowiedź po await JSONbody i remount mogła usunąć nowszy pending zamiar. Wszystkie wrappery exit0/changedFiles[], fingerprintBefore=After `21faed05f12e25e8abc448f2703a3b5a1a2377d64bc54016a47bd6e66862f467`. Dowody `/private/tmp/jobs-crm-history-review-r2/`. Review statyczne, nie wykonanie testów; pozytywne wyniki runtime pochodzą od QA.

Autor dodał lifetime epoch guards po fetch i JSON oraz w catch/finally/focus dla wszystkich async ścieżek, identity-matched cleanup storage (owner/case/event/request), brak dispatch globalnego potwierdzenia po wygaśnięciu lub niezgodności. QA dodaje deterministyczny test: rzeczywistyGETA, opóźnione wyłącznie JSONbody, Next Link remount historii, recoveryA, niedostarczonyB, późnyAbody → B nadal zachowany → reload i identyczny retryB dokładnie raz. Nie fabrykuje się odpowiedzi biznesowej ani Auth. Nowy unit helpera obejmuje zachowanie nowszego zamiaru. R5 runtime i ostatnie frontend/security re-review wymagane osobno przed końcowym PASS.

## Finalny wynik — kod 9afd750

Finalny kandydat produktu i testów: `9afd75048f78fcc1508b6ee15404c2412e9834b9`. Późniejszy commit raportów nie zmienia src/db/tests. **Brak otwartych findings.** Zmienione obszary: nowa migracja0009 i schema/metadata, prywatny efektywny widok i append-only audyt, moduł korekt/BFF history-commands, istniejący detal/edytor/historia, unit/integracja/E2E/upgrade, rejestracja suite i test prefiksów migracji oraz wskazana wyżej dokumentacja. Migracje0000–0008 nie zmieniły się.

| Kontrola | Wynik / dowód |
|---|---|
| Full unit | **PASS257 aplikacyjnych +87 skryptowych**, `pnpm test:unit`, `/private/tmp/jobs-crm-history-test-unit-r5.log` |
| Typecheck / lint / format | **PASS**, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; logi `*-r5.log` i `format-check-r5-final.log` |
| Boundaries / canary | **PASS** lokalnie w opisanym wcześniejszym snapshotcie; finalny hosted CI osobno. |
| Production build i realna integracja | **PASS**, runtime r5 naturalexit0, **66/66**; rollback po AFTER, upgrade/nowe komendy starych danych, realne Auth/Data API/RLS A/B/anon i wyścigi. |
| Pełny HTTPS Chromium | **PASS60/60**,0fail/skip, także delayedJSON/remount i niedostarczony POST/reload/same-intent retry, stale, paginacja, audyt/void i stare regresje. |
| Tożsamość runtime | **PASS117/117** src/db/tests SHA256 także przeciw gitshow9afd750; finalne formatowanie nowego testu (tylko whitespace) skopiowano przed kolekcją testów przez worker, odnotowane w manifeście. Cztery jawne adaptery portów pozostają wyłącznie runtime. |
| Cleanup i zachowanie innych zasobów | **PASS** guarded cleanup własnego targetu;44/44preexisting kontenery zachowane,0własnych pozostało. Źródłowe2pliki analizy bez zmian SHA256. |

Końcowe dowody: `/private/tmp/jobs-crm-history-qa-evidence/{full-r5.log,evidence-r5.json,full-r5-manifest.json,full-r5-candidate-proof.json,r5-browser/}`; [QA](history-corrections-integrity-qa.md). Root obejrzał focused375/1440 obrazy z poprzedniego pełnego przebiegu tego samego layoutu; nowy patch wyłącznie async lifetime/cleanup + regresja, bez zmiany wyglądu.

Finalne niezależne frontend review sesja01a19202-5928-72b1-9474-369707f95817 **PASS**, wszystkie3P2 CLOSED; security sesja01a19202-5928-7971-9d08-ba2b56f1d170 **PASS**. Kod9afd750, osobni read-only rodzice/generic role subagents, każdy exit0/changedFiles[], fingerprintBefore=After `253e887b39bab3fe05ed95b9dc369ce6b3b53311ffab852667ba10063d5d2b87`; dowody `/private/tmp/jobs-crm-history-review-r3/`. Backend **PASS** na fe6f07d pozostaje aktualny: po nim brak zmian backendu/migracji; P2 CLOSED, dowody drugiego review powyżej. Reviewerzy nie uruchamiali testów; zakresy statyczne i runtime QA są rozdzielone.

**Ograniczenia / NOT RUN:** fizyczne urządzenia i technologie asystujące, pełny audyt WCAG, live OAuth, syntetyczna próba obejścia przez sztucznie zagnieżdżony trigger (brak potwierdzonej dostępnej użytkownikowi ścieżki w static security review), publiczny release. Realne równoległe requesty nie dowodzą wszystkich możliwych przeplotów. Recovery przechowuje zamrożony payload w owner/case-bound sessionStorage do bezpiecznego identycznego retry; dane nie są sekretami ani nowymi polami produktu, nie trafiają do repo/logów. Starszy/nieprawidłowy bound marker bez poprawnego payloadu dopuszcza wyłącznie odczyt recovery, bez ryzykownego nowego zamiaru.

Pozostałe OPEN i odłożony zakres według DEC-056/analizy: pełny lifecycle/niezależny PATCH, retencja i fizyczna kasacja/restore, inne rodzaje historii/notatki, kalendarz/globalne etapy, import/Search i publiczne Auth/privacy/OPS. **Bez merge i deploymentu**, bez mutacji persistent DEV. Zgoda PO obejmuje publikację osobnego PR; hosted CI pozostaje odrębnym wynikiem exact HEAD, raportowanym w opisie PR po zakończeniu.
