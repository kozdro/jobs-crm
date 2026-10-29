# Pierwszy RecruitmentCase — raport wykonania

**Stan: lokalny produkt zweryfikowany; końcowy review i hosted CI pozostają bramką DoD.** Autoryzacja PO 2026-10-29, wariant A, [DEC-052](../decisions/product-decisions.md). Baza `cd92648fd4c579cb4be57a962cd88b6e3d537583`, branch `feat/recruitment-case-first-slice`; PR #11 MERGED potwierdzony przez GitHub i ancestry. Bez merge/cloud/produkcji/F4.

[Dokładny model DATA-01](recruitment-case-first-slice.md), [analiza/delegacja](recruitment-case-first-slice-analysis.md), [plan QA](recruitment-case-test-plan.md). Minimalny model APPROVED, OPEN-002/024 PARTIALLY RESOLVED; pozostałe formularze/lifecycle/relacje/retencja/delete nadal OPEN. FR/AC/UC mają PARTIAL COVERAGE; brak pełnego PASS LC/RW/QC/AD.

## Implementacja i odpowiedzialność

Root/orchestrator: kontrakt/raport/Git, prywatne ścieżki proxy i minimalne wejście Dashboard według DEC-018. Spec-analyst: DEC-052/OPEN/traceability i przegląd modelu przed migracjami (MODEL READY). Backend: domain/application/Data API, business command i siedem migracji Drizzle. Frontend/UX: minimalny shell, Quick Capture i list/detail. Platforma: osobny guarded lokalny profil, ledger i obowiązkowy job CI. QA od planowania: real HTTP JWT A/B/anon i Playwright. Sesje autorów: root, spec_first_slice, backend_first_slice, frontend_first_slice, platform_first_slice, qa_first_slice. Model/reasoning dziedziczone, dokładne wartości autorów NOT EXPOSED. Reviewerzy są odrębnymi read-only sesjami, ich wyniki poniżej nie są zastępowane samooceną autora.

Jedna `public.recruitment_case`, source_url opcjonalne; siedem migracji `0000_recruitment_validation`, `0001_recruitment_case`, `0002_recruitment_access_and_create`, `0003_recruitment_intent_before_warning`, `0004_recruitment_url_canonical_boundary`, `0005_recruitment_url_constraint_revalidation`, `0006_recruitment_numeric_host_parity`. Drizzle jest jedyną historią produktu, ledger `recruitment_migrations`; pięć F2 migration oraz profile/raporty F1/F2/F3 niezmienione. RLS owner SELECT/INSERT, INSERT column grants chronią owner/status/ID/datę, brak UPDATE/DELETE, FK NO ACTION do auth.users. RPC INVOKER i explicit EXECUTE, owner-key UNIQUE oraz atomic replay/409, bez fikcyjnej historii.

Strony `/dashboard`, `/recruitments`, `/recruitments/[id]`; POST `/recruitments/commands` wnosi walidację, tożsamość/CSRF i logikę domenową. Prywatne odpowiedzi no-store, per-request user JWT, bez service-role w produkcie. Primary password login przechodzi na minimalny Dashboard zgodnie z DEC-018; F3 login helper weryfikuje ten ekran, a następnie zachowuje wcześniejsze asercje konta/bezpieczeństwa. PKCE callback/recovery bez zmiany kontraktu.

## Weryfikacja — dotychczas wykonana

Node24.22.2/pnpm12.16.1, macOS arm64 i lokalny Linux Docker. Bez nowych zależności/pinów i bez cloud credentials. Context7 resolve→query: Supabase functions/RLS, Drizzle migracje/ledger, Base UI1.9 Dialog/focus, Next request/cache. Changelog Supabase odczytany 2026-10-29: PG17.11 bez użycia dotkniętych rozszerzeń, CBC sunset dotyczy hostingu, self-hosted nie dotyczy.

