# Foundation — macierz QA i protokół dowodów

**Kontrakt v2, 2026-10-29:** decyzja PO Supabase-native, [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md). [Niezmienna macierz v1](https://github.com/kozdro/jobs-crm/blob/5f5c8c8df3a51a337295566565eca398f4bca3ae/docs/technical/foundation-qa.md) zachowuje wcześniejsze kryteria. Zmiana oczekiwań poniżej jest jawna i nie zmienia dawnych dowodów ani znaczenia ich PASS.

| Grupa dowodów | Aktualny status i granica |
|---|---|
| FQA-01–09 / F1 | Wyniki wykonania w [raporcie F1](foundation-f1.md); bez nadpisania i bez ponownego uruchomienia teraz. |
| FQA-10–21 / RLS-01–12 / F2 | Wykonany **PASS** w zakresie i na kandydatach [raportu F2](foundation-f2.md); nie dowodzi integracji Auth F3 ani importu. |
| FQA-22–34 oraz nowy FQA-57 / F3 | **PLANNED / NOT RUN** dla nowej integracji; żaden test runtime Auth nie został wykonany w tym zadaniu. |
| FQA-35–42 / import-specific F4 | **PLANNED / NOT RUN**, przesunięte do docelowego slice importu; bez blokady ręcznego CRUD. |
| FQA-55 / AUTH-13 | **SUPERSEDED / NOT APPLICABLE v2**, nie PASS: broker i własna kryptografia usunięte z architektury. |
| FQA-43–54/56 | **PLANNED / NOT RUN** we właściwych slices background/Storage/DR/release; zmiany brokera w FQA-50 i przeniesienie adapterów F6 jawnie zastąpione. |

Podstawa: [Foundation Plan](foundation-plan.md), [kontrakty AUTH/RLS/RPC v2](foundation-pocs.md), [platforma i DR](foundation-platform.md), [bramki](foundation-gates.md), [strategia QA](../quality/test-strategy.md), [AC](../quality/acceptance-criteria.md), [traceability](../quality/traceability.md). QA projektuje i w przyszłym osobno zleconym slice implementuje integracje/security/E2E; developerzy piszą unit testy. Model/reasoning autora dokumentacji `NOT EXPOSED`. Review pozostaje niezależny, przez harness.

## Zasady oceny i środowiska

- **L0:** czysty checkout dokładnego SHA, przypięty Node/pnpm, bez sekretów i usług. **L1:** nazwany disposable Supabase Local na loopback z syntetycznym A/B/anon, manifestem migracji i wersjami usług. **L2:** L1 + docelowy produkcyjny build aplikacji pod lokalnym HTTPS, niezależne procesy aplikacji i browser contexts dla refresh/multi-session. **G:** L2 + autoryzowany testowy Google client/tożsamość i credentials. **DR:** izolowany restore target i autoryzowane testowe kopie/ledger, bez realnych danych i publicznego ruchu.
- Setup/migrator ma oddzielne uprawnienia. Dowód RLS/RPC używa realnego user JWT i Data API, nigdy postgres/table owner/BYPASSRLS. Inspekcja katalogu to uzupełnienie rzeczywistej próby, nie jej zastępnik. Oba kierunki A↔B muszą być sprawdzone.
- Niewykonany przypadek, brak credentials i zero wykrytych testów to **NOT RUN**; potwierdzone naruszenie w wykonanej próbie to **FAIL**. **BLOCKED** wskazuje konkretną zależną decyzję/środowisko. **SUPERSEDED / NOT APPLICABLE** usuwa nieadekwatny test z aktywnej bramki i nigdy nie oznacza PASS. RLS bywa pustym wynikiem zamiast 403; asercja obejmuje dane, metadata i efekty.
- Czasy/ilości fixture nie są limitami ani TTL produktu. ADR-0012 akceptuje access JWT do expiry po revocation refresh; nie wymaga ponownej zgody PO na ten fakt. OPEN-013/042/043 zachowują wyłącznie pozostałe polityki operacyjne i ochronę operacji wrażliwych; `getUser()` nie jest sam w sobie ponownym podaniem poświadczeń.
- F3 integruje docelowe adaptery bez osobnej aplikacji eksperymentalnej. Minimalne RPC F4 w slice importu; worker F5 przed pierwszą funkcją background; F6 to kontrole integracji/release ponawiane wraz z funkcją. Pierwszy ręczny slice może nastąpić po F3/RLS i jego własnych OPEN, bez import RPC/workera/pełnego DR. Publiczne wydanie nadal wymaga odpowiednich bramek prywatności i bezpieczeństwa.

**Aktualne wykonanie F3 (osobna autoryzacja 2026-10-29):** szczegółowe wyniki lokalnych AUTH/FQA v2, regresji F1/F2 oraz ograniczenia znajdują się w [raporcie F3](foundation-f3.md). Poniższe PLANNED / NOT RUN są historycznym baseline rebaseline i oczekiwaniami; nie należy traktować ich jako aktualnego raportu wykonania. Live Google pozostaje NOT RUN bez credentials, AUTH-13/FQA-55 N/A.

## F1 — scaffold i minimalne CI

Aktualne wyniki FQA-01–09: [raport F1](foundation-f1.md). Odpowiedzialny inżynier pisze unit/config testy; QA implementuje smoke i testy granic, platform przygotowuje czysty CI.

| ID / testowany kontrakt | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-01 Piny i powtarzalny install | Statyczny + CI | L0 | Wersje runtime/managera zgodne z manifestem, frozen install nie zmienia lockfile; brak peer incompatibility; niespójność odmawia dalszego build | platform-engineer + QA | F1 przed build |
| FQA-02 TypeScript strict | Static analysis | L0 | `next typegen && tsc --noEmit` działa także bez `.next` na świeżym checkout; nie wyłączono strict ani błędów build. Celowo niepoprawny fixture jest odrzucany w osobnej próbie czułości | frontend-engineer | F1 każdy PR |
| FQA-03 Lint i format | Static analysis | L0 | ESLint i Prettier uruchomione niezależnie, zero błędów; zmiana formatowania lub zakazany import daje niezerowy exit | frontend-engineer + QA | F1 każdy PR |
| FQA-04 Granice modułów/client-server | Static + build negatywny | L0 | Client Component importujący server env/adapter nie przechodzi; domain bez importu Next/React/DB, moduł bez prywatnej infrastruktury innego modułu. Negatywne fixture poza build release | frontend-engineer + QA | F1; rozszerzać przy modułach |
| FQA-05 Env: poprawne/brakujące/niepoprawne | Unit | L0 | Scaffold działa bez DB/Auth; wymagany dla aktywnego trybu env walidowany; błędy nazwane bez wartości; brak niejawnego targetu produkcji | frontend-engineer | F1 |
| FQA-06 Redakcja i publiczny bundle | Unit + build inspection | L0 | Syntetyczny sekret-canary w server env nie występuje w browser assets, HTML/RSC, logach ani raporcie błędu; publiczne zmienne tylko jawnie dozwolone | frontend-engineer + QA | F1; ponownie F3/F5 |
| FQA-07 Production build/start | Integracja procesu | L0 | Fresh build oraz start działają na skonfigurowanym porcie bez usług; brak zależności od lokalnego cache/dist lub env autora | platform-engineer + QA | F1 |
| FQA-08 Techniczny smoke | Playwright E2E | L0 + production start | HTTP200 strony i side-effect-free `/health/ready`, obecny semantyczny główny obszar/tytuł, `lang=pl`, rzeczywiste computed styles Tailwind v4, używany komponent shadcn/Base UI i ikona Lucide, brak overflow na mobile; brak client errors i sekretnych danych. Smoke nie dowodzi biznesowych AC | QA | F1 |
| FQA-09 Required CI nie pomija błędów | CI regression | Izolowany testowy PR L0 | Celowo czerwony typecheck/test oraz skipped zależny job nie dają zielonego końcowego gate; exact head SHA i wymagane joby identyfikowalne; fork nie dostaje sekretów | platform-engineer + QA | F1 przed przyjęciem pipeline |

## F2 — migracje i RLS A/B

Wykonane wyniki FQA-10–21 i RLS-01–12: **PASS w historycznym zakresie F2**, z dokładnym kandydatem i dowodami w [raporcie F2](foundation-f2.md); nie uruchamiano ich ponownie w tym zadaniu. Nowe ścieżki integracji F3 pozostają **PLANNED / NOT RUN**. Macierz [RLS-01–12](foundation-pocs.md) jest kontraktem szczegółowym. Każdy CRUD sprawdzić dla obu typów obiektów i relacji, przez Data API; w F3 ponowić przez faktyczne browser/server clients i potrzebne wejścia serwerowe. Integracja aplikacji i bezpośrednie RLS otrzymują osobne wyniki. Wiersze A/B obejmują także zamianę ról A↔B, aby nie ukryć specjalnego traktowania fixture.

| ID / testowany kontrakt | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-10 Target preflight i ledger | Unit + integration | L1 | Błędny host/project/port/wersja/hash/ledger odmawia przed mutacją; poprawny target zapisany w dowodzie bez credential | platform-engineer + QA | F2 przed DDL |
| FQA-11 Powtarzalność/upgrade | DB integration | Dwa świeże L1 + upgrade fixture | Ten sam manifest tabel/FK/RLS/policy/grants/funkcji/ledger; drugi migrate bez zmian; upgrade poprzedniego kandydata zachowuje fixture i ochronę | backend-engineer + platform + QA | F2 |
| FQA-12 Błąd i równoległe migrate | DB fault integration | Osobny disposable L1 | Błąd nie zapisuje fałszywego sukcesu; udokumentowany stan/rollback; dwa migratory serializują lub bezpiecznie odmawiają bez podwójnego DDL; zastosowanego SQL nie edytuje się | platform-engineer + QA | F2 |
| FQA-13 Deny by default/anon | HTTP security + catalog | L1 | RLS włączone na każdej eksponowanej relacji; brak policy/grantu nie daje dostępu; brak/niepoprawny JWT i anon nie czytają ani nie mutują; `auth.uid()` NULL nie staje się ownerem | QA | F2; RLS-01/12 |
| FQA-14 SELECT lista/ID/relacje/count | HTTP integration/security | L1, potem L2 | A widzi własne rekordy; B nie otrzymuje danych/metadata A przez ID, listę, count ani embed; brak wycieku istnienia przez kontrakt błędu | QA | F2/F3; RLS-02 |
| FQA-15 INSERT owner | HTTP integration/security | L1, potem L2 | A zapisuje własny fixture; podsunięty owner B/NULL, user metadata i cudzy JWT override nie dają zapisu; `WITH CHECK` działa po obejściu BFF | QA + backend unit | F2/F3; RLS-03 |
| FQA-16 UPDATE i transfer owner | HTTP integration/security | L1, potem L2 | Własna wartość zmieniona; cudzy ID/owner transfer A→B odrzucony; masowy update nie zmienia B. Zweryfikowane `USING` i `WITH CHECK` oraz SELECT policy | QA | F2/F3; RLS-04 |
| FQA-17 DELETE własny/cudzy/masowy | HTTP integration/security | L1, potem L2 | Usunięty tylko dozwolony własny fixture; cudze rekordy/relacje bez zmian; brak sukcesu kontraktu przy zerowym efekcie. Test nie ustala polityki OPEN-005 | QA | F2/F3; RLS-05 |
| FQA-18 Oba końce relacji/FK | HTTP/DB integration/security | L1, potem L2 | A↔A dozwolone; A↔B/B↔A i nieistniejący koniec nie tworzą relacji; owner-qualified constraints i RLS działają przy bezpośrednim ID oraz zmianie relacji | QA | F2/F3; RLS-06/07 |
| FQA-19 Widoki i RPC izolują | HTTP security + catalog | L1 | Invoker view/RPC nie zwiększają dostępu ani nie ujawniają A przez count/join/helper; anon bez EXECUTE. Właściciel widoku/rola funkcji nie omijają RLS | QA + backend review dowodów | F2/F4; RLS-07/08 |
| FQA-20 Jawne grants/ekspozycja | Catalog + HTTP security | L1 | Exposed schemas/USAGE/table privileges/EXECUTE zgodne z manifestem; PUBLIC i anon bez niepotrzebnych uprawnień; GraphQL i Realtime obecne w target mają jawny manifest i negatywne próby A/B/anon, prywatne schematy nie są dostępne przez alternatywny transport; brak grantu odmawia, a dodanie potrzebnego grantu nie omija RLS | backend-engineer + QA | F2; RLS-12 |
| FQA-21 Czułość testów RLS | Negatywna kontrola testu | Oddzielny jednorazowy L1 | Celowo usunięta/poszerzona policy lub podmieniony user client powoduje FAIL odpowiednich prób A/B. Po próbie target usuwany, fixture nigdy do release | QA | F2; RLS-10 |

## F3 — Supabase-native Auth Integration

Wszystkie aktywne wiersze: **PLANNED / NOT RUN**. AUTH-01–12/14 z [kontraktu v2](foundation-pocs.md) określają szczegóły. L2 używa rzeczywistego Auth i Data API. Mock służy kontrolowanemu błędowi, nigdy dowodowi live Google/RLS. Signup jest samoobsługowym zakresem MVP; wyłączony signup syntetycznego F2 nie jest polityką F3.

| ID / testowany kontrakt v2 | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-22 Email/password | Integration + E2E | L2, A/B | Poprawny login tworzy sesję SDK; błędny bez prywatnego dostępu. Brak hasła/tokenów w logach/URL/HTML/RSC/publicznych assets. Dawny opaque handle SUPERSEDED. | backend unit + QA | F3; AUTH-01 |
| FQA-23 Cookies, storage i XSS | Browser security + headers + unit | L2 HTTPS | Wspierany SDK model i faktyczne cookie flags, bez fałszywej HttpOnly-only gwarancji; browser session storage dopuszczony wyłącznie w kontrakcie SDK. Niezaufane dane nie wykonują kodu; tokeny nie kopiowane do DOM/logów/niepotrzebnych storage. Brak shared cache prywatnych odpowiedzi/Set-Cookie. PROPOSED ocena CSP/minimalizacji third-party scripts w OPEN-013; po wyborze test zgodności z SDK/OAuth, z uwzględnieniem ryzyka kradzieży refresh tokenu. | backend unit + QA | F3; AUTH-03/07 |
| FQA-24 Real Google OAuth/PKCE | Live provider E2E | G | Wspierany PKCE i callback ustanawiają właściwą sesję; bez open redirect i tokenów w URL/logach. Bez credentials **NOT RUN**, mock nie daje live PASS. | QA + platform config | F3; AUTH-02 |
| FQA-25 OAuth negatywny | Integration + E2E | L2, live wariant G | Zły/brak verifier, code replay, cudzy context, odmowa consent i zły next/redirect bez nieuprawnionej sesji. Mock/live rozdzielone. | backend unit + QA | F3; AUTH-02 |
| FQA-26 Refresh i zaufany user | Integration | L2 | Standardowy SDK refresh i propagacja cookies SSR; tożsamość z właściwej weryfikacji, bez zaufania do getSession/user payload/metadata. getClaims nie dowodzi aktualnej revocation; operacja wymagająca bieżącej weryfikacji odmawia przy jej błędzie. | backend unit + QA | F3; AUTH-04/07 |
| FQA-27 Refresh concurrency | Concurrent integration + E2E | L2, tabs/SSR i dwa procesy | Zachowany owner, brak cross-user cookie/cache corruption i niezamierzonego logout spowodowanego integracją. Kontrolowane opóźnienie/awaria kończą się wynikiem SDK lub jawnym retry/re-login. Część v1 CAS/generation/lease/crash brokera SUPERSEDED; brak własnego koordynatora. | backend unit + QA | F3; AUTH-05 |
| FQA-28 CSRF i wejścia publiczne | HTTP security + E2E | L2, dwa originy | Test faktycznych cookie-auth Actions/Handlers, login/logout/reset i callback; cross-origin form/POST/GET, login CSRF i fixation bez nieuprawnionego efektu. Direct SDK/Data API JWT Authorization ocenione jako odrębna powierzchnia. Origin/redirect i ochrona odpowiednie do modelu; bez obowiązku własnego pre-auth nonce brokera. | QA | F3; AUTH-06 |
| FQA-29 Expiry/reload/offline | Integration + E2E | L2, fixture TTL | Nieważna tożsamość nie daje prywatnych danych; właściwe czyszczenie sesji, czytelny re-login, brak loop i wycieku back/reload/bfcache. Prywatne odpowiedzi oraz Set-Cookie bez shared cache zgodnie z adapterem. | QA | F3; AUTH-07 |
| FQA-30 Local logout | Integration + E2E | L2, trzy sesje A + B | Jawny local usuwa bieżącą sesję klienta według SDK, bez niezamierzonego odtworzenia przez integrację; pozostałe sesje nietknięte. Wynik upstream i klienta osobno; stary JWT do expiry badany w FQA-33. | QA | F3; AUTH-08 |
| FQA-31 Others/global logout | Integration + E2E | L2, trzy sesje A + B | Jawne others zachowuje bieżącą sesję A, global cofa wszystkie refresh sessions A; B bez zmian. Odświeżenie cofniętych sesji według dostawcy; nie zakładać SIGNED_OUT na bieżącym kliencie others. Część v1 selected-device revoke SUPERSEDED/N/A; global to jawne rozszerzenie v2. | QA | F3; AUTH-09 |
| FQA-32 Reset hasła | Integration + E2E | L2 + mail sink | Nieenumerująca odpowiedź, poprawny recovery/new password; złe/wygasłe/replayed linki i open redirect odmówione. Cross-device zachowanie zbadane dla wybranego flow; polityka potwierdzeń/skutków sesji OPEN-043/042, bez modyfikacji auth.*. | backend unit + QA | F3; AUTH-10 |
| FQA-33 JWT po revocation | HTTP security + pomiar | L2, JWT tylko w pamięci testu | Osobno standardowy stan klienta, refresh rejection i Data API replay JWT przed/po expiry dla local/global/others. Dostęp ważnym JWT przed expiry nie jest automatycznie FAIL; po expiry odmowa. Operacje wrażliwe według osobnego kontraktu reauth/aktualnego stanu, bez claims-only obietnicy. | QA | F3 i właściwy sensitive slice; AUTH-11 |
| FQA-34 Identity/cache A/B | Concurrent integration + E2E | L2 | Browser/server clients i rzeczywiste Actions/Handlers/SSR/RSC mają właściwego usera; brak server singletona, service-role, metadata/JWT override i wycieku w listach/ID/relacjach/cache. Bezpośrednia Data API nadal chroniona RLS. | QA | F3; AUTH-12 + ponowienie RLS |
| FQA-55 Historyczny broker/klucze | Wycofany kontrakt v1 | Nie dotyczy v2 | **SUPERSEDED / NOT APPLICABLE**, nie PASS; brak brokera/AEAD/session handles oznacza brak testowanego mechanizmu i jego bramki. ID nie otrzymuje nowego znaczenia. | — | AUTH-13, ADR-0012 |
| FQA-57 Self-service signup (nowy v2) | Integration + E2E | L2 | Standardowa rejestracja e-mail/hasło, izolacja nowego konta; błędne/nieukończone przejście bez prywatnych danych. Próba istniejącego vs nowego e-maila obejmuje UI i bezpośredni Auth API: udokumentować rzeczywistą zależność odpowiedzi SDK od konfiguracji, bez fałszywej gwarancji nieenumeracji. Szczegóły pól/aktywacji/komunikatów/abuse wg OPEN-041/013. | backend unit + QA | F3; AUTH-14 |

Zmiany FQA-22/23/26/27/30/33/34 wycofują wyłącznie zależności od własnego brokera i gwarancje silniejsze od SDK. FQA-24/25/28/29/32 zachowują obszary v1, z modelem v2 zamiast server-only brokera. Niewykonane stare kryteria nie są PASS ani runtime dowodem nowej architektury.

## F4 — minimalne native RPC, w docelowym slice importu

Wszystkie wiersze: **PLANNED / NOT RUN, PRZESUNIĘTE DO IMPORTU**. Osobny mały eksperyment tylko po wskazaniu realnej luki i osobnym zleceniu; bez dużej F4 bramki dla zwykłego CRUD. Jedno `supabase.rpc()` przez rzeczywisty Data API, user JWT, preferowany INVOKER, minimalne granty i PostgreSQL rollback. Brak trwałego stagingu i frameworka transakcji/idempotencji.

| ID / testowany kontrakt | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-35 Jeden atomic commit | HTTP + DB integration | L1/L2 import fixture | Cały zatwierdzony wsad wielu rekordów/relacji i minimalny wynik retry w jednej transakcji; bez niezależnych insert requestów. | QA | Import; RPC-01 |
| FQA-36 Rollback | DB/HTTP negative integration | L1/L2 | Błąd walidacji/constraint/RLS po części zapisów nie pozostawia partial efektów ani fałszywego sukcesu registry. | backend unit + QA | Import; RPC-02 |
| FQA-37 Retry i zmieniony payload | Integration | L1/L2 | Ten sam owner/key/payload daje jeden efekt i ten sam wynik; inny payload konflikt; przestrzeń kluczy A/B izolowana. Równoważność sprawdzona serwerowo. | backend unit + QA | Import; RPC-03/04/11 |
| FQA-38 Utrata odpowiedzi | HTTP fault integration | L1/L2 | Odpowiedź utracona po commit → retry bez duplikacji i z odtworzonym wynikiem; stan DB potwierdzony poza odpowiedzią klienta. | QA | Import; RPC-05 |
| FQA-39 Podstawowa współbieżność | Concurrent HTTP integration | L1/L2 | Ten sam key daje jeden efekt lub jawny konflikt. Kolizje aktualizacji tylko jeśli objęte slice; brak cichego overwrite. Liczba requestów fixture, bez obowiązkowego benchmarku v1. | QA | Import; RPC-06/07 |
| FQA-40 RLS i minimalne grants | HTTP security + catalog | L1/L2 A/B/anon | Cudzy ID/owner odrzucony z rollback; INVOKER/EXECUTE/RLS bez bypass; rejestr retry nie może być manipulowany dostępnymi transportami, by ominąć izolację/idempotencję. Granica i faktyczne prawa INVOKER sprawdzone, bez magicznego zakazu DML potrzebnego funkcji. | QA + backend catalog test | Import; RPC-08/09/12 |
| FQA-41 Metody/niepewny wynik | HTTP integration | L1/L2 | GET bez mutacji; po timeout/cancel retry tego samego klucza ustala jeden pełny wynik. Wyjątek sieciowy nie jest dowodem rollbacku. | QA | Import; RPC-10 |
| FQA-42 Budżet payload/time | Kontrola docelowych limitów | L1/L2 import fixture | Przekroczenie zatwierdzonego budżetu nie daje partial commit/stagingu. Dawny obowiązkowy osobny bounded experiment SUPERSEDED; docelowe wartości i test po OPEN-007/023, bez nowego benchmarku foundation. | backend + QA | Docelowy import, nie blokada CRUD |

## F5 i przed publicznym uruchomieniem — worker, Storage i DR

Wszystkie wiersze: **PLANNED / NOT RUN**. Próby DR wymagają osobnego zadania i akceptacji środowiska; nie są wymagane do F1. Konfiguracja YAML i review nie dowodzą działania usługi Render.

| ID / testowany kontrakt | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-43 Queue durability/read vs pop | Integration | L1 + worker | Basic/logged queue zachowuje job po restart DB/worker; read nie usuwa przed trwałym efektem; ACK dopiero po efekcie | backend unit + QA | F5 |
| FQA-44 Lease/redelivery/kill | Fault integration | L1, dwa workery | Kill przed efektem i po efekcie/przed ACK prowadzi do ponowienia z dokładnie jednym efektem job_id; brak równoczesnego odbioru w aktywnym oknie lease | QA | F5 |
| FQA-45 Shutdown/poison/outage | Process integration | L1 + worker | SIGTERM zatrzymuje nowe read, kończy lub oddaje pracę; SIGKILL nie gubi joba; poison/outage nie ACK sukcesu i nie hot loop; testowy backoff/terminal state jawny | platform + backend + QA | F5 |
| FQA-46 Worker least privilege | HTTP/SQL security | L1 | A/B/anon bez queue read/consume; role workera tylko potrzebne obiekty; podmieniony owner odmówiony, status/metadata wyniku dostępny wyłącznie właścicielowi | QA + security review | F5 |
| FQA-47 Health/log/alert contract | Unit + process integration | L0/L1; potem autoryzowany Render | Web jawne 200 bez login redirect i sekretów; błąd wymaganej zależności nie udaje readiness; worker heartbeat/backlog sygnalizują zastój; canary nie występuje w logach | platform + QA | F5/przed release |
| FQA-48 Deployment/rollback | Config review + integration smoke | Autoryzowane środowisko release | Exact-SHA CI przed deploy; Web/worker compatible N/N-1, rollback artifact nie cofa DB. Smoke i syntetyczny job po live; brak środowiska pozostaje NOT RUN | platform + QA | Przed release |
| FQA-49 Private Storage isolation | HTTP integration/security | Autoryzowany disposable L1/DR | A odczytuje własne bytes/wersje, B/anon nie odczytuje/listuje po ID/object key/URL; bucket private; metadane i plik spójne; hash potwierdzony | QA | Storage slice/przed release |
| FQA-50 DB/Auth restore | DR integration | DR | Manifest danych/schema/RLS/grants/RPC zgodny z checkpointem; odtworzony target izolowany od zewnętrznego dostępu do zakończenia replay i testów. Dozwolony login/reset działa; cofnięte sesje/zmiany hasła po checkpoint nie odradzają się wbrew zatwierdzonej polityce recovery. Inwentarz obejmuje natywny Auth i potrzebne secrets/config; dawna część broker/klucze SUPERSEDED przez ADR-0012. Zbadać stare JWT/refresh/hasło na właściwych powierzchniach z uwzględnieniem JWT do expiry; bez udowodnionej izolacji i bezpiecznego wznowienia BLOCKED release. Szczegóły OPEN-032/042/046. | platform + QA | Przed release |
| FQA-51 Storage restore bytes | DR integration | DR | Przywrócone wszystkie potrzebne immutable wersje z checksum; A download działa, B/anon deny; brak relacji do utraconych bytes i obiektów objętych deletion ledger | platform + QA | Przed release |
| FQA-52 Queue/effects po restore | DR fault integration | DR | Inflight/pending redelivery nie powiela efektów; zgodność wersji payload/consumer; job usuniętego konta nie wznawia się; spójny checkpoint DB/Storage | backend + platform + QA | Przed release |
| FQA-53 Independent deletion ledger | DR/security fault integration | DR, ledger poza restore target | Wpis usunięcia nowszy niż backup przetrwa restore; replay przed dostępem usuwa/blokuje konto, dane, bytes i joby. Replay idempotentny; brak/uszkodzony ledger zamyka dostęp, nie udaje sukcesu | platform + backend + QA | Przed release |
| FQA-54 RPO/RTO/7 dni | DR pomiar + retention test | DR + autoryzowane kopie | Rzeczywista luka utraconych potwierdzonych zapisów DB i bytes ≤1h; RTO od incydentu do bezpiecznego wznowienia po replay/tests ≤24h; rotacja kopii po 7 dniach zgodna z zatwierdzoną polityką | platform + QA | Przed release; okresowe powtórki |

## F6 — ciągła integracja i weryfikacja release

**PLANNED / NOT RUN**. F3 od razu wdraża docelowe adaptery; F6 nie jest etapem przepisywania Auth ani obowiązkową migracją z dużej aplikacji PoC. Kontrole dotyczą aktualnie dostarczanej funkcji i nie wymagają wcześniejszego import RPC/workera, jeśli funkcja ich nie używa.

| ID / kontrakt | Poziom | Środowisko | Oczekiwanie / kryterium PASS | Odpowiedzialny agent | Etap |
|---|---|---|---|---|---|
| FQA-56 Izolacja fixture od release | Build artifact + HTTP negative | L0 release, potem autoryzowany target | Runtime output nie udostępnia fixture/provisionera/fault hooks ani eksperymentalnych tras F2. Manifest/negative requests wykazują brak osiągalności; docelowe adaptery Auth są normalną częścią aplikacji. Część v1 o przenoszeniu adapterów z osobnego Auth PoC SUPERSEDED; cel izolacji testów zachowany. | platform + backend + QA | Każdy zależny release |

Dokładny release build ma własne black-box dowody Auth/RLS i cache isolation. Instrumentowany test build tylko tam, gdzie konkretny scenariusz wymaga hooka; hash i różnice jawne, jego PASS nie zastępuje release PASS. Nie tworzymy domyślnie dwóch dużych aplikacji/test frameworks. Przy pomiarze replay JWT odczyt tylko z izolowanego kontekstu testowego do pamięci; bez endpointu eksportującego tokeny i bez magazynu brokera.

## Kontrolowane awarie i czułość

Refresh concurrency synchronizuje rzeczywiste operacje wspieranego SDK; nie generacje własnego brokera. Import testuje utratę odpowiedzi po commit i retry tego samego klucza, sprawdzając stan DB; hook/proxy tylko gdy potrzebny do odtworzenia tej awarii, poza release. Worker kill/lease przed pierwszą funkcją background. Rzeczywisty fixture TTL i polling z deadline sprawdzają expiry; fake clock unit nie dowodzi ważności JWT w usługach. Negatywna kopia z błędną policy/grantem służy wykazaniu czułości; nie osłabia kandydata. Zero rows spowodowane błędem setupu nie daje PASS izolacji.

## Komendy i artefakty — istniejące vs przyszłe

W tym zadaniu dokumentacyjnym wolno uruchomić istniejące kontrole: `python3 harness/scripts/sync.py --check`, `python3 harness/scripts/check.py`, `python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v`, `git diff --check` i kontrolę względnych odnośników zmienionych dokumentów. Są to kontrole dokumentacji/harnessu, bez wykonywania Auth/RPC. Nie dodajemy walidatora.

Istniejące skrypty F1/F2: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm build`, `pnpm test:e2e:foundation`, `pnpm test:integration:f2`; zakres i wyniki wykonane wcześniej w raportach F1/F2. Nie uruchamiano ich ponownie dla tej zmiany dokumentacyjnej. Testy F3/import/queue/DR dopiero powstaną w osobno autoryzowanych slices; ich przyszłe nazwy komend zostaną dopisane do task packet przed wykonaniem, bez wymyślonych istniejących skryptów. Google live i DR mają odrębne credentials/wyniki, brak wymaganego testu nie przechodzi przez skip/pustą suite.

Każdy przyszły wykonany wynik: FQA/AUTH/RLS/RPC/AC/TC, commit i base, hashe test source/fixture, rola/model/reasoning lub NOT EXPOSED, data, komenda, exit/liczba testów, target identity, wersje usług/SDK, konfiguracja cookies/redirects/cache i manifest grants/RLS, oczekiwanie/obserwacja, status oraz przyczyna niewykonania. Artefakty zredagowane, bez cookies/credentials/PII/tokenów/pełnych HAR w Git. Zmieniony kandydat wymaga ponowienia dotkniętych kontroli.

## Exit gates i przyszły biznesowy slice

SEC-01 = standardowa integracja Supabase Auth/SSR i adekwatne aktywne testy F3, bez FQA-55/selected-session/broker checks. SEC-02 = RLS A/B nadal obowiązkowe; IM-01 = atomowość i bezpieczne retry dopiero importu. Brak nieuzasadnionego wycieku tokenów, A/B leakage, RLS bypass i partial/duplicate commit; dostęp browser SDK do tokenów według kontraktu jest zaakceptowanym modelem. Native JWT do expiry po logout nie jest FAIL sam w sobie. Operacje wrażliwe wymagają osobnej bieżącej weryfikacji/reauth zgodnie z właściwym OPEN. Google z NOT RUN nie otrzymuje pełnego PASS ani zgody publicznego udostępnienia tej ścieżki.

Bez arbitralnego procentu coverage, z kompletem wymaganych przypadków danej funkcji i niezależnym review bez P0/P1. Pierwszy ręczny slice pozostaje propozycją z [foundation-gates](foundation-gates.md): własne AC-LC-001, AC-QC-002/010, AC-AD-002 i UC-001/029/034 po zatwierdzeniu jego modelu/OPEN i osobnym zleceniu. Brak pełnego Kanbana/siedmiu modułów nie daje pełnego PASS AC-RW-005/009 ani AC-QC-001. Import, Storage, background i publiczne wydanie zachowują własne dalsze bramki.
