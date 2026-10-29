# Pierwszy RecruitmentCase — raport wykonania

**Stan: IN PROGRESS / nie zamyka DoD.** Autoryzacja PO 2026-10-29, wariant A, [DEC-052](../decisions/product-decisions.md). Baza `cd92648fd4c579cb4be57a962cd88b6e3d537583`, branch `feat/recruitment-case-first-slice`; PR #11 MERGED potwierdzony przez GitHub i ancestry. Bez merge/cloud/produkcji/F4.

[Dokładny model DATA-01](recruitment-case-first-slice.md), [analiza/delegacja](recruitment-case-first-slice-analysis.md), [plan QA](recruitment-case-test-plan.md). Minimalny model APPROVED, OPEN-002/024 PARTIALLY RESOLVED; pozostałe formularze/lifecycle/relacje/retencja/delete nadal OPEN. FR/AC/UC mają PARTIAL COVERAGE; brak pełnego PASS LC/RW/QC/AD.

## Implementacja i odpowiedzialność

Root/orchestrator: kontrakt/raport/Git, prywatne ścieżki proxy i minimalne wejście Dashboard według DEC-018. Spec-analyst: DEC-052/OPEN/traceability i przegląd modelu przed migracjami (MODEL READY). Backend: domain/application/Data API, business command i trzy migracje Drizzle. Frontend/UX: minimalny shell, Quick Capture i list/detail. Platforma: osobny guarded lokalny profil, ledger i obowiązkowy job CI. QA od planowania: real HTTP JWT A/B/anon i Playwright. Sesje autorów: root, spec_first_slice, backend_first_slice, frontend_first_slice, platform_first_slice, qa_first_slice. Model/reasoning dziedziczone, dokładne wartości autorów NOT EXPOSED. Reviewerzy są odrębnymi read-only sesjami, ich wyniki poniżej nie są zastępowane samooceną autora.

Jedna `public.recruitment_case`, source_url opcjonalne; trzy migracje `0000_recruitment_validation`, `0001_recruitment_case`, `0002_recruitment_access_and_create`. Drizzle jest jedyną historią produktu, ledger `recruitment_migrations`; pięć F2 migration oraz profile/raporty F1/F2/F3 niezmienione. RLS owner SELECT/INSERT, INSERT column grants chronią owner/status/ID/datę, brak UPDATE/DELETE, FK NO ACTION do auth.users. RPC INVOKER i explicit EXECUTE, owner-key UNIQUE oraz atomic replay/409, bez fikcyjnej historii.

Strony `/dashboard`, `/recruitments`, `/recruitments/[id]`; POST `/recruitments/commands` wnosi walidację, tożsamość/CSRF i logikę domenową. Prywatne odpowiedzi no-store, per-request user JWT, bez service-role w produkcie. Primary password login przechodzi na minimalny Dashboard zgodnie z DEC-018; F3 login helper weryfikuje ten ekran, a następnie zachowuje wcześniejsze asercje konta/bezpieczeństwa. PKCE callback/recovery bez zmiany kontraktu.

## Weryfikacja — dotychczas wykonana

Node24.22.2/pnpm12.16.1, macOS arm64 i lokalny Linux Docker. Bez nowych zależności/pinów i bez cloud credentials. Context7 resolve→query: Supabase functions/RLS, Drizzle migracje/ledger, Base UI1.9 Dialog/focus, Next request/cache. Changelog Supabase odczytany 2026-10-29: PG17.11 bez użycia dotkniętych rozszerzeń, CBC sunset dotyczy hostingu, self-hosted nie dotyczy.

| Kontrola | Komenda / zakres | Wynik |
| --- | --- | --- |
| Frozen install | pnpm install --frozen-lockfile --offline | PASS |
| Unit aplikacji | pnpm test:unit | PASS 114/114 Vitest |
| Unit narzędzi | ta sama komenda | PASS 59/59 node:test |
| Typy | pnpm typecheck | PASS |
| Lint | pnpm lint | PASS |
| Format | pnpm format:check | PASS |
| Harness | sync.py --check, check.py | PASS |
| Harness regresje | python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v, isolated source snapshot | PASS 20/20, 6.674s; nie są to testy aplikacji |
| F2 | pnpm test:integration:f2 / własne profile5642x | PASS85/85 TAP, 207.255s; wszystkie owned targets usunięte guardem |
| Produkt build/HTTP | RECRUITMENT_TARGET_ID=preflight-b pnpm test:recruitment R2 | PASS build i20/20HTTP |
| Produkt browser | ten sam R2, desktop/mobile375px, HTTPS3153 | PASS12/12, zero skips/failures |
| F1 boundaries/canary | pnpm test:boundaries; pnpm test:canary | PASS7kontroli +3kontrole |
| F1 browser | pnpm test:e2e:foundation | NOT RUN |
| F3 pełna regresja Auth/HTTPS | pnpm test:auth:f3 | IN PROGRESS |
| Niezależny backend/frontend/security review | harness/scripts/review.py, frozen candidate | NOT RUN |
| Hosted CI final SHA | Application CI / Foundation required | NOT RUN |