| Kontrola | Komenda / zakres | Wynik |
| --- | --- | --- |
| Frozen install | pnpm install --frozen-lockfile --offline | PASS |
| Unit aplikacji | pnpm test:unit | PASS 148/148 Vitest |
| Unit narzędzi | ta sama komenda | PASS 59/59 node:test |
| Typy | pnpm typecheck | PASS |
| Lint | pnpm lint | PASS |
| Format | pnpm format:check | PASS |
| Harness | sync.py --check, check.py | PASS |
| Harness regresje | python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v, isolated source snapshot | PASS 20/20, 6.674s; nie są to testy aplikacji |
| F2 | pnpm test:integration:f2 / własne profile5642x | PASS85/85 TAP, 207.255s; wszystkie owned targets usunięte guardem |
| Produkt build/HTTP | RECRUITMENT_TARGET_ID=ace-parity-a pnpm test:recruitment R9 | PASS build i25/25HTTP |
| Produkt browser | ten sam R9, desktop/mobile375px, HTTPS3153 | PASS19/19, zero skips/failures |
| F1 boundaries/canary | pnpm test:boundaries; pnpm test:canary | PASS7kontroli +3kontrole |
| F1 build/browser | pnpm build; pnpm test:e2e:foundation | PASS build i3/3browser |
| F3 pełna regresja Auth/HTTPS | pnpm test:auth:f3 | PASS build, SDK13/13 i browser10/10, artifact/log scans oraz owned cleanup |
| Niezależny backend/frontend/security review | harness/scripts/review.py, frozen candidate | NOT RUN |
| Hosted CI final SHA | Application CI / Foundation required | NOT RUN |

## Zachowane nieudane próby i targety

Pierwszy bootstrap `preflight-a` FAIL przed kontenerami/migracjami: Supabase CLI skraca project ID do40 znaków; guard odmówił niezgodnego volume create. Naming poprawiony na deterministycznie związany z id hash+random, limit40 objęty unit. Failed receipt zachowany; tylko własna pusta sieć usunięta przez guard, idempotentny cleanup PASS. Bez rozszerzenia Docker uprawnień.

Świeży `preflight-b` bootstrap PASS: projekt `jobs-crm-recruitment-dfe0d8-9eedf9ae475f`, Authv2.197.0/PostgREST16.5/PG17.11, pięć przypiętych kontenerów z identity/image preflight. public0tables/0functions, anon/authenticated CREATE=false, brak foundation_poc i produktu/ledgeru przed migracją. To osobny target od F2 i cudzych baz Bluvv/Medusa. Wyniki migracji/runtime zostaną dopisane po wykonaniu.

Dwie przerwane próby uruchomienia unittest harnessu w pełnym checkout kopiowały node_modules/.next w istniejącym setUp; nie są PASS. Wykonano następnie kompletny test na izolowanym snapshot źródeł bez ignorowanego runtime, z jawnym PASS20/20. Harness nie został osłabiony ani zmieniony.

## Pierwszy runtime i korekty

QA integration R1: FAIL timeout (5PASS/3CANCELLED), przyczyną zagnieżdżone sibling t.test; przeniesiono testy do prawidłowej kolejności bez zwiększania timeoutu lub zmian DB. Następny pełny HTTP run20/20PASS, a runner produkcyjny powtórzył20/20PASS. Dowody awarii i poprawnych prób pozostają oddzielne.

Produkcja R1: buildPASS, HTTP20/20PASS, browser11PASS/1FAIL — mobilna kontrola wymagała semantycznego aria-modal na rzeczywiście modalnym dialogu Base UI. Autor dodał atrybut do obu Popup, test pozostał wymagany. R1 nie jest pełnym PASS. Pełna nowa próba R2 przeszła build, HTTP20/20 i browser12/12, z log/artifact scans. [Zachowany R1](evidence/recruitment-first-slice/r1-failed-browser-run.json), [QA R1](evidence/recruitment-first-slice/r1-failed-qa-integration.json).

## Niezależny review i naprawa wyścigu

Statyczny backend review kandydata `f1dbf9692b0245358dcbc471670be68f20e01c72` potwierdził P2: direct INSERT z tym samym owner/key może zatwierdzić dane między pierwszym sprawdzeniem idempotencji a zapytaniem o duplikaty. Zamiast replay lub409 RPC zwracało wtedy warning. Dodano forward migration0003: nowy odczyt klucza i pełne porównanie payloadu przed warning; migracje0000–0002 niezmienione. [Deterministyczny test z barierą i negatywną kontrolą](evidence/recruitment-first-slice/qa-r3-direct-insert-race.json) przeszedł na disposable targetcie: pełne HTTP22/22PASS. Stara funkcja0002 została wykryta przez ten sam oracle w obu harmonogramach, potem odtworzono i sprawdzono dokładne funkcję/politykę/ACL/INVOKER oraz ledger, bez pozostawienia helpera. Pełny produkcyjny R3 także PASS: cztery migracje, build, HTTP22/22 i browser12/12 oraz skany artefaktów/logów.

