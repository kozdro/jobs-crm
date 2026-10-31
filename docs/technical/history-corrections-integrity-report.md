# History Corrections & Integrity — raport wykonania

Data 2026-10-31. W TOKU — nie jest to końcowy wynik akceptacji. Podstawa DEC-056, zatwierdzone 1A/2A [kontraktu](history-corrections-integrity-analysis.md). Baza merge PR #16 `8729e9e180d81eea1ef9adbeb0f8330243a6304a`, izolowany worktree `/private/tmp/jobs-crm-history-integrity`, branch `feat/history-corrections-integrity`. Bez merge/deploymentu i mutacji persistent DEV.

Wyniki testów i niezależnego review zostaną uzupełnione po ich rzeczywistym wykonaniu; obecnie NOT RUN.

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
