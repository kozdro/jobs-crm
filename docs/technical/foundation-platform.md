# Foundation — środowiska, migracje i operacje

**Aktualizacja F2, 2026-10-29:** lokalny syntetyczny stack i migrator mają osobną autoryzację wykonania. Aktualna konfiguracja, bezpieczne komendy, wersje i rzeczywiste wyniki są w [raporcie F2](foundation-f2.md). Historyczny status planowania poniżej nie stanowi bieżącego wyniku F2; cloud/worker/DR pozostają poza tym zleceniem.

**Stan:** DRAFT / PROPOSED plan wykonania, 2026-10-28. **Wykonanie:** wszystkie poniższe testy aplikacji i infrastruktury `PLANNED / NOT RUN`. Dokument nie autoryzuje instalacji, migracji, provisioning ani usług płatnych. Główny zakres i kolejność: [Foundation Plan](foundation-plan.md).

Podstawa: TD1.17–1.21, 1.24, 1.28–1.30, 1.33–1.36, 1.38; [ADR-0007/0009/0010](../decisions/adr/README.md), [operacje](operations-and-quality.md), [dane](data-and-persistence.md), [bramki](gates-and-impacts.md). Zatwierdzone są dev lokalny + prod, Render Web Service + osobny Background Worker, Supabase PostgreSQL/Auth/private Storage i pgmq Basic; staging później. Szczegóły konfiguracji, koszty i wyniki walidacji nie są zatwierdzonymi faktami.

## 1. Granice etapów i proponowane pakiety PR

Numery PR wyznacza plan główny; poniżej rozłączne pakiety platformowe, a nie dodatkowa kolejność konkurująca z nim.

| Pakiet | Cel / zakres i planowane pliki | Zależności / decyzje | Role i testy | DoD / STOP / poza zakresem |
|---|---|---|---|---|
| Local stack + migrator | `supabase/config.toml`, `drizzle.config.ts`, `scripts/db/{preflight,migrate}.ts`, instrukcja dev, `.env.example`; dopiero w autoryzowanym PoC `experiments/foundation/rls/` i testy syntetyczne | Po inicjalizacji aplikacji; PO autoryzuje lokalny stack i syntetyczny PoC; OPEN-002 blokuje schemat domenowy, nie ten eksperyment | Platform owns konfigurację/preflight, backend SQL i migrator, QA integracje; backend/security review | Świeży lokalny stack odtwarza ten sam schema/ACL/ledger; drugi migrate bez zmian; STOP: nieznany target, błędna wersja/extension, zależny OPEN lub dryf. Bez RecruitmentCase i danych realnych |
| CI fundamentów | `.github/workflows/app-ci.yml`, test config, instrukcja komend; rozbudowa istniejących kontroli harnessu bez ich zastępowania | Po kontraktach skryptów i dostępności lokalnego stacku w CI; brak cloud credentials | Platform pipeline, QA testy integracyjne/E2E; niezależny review | Czysty checkout wykonuje wymagane kontrole na dokładnym SHA; błędny RLS/test blokuje job; STOP: testy pomijane lub niejawnie zielone. Bez automatycznego deploymentu |
| Worker/queue PoC lokalny | `src/worker/`, techniczny adapter kolejki, `experiments/foundation/queue/`, testy crash/retry, runbook | Po walidacji RLS/RPC; zatwierdzenie dokładnych grantów wewnętrznej roli i syntetycznego kontraktu | Backend worker/unit, platform signals/runtime, QA fault injection; security/backend review | Brak zgubionego zadania po crash/SIGTERM, jeden efekt po redelivery, obcy użytkownik nie odczytuje payloadu; STOP: potrzeba szerokiego bypassu lub nowej architektury. Bez Smart Import/fetch/CV |
| Release readiness — konfiguracja | Późniejsze `render.yaml`, runbook deployment/rollback, matryca sekretów, monitoring i DR proof | Osobne zadanie po fundamentach; jawna autoryzacja zasobów/kosztu; OPEN-013/014/032/042/046 w dotkniętym zakresie | Platform author, QA smoke/DR, security/backend independent review | Najpierw review konfiguracji; provisioning i deploy wyłącznie w autoryzowanym zakresie. STOP przed live przy brakującym backupie Storage/deletion replay lub nieudanym DR. Bez publicznej rejestracji w Foundation |

