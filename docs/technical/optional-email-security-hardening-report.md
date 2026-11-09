# PR #26 — Security Hardening

**Status: BLOCKED, bez READY.** Naprawa istniejącego PR, bez nowego przyrostu. Baza poprawki `f0d65859fa1c408f37b6a43749f18318d65fc7e5`; kod po poprawkach review i granicy XID `6603850`. Końcowy SHA publikacji, trzy niezależne review oraz hosted CI dla dokładnego SHA są wskazane w [istniejącym PR #26](https://github.com/kozdro/jobs-crm/pull/26). Ten dokument nie przypisuje PASS przyszłemu uruchomieniu CI. Końcowy rekord review/CI jest aktualizowany w PR, dzięki czemu zapis wyniku CI nie zmienia ocenianego SHA.

Autoryzacja, macierz zgodności i właściciele: [task packet](optional-email-reminders-delivery.md#pr-26--security-hardening-2026-11-09). FR/AC-TN-005, regresja AC-TN-004, DEC-027/063 APPROVED, BR-009/020/024/030, UC/TC-023/037, F09, ADR-0007/0012/0013/0014. OPEN-009/040 rozstrzygnięte wyłącznie w dotychczasowym zakresie; OPEN-013/014 i ogólne polityki danych nadal otwarte. [Ocena wyjściowa](optional-email-trigger-hardening-assessment.md) jest zachowana bez zmiany historycznej treści.

## Mechanizm i granice dowodu

Nowa migracja `0021_email_consent_context.sql` dodaje prywatny snapshot zgody: dokładny adres, timestamp weryfikacji, xmin i ctid rekordu Auth, tableoid/filenode oraz pełny horyzont XID. Po blokadzie każda z trzech ścieżek pobiera świeżą granicę `greatest(pg_current_xact_id(), pg_snapshot_xmax(pg_current_snapshot()) - 1)` w osobnym zapytaniu VOLATILE. Sam wcześniej przydzielony XID klienta może być starszy od późniejszych transakcji. Read wiąże wersję wyświetloną w UI z kontekstem; enable i replay niezależnie od triggera porównują snapshot. Jawne enable kopiuje dowód do intentu. Prepare pod blokadą Auth → owner → intent porównuje zapisany kontekst i dopiero zwraca zatwierdzony adres. Blokady trwają przez handoff i finish. Brak dowodu, stary intent bez snapshotu, niezgodność albo niejednoznaczny horyzont oznacza brak transportu. Bez nowych uprawnień lub zmian chronionych obiektów Auth przez migrację hardeningu.

Dodatkowy katalogowy guard odrzuca brak, wyłączenie lub zmianę triggera/funkcji. Nie stanowi audytu historycznego DDL. Niezależny snapshot wykrywa pominiętą zmianę rekordu także po przywróceniu funkcji i katalogu do stanu poprawnego, w tym A→B→A w jednej transakcji. Przejściowego DDL bez żadnej zmiany Auth nie rejestruje; w takim przypadku nie zmienia się adres ani kontekst zatwierdzonej zgody. Nie przedstawiamy samego katalogu jako pełnej ochrony.

xmin sam jest niewystarczający. ctid wykrywa kolejne zmiany w jednej transakcji, filenode rewrite relacji, a pełny horyzont odrzuca kontekst przed możliwym ponownym użyciem zapisanego 32-bitowego xmin, także dla bardzo starej tuple. Cofnięcie pełnego XID blokuje wysyłkę. Granice liczbowe są testami deterministycznymi, nie wykonaniem miliardów transakcji. Restore nie był testowany: dispatch musi pozostać zatrzymany, a wszystkie wcześniejsze konteksty unieważnione przed wznowieniem. Snapshot odtwarzany z bazą nie dowodzi historii poza backupem.

Deterministyczny nowy test dwóch połączeń wykonuje rzeczywiste read/enable: granica zapisana w auth_version i intent rośnie po commitach drugiego połączenia, podczas gdy XID pierwszego klienta pozostaje niezmieniony. Prepare sprawdzono na rzeczywistej próbie przy wcześniej przydzielonym XID; ponieważ nie utrwala granicy, ten smoke nie dowodzi jej świeżości samodzielnie. To wzmocnienie argumentu bezpieczeństwa, nie potwierdzony exploit poprzedniej wersji; MVCC utrudnia ponowne użycie ctid przy aktywnej starej transakcji.

Każda aktualizacja tuple Auth może zachowawczo unieważnić zgodę przy niezmienionym adresie. UI wyjaśnia kontekst bezpieczeństwa i potrzebę ponownego świadomego włączenia, bez przypisywania nieudowodnionej przyczyny anulowania. Nie ma automatycznej reaktywacji. Dane kontekstu są prywatne: brak klientowych grantów, brak adresu w kolejce, bez nowych logów; intent podlega istniejącemu purge terminalnemu po 30 dniach. auth_version przechowuje ostatni kontekst preview do jego zastąpienia; nie jest ogólnym rejestrem historii zgody. Zachowane neutralna treść, idempotencja, safe retry/unknown i okno 6 godzin.

## Wykonane kontrole

Node `24.22.2`, pnpm `12.16.1`, macOS, własne jednorazowe lokalne targety i wyłącznie dane syntetyczne. Bez cloud/provisioningu usług, podnoszenia uprawnień, dotykania DEV, cudzych targetów i main. Komendy uruchomiono z przypiętym PATH; potwierdzono także `pnpm exec node`.

| Kontrola | Wynik | Dowód / zakres |
|---|---|---|
| `pnpm test:unit` | PASS: 620 Vitest + 102 node:test | `unit-latest.log`; frontend także istniejące 11/11. |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` | PASS | Końcowe `typecheck-latest.log`, `lint-latest.log`, `format-latest.log`, `build-latest.log`; wcześniejsze błędy zachowane poniżej. |
| `pnpm test:boundaries` | PASS | `boundaries.log`, testy negatywne granic. |
| `pnpm test:canary` | PASS | `canary-final.log`, publiczne artefakty i logi, pozytywna kontrola skanera i negatywny build env. |
| `pnpm test:e2e:foundation` | PASS: 3/3 | `foundation-browser-final.log`, 1280/375 oraz readiness. |
| Harness sync/check/unit | PASS: 21/21 | `python3 harness/scripts/sync.py --check`, `check.py`, `python3 -m unittest discover -s harness/scripts -p 'test_*.py'`; `harness.log`. To nie test aplikacji. |
| `pnpm test:integration:f2` | PASS: 85/85 | Własne baseline/replica/fault targets, posprzątane przez harness. |
| `pnpm test:auth:f3` | PASS: build, SDK 13/13, Chromium 11/11 | `f3-retry-run.log`, `.foundation-f3/evidence-run-86b9c04f.json`, skany 27 statycznych plików + 15 odpowiedzi; własny target posprzątany. |
| `pnpm test:recruitment` na `fb063e7` | PASS: 22/22 migracje, 187/187 integracje, 195/195 Chromium | `qa-full-r2.log`; source binding r2. Przed ostatnim wzmocnieniem granicy XID. |
| Najnowszy kod `6603850`: świeży target + build + integracje | PASS: 22/22 migracje, build i 188/188 integracje | Świeży `hardening-r2`, output SHA256 `db9bcedb1f23b68efd21026f14f9ee317da0cf56e6416f2f848ba111598ecf48`; runtime-only driver bez browser. Najnowszy browser lokalnie NOT RUN; pełny hosted CI publikuje wynik dokładnego finalnego SHA. |
| Focused helper, queue i owner API na najnowszym kodzie | PASS: 4/4 | Brak/wyłączenie/zmiana katalogu jako symulacje; ścieżka rzeczywistego processQueueOnce z injekcją wyniku guard. |
| Pominięte zdarzenia po cofniętym dryfcie | PASS — symulacje | Własna funkcja app-owned czasowo no-op, syntetyczna zmiana Auth, przywrócenie funkcji PRZED dispatch; A→B, A→B→A między transakcjami i w jednej transakcji, utrata weryfikacji. Zero transportu. Nie test DDL triggera Auth. |
| Brak persisted snapshot, współbieżność, retry/unknown/6h | PASS w szerszej roli fixture | Pełna regresja kolejki, Auth UPDATE czeka przez handoff; nie dowód wykonania pod rolą workera. |
| Rzeczywisty CREATE OR REPLACE triggera Auth | PASS | Własny target, istniejące TRIGGER/EXECUTE bez własności: zdrowy prepare jako kontrola pozytywna; zmiana zdarzeń triggera → guard=false → prepare=NULL → zero transportu; rollback przywraca dokładną zdrową definicję. Bez grantów/eskalacji. |
| Rzeczywisty DROP/DISABLE triggera Auth | BLOCKED, 2 testy SKIP | `postgres`, owner `supabase_auth_admin`, existingOwnership=false. Historyczne `42501` zachowane. |
| Pełny dispatch dedykowaną rolą workera | BLOCKED, test SKIP | Brak istniejącego SET membership. Samodzielny test obejmuje realne enable → claim → dispatch 1 i niezgodny kontekst → dispatch 0, lecz nie wykonano go przy niedostępnych uprawnieniach. |

Odtworzenie testów focused i oddzielnych prób na własnym aktywnym targetcie wymaga jego zweryfikowanego manifestu; przykład dla ostatniego QA (bez żadnych dodatkowych grantów):

```sh
RECRUITMENT_TARGET_ID=hardening-r2 node --test --test-concurrency=1 tests/integration/recruitment/optional-email-context.test.ts tests/integration/recruitment/optional-email-queue.test.ts tests/integration/recruitment/optional-email-reminders.test.ts
RECRUITMENT_TARGET_ID=hardening-r2 node --test --test-concurrency=1 tests/integration/recruitment/optional-email-auth-ddl.test.ts tests/integration/recruitment/optional-email-worker-role.test.ts
```

Po zakończeniu własny target jest zatrzymany przez guarded cleanup; przykład nie upoważnia do użycia cudzej ani trwałej bazy.

Logi główne: `/private/tmp/jobs-email-hardening-evidence/`. Najnowszy target `hardening-r2` zbudowano od zera po zmianie 0021, bez edycji ledgerów już zastosowanych migracji; checkpoint `6cf70f3b3edb20fbd4bddab03ea3dc8ad33064ef24c04cf60694db0798a1c1e3`. Manifest `qa-source-manifest-latest.json`, SHA256 `33ac6bec0c2156ade9f6ffbd1aae29b35c2cc55f6229011bba076bd84cf21b11`: 421 plików non-doc zgodnych z `6603850` poza jawnie udokumentowanym adapterem portów. Najnowsze testy focused i pełne 188/188 integracji nie zastępują najnowszego pełnego browser, który wymaga dowodu hosted CI końcowego SHA. Recruitment snapshot: `/private/tmp/jobs-email-hardening-qa-kNW3usRf/`, własny target `hardening-r1`, porty 5732x. 421 plików źródłowych związano z `fb063e7`; jedyna adaptacja wykonawcza to `scripts/recruitment/validation.ts` 5702x→5732x. Manifest `qa-source-manifest-r2.json`, SHA256 `5d907eb78157e57b9f2c1a97e7de5f54983ebcb7bc0571d232421b34a13d9f5d`; binding `qa-candidate-binding-r2.json`.

Foundation snapshot: `/private/tmp/jobs-email-foundation-hardening-ZPxzHO/`. F2 evidence `.foundation-f2/evidence/2026-11-09T15-14-53-445Z-ceac3fac.json`. F3 uruchomiono na własnych 5742x; wyłącznie runtime adaptery `supabase/f3-config.toml`, `scripts/auth/f3-target.ts`, `scripts/auth/cleanup-plan.ts` 5652x→5742x, hashe w `qa-port-adapter-hashes.json`. Foundation QA powstało przed końcową zmianą tekstu UI; finalny UI jest objęty pełnym Recruitment browser, a końcowy hosted CI odpowiada dokładnemu publikowanemu SHA. Nie przypisujemy adaptacjom mocy dowodu środowiska docelowego.

## Review i zachowana historia FAIL

Pierwsze review `7fb4049`: backend FAIL dwa P2 (test workera z nieistniejącą próbą oraz brak wyjaśnienia konserwatywnego unieważnienia), frontend FAIL P2 UI, security BLOCKED i P2 pokrycia workera. Poprawiono oba miejsca w `fb063e7`. Początkowe wrappery miały exit1, ponieważ równoległy autor uruchomił Foundation/typegen i zmieniły się wygenerowane `.next` oraz `test-results`; nie zmienił się kod, ale nie raportujemy czystego PASS harnessu. Po dodatkowym wzmocnieniu granicy XID końcowe niezależne backend/frontend/security review wymagają oddzielnego rodzica read-only, zamrożonego kandydata, zerowego changedFiles i są publikowane w PR wraz z logami `*-final-review.*`. Review nie zastępuje brakujących bramek runtime.

Bieżące FAIL zachowane osobno:

- Pierwszy build: nowe typy JSONValue/TransactionSql w testach; poprawione, `build.log` zachowany. QA dodatkowo zachowuje własny tsc FAIL; późniejszy Playwright matcher TS FAIL również poprawiony. Frontend pierwszy format FAIL poprawiony.
- Pełna integracja: 185/187 FAIL, hash `e63feacd92be0bfaca568820940c5ba17d8d177dae39391f2d9763c8bdcb40e0`, raw odrzucony przez harness. Powtórzenie diagnostyczne również 185/187, jedno nieudane podzadanie + rodzic: `lifecycle-upgrade.ts` 22!==21. To potwierdza przyczynę powtórzenia diagnostycznego; przyczyna oryginału bez raw pozostaje niepotwierdzona. Fixture zaktualizowany, końcowe 187/187 PASS nie usuwa historii.
- Pierwsze F3 produkcyjny build FAIL, raw withheld; hash `861986521776677533d2bbcad0720860e4ad99eaed544e6ea209c889eae47dde`. Późniejsza diagnostyka wskazała nieaktualne typy testu w snapshotcie; source zsynchronizowano i retry zachowano oddzielnie. Nie uznajemy tego za dowód przyczyny pierwotnego raw.
- Pierwotny review projektu potwierdził P1 starej implementacji; przebieg advisory miał zmieniający się kandydat i nie stanowi końcowego gate.

Historia PR #26 sprzed hardeningu nadal obowiązuje: SQLSTATE `42501` przy próbie wyłączenia triggera Auth oraz pierwszym nadaniu roli workera; fixture liczby migracji, build z symlinkiem zależności, integracja 184/186, przerwany Chromium, błędy typów i wcześniejsze findings. Timeout lifecycle PR #25 nadal ma nieustaloną przyczynę. Późniejsze PASS nie usuwają ani nie wyjaśniają tych wyników.

Przebieg actual DDL ma osobną historię: początkowy ownership-only preflight pominął wszystkie zmiany. Późniejszy odczyt wykazał istniejące TRIGGER/EXECUTE, a dokumentacja PostgreSQL potwierdziła możliwość CREATE OR REPLACE bez własności. Nie interpretujemy wcześniejszego SKIP jako dowodu niedostępności replacement. Końcowe probe obejmuje jeden PASS replacement i trzy SKIP: DROP, DISABLE oraz worker SET. Wszystkie pozostają odrębne od symulacji.

## Konkretna pozostała luka dowodowa

Nie udowodniono reakcji na rzeczywiste DISABLE/DROP triggera Auth w odpowiednio uprawnionym targetcie ani pełnego dispatch z nową walidacją pod dedykowaną rolą workera. Rzeczywista zamiana definicji jest udowodniona osobno; nie zastępuje DROP/DISABLE. Symulacje i wykonanie jako szersza rola fixture nie zamykają pozostałych bramek. Nie eskalowano uprawnień w celu ich zaliczenia. Brak potwierdzonego statycznego bypassu nie jest dowodem pełnej ochrony. Stąd **BLOCKED**, PR pozostaje draftem.

Rzeczywista dostawa Resend, sandbox/credentials, docelowe TLS/login workera, monitoring produkcyjny, restore, fizyczne urządzenia i technologie asystujące pozostają NOT RUN; OPEN-013/014 nadal obowiązują. Bez merge, deploymentu, provisioningu i eskalacji. Lokalny main pozostaje `5f9e7fb8c6c95ec46e3a23b14e66005dbbf6ddaa`, bez zmian.

Pliki: nowa migracja i journal, fixture migracji Local DEV oraz lista integracji runnera; testy helper/queue/worker-role/Auth-DDL/lifecycle-upgrade i browser e-mail; tekst UI; ADR-0014 i indeks, DEC-027, traceability, task packet, zachowana ocena i niniejszy raport. Pozostały produkt i publiczne dopuszczenie nie zostały rozszerzone.