Pierwsze wrappery review przerwano: jednoczesny F3 zmieniał ignorowane artefakty runtime, które wrapper także fingerprintuje. Nie są to końcowe PASS review. Aby zapewnić niezmienność całego ocenianego drzewa, końcowe niezależne sesje odbędą się przez niezmieniony wrapper w osobnym źródłowym worktree dokładnego commitu, bez buildów/runtime w tym worktree. Static finding zachowano i naprawiamy; przerwane sesje nie zastępują pełnego review.

Historyczny R2 (trzy migracje) ma [osobny wynik](evidence/recruitment-first-slice/product-r2-pass.json) i [własny manifest](evidence/recruitment-first-slice/source-manifest-r2.json). Historyczny R3 ma [własny manifest](evidence/recruitment-first-slice/source-manifest-r3.json). [Historyczny R5 manifest](evidence/recruitment-first-slice/source-manifest-r5.json) odpowiada sześciu migracjom; końcowy manifest obejmuje siedem migracji, numeric-host parity i korekty UX; nie przypisujemy go wstecz do R2/R3.

## Drugi pełny review — wyniki i zależne korekty

[Read-only R2](evidence/recruitment-first-slice/reviews-r2.json), kandydat3e0301a: backend FAIL P2 URL parity (raw path /a/../b w DB vs /b w BFF); frontend FAIL2P2 (zamknięcie nierozstrzygniętego zamiaru i potwierdzenie save-next pod modalem) oraz3P3 (wybór zwykłego Save po warning, koherentny reset/recovery bfcache, semantyka kroków/hints); security PASS bez findings. Wszystkie wrappery COMPLETED/exit0/changedFiles=[]/before=after. Są to wyniki statyczne, nie testy. Korekty backendu i UX wykonane; [produkcyjny R5](evidence/recruitment-first-slice/product-r5-pass.json) ma buildPASS, HTTP24/24 i UI17/17. Forward0004 odmawia niekanonicznych komponentów URL, przyjmuje URL.href, zachowuje identyfikatory query/hash;0005 ponownie waliduje CHECK istniejących wierszy bez datarewrite. [31wektorów URL i negative control](evidence/recruitment-first-slice/qa-url-parity-pass.json) przeszły. UX usuwa pułapkę unknown-result dzięki świadomemu potwierdzeniu porzucenia zamiaru, obsługuje401/403 przez login, potwierdza save-next w Popup, rozdziela plain Save/retry/dupconfirm i resetuje pagehide/recovery oraz semantykę kroków/hints. Nowe E2E potwierdziły te ścieżki. Końcowy review wymagany na nowym kandydacie.

## Potwierdzone zachowanie produktu

[Pełny R9](evidence/recruitment-first-slice/product-r9-pass.json), [manifest źródeł](evidence/recruitment-first-slice/source-manifest.json), [runtime](evidence/recruitment-first-slice/runtime-preflight.json). Realne HTTP potwierdziło własny create/read A/B, deny anon, brak cross-owner list/ID/count/duplicates, owner/status/id/time spoof denial, minimalne grants i INVOKER, native DB constraints, same-key replay/409/concurrency oraz direct-INSERT race. Negative sensitivity na disposable targetcie wykryła wyłączenie RLS w obu kierunkach, po czym RLS przywrócono i ponownie potwierdzono izolację.

Playwright19/19: login F3→Dashboard, cztery kroki/no premature writes, Unicode/walidacja, duplicate cancel/continue i save-next, toast/open/stay, dirty Escape/X/backdrop/focus, failed-response retry+doubleclick, owner list/detail/404 i logout/cache, mobile375px/overflow/semantics, recovery po refresh przy utracie udanej odpowiedzi, pending payload/key freeze i paginacja25/27 ze stabilnym UUID przy wspólnym created_at. Testy źródłowego URL nie wykonały fetch; UI renderuje wyłącznie tekst i świadome safe links.

Dodatkowe nowe E2E: unknown request nigdy nie dotarł do DB→reload→świadome porzucenie bez deklaracji rollbacku,401/403→login/ukrycie portalu, widoczny i dostępny status save-next w mobile Popup, ordinary Save po dupwarn+edit zamyka kreator, Escape w nested AlertDialog zachowuje szkic. R4 miał16PASS/1FAIL z powodu niejednoznacznego selektora alertu obejmującego Next route announcer; zakres selektora poprawiono na main, bez zmiany wymaganego komunikatu. [R4 FAIL](evidence/recruitment-first-slice/product-r4-failed-browser.json) i R5PASS pozostają osobne.