## 2. Supabase Local i wersjonowane migracje

**PROPOSED wykonanie:** przypięty CLI + kontenery zgodne z Docker API, indywidualny `project_id`, lokalne adresy i porty, syntetyczne konta A/B. CLI nie jest uruchomiony w zadaniu planistycznym. Przed pierwszym uruchomieniem implementator sprawdza jego `--help`, dostępny runtime kontenerowy, porty i obraz DB; wybiera jawnie lokalny target. Bind usług wyłącznie do loopback/prywatnej sieci kontenerów, bez wystawiania Studio/Postgres/Auth w sieci publicznej. Dev nie używa produkcyjnych kluczy, bazy ani kopii CV.

Wersje kandydatów sprawdzone 2026-10-28: **Supabase CLI 2.122.0** ([oficjalne release](https://github.com/supabase/cli/releases/tag/v2.122.0), wydane 2026-10-23), **drizzle-orm 0.45.4** i **drizzle-kit 0.31.11** ([registry ORM](https://registry.npmjs.org/drizzle-orm/latest), [registry Kit](https://registry.npmjs.org/drizzle-kit/latest)). To opublikowane wersje, nie dowód wspólnego działania. Dokładne obrazy PostgreSQL/Auth/PostgREST/Storage oraz `pgmq` extension trzeba odczytać z wybranego CLI/stacku i zapisać w dowodzie pierwszego PoC; nie przyjmować wersji rozszerzenia z daty wydania CLI. Przed instalacją odświeżyć changelog/security advisories i utrwalić dokładne piny/lockfile.

Jeden właściciel historii migracji: **Drizzle** zgodnie z TD1.33/1.38. Proponowany workflow: schema TypeScript → wygenerowany, przejrzany SQL + metadane → jeden serializowany proces `migrate`. RLS, granty, funkcje i rozszerzenia wymagają review SQL; tam, gdzie generator ich nie reprezentuje, custom migration w tej samej historii. Nie dublować stosowania tego samego SQL przez Supabase i Drizzle; Supabase CLI zarządza lokalnymi usługami, a nie równoległym ledgerem aplikacji. Nie stosować `push` jako mechanizmu release i nie migrować przy starcie każdej repliki Web/Worker. Dokumentacja potwierdza [generate + migrate i ledger](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/pg/drizzle-kit-migrate.mdx); zachowanie przypiętego wydania wymaga testu.

Preflight migratora: sprawdzenie jawnego środowiska, hosta/portu/nazwy DB, wersji PostgreSQL, oczekiwanej historii i hashy migracji; credential migratora niedostępny Web BFF. Blokada serializuje równoległe wywołania. Już zastosowanych migracji nie edytować; korekta przez kolejną migrację. Rozdzielić Supabase-managed `auth`/`storage` od własnych obiektów; nie nadpisywać ich tabel generatorami.

Plan walidacji migracji, każda pozycja `PLANNED / NOT RUN`:

1. Świeży disposable local stack → migracje syntetycznego PoC → porównanie tabel, constraintów, RLS, policy, grantów, funkcji i ledgeru z manifestem.
2. Ponowne migrate → zero nowych zmian i rekordów ledgeru; drugi świeży stack → ten sam manifest, pomijając jawnie niedeterministyczne identyfikatory instancji.
3. Celowo błędna migracja w disposable fixture → brak fałszywego wpisu sukcesu, znany stan po błędzie; naprawa bez resetowania historii. Dwa migratory naraz → serializacja albo bezpieczna odmowa, bez podwójnego zastosowania.
4. Próba zmienionego zastosowanego pliku → preflight odmawia; RLS/granty nie znikają przy kolejnej migracji. Brak wymaganego `pgmq` → fail przed zależnym DDL.
5. A/B + anon przez rzeczywisty Data API, a nie wyłącznie SQL jako `postgres`. PoC [Auth/RLS/RPC](foundation-pocs.md) dostarcza dowodu izolacji.

Aktualny [changelog Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) zapowiada wymuszanie jawnej ekspozycji nowych tabel Data API na wszystkich projektach od **2026-10-30**. Dlatego manifest sprawdza jednocześnie exposed schemas, `USAGE`, granty tabel/funkcji i RLS; samo istnienie policy nie zapewnia dostępu. Test kontroluje też odmowę bez jawnego grantu. Nie omijać błędów uprawnień `service_role`.

## 3. Procesy i konfiguracja środowisk

| Obszar | Development | Produkcja — plan przed uruchomieniem |
|---|---|---|
| Web | Lokalny Next.js i BFF, lokalna Supabase, syntetyczne konta, brak publicznego signup | Render Web Service; build z lockfile, start nasłuchujący na `0.0.0.0:$PORT`; TLS na brzegu Render, cookies Secure dla publicznego HTTPS |
| Worker | Oddzielny proces z tego repo, lokalna trwała pgmq | Osobny Background Worker, bez endpointu HTTP; ten sam zatwierdzony commit/kontrakt co Web, niezależne start/stop/release |
| DB/API | Lokalny PostgreSQL + Data API; user JWT tylko serwerowo | Oddzielny projekt Supabase; Web wykonuje standardowe operacje JWT użytkownika przez Data API/RLS; migrator i worker mają oddzielne, ograniczone uprawnienia wewnętrzne; jeśli broker zaakceptowany, Web ma odrębne poświadczenie wyłącznie jego nieeksponowanego store, bez danych CRM/auth.*, oraz osobny klucz AEAD |
| Storage/Auth | Local Auth i private bucket, e-mail do lokalnego odbiornika | Private bucket; OAuth redirect i mail provider dopiero po konfiguracji/review; żadnego otwierania rejestracji przez sam deploy |
| Staging później | Testy mają per-run izolację | Nowe env/service/project/secrets i własne redirect URI; bez odwołań do produkcji i bez zmiany domeny |

Grupa zmiennych proponowana do walidacji: `APP_ENV`, `APP_ORIGIN`, `SUPABASE_URL`, publishable key jako identyfikator API, prywatne konfiguracje sesji BFF zgodnie z wybranym PoC, migrator `DATABASE_URL` i oddzielny worker credential. `NEXT_PUBLIC_*` oznacza zawartość publicznego bundle: żaden JWT, refresh token, DB password, sekret OAuth, klucz szyfrujący lub service-role tam nie trafia. Publikowalny key nie zastępuje tożsamości użytkownika. Credentials admin/Auth tylko w oddzielnej ścieżce operacyjnej, nigdy domyślny klient danych użytkownika. Web, worker i migrator nie współdzielą automatycznie pełnej grupy sekretów. Warunkowe Web-only broker DB credential i klucz AEAD są osobną klasą sekretów: nie przekazuje się ich workerowi ani runnerowi migracji, do klienta lub NEXT_PUBLIC; provisioning fixture/DR używa odrębnej, jawnie autoryzowanej ścieżki.

`.env.example` ma nazwy i niesekretne placeholdery; walidator startu odmawia pracy przy brakującym/nieprawidłowym env, nie wypisując wartości. CI PR nie dostaje sekretów produkcyjnych. Późniejszy deploy wykorzystuje środowisko GitHub chronione akceptacją operatora, minimalne permissions (w CI PR jawne `permissions: contents: read`, bez write/OIDC tokenu do deploy) i osobny credential wdrożeniowy; wersje Actions przypięte do zweryfikowanych pełnych commitów. Token Supabase Management API nie jest tokenem aplikacji; scope i ekspozycję sprawdzi security reviewer.

## 4. Queue/worker: mierzalny PoC

`pgmq` Basic używa logged tables; Unlogged nie spełnia zatwierdzonej trwałości. Domyślnie nie eksponować `pgmq`/`pgmq_public` zwykłym `anon`/`authenticated`. Wewnętrzny transport i dokładny minimalny role/grant manifest są propozycją do security review; zwykły BFF nadal korzysta z RLS, nie uprzywilejowanego klienta.

Proponowany fixture: techniczne `job_id`, `owner_id`, wersja kontraktu i losowy marker syntetyczny; payload nie zawiera tokenów, dokumentów ani danych realnych. Worker używa read/visibility timeout, a potwierdza/archiwizuje dopiero po trwałym idempotentnym efekcie. Nie używa `pop` przed wykonaniem: ta operacja usuwa wiadomość przy odczycie. Powtórne dostarczenie, w tym po crash między efektem a ACK, nie może powielać skutku. Dokumentowane „exactly once” dotyczy okna widoczności, nie końcowego skutku biznesowego.

| Test / kontrakt | Procedura i PASS / FAIL | Odpowiedzialność i etap |
|---|---|---|
| Durability | Send → restart worker i lokalnej DB → ten sam job nadal dostępny; brak utraty = PASS | QA; lokalny queue PoC |
| Visibility/redelivery | Kill po read przed ACK → po wygaśnięciu lease job odebrany ponownie; przed upływem lease brak drugiego odbioru | QA; queue PoC |
| Idempotent effect | Kill po zapisie efektu przed ACK, potem retry → dokładnie jeden efekt dla `job_id` | Backend unit + QA integracja; queue PoC |
| SIGTERM/SIGKILL | Stop nowych read na SIGTERM, dokończenie lub bezpieczne oddanie pracy; wymuszony kill nie gubi joba | Platform + QA; lokalnie, potem smoke Render |
| Concurrent consumers | Dwa workery na jednym fixture, w tym wygasły lease → brak podwójnego efektu i niespójnego statusu | QA; queue PoC |
| Negative authorization | A/B/anon nie listują kolejki, nie konsumują ani nie podstawiają cudzego ownera; status wyniku tylko dla właściciela | QA + security review; po RLS/RPC |
| Retry/poison | Powtarzalny błąd nie powoduje cichego ACK ani nieskończonego gorącego loopa; retry/backoff i stan terminalny jawne | Backend + QA; syntetyczne parametry eksperymentu, docelowe wartości do zatwierdzenia |

PoC ustala testowe lease/retry czasy wyłącznie w fixture i zapisuje je w raporcie; nie narzuca limitów produktu. `pgmq`/API signatures i `extversion` muszą być sprawdzone w target. Changelog opisuje historyczne zmiany `delay` między 1.4.4 a 1.5.1: nie przenosić semantyki wersji bez testu. Queue i tabela efektu muszą mieć spójny recovery plan; po restore wznowić konsumpcję dopiero po replay usunięć i kontroli idempotencji.

## 5. CI, health, logi i rollback

CI wdrażać przy powstawaniu realnych kontraktów. Proponowane komendy **do utworzenia, obecnie NOT RUN**: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, następnie `pnpm test:integration` i `pnpm test:e2e:foundation`. Nazwy finalizuje pierwszy PR aplikacji; żadna nie istnieje obecnie jako dowód.

Pipeline: checkout dokładnego SHA → przypięty Node/package manager → frozen install → niezależne typecheck/lint/format/unit → build → disposable Supabase Local i migracje → integracyjne A/B/RPC/session → uruchomienie produkcyjnego buildu i techniczny Playwright smoke. Clean-checkout sprawdza brak zależności od lokalnych artefaktów. Ostatni job agreguje wymagane kontrole i odmawia sukcesu przy pominiętym/fail dependency. Fork PR nie uruchamia niezaufanego kodu z sekretami ani przez `pull_request_target` z checkoutem head. Zachować dotychczasowe kontrole harnessu. Branch protection i deployment checks konfiguruje osobno uprawniony operator; sam YAML nie wymusza ochrony branch.

Web readiness: minimalny side-effect-free `/health/ready` zwraca jawne `200`, bez danych konta i konfiguracji. Sprawdzić błędny env, niedostępność niezbędnej zależności i brak przypadkowego redirectu do loginu; platforma uznaje także 3xx za zdrowe, więc test aplikacji wymaga 200. Worker nie ma HTTP health check Render: planować osobny heartbeat, wiek ostatniego skutecznego odbioru i backlog; samo „process running” nie potwierdza pracy.

Logi techniczne JSON: correlation ID, typ operacji, kod wyniku, czas, wersja buildu, techniczne job ID. Redakcja tokenów/cookies/Authorization, haseł, CV, treści notatek i prywatnych URL z query. Test z syntetycznym sekretem musi wykazać zero jego wystąpień w logach i artefaktach CI. Alerty: Web unavailable, worker stale, rosnący backlog/terminal failed job, backup nieskuteczny/starszy od celu i nieudany restore smoke. Dostawca alertów, odbiorca, progi i retencja logów pozostają do uzgodnienia; techniczne progi PoC nie stają się polityką produkcji.

Deploy/rollback: zarejestrować commit, konfigurację, manifest migracji, service/deploy ID i poprzedni dostępny artifact. Wdrażać tylko po exact-SHA CI. Jeden serializowany release migracji poprzedza kompatybilny Web i Worker; stosować zmiany expand/contract, test zgodności N/N-1 i wersjonowany payload zadań. Render rollback odtwarza build, **nie cofa DB, Storage, wiadomości i zewnętrznych skutków**. Nie proponować destrukcyjnego down migration jako rutynowego rollbacku. Przed cofnięciem sprawdzić kompatybilność schematu/env i zatrzymać worker, jeśli wymaga tego kontrakt. Ustawienia auto-deploy po rollback zależą od użytej metody, trzeba je sprawdzić. Uruchomienie deploy ≠ status live; po live potrzebny Web smoke oraz dowód przetwarzania syntetycznego joba.

## 6. Backup/restore: cel i osobna bramka publicznego wydania

**APPROVED cele:** retencja standardowych kopii **7 dni**, **RPO ≤1 h**, **RTO ≤24 h**. Stan realizacji: **NOT VERIFIED / NOT RUN**. Rozpoczęcie lokalnego developmentu nie wymaga zakupu PITR ani produkcyjnego backupu. Przed przechowywaniem realnych danych/publicznym wydaniem wymagany zatwierdzony wariant i test DR wszystkich komponentów.

Obecna dokumentacja Supabase: daily backups na Pro przechowywane 7 dni, lecz dzienna częstotliwość nie zapewnia RPO1h; PITR zastępuje daily i jest opcją płatną. Nie wybieramy planu ani kosztu w tym dokumencie. DB backup zawiera metadane Storage, **nie bytes obiektów**; osobna kopia/versioning jest obowiązkowa, a dokładny destination/provider, szyfrowanie i uprawnienia wymagają projektu oraz akceptacji przed provisioning. Nie deklarować kompletności kopii Auth przez samo wylistowanie users.

| Składnik | Co trzeba zabezpieczyć / odtworzyć | Konkretny dowód wymagany przed release |
|---|---|---|
| PostgreSQL | Aplikacyjne dane, constraints, indexy, granty/RLS/RPC, techniczne rejestry operacji i kolejka Basic | Restore od wybranego punktu, porównanie manifestu i data checkpoints, A/B/anon testy, rollback/idempotencja RPC |
| Auth | Rekordy użytkowników/tożsamości oraz potrzebna konfiguracja dostawców, redirecty, klucze/JWT poza samą tabelą users | Test konta e-mail i OAuth, resetu i odmowy kont usuniętych; decyzja/bezpieczna procedura unieważnienia sesji po restore; konfiguracja nowego projektu nie jest automatycznie przenoszona |
| Private Storage | Bytes każdej potrzebnej niezmiennej wersji + checksum + object key + metadane relacji, bucket/privacy policies | Restore wersji pliku o znanym hashu, brak osieroconych relacji/obiektów, owner download PASS i B/anon deny; usunięty obiekt niedostępny |
| Worker/queue | Pending/inflight/archived state + job/effect idempotency records i kompatybilny consumer | Po restore redelivery nie powiela efektu i nie wznawia zadania usuniętego konta; checkpoint DB i obiektów spójny |
| Deletion ledger | Trwały dziennik niezależny od DB/obiektu cofanych do punktu T, minimum identyfikacji, kontrola integralności/dostępu | Wpis po T przetrwa awarię i restore; replay przed dostępem blokuje odrodzenie konta, danych, plików i zadań; powtórny replay idempotentny |
| Broker (jeśli zaakceptowany) | Magazyn session handles/token ciphertext/generacji oraz klucze w odrębnym secret store; nie zakładać, że DB snapshot wystarcza | Sesje cofnięte po T i stare pary refresh nie wskrzeszają się; procedura unieważnienia/re-encryption/rotation i odmowy starego klucza po restore zweryfikowana |
| Konfiguracja | IaC/runbook/piny oraz odtwarzalne sekrety w osobnym secret store | Operator odzyskuje uprawnienia bez sekretów w Git/raporcie; rotacja kluczy i odcięcie starego środowiska zweryfikowane |

OPEN-032/046 obejmują m.in. minimalną treść i retencję ledgeru oraz fizyczne usunięcia z backupów. Kierunek niezależnego ledgeru jest już zatwierdzony (TD1.17); jego umiejscowienie i trwałość nadal **PROPOSED**. Rekomendacja: osobny, chroniony przed rollbackiem i ograniczony dostępem zapis tombstone, utrwalony przed uznaniem usunięcia za zakończone. Awaria ledgeru zamyka ścieżkę finalizacji usunięcia/release restore; nie udaje sukcesu. Nie przyjmować, że ledger w tej samej odtwarzanej DB wystarczy. Sekwencja między intentem, usunięciem danych, kopią obiektów i replay wymaga testów fault injection oraz security review.

**Warunek wykonalności kwarantanny managed Supabase — VALIDATION REQUIRED:** odcięcie samego Render nie odcina Auth, Data API ani Storage. Przed restore trzeba zatwierdzić i sprawdzić na disposable managed target mechanizm odmowy dla wszystkich tych endpointów przez cały restore/replay. Proponowany wariant do badania: nowy projekt z odrębnymi URL/kluczami, wyłączonymi providerami/Auth signup i ograniczoną ekspozycją/grantami danych do końca replay; samo niepublikowanie URL/klucza nie jest zabezpieczeniem. Manifest po restore i zewnętrzny równoległy probe z anon oraz starymi i testowymi nowymi poświadczeniami muszą wykazać brak dostępu i brak odrodzenia sesji. Nie zakładać, że restore nie nadpisze ograniczeń lub kluczy. Jeśli dostawca nie pozwala utrzymać tej blokady, wariant jest FAIL/BLOCKED release: przed danymi/restore nowy projekt bezpiecznej kwarantanny do security review i decyzji PO, bez in-place PITR otwartego na ruch przed replay. Lokalny test nie dowodzi tej własności managed usługi.

**Sesje i credential po T:** restore obejmuje również stan Auth i ewentualnego brokera, więc deletion ledger sam nie chroni cofniętych sesji ani hasła zmienionego po T. Rekomendacja PROPOSED do OPEN-013/042/043: wspierana procedura unieważnienia wszystkich odtworzonych sesji/broker handles oraz bezpiecznego ponownego zweryfikowania credential po restore, zanim endpointy przyjmą ruch. Dokładna metoda provider-side revocation/rotacji i odzyskania dostępu wymaga zatwierdzenia i próby; nie edytować `auth.*` nieudokumentowanym SQL. FQA-50 musi wykazać, że sesja cofnięta i stare hasło zmienione po T nie wracają. Brak wspieranego mechanizmu lub decyzji to blokada publicznego restore, nie zgoda na uznanie JWT expiry za wystarczające.

Protokół DR do autoryzowanego wykonania:

1. Operator odcina ruch i konsumentów; zapisuje czas incydentu, ostatni trwały checkpoint osobno DB, Auth, Storage i ledgeru, oraz początek pomiaru RTO. Przypadki: utrata DB, utrata obiektu, utrata środowiska, restore starszy niż usunięcie.
2. Odtwarza do izolowanego target bez publicznego ingress. Ładuje konfigurację i ledger nowszy niż restore; odtwarza potrzebne bytes obiektów i usuwa te objęte tombstone.
3. Replay usunięć i rekonsyliacja ownerów/relacji/kolejki przed dopuszczeniem Web/Auth/Storage; sprawdza również stare sesje/URL do obiektów. Ledger nie może być zależny od dostępu do przywróconego konta.
4. QA wykonuje powyższe testy pozytywne/negatywne, liczy rzeczywistą utratę potwierdzonych zapisów względem czasu awarii oraz ostatniego kompletnego, spójnego punktu odzyskania każdego komponentu; sprawdza też luki wewnątrz odzyskanego zbioru, nie tylko interwał harmonogramu. PASS wymaga luki ≤1h dla DB **i** plików oraz braku odrodzonych usunięć.
5. Koniec RTO po zakończeniu replay i pozytywnych kontrolach dostępu oraz bezpiecznym wznowieniu usług; PASS ≤24h. Przechować zredagowane timestamps, manifest/hash i dowody testów. Brak pomiaru/składnika = NOT RUN, przekroczony cel = FAIL, release zatrzymany.
6. Zweryfikować rotację kopii po 7 dniach, brak niezamierzonej dłuższej retencji w obiektach/logach/archiwach kolejki; wyjątki prawne wymagają decyzji OPEN-032. Przećwiczyć powtórny idempotentny replay i reakcję na uszkodzony/brakujący ledger.

## 7. Źródła sprawdzone 2026-10-28 i granice dowodu

Zastosowano Context7 `resolve-library-id` → `query-docs`: `/supabase/supabase` (backup/Storage), `/drizzle-team/drizzle-orm-docs` (migrations), `/websites/render` (deploy/signal). Źródła pierwotne odczytano dodatkowo bezpośrednio; markdown Supabase/Render zwrócił HTTP200 przez klienta HTTP. Strona HTML Drizzle zwróciła403, użyto oficjalnego repo dokumentacji. Nie uruchomiono Supabase CLI, instalacji ani runtime aplikacji.

- [Supabase Local](https://supabase.com/docs/guides/local-development): CLI i Docker-compatible runtime; loopback; lokalny stack nie dowodzi konfiguracji managed prod.
- [Supabase changelog](https://supabase.com/changelog.md): sprawdzono zmiany DB/API. [Ekspozycja nowych tabel](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) wymaga jawnych grantów. [Historyczny pgmq delay](https://supabase.com/changelog/39378-potential-breaking-change-in-pgmq-from-1-4-4-to-1-5-1-and-temporary-halt-on-upgrade-for-existing-projects) wymaga kontroli `extversion`. [Deprecjacja TLS CBC](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), planowana na2026-11-10: przyszły deployment sprawdza połączenia nowoczesnego Node, bez zgadywania kompatybilności ze starym klientem.
- [Supabase Queues](https://supabase.com/docs/guides/queues), [quickstart](https://supabase.com/docs/guides/queues/quickstart), [API](https://supabase.com/docs/guides/queues/api): trwała Basic, jawna ekspozycja, różnica read/pop i okno widoczności. To nie gwarancja exactly-once efektów.
- [Supabase backups](https://supabase.com/docs/guides/platform/backups): daily/PITR, ograniczenia Storage i wymagania restore. Brak kwot kosztowych i brak wyboru płatnego planu.
- [Drizzle migrate](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/pg/drizzle-kit-migrate.mdx): versioned SQL i ledger. Piny powyżej wymagają wspólnego testu, nie wynikają z przykładów gałęzi main dokumentacji.
- [Render deploys](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [rollbacks](https://render.com/docs/rollbacks): osobne lifecycle i signal shutdown, Web HTTP health, Worker bez health HTTP, artifact rollback bez cofania danych. Dokładne timeouty nie są kontraktem produktu; przyszły release ponawia weryfikację ustawień i rzeczywistego zachowania.
