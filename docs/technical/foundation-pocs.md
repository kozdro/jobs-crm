# Foundation — kontrakty Supabase-native Auth, RLS i minimalnego RPC

**Aktualny kontrakt v2, 2026-10-29:** decyzja PO wariant A i [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md). Jest to aktualizacja dokumentacji, bez autoryzacji implementacji Auth/RPC ani nowych eksperymentów. F1/F2 i ich wykonane wyniki pozostają w [raporcie F1](foundation-f1.md) i [raporcie F2](foundation-f2.md). Nowe testy F3 oraz import-specific F4: **PLANNED / NOT RUN**.

**Historia:** [niezmienny kontrakt v1 w bazie PR #8](https://github.com/kozdro/jobs-crm/blob/5f5c8c8df3a51a337295566565eca398f4bca3ae/docs/technical/foundation-pocs.md) zachowuje dawne kryteria AUTH/RPC. Poniższe zmiany wersji nie reinterpretują dawnych wyników. AUTH-13 jest wycofany, pozostałe ID zachowują obszar testowania z jawną zmianą kryteriów. Dokument uzupełnia [Foundation Plan](foundation-plan.md), [QA](foundation-qa.md), [bramki](foundation-gates.md) i [persystencję](data-and-persistence.md). QA projektuje i w przyszłym autoryzowanym slice implementuje integracje/E2E; backend pisze własne unit testy. Model/reasoning bieżącego autora: `NOT EXPOSED`.

## 1. Podstawa, wpływ i granice

Obowiązują ADR-0012 (`ACCEPTED`, następca ADR-0003) i [ADR-0005](../decisions/adr/0005-atomic-inmemory-import.md) (`ACCEPTED`, bez zastąpienia). Niezmienniki `NFR-001`, `BR-030`, `FR/AC-AD-002` pozostają obowiązujące. `FR/AC-AD-003–006` oraz `NFR-004` mają częściowo zatwierdzony kierunek Auth; pozostałych szczegółów OPEN nie podnosi się do APPROVED. Import zachowuje `FR-IM-005–014`, `AC-IM-008/011/014`, `BR-021–025`, `NFR-008`, TD 1.28–1.30.

F3 integruje docelową aplikację z oficjalnymi browser/server clients `@supabase/supabase-js` i `@supabase/ssr`: e-mail/hasło, self-service signup, Google/PKCE, reset, standardowy refresh i scopes logout. Nie powstaje broker, magazyn session handles, kryptografia sesji, CAS/generation/lease framework ani rejestr urządzeń. F4 to minimalne PostgreSQL-native RPC w docelowym slice importu; nie blokuje ręcznego RecruitmentCase/Quick Capture. F5 czeka na pierwszą funkcję background. F6 to stopniowa weryfikacja integracji/release, bez przepisywania osobnej aplikacji Auth.

Wpływ: browser/server/Auth/Data API/RLS, sesje, prywatny cache, retry i transakcje importu. Nie zmieniamy lifecycle, historii biznesowej, fizycznego modelu RecruitmentCase (`OPEN-002`), komunikacji, wyszukiwania ani reguł duplikatów. Polityki operacji wrażliwych pozostają w `OPEN-032/043/045/046`; implementuje je dopiero odpowiedni slice.

## 2. Potwierdzone mechanizmy dostawcy i przyszły preflight

Źródła zweryfikowano **2026-10-29** przez Context7 (`resolve-library-id` → `/supabase/ssr` i `/supabase/supabase` → tematyczne `query-docs`) i oficjalne strony. To dowód dokumentacyjny, a nie wykonanie testów.

| Mechanizm potwierdzony dokumentacją | Konsekwencja dla planu |
|---|---|
| Oficjalny SSR używa browser/server clients i cookies; browser potrzebuje dostępu do refresh tokenu. Nie daje gwarancji HttpOnly-only. | Test wspieranego adaptera i rzeczywistych flag/storage; browser-accessible session tokens są cechą modelu. Zakazane są dodatkowe nieuzasadnione kopie lub ujawnienia. [SSR](https://supabase.com/docs/guides/auth/server-side), [advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) |
| `getClaims()` sprawdza podpis/ważność JWT, bez sprawdzenia bieżącej revocation; `getUser()` komunikuje się z Auth, gdy potrzebny jest aktualny stan. | Nie ufać serwerowemu `getSession()` jako dowodowi tożsamości; plan ochrony operacji wrażliwych musi rozróżniać walidację JWT od aktualnego stanu konta. |
| Sesje zawierają JWT i rotowane refresh tokens; dostawca opisuje współbieżność i wyjątki reuse. | Test rzeczywistego SDK, wielu browser contexts i SSR, bez własnego protokołu generacji. Czasy fixture nie stają się polityką MVP. [Sessions](https://supabase.com/docs/guides/auth/sessions) |
| Logout scopes: `local`, `global`, `others`; access JWT może działać do expiry po cofnięciu refresh tokens. | Jawnie podawać scope; nie testować wymyślonego target-by-id i natychmiastowego odrzucenia JWT. `others` zachowuje bieżącą sesję; nie zakładać zdarzenia SIGNED_OUT w bieżącym kliencie. [Signout](https://supabase.com/docs/guides/auth/signout) |
| Reset hasła przez e-mail i standardowe przepływy Auth/PKCE. | Test recovery, złych/wygasłych linków i bezpiecznych redirects; wariant cross-device i szczegóły potwierdzeń w OPEN-043. [Passwords](https://supabase.com/docs/guides/auth/passwords) |
| RLS, grants i INVOKER są odrębnymi mechanizmami; funkcja domyślnie nie oznacza minimalnych EXECUTE grants. | Rzeczywiste A/B/anon, kontrola obu końców relacji, brak metadata/service-role bypass; jawne minimalne granty. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [functions](https://supabase.com/docs/guides/database/functions) |
| Jeden request PostgREST działa w transakcji; DB error powoduje rollback. Kilka requestów nie tworzy wspólnej transakcji. | Jeden mutujący RPC przez POST dla zaakceptowanego wsadu. [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html) |

Przeczytano [changelog](https://supabase.com/changelog) i [indeks changelogu](https://supabase.com/changelog.md). Przyszły preflight przed F3: aktualna kompatybilność Next.js/SDK/SSR, cookies i cache headers adaptera, konfiguracja PKCE/callback, wersje lokalnych usług oraz istotne breaking changes. Nie zmieniamy pinów ani zależności teraz. Dokumentacja nie dowodzi bezbłędnego zachowania integracji, refresh concurrency, konfiguracji Google ani przyjętej polityki sesji.

## 3. Warunki przyszłej weryfikacji

1. Osobna autoryzacja implementacji i testów, dokładny commit/target identity, wersje, loopback porty i manifest fixture/migracji. Bez cloud/produkcji ani danych prywatnych. Setup syntetycznego A/B oddzielony od testowanej user-scoped ścieżki.
2. F3 korzysta z docelowych adapterów w root aplikacji; nie tworzy osobnego dużego projektu Auth do przepisania w F6. Signup w MVP jest samoobsługowy; wyłączony signup syntetycznego F2 nie jest polityką produktu.
3. Live Google wymaga osobno skonfigurowanego testowego providera/tożsamości i credentials. Ich brak = **NOT RUN** live OAuth. Mock błędu callback nie zastępuje live PASS.
4. Artefakty bez tokenów/hasła/PII i pełnych HAR: wyniki, zredagowane headers, manifest konfiguracji/grants, liczniki DB. Token w pamięci izolowanego testu służący pomiarowi JWT nie trafia do raportu.
5. STOP zależnego zakresu: wyciek A/B, nieuzasadnione ujawnienie tokenu, service-role w user path, obejście RLS, partial/duplicate import. Dostęp SDK do tokenów w jego wspieranym modelu nie jest sam w sobie błędem.

## 4. AUTH v2 — Supabase-native Auth Integration / PR-F3

Wszystkie aktywne poniższe testy: **PLANNED / NOT RUN**. Szczegóły plików i DoD przyszłego PR: [Foundation Plan](foundation-plan.md). Nie ustanawiamy tu TTL, limitów, retencji ani nowej polityki operacji wrażliwych.

| ID | Przepływ / procedura v2 | Kryterium sukcesu; negatywne przypadki |
|---|---|---|
| AUTH-01 | E-mail/hasło przez wspierany client SDK w docelowym UI. | Poprawne dane ustanawiają sesję SDK; błędne nie dają prywatnego dostępu. Brak haseł/tokenów w logach, HTML/RSC, URL i publicznych assets; wspierany session storage SDK nie jest zakazanym wyciekiem. |
| AUTH-02 | Google OAuth/PKCE i callback `exchangeCodeForSession` według adaptera. | Poprawny live flow; brak/zły verifier, replay code, cudzy context, odmowa consent, zły redirect/next bez nieuprawnionej sesji lub open redirect. Kod usunięty z URL po callback. Mock i live osobne. |
| AUTH-03 | Inspekcja cookies/storage, odpowiedzi SSR/RSC, prywatnego cache oraz wejść XSS. | Dokładny storage/flags zgodny z przypiętym SDK, bez deklaracji HttpOnly-only; brak zbędnych kopii tokenów i renderowania niebezpiecznych danych. Prywatne odpowiedzi/Set-Cookie nie trafiają do shared cache, A/B i back/bfcache bez wycieku. Testy XSS obejmują niezaufane wartości i canary, a nie twierdzenie, że SDK chroni przed XSS. PROPOSED w F3/OPEN-013: ocena CSP i ograniczenia skryptów zewnętrznych; po wyborze test zgodności ochrony z SDK/OAuth. Kradzież refresh tokenu może przedłużać kompromitację poza expiry access JWT; reakcja oparta na wspieranej revocation, skutki resetu osobno w OPEN-043. |
| AUTH-04 | Zaufana tożsamość server client i ochrona każdej faktycznej operacji serwerowej. | Weryfikacja JWT/user według potrzeb powierzchni; `getSession()`/owner payload/user-editable metadata nie przyznają uprawnień. `getClaims()` nie dowodzi świeżej revocation. Nieprawidłowa tożsamość i niepowodzenie wymaganej bieżącej weryfikacji = odmowa. |
| AUTH-05 | Standardowy refresh w równoległych browser tabs/SSR i niezależnych procesach aplikacji; opóźnienie/awaria Auth. | Zachowany owner i brak wycieku/corruption cookies; wynik refresh zgodny ze wspieranym SDK, jawny retry/re-login przy utracie sesji. Bez własnych CAS/lease/generacji i gwarancji rozproszonej blokady. Konkretna macierz i liczba requestów to parametr testu, nie SLA produktu. |
| AUTH-06 | CSRF/login CSRF/session fixation na faktycznie używanych cookies i endpointach. | Dla Server Actions/Route Handlers/cookie-auth mutacji odtworzone cross-origin POST/form/GET i negatywne origin/redirect; bez efektu bez uprawnienia. Dla bezpośredniego SDK/Data API rozróżnić JWT Authorization i automatycznie wysyłane cookies. Zastosowana ochrona i test mają odpowiadać rzeczywistej powierzchni; SameSite sam nie daje PASS. Nie narzuca się własnego pre-auth nonce frameworka. |
| AUTH-07 | Malformed/expired session, nieudany refresh, reload/offline→online/back. | Brak prywatnego dostępu bez ważnej wymaganej tożsamości; bez redirect loop i cache leakage, czytelny re-login. Fixture TTL nie rozstrzyga OPEN-042. |
| AUTH-08 | Jawne `signOut({scope: 'local'})`, reload, standardowy refresh po logout, trzy sesje A. | Bieżący klient usuwa standardową sesję zgodnie z SDK; brak jej niezamierzonego odtworzenia przez integrację. Pozostałe sesje A i B nietknięte. Skopiowany access JWT badany odrębnie w AUTH-11, bez gwarancji natychmiastowej revocation. |
| AUTH-09 | Jawne `global` i `others`, trzy sesje A + B. | Global cofa refresh sessions A; others zachowuje bieżącą i cofa pozostałe zgodnie z SDK. Stan klienta oraz wynik upstream raportowane osobno; test odświeżenia cofniętych sesji i izolacji B. Część v1 „jedna dowolnie wskazana inna sesja” **SUPERSEDED / NOT APPLICABLE**; brak urządzeniowego registry/target-by-id. |
| AUTH-10 | Reset e-mail, mail sink, recovery i zmiana hasła według wspieranego flow. | Odpowiedź nie enumeruje kont; złe/wygasłe/replayed linki i open redirects odmówione; nowe hasło działa. Cross-device/link bez verifier osobnym przypadkiem zgodnym z wybranym flow; szczegóły, potwierdzenia i skutki dla sesji w OPEN-043/042. Bez nieudokumentowanych zmian auth.*. |
| AUTH-11 | Zachowany w pamięci testu JWT po native logout/revocation i jego replay do Data API, przed/po expiry. | Zapisany rzeczywisty okres ważności, poprawna odmowa po expiry i brak cross-owner dostępu. Ważny JWT przed expiry po cofnięciu refresh nie jest automatycznie FAIL — to ograniczenie zaakceptowane ADR-0012. Bieżący klient odcięty zgodnie ze scope; operacje wrażliwe mają osobne testy aktualnego stanu/reauth według właściwych OPEN. |
| AUTH-12 | Per-request server client i browser clients A/B; lista/ID/relacje, Actions/Handlers/SSR/RSC/cache. | `auth.uid()` odpowiada właściwemu ownerowi; brak współdzielonego mutable server clienta, service-role, podmiany kontekstu i wycieku A→B. RLS działa również przy bezpośrednim dostępie do Data API. |
| AUTH-13 | Historyczny magazyn brokera/AEAD/hash-only handle/rotacja własnych kluczy. | **SUPERSEDED / NOT APPLICABLE v2**, nie PASS; ADR-0012 usuwa mechanizm i jego bramkę. Zachowany opis v1 pod niezmiennym linkiem powyżej. ID nie otrzymuje nowego znaczenia. |
| AUTH-14 | Nowy przypadek v2: samoobsługowa rejestracja e-mail/hasło i izolacja nowego konta. | Standardowy wspierany flow Auth, konto bez danych innych użytkowników; błędne dane/nieudane potwierdzenie bez prywatnego dostępu. Szczegóły pól, aktywacji/komunikatów i ochrony nadużyć zależne od OPEN-041/013. Dodatkowy przypadek: istniejący vs nowy e-mail, odpowiedź UI i bezpośredniego Auth API bez pozornej gwarancji SDK; komunikaty/antyenumeracja i ustawienia według OPEN-041/013. |

### Jawne zastąpienie kryteriów v1 i bramka AUTH

AUTH-01/03/04/05/07/08/11/12 nie wymagają opaque handles, server-only token storage ani własnej synchronizacji. AUTH-02/06/10 zachowują PKCE/CSRF/recovery, lecz nie narzucają brokera i jego nonce/callback. AUTH-09 wycofuje selected-session revoke, rozszerzając jawnie v2 o natywny global. AUTH-13 w całości wycofany. To zmiana zatwierdzona PO, a nie PASS niewykonanych testów.

SEC-01 wymaga adekwatnych aktywnych AUTH-01–12/14 na docelowej integracji, osobnych wyników lokalnych i live Google oraz niezależnego backend/security review bez P0/P1. Brak live credentials = NOT RUN tej części, bez pełnego PASS Google ani publicznego wydania Google. Prace niezależne nie czekają na mechanizm brokera ani target-by-id. Brak decyzji polityki zatrzymuje tylko zależną operację; akceptacja JWT do expiry jest już rozstrzygnięta, nie czeka ponownie na PO. Potwierdzony błąd SDK/integracji oznacza zachowanie dowodu i minimalną naprawę we wspieranym modelu, bez automatycznej budowy brokera.

## 5. DB/RLS-P0 — środowisko, migracje i izolacja

**Wykonanie F2 autoryzowane 2026-10-29:** syntetyczny kontrakt i bezpośrednia kolumna Data API macierzy są implementowane w osobnym PoC. [Raport F2](foundation-f2.md) zawiera aktualne wyniki i ograniczenia; poniższe oznaczenia PLANNED opisują historyczny plan. Nowe ścieżki browser/server pozostają NOT RUN do F3; import-specific atomic RPC czeka na slice importu. Wynik minimalnego RPC F2 nie jest wynikiem pełnego kontraktu importu.

### Przygotowanie do osobnej autoryzacji

Minimalny syntetyczny kontrakt: dwa rodzaje obiektów `probe_item`, `probe_label` (id, owner UUID, sztuczna wartość), relacja m:n `probe_link` bez registry importu w F2; minimalny registry pojawi się dopiero z import-specific RPC, jeśli wymagany do retry. Nazwy/kolumny są **PROPOSED, wyłącznie testowe**. Relacja musi wymuszać tego samego ownera po obu stronach (np. owner-qualified klucze/FK plus RLS); zwykły FK po id nie jest autoryzacją. Nie zawiera stanowiska, statusu ani dat rekrutacji.

Proponowany przyszły zakres: `experiments/foundation/rls/`, dedykowany Drizzle config/schema/migrations, fixture A/B, HTTP integration tests. Platform przygotowuje Supabase Local i jawny DB target; Drizzle jest jedynym autorem migracji technicznego schematu, CLI nie generuje równolegle konkurencyjnej historii. SQL polityk/funkcji/grantów jest przeglądany i wersjonowany razem. PoC musi zarejestrować rzeczywiste wersje PostgreSQL, rozszerzeń i PostgREST, nie tylko wersję CLI.

Procedura walidacji migracji: (1) świeży disposable target → wszystkie migracje; (2) ponowne uruchomienie runnera → brak nowej zmiany; (3) upgrade z poprzedniego commitu z syntetycznym stanem → nowa migracja; (4) drugi niezależny świeży target → porównanie schematu/polityk/funkcji/grantów i ledgeru; (5) celowo błędna migracja w osobnym klonie → udokumentowany rollback/stop. Wynik zależy od rzeczywistych możliwości migratora — nie zakładać transakcji całej historii bez próby. Nigdy `push`/reset na niezweryfikowanym targetcie.

Domyślnie zero policy/grants = brak dostępu. Potem jawne grants tylko potrzebnych operacji do `authenticated`, RLS na wszystkich eksponowanych tabelach; `anon` nie dostaje prywatnych danych. Każda polityka sprawdza uwierzytelnionego `auth.uid()` i ownera. SELECT/DELETE używają `USING`; INSERT `WITH CHECK`; UPDATE oba warunki oraz potrzebna SELECT policy. Weryfikować owner transfer, a nie tylko zmianę wartości. Nigdy user-editable metadata jako źródło uprawnień.

### Macierz autoryzacji — stabilne RLS-01–12

W PR-F2 każdy przypadek wykonać bezpośrednio przez Data API z rzeczywistym JWT A/B uzyskanym przez izolowany fixture lokalnego Auth HTTP; nie wymaga to produktowego BFF. Kolumna BFF opisuje kontrolę wejścia serwerowego tam, gdzie ono istnieje; nie nakazuje proxy dla każdego CRUD. W F3 ponowić izolację przez faktycznie używane browser/server clients i wejścia aplikacji. Bezpośredni browser CRUD zawsze podlega RLS. SQL role tests są dodatkową diagnostyką, nie zamiennikiem. Tożsamość setupu admina wyłączona z fazy testowanej.

| ID | Operacja / atak | BFF — wymagana kontrola | PostgreSQL / Data API — oczekiwany wynik |
|---|---|---|---|
| RLS-01 | Anon lista/ID/CRUD/RPC; brak i fałszywy JWT | Brak aktywnej sesji → odmowa przed user query | Brak prywatnych wierszy/efektów; JWT nieważny odrzucony, `auth.uid()` bez usera nie daje dostępu |
| RLS-02 | A SELECT własna lista i ID, B lista i ID A, embedded relations/count | Sprawdzenie bieżącego usera; filtrowanie właściciela nie zastępuje RLS | A widzi swoje; B zero danych/metadanych A; count/join nie ujawnia A. Not-found/forbidden bez istnienia cudzego rekordu |
| RLS-03 | INSERT własny owner vs owner B/NULL; A podszywa się przez metadata | Payload owner ignorowany lub odrzucony; trusted owner ustalony serwerowo | `WITH CHECK` blokuje cudzy/NULL owner nawet po obejściu BFF; poprawny A zapisany raz |
| RLS-04 | UPDATE własny/cudzy ID; owner A→B; masowy update bez filtra | Walidacja DTO i uprawnienia do komendy | `USING` wycina cudze wiersze; `WITH CHECK` blokuje owner transfer, nie zmienia żadnego rekordu B |
| RLS-05 | DELETE własny/cudzy; masowy delete | Tylko autoryzowana techniczna akcja fixture, bez produktu delete | A usuwa własny fixture, B nie usuwa A; kontrola liczby/relacji. To nie rozstrzyga OPEN-005 |
| RLS-06 | Relacja A-item↔A-label, A↔B, B↔A, relacja z nieistniejącym ID | Weryfikacja obu końców; nie tylko parenta | Tylko A↔A dopuszczona; brak osierocenia, przejęcia lub ujawnienia cudzego końca przez odpowiedź/error |
| RLS-07 | View zwykły i nested relation; ID A jako B | Te same reguły co odczyt | Eksponowany view ma `security_invoker=true`; brak view bypassu. Niezabezpieczony view nie jest eksponowany |
| RLS-08 | RPC wywołane jako A/B/anon, także ze sfałszowanym owner param | Identity tylko z sesji; owner nie jest argumentem autoryzacyjnym | INVOKER, jawne EXECUTE grants, RLS na wszystkich zapisach; cudzy ID bez odczytu/zmian |
| RLS-09 | JWT A z user metadata owner=B, cookie A + request owner=B | Brak zaufania do metadanych/payloadu | `auth.uid()`=A; metadata nie przyznaje B. Fałszowany podpis/claim odrzucony przed SQL |
| RLS-10 | Brak polityk, brak grantów, wyłączona RLS w negatywnej kopii | Static check wykrywa konfigurację | Suite ma udowodnioną czułość: celowo podatna kopia daje FAIL. Nie wyłączać RLS w docelowym kandydacie |
| RLS-11 | Dwa przeplatane konta, równoległe requesty, pooling | Nowy user context per request; brak cache/session singleton | Żaden request B nie odziedziczy roli/claims A; role testowa nie jest ownerem tabel/superuserem/BYPASSRLS |
| RLS-12 | Inspekcja katalogu DB i bundle/env | service-role/DB admin nieobecne w user path i kliencie | Jawna lista tabel, views, functions, grants/default privileges, RLS i policy expressions oraz pg_graphql/search_path/Realtime publications; A/B/anon introspection/query/mutation GraphQL nie obchodzą izolacji ani nie ujawniają prywatnych schematów; test bez uprzywilejowanej roli |

Nie każdy brak dopasowania RLS daje HTTP 403: SELECT/UPDATE/DELETE mogą zwrócić pusty rezultat. PASS wymaga braku wycieku i efektów oraz oczekiwanego rezultatu kontraktu, nie jednego uniwersalnego statusu HTTP. Constraint errors mogą ujawniać istnienie rekordów — sprawdzić zachowanie BFF i surowej Data API i ograniczyć to syntetycznymi, nieenumerowalnymi relacjami.

### Bramka DB/RLS

Zakończenie wymaga całej macierzy RLS-01–12 dla każdego rodzaju syntetycznego obiektu i relacji, powtarzalnych migracji na dwóch świeżych targetach, testu upgrade, negatywnej kontroli czułości oraz backend/security review polityk i grants. Zero dostępu B→A, zero niejawnego admin bypassu; każdy FAIL blokuje zależny user CRUD. Przejście fixture PoC nie jest certyfikacją przyszłych tabel produktu — ich macierz musi zostać ponowiona po zatwierdzeniu OPEN-002.

## 6. RPC v2 — minimalna atomowa mutacja dopiero przy imporcie

**Rekomendacja planu:** implementacja i testy RPC w docelowym CSV/XLSX import slice po zatwierdzeniu jego kontraktu domenowego; bez dużego osobnego PR-F4 blokującego CRUD. Mały izolowany test jest opcją tylko po wskazaniu konkretnej nierozstrzygniętej luki technicznej i osobnym zleceniu. Wszystkie poniższe import-specific testy **PLANNED / NOT RUN**; wykonany mały RPC F2 nie jest dowodem tego kontraktu.

Jedna mała funkcja PostgreSQL wywołana raz przez `supabase.rpc()` (mutujący POST) zapisuje cały zaakceptowany wsad w jednej natywnej transakcji PostgREST/PostgreSQL. Preferowane `SECURITY INVOKER`, minimalne EXECUTE grants i RLS na tabelach uczestniczących, owner z zaufanego kontekstu. Bez privileged Drizzle runtime dla user CRUD, własnego koordynatora, silnika workflow, globalnego frameworka idempotencji, exactly-once jobs, kolejki lub trwałego stagingu wierszy.

Minimalny user-scoped klucz/rejestr retry tylko w zakresie potrzebnym do ADR-0005: powiązanie owner/key, rozpoznanie równoważnego payloadu i zapis wyniku w tej samej transakcji co efekty. Bez trwałej kopii pliku/wierszy. Ten sam key dla innego payloadu daje konflikt. Szczegóły równoważności, retencji i celowego ponownego importu pozostają OPEN-035/032; semantyka aktualizacji istniejących danych OPEN-010/024. Konkretny SQL/grants/rejestr powstaje w planie importu, bez narzucania tu schematu frameworka. INVOKER wymaga rzeczywistych minimalnych praw, a nie deklaracji braku DML przy równoczesnym jego użyciu; nieeksponowany rejestr i alternatywne transporty podlegają security review. Bez cichego przejścia do DEFINER.

| ID | Minimalny test v2 | Mierzalny oczekiwany rezultat |
|---|---|---|
| RPC-01 | Jeden zaakceptowany wsad wielu rekordów/relacji, jedno HTTP RPC. | Cały wsad i wynik retry w jednej transakcji; wyłącznie własne dane. |
| RPC-02 | Błąd walidacji/constraint/RLS po części zapisów. | Rollback całego wsadu oraz stanu idempotencji; brak raportowanego sukcesu i partial commit. |
| RPC-03 | Ten sam user/key i równoważny payload ponownie. | Ten sam wynik, jeden efekt; bez duplikatów. |
| RPC-04 | Ten sam user/key i inny payload; key identyczny u B. | Jawny konflikt payloadu, bez nowego efektu; klucz B izolowany od A. |
| RPC-05 | Utrata odpowiedzi po commit, retry identycznego requestu. | Jeden pełny zapis i odtworzony wynik; wyjątek sieciowy nie rozstrzyga rollbacku. |
| RPC-06 | Podstawowa współbieżność tego samego klucza, zgodny i sprzeczny payload. | Jeden efekt albo jawny konflikt; bez wiszącego stanu i duplikacji. Liczba requestów określona w fixture importu, bez obowiązkowego benchmarku 20 requestów z v1. |
| RPC-07 | Konkurujące aktualizacje istniejącej sprawy, jeśli import slice je obejmuje. | Jawny konflikt/rollback według zatwierdzonego kontraktu; brak cichego nadpisania i automatycznego merge. Przypadek warunkowy, bez blokady zwykłego create-only CRUD. |
| RPC-08 | Cudzy ID/owner i anon przez rzeczywiste RPC. | RLS oraz granty blokują cudze dane i rollback obejmuje cały wsad. |
| RPC-09 | EXECUTE/default privileges, INVOKER i uczestniczące tabele. | Brak EXECUTE dla PUBLIC/anon/zbędnych ról, tylko wymagany authenticated dostęp; bez BYPASSRLS/helper bypass. |
| RPC-10 | Niewłaściwa metoda i przerwanie/timeout requestu. | GET nie mutuje; po niepewnej odpowiedzi retry tego samego klucza ustala jeden pełny wynik, bez częściowych zapisów. |
| RPC-11 | Równoważność/zmiana payloadu według kontraktu importu. | Serwer rozpoznaje zmianę, nie ufa wyłącznie client hash; bez osobnego uniwersalnego frameworka kanonizacji. |
| RPC-12 | Bezpośrednia manipulacja rejestrem retry dostępnymi transportami, potem replay. | Brak możliwości obejścia ochrony retry lub izolacji A/B przez REST/view/helper/obecne GraphQL/Realtime. Granty i rzeczywista ekspozycja rejestru sprawdzone zgodnie z przyjętym minimalnym projektem. |

RPC-01–12 zachowują obszary v1; v2 usuwa obowiązek osobnego rozbudowanego eksperymentu i arbitralne liczby fixture. Nie przepisuje wcześniejszych wyników. SQL transakcja nie obejmuje Storage/zewnętrznej komunikacji; nie dodajemy tych efektów do importu. Wiele niezależnych Data API insertów nie zastępuje jednego atomic RPC. Awaria atomowości, retry lub RLS = STOP importu i IM-01, a nie powód blokowania niezależnego ręcznego CRUD.

## 7. Handoff i dowody

Przyszły PR-F3 działa w docelowej aplikacji po zatwierdzeniu tej dokumentacji i osobnym zleceniu implementacji. QA implementuje testy z powyższych kontraktów, backend unit testy; niezależni backend/security reviewerzy oceniają dokładnego kandydata. F4 odkłada się do importu, F5 do background, F6 sprawdza integrację/release bez przepisywania Auth. Każdy wynik podaje commit, target, wersje, rzeczywistą komendę/exit/liczbę testów, konfigurację i zredagowany dowód. `PASS / FAIL / NOT RUN / BLOCKED / SUPERSEDED / NOT APPLICABLE` są rozdzielone; status wykonania nie zatwierdza polityki produktu ani publicznego wydania.
