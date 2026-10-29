# Foundation F2 — Supabase Local, Drizzle i syntetyczne RLS

**Autoryzacja:** zadanie PO „Jobs CRM — PR-F2 Supabase Local, Drizzle & RLS A/B”, 2026-10-29: lokalne zależności/kontenery, syntetyczny PoC, migracje, testy, CI, dokumentacja, niezależny review i commit/push/PR. Bez cloud, kosztów, produkcji, deploymentu i merge. **Stan lokalnego runtime: PASS, 2026-10-29. Backend/security review R1/R2: PASS; poprawki P3 i finalny rerun z naturalnym exit 0: PASS. Ostatni przegląd delty i hosted CI są bramkami publikacji.**

## Podstawa, analiza wpływu i plan

| Źródło / ID                               | Status / zastosowanie                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ADR-0002/0003/0005/0010                   | ACCEPTED: PostgreSQL, Drizzle, Data API z user JWT/RLS, warstwowe QA; pełne RPC z idempotencją pozostaje F4 |
| ADR-0011                                  | ACCEPTED; istniejący frontend Tailwind v4 / shadcn Base UI / Lucide pozostaje kontraktem F1                 |
| FR-AD-002, AC-AD-002, BR-030; DEC-039/041 | Zatwierdzony niezmiennik prywatności; PoC weryfikuje mechanizm techniczny, nie pełne AC produktu            |
| FQA-10–21, RLS-01–12                      | Kontrakty wykonania z [QA](foundation-qa.md) i [PoC](foundation-pocs.md); wyniki poniżej                    |
| OPEN-002 / OPEN-013                       | OPEN; brak fizycznego modelu CRM i zgody na publiczne konta. Wynik techniczny nie zamyka decyzji            |
| Produktowe UC/TC                          | Nie są implementowane: brak workflow użytkownika, historii, importu, wyszukiwania, dokumentów i sesji BFF   |

Wpływ obejmuje wyłącznie środowisko lokalne, syntetyczne dane, integralność relacji, granty/RLS, bezpieczny migrator i wymaganą integrację CI. PoC nie zmienia modelu rekrutacji, funkcji biznesowych ani UX. Ryzyka: pomylenie targetu, publikacja portów, domyślne granty, uprzywilejowany klient w testach, niewykryty dryf SQL, ujawnienie sekretów w diagnostyce i pozorny sukces pustej odpowiedzi.

Plan po analizie i przy udziale QA:

1. Potwierdzić merge F1, czysty checkout, exact toolchain, lokalny Docker, porty, wersje i aktualne dokumenty.
2. Utworzyć własne disposable targety z manifestem i siecią loopback; odmówić nieznanego targetu przed DDL.
3. Wygenerować Drizzle schema/SQL i dołączyć custom SQL RLS w jednej historii; zablokować konkurencję i manipulację zastosowanymi plikami.
4. Wykonać pełne testy migracji, rzeczywiste Auth JWT i Data API A/B/anon; powtórzyć izolację w obu kierunkach i udowodnić czułość na osobnej kopii.
5. Zachować F1/harness; dołączyć obowiązkowy job F2 do `Foundation required`, zamrozić kandydata i wykonać niezależne review przez `harness/scripts/review.py`.
6. Zaktualizować wyniki, opublikować PR i sprawdzić CI na finalnym SHA; bez merge.

Delegacja: native generic subagent + canonical role; model/reasoning dziedziczone, dokładny identyfikator runtime NOT EXPOSED. Orchestrator `/root` posiada dokumentację/Git i integrację. `/root/platform_engineer` posiada zależności, `supabase/`, `scripts/db/`, CI i env/ignore. `/root/backend_engineer` posiada `experiments/foundation/rls/` i dedykowany Drizzle config. `/root/qa_engineer` posiada `tests/integration/{rls,migrations}/`; uczestniczy od planowania, implementuje i wykonuje testy. Reviewerzy backend/security mają odrębne sesje read-only, bez edycji kandydata. DoD: wszystkie wymagane kontrole z dowodami, brak P0/P1, jawne ograniczenia, PR bez merge.