## Zachowane nieudane próby i targety

Pierwszy bootstrap `preflight-a` FAIL przed kontenerami/migracjami: Supabase CLI skraca project ID do40 znaków; guard odmówił niezgodnego volume create. Naming poprawiony na deterministycznie związany z id hash+random, limit40 objęty unit. Failed receipt zachowany; tylko własna pusta sieć usunięta przez guard, idempotentny cleanup PASS. Bez rozszerzenia Docker uprawnień.

Świeży `preflight-b` bootstrap PASS: projekt `jobs-crm-recruitment-dfe0d8-9eedf9ae475f`, Authv2.197.0/PostgREST16.5/PG17.11, pięć przypiętych kontenerów z identity/image preflight. public0tables/0functions, anon/authenticated CREATE=false, brak foundation_poc i produktu/ledgeru przed migracją. To osobny target od F2 i cudzych baz Bluvv/Medusa. Wyniki migracji/runtime zostaną dopisane po wykonaniu.

Dwie przerwane próby uruchomienia unittest harnessu w pełnym checkout kopiowały node_modules/.next w istniejącym setUp; nie są PASS. Wykonano następnie kompletny test na izolowanym snapshot źródeł bez ignorowanego runtime, z jawnym PASS20/20. Harness nie został osłabiony ani zmieniony.

## Pierwszy runtime i korekty

QA integration R1: FAIL timeout (5PASS/3CANCELLED), przyczyną zagnieżdżone sibling t.test; przeniesiono testy do prawidłowej kolejności bez zwiększania timeoutu lub zmian DB. Następny pełny HTTP run20/20PASS, a runner produkcyjny powtórzył20/20PASS. Dowody awarii i poprawnych prób pozostają oddzielne.

Produkcja R1: buildPASS, HTTP20/20PASS, browser11PASS/1FAIL — mobilna kontrola wymagała semantycznego aria-modal na rzeczywiście modalnym dialogu Base UI. Autor dodał atrybut do obu Popup, test pozostał wymagany. R1 nie jest pełnym PASS. Pełna nowa próba R2 przeszła build, HTTP20/20 i browser12/12, z log/artifact scans. [Zachowany R1](evidence/recruitment-first-slice/r1-failed-browser-run.json), [QA R1](evidence/recruitment-first-slice/r1-failed-qa-integration.json).

## Potwierdzone zachowanie produktu

[Pełny R2](evidence/recruitment-first-slice/product-r2-pass.json), [manifest źródeł](evidence/recruitment-first-slice/source-manifest.json), [runtime](evidence/recruitment-first-slice/runtime-preflight.json). Realne HTTP potwierdziło własny create/read A/B, deny anon, brak cross-owner list/ID/count/duplicates, owner/status/id/time spoof denial, minimalne grants i INVOKER, native DB constraints, same-key replay/409/concurrency oraz direct-INSERT race. Negative sensitivity na disposable targetcie wykryła wyłączenie RLS w obu kierunkach, po czym RLS przywrócono i ponownie potwierdzono izolację.

Playwright12/12: login F3→Dashboard, cztery kroki/no premature writes, Unicode/walidacja, duplicate cancel/continue i save-next, toast/open/stay, dirty Escape/X/backdrop/focus, failed-response retry+doubleclick, owner list/detail/404 i logout/cache, mobile375px/overflow/semantics, recovery po refresh przy utracie udanej odpowiedzi, pending payload/key freeze i paginacja25/27 ze stabilnym UUID przy wspólnym created_at. Testy źródłowego URL nie wykonały fetch; UI renderuje wyłącznie tekst i świadome safe links.

## Otwarte granice

Pełne UC/TC-001/029/034 i FR-LC/RW/QC/AD nie są ukończone. Brak lifecycle, edycji, historii, firmy/kontaktów, Kanbana/drawera, importu, fetch URL, workera, dokumentów i publicznego wydania. OPEN-001/004/005/018/020/029/034 i pozostałe części OPEN-002/024/025/026/028 oraz polityki OPEN-013/032/041–046 zachowują swoje bramki. Wymagane testy/review/CI poniżej muszą zostać wykonane przed uznaniem DoD za spełnione.