Regeneracja lokalnych typów ujawniła zduplikowane wygenerowane pliki .next/types/routes.d 2.ts. Zachowano cały ignorowany output w .harness-runs, wygenerowano typy od nowa i typecheckPASS; nie zmieniano źródeł/tsconfig w celu pominięcia błędu.

## R3 i końcowe doprecyzowania

[Statyczny R3](evidence/recruitment-first-slice/reviews-r3.json): frontend zamknął wszystkie R2findings, z nowymi3P3; security PASS z P3 bare0x. Backend zgłosił P2 ACE, ale [pinned Node24.22.2 i Chromium156](evidence/recruitment-first-slice/ace-runtime-counterevidence.json) zgodnie przyjmują xn--a i inne przywołane ACE. Przesłanka rozjazdu parserów nie odtworzyła się; nie dodano nowej polityki IDNA. Niezależne końcowe rozstrzygnięcie review pozostaje bramką. Rzeczywisty bare0x rozjazd naprawia0006 i rewalidacja CHECK, bez zmian0000–0005. QA ma49dodatnich wektorów URL i12faktycznie odrzucanych hostów, pełne HTTP25/25PASS.

Frontend P3: link listy zamyka oba modale, zachowując owner-scoped pendingkey; komunikaty live są trwale zamontowane, a nagłówek opisany sukcesem; CaptureSession ma key=owner i generationcleanup, aby spóźniona odpowiedź starego ownera nie odtworzyła szkicu; oficjalny AuthSessionMissingError400 jest klasyfikowany jako re-login. Natywne czytniki ekranowe (NVDA/JAWS/VoiceOver) i fizyczne urządzenia pozostają NOT RUN — testy sprawdzają semantykę/fokus i Chromiumviewport.

Dwie nowe E2E sprawdzają page-level porzucenie/re-entry i link listy oraz ukrycie portalu przy SDK401/403 przed zakończeniem loginu. Ostatni test wymagał pasywnego MutationObserver/binding: locator i evaluate blokowały się przy celowo wstrzymanej nawigacji (R6/R7/R8:18PASS/1FAIL). [Focused proof](evidence/recruitment-first-slice/focused-recovery-sdk-pass.json) 1/1PASS obejmuje obastatusy, z bramką zwolnioną dopiero po obserwacji DOM/prywatności/klucza. [Pełny R9](evidence/recruitment-first-slice/product-r9-pass.json) potwierdził build, HTTP25/25 i UI19/19. Focused result i wcześniejsze R6/R7/R8FAIL nie zastępują tego pełnego przebiegu.

[Końcowy HTTP](evidence/recruitment-first-slice/qa-ace-numeric-parity-pass.json) obejmuje49dodatnich wektorów i12rzeczywiście odrzucanych hostów. Siedem migracji i zwalidowany CHECK potwierdzono w realnym katalogu. UI19/19 obejmuje pasywną obserwację starego dokumentu: MutationObserver/binding wysyła stan DOM do Node przed zakończeniem nawigacji; wstrzymanie loginu jest zwalniane dopiero po asercjach ukrycia portalu i owner-key. Nie generuje się sztucznych events ani nie osłabia timeoutu.

## Cleanup i izolacja

[Cleanup produktu](evidence/recruitment-first-slice/cleanup-pass.json) PASS, także powtórzenie. Tylko własne kontenery/sieci/wolumeny usunięte; manifesty i receipts pozostają lokalnym dowodem. F2 i F3 własne targety także sprzątnięte. Inwentarz pięciu zastanych kontenerów Bluvv/Medusa pozostał bez zmian. Nie wykonano resetu bazy ani provisioning/deploy/merge.

## Rekomendacja kolejnego małego slice

PROPOSED: świadoma edycja nazwy/opisu/URL istniejącej własnej sprawy, po osobnej autoryzacji i doprecyzowaniu zakresu audytu/korekt z OPEN-004. Nie rozpoczynamy tego etapu w bieżącym zadaniu.

## Otwarte granice

Pełne UC/TC-001/029/034 i FR-LC/RW/QC/AD nie są ukończone. Brak lifecycle, edycji, historii, firmy/kontaktów, Kanbana/drawera, importu, fetch URL, workera, dokumentów i publicznego wydania. OPEN-001/004/005/018/020/029/034 i pozostałe części OPEN-002/024/025/026/028 oraz polityki OPEN-013/032/041–046 zachowują swoje bramki. Wymagane końcowe testy/review/CI muszą zostać wykonane przed uznaniem DoD za spełnione.