## Środowisko i wersje

Baza Git: `d0c645f48e323cae722720d4262cba2d558e6fd0`, merge [PR #7](https://github.com/kozdro/jobs-crm/pull/7), potwierdzony przed pracą. `main` zsynchronizowane fast-forward; gałąź `feat/foundation-f2-supabase-rls`.

Preflight hosta: macOS 27.0.1 arm64; Docker Desktop 29.9.2, context `desktop-linux`, lokalny Unix socket, 8 CPU / około 8 GB RAM. Zastany Node 24.22.0 zastąpiony w PATH istniejącym izolowanym runtime 24.22.2, pnpm 12.16.1. Port 54321 był zajęty; PoC używa osobnego zakresu 5642x. Istniejące kontenery bluvv/rigby pozostają poza manifestem PoC.

Zainstalowane dokładne piny: Supabase CLI 2.122.0, Drizzle ORM 0.45.4, Kit 0.31.11, driver postgres 3.4.8. Zweryfikowano rzeczywiste CLI `--help`, generowanie i kontrolę migracji. Diagnostyka uruchomionych usług odczytała Auth `v2.197.0` z health endpointu i `PostgREST 16.5` z binarnego `--version`; raport pełnej suite musi dodatkowo zachować wersję PostgreSQL, obrazy i dostępne rozszerzenia z każdego targetu.

Pierwsza próba startu ujawniła nieskuteczność domyślnego bindu sieci Docker Desktop 29.9.2. Sieć miała opcję `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, lecz DB/gateway faktycznie opublikowały `0.0.0.0:56422/56421` i IPv6. Zatrzymano wyłącznie cztery kontenery zweryfikowanego projektu `jobs-crm-f2-primary-ed5d96af91f0`; **żadna migracja PoC nie została wykonana**. To wykonany negatywny wynik konfiguracji sieciowej, nie PASS. Zachowano manifest i zredagowaną inspekcję. Zależne próby wstrzymano do zapewnienia jawnego bindu przed utworzeniem kontenera i niezależnego security review poprawki. Nie uznajemy samego późniejszego sprawdzenia bindingu za wystarczające zabezpieczenie startu.

## Wyniki i granice akceptacji

Pierwsze kontrolowane starty przez guard również zakończyły się przed migracjami PoC: Docker 29 serializuje puste `Devices: []`, a CLI 2.122 uruchamia jednorazowy, nienazwany kontener `gotrue migrate`. Odmowy nie były obchodzone; przyczyny potwierdzono w rzeczywistym żądaniu Docker CLI do atrapowego daemonu oraz w przypiętym kodzie CLI. Dowody: [pierwsza odmowa guarda](evidence/foundation-f2-guarded-start-failure.json), [odmowa bootstrapu Auth](evidence/foundation-f2-guarded-start-r2-failure.json). Każda ma FAIL / 0 wykonanych przypadków integracyjnych. Start może inicjalizować zarządzane schematy Supabase; stwierdzenie „bez migracji” dotyczy wyłącznie schematu PoC.

FQA-10–21 / RLS-01–12 Data API: **PASS**. Pełne wykonanie `pnpm test:integration:f2` zakończyło się exit 0 po 198,405 s: **84/84 przypadki potomne + test nadrzędny = 85/85**, zero fail/cancel/skip. [Niezmieniony raport wykonania](evidence/foundation-f2-final-local-results.json) zawiera środowisko, warunki początkowe, oczekiwanie, rzeczywisty wynik, status, przyczynę niewykonania oraz dowód dla każdego ID i przypadku. Run `2026-10-29T15-51-10-842Z-f6292351`; SHA256 raportu `e11a29cfdbd39ddacac32a1a048139e6818971a91c599960846daf65364d9787`. Wszystkie 29 hashy źródeł porównano z ocenianym kodem: identyczne.

BFF, cookies, OAuth i sesje F3: **NOT RUN**, poza F2. Pełna atomowość RPC i registry idempotencji F4: **NOT RUN**, poza F2. Testy przyszłego schematu Jobs CRM muszą ponowić macierz izolacji po zatwierdzeniu modelu.

Niezależne pełne review R1 backend/security mają **PASS**, bez P0/P1/P2; cztery P3 opisano i poprawiono poniżej. Końcowy rerun po poprawkach ma PASS. Delta review oraz hosted CI pozostają wymagane przed finalnym przekazaniem PR; lokalne testy ich nie zastępują.

## Konfiguracja i komendy lokalne

Wymagane Node 24.22.2 / pnpm 12.16.1, osiągalny lokalny Docker API i wolne porty 56421/56422. Nie instalować ani uruchamiać aplikacji systemowych automatycznie. `pnpm install --frozen-lockfile` odtwarza zależności; aplikacja F1 nadal działa bez uruchomionej bazy.

```sh
pnpm db:f2:start sandbox
pnpm db:f2:preflight sandbox
pnpm db:f2:migrate sandbox
node scripts/db/cli.ts snapshot sandbox
pnpm db:f2:stop sandbox --remove
pnpm test:integration:f2
```

`sandbox` jest przykładową lokalną etykietą. Wrapper tworzy nowy losowy project ID, własną sieć i katalog `.foundation-f2/<id>/`; istniejący katalog odmawia startu. Manifest zawiera identyfikatory kontenerów i obrazów, porty, hash konfiguracji i niesekretny checkpoint integralności ledgeru. Hasła/klucze z lokalnego statusu CLI są odczytywane do pamięci, nie do repozytorium, env aplikacji ani logów.

Uruchamiać **wyłącznie przez wrapper**. Bare `supabase start` nie zapewnia wymaganej granicy sieci. Tymczasowy socket guarda ma prawa 0600, katalog 0700, a `DOCKER_HOST` zmienia się tylko w dziecku CLI. Guard wymusza jawny loopback przed container-create, sprawdza własność projektu/sieci i odmawia nieobsługiwanych mutacji; po starcie preflight ponownie sprawdza żądane i rzeczywiste porty oraz identity. Studio, Storage, Realtime, Analytics, pooler, mail i Edge Runtime są wyłączone. Globalny publiczny signup i anonymous sign-in są wyłączone. Provider e-mail jest włączony wyłącznie dla logowania przygotowanych kont syntetycznych: w CLI 2.122 `auth.email.enable_signup=false` wyłącza także password grant. Rzeczywisty `/signup` odmawia kodem `signup_disabled`, liczba kont się nie zmienia, a admin fixture A/B uzyskuje poprawne JWT.

Bootstrap Data API eksponuje wyłącznie pusty `public`. Rzeczywisty [katalog świeżego targetu](evidence/foundation-f2-empty-public-bootstrap.json) potwierdził brak relacji i funkcji w `public` oraz brak CREATE dla anon/authenticated; diagnostykę wykonano przy wyłączonym gatewayu. PostgREST 16.5 nie buduje schema cache, gdy lista ekspozycji zawiera nieistniejący schemat, nawet jeżeli `public` jest pierwszy. Próba takiej konfiguracji zakończyła się rzeczywistym `503/PGRST002`, a nie PASS.

Migracja Drizzle `0004_synthetic_api_exposure_v1.sql` dopiero po tabelach, RLS, grantach, view i RPC ustawia `pgrst.db_schemas='public,foundation_poc'` dla roli `authenticator` **w tej konkretnej bazie `postgres`** oraz wysyła `reload config` i `reload schema`. Jest to wspierana konfiguracja in-database PostgREST ([dokumentacja](https://github.com/postgrest/postgrest/blob/main/docs/references/configuration.rst)); wymaga uprzywilejowanego migratora i pozostaje wyłącznie lokalnym PoC. Nie zmienia JWT, uprawnień samej roli ani zarządzanych tabel `auth`/`storage`. Preflight/snapshot mają rozróżniać bootstrap env i rzeczywiste ustawienie DB. Runner czeka na odczytową gotowość Data API po migracji; nie powtarza zapisów fixture w ciemno.

Pełna historia ma pięć wpisów. V0 (`through: 2`) ma tabele, RLS i granty, ale pozostaje niewystawione przez API; syntetyczny fixture upgrade przygotowuje oddzielny uprzywilejowany setup, a po v1 zachowanie sprawdza prawdziwy JWT. Testy bezpieczeństwa v1 zawsze korzystają z rzeczywistego Data API. Preflight i QA egzekwują pustkę `public` oraz brak dostępu do prywatnych tabel/view/RPC przez domyślny profil. Wszystkie testowane query PoC używają profilu `foundation_poc`. Nie powstaje alternatywna historia migracji ani DDL poza Drizzle w celu obejścia health check.

`stop` wymaga jawnego `--remove`: usuwa dane syntetycznego disposable targetu, własne kontenery, oznaczone wolumeny, sieć i katalog. Nie jest to polecenie produkcyjne ani wzorzec backupu. Stop po wcześniejszej walidacji używa przypiętego CLI i dokładnego project ID; transport guarda dotyczy startu. `scripts/db/cleanup.ts` jest fallbackiem CI dla manifest-bearing targetów i pomija katalogi bez manifestu (w tym dowody). Lokalnie usuwać jawnie wskazany target; nie uruchamiać zbiorczego cleanupu przed zachowaniem dowodu błędu.

Checkpoint manifestu nie jest drugim ledgerem migracji. Jedyną historią SQL pozostaje `foundation_migrations.__drizzle_migrations`; checkpoint wykrywa także usunięcie końcowego wiersza. Awaria po commicie DB, przed atomowym zapisem checkpointu, kończy się odmową następnego migrate. Dla tego syntetycznego środowiska: zachować manifest/błąd/snapshot, zweryfikować własność, jawnie usunąć dokładny disposable target i utworzyć świeży. Nie naprawiać automatycznie ledgeru i nie resetować nieznanego targetu.

## Zależności i bezpieczeństwo narzędzi

Drizzle i driver są narzędziami eksperymentu, bez importów w `src/`. Jeden `pnpm-lock.yaml`, strict peers/engines i brak automatycznych major upgrades. Skrypty fallback-download dla esbuild są jawnie wyłączone; używane są przypięte optional binaries. Rzeczywiste `generate`, `check`, typecheck i mocki transportu weryfikują działanie tego toru.

Audit produkcyjny: zero advisories. Pełny audit wykazał MODERATE `esbuild@0.18.20` przez legacy loader Drizzle Kit ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)) i istniejące LOW `deepmerge@4.3.1` przez shadcn ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)). Podatność esbuild dotyczy dev servera; ten PoC go nie uruchamia. Ocena akceptowalności tego ograniczonego użycia jest częścią finalnego niezależnego security review; sam exit code instalacji nie rozstrzyga ryzyka.

## Wdrożony model i migracje

`foundation_poc.probe_item`, `probe_label`, `probe_link` to wyłącznie syntetyczne obiekty techniczne. Każdy ma `owner_id UUID`, losowy `id UUID` i sztuczny `marker`. Item ma techniczny `revision`; link zawiera `item_id` i `label_id`. Composite PK `(owner_id,id)` i oba owner-qualified FK wiążą końce relacji tego samego właściciela. Dodatkowe UNIQUE, CHECK i indeksy wspierają integralność. Schemat ma trzy base tables, 12 polityk CRUD, jeden invoker view i jedno invoker RPC `probe_set_marker(uuid,text)`. Brak encji, statusów, historii, słowników i modelu RecruitmentCase.

RLS korzysta z `(SELECT auth.uid())`, z `USING` i `WITH CHECK` dla UPDATE oraz sprawdzeniem obu końców linku. Metadane użytkownika nie autoryzują. Authenticated otrzymuje tylko CRUD tabel, SELECT widoku i EXECUTE minimalnego RPC. PUBLIC/anon nie otrzymują dostępu do prywatnych obiektów. Widok ma `security_invoker=true`; funkcja `SECURITY INVOKER`, pusty search_path i jawne REVOKE/GRANT. Per-schema default REVOKE nie znosi globalnego domyślnego PUBLIC EXECUTE, dlatego każda funkcja ma także jawne REVOKE na samym obiekcie, potwierdzone katalogiem.

Drizzle Kit generuje schema SQL/snapshoty, custom SQL polityk i konfiguracji pozostaje w tej samej historii:

| Migracja | Zakres                                                         |
| -------- | -------------------------------------------------------------- |
| 0000     | Trzy tabele, constrainty, RLS enabled i revoke                 |
| 0001     | Jawne granty i 12 polityk owner/endpoint                       |
| 0002     | Przyrostowy checked revision z default 0                       |
| 0003     | Security-invoker view i uproszczone invoker RPC                |
| 0004     | Dopiero teraz ekspozycja istniejącego PoC w PostgREST i reload |

Wszystkie pięć migracji wykonano na utrwalonych targetach. Ich SQL jest niezmienny; poprawki wymagają kolejnej migracji. `generate` nie wykazało dryfu, `check` przeszedł. Supabase migrations/seeds są wyłączone, nie ma drugiego ledgeru ani `drizzle-kit push`.

## Macierze wykonania

Środowisko wszystkich wyników: macOS arm64, przypięty Node/pnpm, lokalny Docker Desktop, trzy rozłączne disposable projekty. Baseline `jobs-crm-f2-baseline-8262205c439c`, replica `jobs-crm-f2-replica-59a7d5949be6`, fault `jobs-crm-f2-fault-ae09f64dcf37`. Pełne per-case metadane i wyniki: [raport JSON](evidence/foundation-f2-final-local-results.json).

| FQA | Rzeczywista próba / obserwacja                                                                                                                      | Wynik |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 10  | Trzy preflighty; błędne identity/port/config/image i ledger odrzucone przed DDL; unit dla hosta/wersji/bindingów                                    | PASS  |
| 11  | Dwa fresh targety, apply 5, no-op, identyczny manifest; v0→v1 zachowuje fixture i realny odczyt A/B                                                 | PASS  |
| 12  | Dwa rzeczywiste procesy migratora; jedna aplikacja lub bezpieczna odmowa; błąd całej pending transakcji bez fałszywego ledgeru; legalne luki SERIAL | PASS  |
| 13  | Anon/brak JWT/fałszywy podpis i claims bez dostępu; RLS/deny i zamknięty signup                                                                     | PASS  |
| 14  | Oba kierunki, oba typy obiektów i relacja: własne/cudze listy, ID, counts, embed                                                                    | PASS  |
| 15  | Własny INSERT, cudzy/NULL owner oraz metadata spoofing z nowym JWT                                                                                  | PASS  |
| 16  | Własny/cudzy UPDATE, owner transfer dokładnie 42501, mass update nie zmienia B                                                                      | PASS  |
| 17  | Własny/cudzy i masowy DELETE, relacje drugiego konta zachowane                                                                                      | PASS  |
| 18  | Oba końce linku, istniejący obcy i losowo nieistniejący endpoint; niezależna diagnostyka FK/CHECK/NOT NULL/UNIQUE                                   | PASS  |
| 19  | Widok/RPC nie zwiększają dostępu; brak anon EXECUTE i view UPDATE; cudze ID bez efektu                                                              | PASS  |
| 20  | Rzeczywiste grants/default ACL/role/config, pusty public, nieeksponowane schematy, GraphQL/Realtime bez ekspozycji                                  | PASS  |
| 21  | Na osobnym fault targetcie brak grantu/policy odmawia; wyłączenie RLS powoduje konkretnie Cross-owner list leak w obu kierunkach                    | PASS  |

| RLS | Zakres bezpośredniej Data API                                                    | Wynik |
| --- | -------------------------------------------------------------------------------- | ----- |
| 01  | Anon, brak/nieprawidłowy JWT, sfałszowane claims; CRUD/view/RPC                  | PASS  |
| 02  | Własny odczyt i brak cudzych danych przez listy/ID/count/embed                   | PASS  |
| 03  | INSERT owner/NULL/spoof obu kont i trzech tabel                                  | PASS  |
| 04  | UPDATE, owner transfer, masowe zapisy i brak efektów u drugiego ownera           | PASS  |
| 05  | DELETE własny/cudzy/masowy, brak obcych kaskad                                   | PASS  |
| 06  | Relacje A↔A dopuszczone; A↔B/B↔A i missing odrzucone, bez oracle istnienia       | PASS  |
| 07  | Invoker view i nested relations/count bez bypassu                                | PASS  |
| 08  | Invoker RPC, jawny EXECUTE, cudzy ID i podrobiony owner param                    | PASS  |
| 09  | Zmienione user metadata i ponownie uzyskany Auth JWT nadal mają uid A            | PASS  |
| 10  | Brak grantu/policy i celowo podatny osobny target dowodzą czułości               | PASS  |
| 11  | 20 równoległych iteracji przeplatanych A/B na każdym świeżym targetcie           | PASS  |
| 12  | Katalog, role bez superuser/BYPASSRLS, ACL, ekspozycja oraz wyłączone transporty | PASS  |

Supabase safeupdate odmawia UPDATE/DELETE bez WHERE kodem 21000. Test potwierdza niezmienione wszystkie rekordy A/B po tej odmowie, następnie używa `id IS NOT NULL`, bez owner filtra, i potwierdza masową zmianę wyłącznie własnych wierszy. Nie wyłączono tego zabezpieczenia. Diagnostyka constraintów i v0 setup jako postgres nie są dowodem RLS; cały user-path powyżej korzysta z rzeczywistych JWT i HTTP.

Baseline i replica mają identyczny znormalizowany manifest tabel/kolumn/constraintów/polityk/grantów/funkcji/role config/ledgeru: SHA256 `c7a85e064bebf7e6e43bebf9f1840a8042266d3dfebb3febf7f26fa7d9fccce3`. Czułość suite wykazała dokładnie oczekiwany błąd obu orientacji, po czym podatny target usunięto. Wszystkie trzy cleanupy przeszły; nie pozostały własne kontenery, sieci ani wolumeny.

Rzeczywiste usługi: PostgreSQL 17.11 (obraz 17.11.0.006), Auth v2.197.0, PostgREST 16.5, Kong 2.8.1. Odczytano 78 dostępnych rozszerzeń i pełne image IDs; zainstalowane: pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1. pg_graphql 1.6.2 i pgmq 1.5.1 są dostępne, **niezainstalowane**. GraphQL nie jest eksponowane, Realtime jest wyłączone i PoC nie należy do publikacji; wykonano negatywne HTTP probes A/B/anon. Nie aktywowano dodatkowych transportów ani kolejki.

## Regresja, CI i finalny review

Lokalne PASS: `pnpm install --frozen-lockfile` także w czystym checkoutcie (565 pakietów, niezmieniony lock), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit` (**18 Vitest + 28 platformy = 46**), `pnpm test:boundaries` (7 kontroli), `pnpm build`, `pnpm test:e2e:foundation` (**3/3**) i `pnpm test:canary`. Harness: `sync.py --check`, `check.py`, unittest **20/20**. Testy harnessu pozostają odrębne od testów aplikacji/RLS. Minimalna zmiana pomocnika F1 pomija lokalny stan F2 w snapshotach; regresja rzeczywiście sprawdziła to wykluczenie.

CI zachowuje dotychczasowe joby F1/harness i dodaje pełną suite F2 na disposable Supabase Local bez cloud secrets. F2 jest obowiązkową zależnością niezmienionego `Foundation required`. Cleanup uruchamia się także po porażce i dotyczy wyłącznie własnych manifestów. Bez continue-on-error, ignorowania migracji i zielonych skipów. Hosted wynik dokładnego finalnego SHA jest raportowany w PR i końcowym przekazaniu; ten raport lokalny nie zastępuje odczytu statusu GitHub Actions.

## Ograniczenia i wejście do F3

PoC certyfikuje wyłącznie wskazany syntetyczny model i kontrolowany lokalny runtime. Nie zastępuje późniejszej macierzy dla zatwierdzonych tabel CRM. BFF/HttpOnly, CSRF, cookies, OAuth, sesje, revocation i reset są NOT RUN do F3; pełna atomowość i registry idempotencji RPC są NOT RUN do F4. F5/worker i cloud/produkcja/DR nie były uruchamiane.

OPEN-002 i OPEN-013 pozostają OPEN; żaden FR/AC/BR/DEC produktu nie został zmieniony. Warunki F3: ukończone bramki review/CI F2, osobne zlecenie Auth/BFF, rozstrzygnięcia APP_ORIGIN/guardrail env z F1 i uprzednio zatwierdzony zakres brokera/kluczy według Foundation Plan. Nie rozpoczynano F3.

## Niezależny review i rozliczenie findings

R1 oceniło pełny kandydat `a20abffaf7e5ac7a073e4cf702b436cd00a5909d` względem `d0c645f48e323cae722720d4262cba2d558e6fd0` w osobnym checkoutcie bez lokalnych sekretów i zależności runtime. Niezmieniony `harness/scripts/review.py` wymusił osobny read-only parent Codex + native generic backend-reviewer oraz Claude restricted Read/Grep/Glob security-reviewer, bez MCP/plugins. Reviewerzy nie edytowali kodu ani nie uruchamiali testów. Oba wrappery: exit 0, changedFiles=[], identyczny fingerprint przed/po `7408b3cdd952a409b2abe6e99e86d9bf7da324f9e3dad543014326ac84bf6b60`.

- Backend parent `01a1883b-cc39-7ae3-a91a-ca26a8ad0986`, native child `01a1883c-4791-7da2-9746-fbf557b1fae2`: PASS, zero findings. Natywne `thread/read` potwierdziło parent-child/depth=1 i `agent_role=null`, czyli generic + canonical role. Parent niezależnie przeliczył hash raportu, źródeł i równoważność manifestów.
- Security `05f900c5-67cd-444c-b988-1257fb351b55`: PASS, brak P0/P1/P2, cztery P3. Narzędzia ograniczone do odczytu uniemożliwiały samodzielne Git/hash checks; tę tożsamość i hashe potwierdził orchestrator oraz backend parent. Zależności dev-only esbuild MODERATE i deepmerge LOW uznano za akceptowalne w opisanym ograniczonym użyciu, bez zmiany pinów.

| Finding R1                                     | Poprawka / rozstrzygnięcie                                                                                                        | Weryfikacja po zmianie                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P3-1 exec Privileged case alias                | Canonical-key validation przed Privileged; oba warianty odrzucone                                                                 | Unit rzeczywistego Unix transportu PASS                           |
| P3-2 sensitive Docker reads / HostConfig model | archive/export/logs tylko własnego kontenera, GET i HEAD; pozostała lista zakazów jawnie ograniczona do zaufanego przypiętego CLI | Obce odczyty 403 bez forwarding, własne działają; full suite PASS |
| P3-3 cleanup przerywa po pierwszym błędzie     | Wszystkie targety są próbowane, potem zbiorczy błąd z samymi ID, bez przyczyn mogących zawierać sekrety                           | Mock pierwszej/trzeciej awarii i wykonania drugiego cleanup PASS  |
| P3-4 PATCH oracle relacji                      | 42501 i identyczne odpowiedzi foreign/missing dla obu końców i obu kierunków                                                      | Dwa świeże targety, pełne 85/85 PASS                              |

Guard służy przypiętemu, zaufanemu CLI; ten sam użytkownik ma dostęp do oryginalnego socketu Docker. Nie stanowi sandboxu dla dowolnego złośliwego programu. Odczyt inwentarza/inspect pozostaje potrzebny do preflight, a lista zakazów HostConfig nie jest kompletną polityką bezpieczeństwa kontenerów. Główne egzekwowane granice to jawny loopback przed create, brak bindów hosta/dodatkowych sieci i brak mutacji cudzych zasobów. Każda aktualizacja CLI/Dockera wymaga ponowienia kontraktów i pełnej suite.

Pierwsza próba z wildcard bindem pozostaje udokumentowanym FAIL; pozytywny wynik dotyczy poprawionego guarda i końcowych targetów. Nie ustalano zasięgu ani czasu historycznej ekspozycji. Nie było wtedy danych PoC ani danych realnych. Finalny delta review ma potwierdzić powyższe poprawki przed publikacją.

## Końcowe utwardzenie i rzeczywisty exit procesu

R2 na `afe1cb056e1a2ed00e8729d51d44891fbaeec3ec` zamknęło cztery P3: backend parent `01a18848-cee0-7e33-b52d-c04200c803b8` / native child `01a18849-364e-7b73-bf83-0307ab43c886` oraz security `9e622f6a-1bc1-48fb-89b3-4ec974dca08e` mają PASS, brak P0/P1/P2. Oba wrappery exit 0, changedFiles=[], before=after `3050706aa84f7f1ba5d1b08fb42aeae1320901c3c3a5f6bb1e2ecd28923b69a2`. [Receipt review](evidence/foundation-f2-review-receipts.json) rozdziela ocenę kodu od dowodów wykonania. Nowe nieblokujące N1/P3 dotyczące Unicode case folding zamknięto przez odrzucanie wszystkich kluczy obiektu spoza ASCII przed porównaniem nazw; testy obejmują Mountſ/Bindſ/NetworKMode, a rzeczywiste payloady przypiętego CLI pozostają dozwolone.

R10 pokazał ważne ograniczenie dowodu: 84 asercje i zapisany JSON miały PASS, lecz proces Node pozostawał otwarty z jednym socketem Docker. **Całą komendę uznano za niezaliczoną**, zachowując [obserwację zawieszenia](evidence/foundation-f2-upstream-handle-hang.json) i [receipt zakończenia sygnałem](evidence/foundation-f2-upstream-handle-cancel.json). Nie zastosowano wymuszonego exit 0 ani `unref`.

Dwa niezależne, ograniczone czasowo testy na atrapowym daemonie wykazały RED: po przerwaniu klienta pozostawał upstream stream; klient zamknięty podczas asynchronicznej kontroli własności mógł uruchomić późny raw upgrade. Poprawka nadaje guardowi prywatnego Agenta HTTP, śledzi wszystkie sockety normalnych/helper/raw requestów, anuluje niedokończone upstreamy po przerwaniu downstreamu oraz ponownie sprawdza stan zamykania po await. `close` niszczy i oczekuje zamknięcia wyłącznie własnych socketów/Agenta. Globalny Agent oraz inne procesy i połączenia pozostają poza zakresem. Oba testy mają GREEN, wszystkie 28 testów platformy kończą się naturalnie exit 0.

Końcowy R11, z tą poprawką, ponownie przeszedł pełne 85/85 i **naturalny exit 0** po 198,405 s, bez sygnałów, skipów i wymuszonego wyjścia. [Receipt komendy](evidence/foundation-f2-final-command-exit.json), SHA256 `ee4464a3a2512bc5f167b8da77f9d822ace7846b12a87f8e07b8423807afe3b3`, jest oddzielny od [raportu asercji](evidence/foundation-f2-final-local-results.json). Manifest 29 źródeł: `b712c1a35970960fa4ef7f45858217f6d6f9732b5ad74a0d37de7df27da67dee`; każdy hash odpowiada zamrożonemu kodowi. Ostatni read-only przegląd obejmuje Unicode, lifecycle i powyższe aktualizacje dowodów; jego wynik oraz finalny hosted CI są raportowane przy dokładnym SHA PR.
