# PR-F3 — Supabase-native Auth Integration

**Autoryzacja:** zadanie PO z 2026-10-29 obejmuje implementację lokalną, przypięte zależności, testy, niezależny review i PR bez merge, cloud, produkcji i płatnych zasobów. **Stan roboczy: IMPLEMENTATION IN PROGRESS; wyniki poniżej nie są jeszcze PASS.**

## Podstawa, zakres i wpływ

Baza `ad8050f0e755fd8ee4a84feedccda56bdb3dd9ae`; PR #9 merge `57a7a5475183122526425a584c11b041d987d783` i PR #10 merge `ad8050f0e755fd8ee4a84feedccda56bdb3dd9ae` potwierdzone przez GitHub i ancestry. Czysty checkout `main`, fetch i merge ff-only, gałąź `feat/foundation-f3-supabase-auth`.

Źródła: ACCEPTED [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), APPROVED DEC-051, BR-030/NFR-001, FR/AC-AD-002 (prywatność). FR/AC-AD-003–006 jako pełne kontrakty pozostają PROPOSED; zatwierdzony podzakres SDK/signup/logout/reset/wiele sesji realizuje F3. UC/TC-034/035 tylko w pokrytym podzakresie. AUTH-01–12/14 i FQA-22–34/57 v2; AUTH-13/FQA-55 SUPERSEDED / NOT APPLICABLE. Pełny Dashboard, dane i pliki produktu nie są przedmiotem F3.

Wpływ obejmuje zaufanie browser/server, cookies, refresh, callbacki, prywatny cache, walidację i izolację Data API. Model RecruitmentCase, historia, import, wyszukiwanie, Storage, worker i eksport/delete pozostają poza zakresem. F2 syntetyczne migracje i historyczne wyniki pozostają odrębne; nie nadają pełnego PASS Account Management.

## Plan i odpowiedzialność

Metadane: model/reasoning autorów według dostępnego runtime, inaczej NOT EXPOSED. Orchestrator `/root`: analiza źródeł, kanoniczny origin/public env, dokumentacja i finalny artefakt. `backend_f3` backend-engineer: `src/modules/identity`, `src/proxy.ts`, `src/app/auth` i unit backend. `platform_f3` platform-engineer: przypięte zależności, osobny guarded F3 fixture, runner/HTTPS/CI i minimalna opcja portów istniejącego Docker guard. `qa_f3` qa-engineer uczestniczy od planowania i pisze `tests/integration/auth` i `tests/e2e/auth*.spec.ts`. Frontend-engineer otrzyma rozłączne strony `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/account` i komponenty Auth. Niezależne frontend/backend/security review przez `harness/scripts/review.py` na zamrożonym kandydacie, bez zapisu reviewera.

Kolejność: preflight → adaptery i lokalny fixture → UI i testy → regresja F1/F2/CI → niezależne review/poprawki → dokumentacja i PR. DoD: rzeczywiste Auth/Data API/Playwright i finalny build, testy cookies/cache/CSRF/XSS/PKCE/scopes/replay JWT, brak P0/P1, jawne luki. Brak Google credentials daje NOT RUN live, nie PASS.

## Kontrakt APP_ORIGIN przed użyciem w Auth

`normalizeAppOrigin` przyjmuje wyłącznie absolutny origin HTTPS; HTTP dozwolone tylko dla dokładnych loopback hostów `localhost`, `127.0.0.1`, `[::1]`, także w lokalnym production build F1. Odrzuca credentials, whitespace/control chars, backslash, wildcard, nie-ASCII zapis, ścieżki (także normalizowane dot segments), query i fragment. Opcjonalny końcowy `/`, wielkość liter hosta i domyślny port są normalizowane przez `URL.origin`. Pojedynczy jawny origin, bez wildcard/subdomain allowlisty, bez zaufania do Host/X-Forwarded-Host. Włączony Auth wymaga zgodności kanonicznego APP_ORIGIN i publicznego NEXT_PUBLIC_APP_ORIGIN. Produkcyjny zewnętrzny origin wymaga HTTPS; zgoda na lokalny HTTP nie autoryzuje publicznego deploymentu.

Publiczna konfiguracja to jawna allowlista build-time NEXT_PUBLIC_AUTH_ENABLED, NEXT_PUBLIC_APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED i NEXT_PUBLIC_AUTH_LOCAL_TEST. Key to publishable lub legacy anon, nigdy service-role. Syntetyczny admin key występuje wyłącznie w pamięci fixture QA. Flaga local test ogranicza widoczność i dostępność formularzy aplikacji do jawnego loopback fixture; nie jest kontrolą bezpośredniego Auth API ani polityką produkcyjną. Dostawca może przyjmować signup/recovery niezależnie od UI. Przed jakimkolwiek wdrożeniem trzeba uzgodnić OPEN-041/043/013 i zweryfikować konfigurację enable_signup, potwierdzeń, recovery i ochrony poświadczeń w samym Supabase. Samo ukrycie formularza lub odmowa endpointu aplikacji nie zamyka tej bramki.

## Otwarte decyzje

OPEN-013: dopuszczenie publiczne, ustawienia ochrony operacji i ewentualna docelowa CSP; OPEN-041: aktywacja/potwierdzenia/abuse przed publicznym signup; OPEN-042: TTL i ustawienia sesji; OPEN-043: recovery cross-device, sensitive reauth, skutki dla pozostałych sesji. Fixture służy pomiarowi, nie ich zamknięciu. Brak natychmiastowej revocation access JWT jest zatwierdzonym ograniczeniem ADR-0012. Parametry fixture nie są SLA ani wartościami produkcyjnymi.

## Weryfikacja i dowody

Bieżący kandydat review R1: `e8ac1dee9a1bb812571f96c4f8f1fee39f5321d3`. Regresja F2 `pnpm test:integration:f2`: **PASS 85/85**, exit 0, 249.8 s; faktyczne Data API A/B/anon, listy/ID/relacje, spoofing metadata/owner, zapis i RLS sensitivity. F1 boundary suite i canary: PASS; harness sync/check i 20 unittest na snapshotcie źródeł: PASS. Szczegółowy finalny manifest dowodów poniżej zostanie uzupełniony po poprawkach i ponowieniu.

Pierwszy pełny runner F3 na target `preflight-a` / projekt `jobs-crm-f3-preflight-a-4b10498e643b`: build PASS, SDK/Auth/Data API **12/12 PASS**, exit 0, 94.6 s. Playwright **3 PASS / 3 FAIL**, exit 1: błędne założenie testu historii po `location.replace` oraz rzeczywiste odrzucenie callback signup/recovery przez porównanie publicznego origin z wewnętrznym adresem listenera Next. Zachowano target i dowód niepowodzenia. Naprawa callback porównuje rzeczywisty Host jako ograniczenie do skonfigurowanego hosta, sprawdza supplied Origin, ignoruje forwarded headers; wszystkie Location nadal wyłącznie z konfiguracji. Deployment/proxy ma zachować publiczny kanoniczny Host. Regresję backend odtworzono jako red, po naprawie 14/14 unit PASS. Finalny rerun wymagany.

Live Google NOT RUN: brak autoryzowanych credentials; mock/negatywny PKCE nie daje live PASS. AUTH-13/FQA-55 N/A. Nie wykonywać merge ani F4.

## Preflight zależności i dokumentacji

Przypięte nowe zależności: `@supabase/supabase-js 2.118.0`, `@supabase/ssr 0.12.7`; peer SSR `supabase-js ^2.114.0`, silnik JS `node >=22`. Zachowane: Next `16.4.3`, React `19.3.1`, TypeScript `6.0.3`, Tailwind `4.3.3`, Base UI `1.9.0`, Lucide `1.63.0`, CLI Supabase `2.122.0`, pnpm `12.16.1`, wymagany Node `24.22.2`. Host shell początkowo miał Node `24.22.0`; do zależności i weryfikacji użyto pobranego z oficjalnych dystrybucji Node `24.22.2` po sprawdzeniu SHASUMS, z przypiętym executable w launcherach.

2026-10-29: Context7 resolve-library-id → query-docs dla `/supabase/ssr`, `/supabase/supabase-js`, `/vercel/next.js`; oficjalne [SSR releases](https://github.com/supabase/ssr/releases/tag/v0.12.7), [JS releases](https://github.com/supabase/supabase-js/releases/tag/v2.118.0), [SSR server Auth](https://supabase.com/docs/guides/auth/server-side), [password security](https://supabase.com/docs/guides/auth/password-security), [Next 16.4](https://nextjs.org/blog/next-16-4) i metadata registry. Uwzględniono zmianę SSR `setAll(cookies, headers)`: nagłówki cache przekazywane przy pierwszym zapisie, dlatego klient serwerowy jest per-request; cookies i cache headers muszą przetrwać redirect/error/proxy.

Przejrzano [changelog Supabase](https://supabase.com/changelog) (markdown index pobrany przez curl po odmowie formatu przez reader), [CBC TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [wymaganie TS5](https://supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0), zmiany ekspozycji Data API i self-hosted gateway. Nie wykonano aktualizacji pinów F2 ani cloud. TS6/Node24 spełniają wymagania SDK; zgodność aplikacji dowodzą dopiero typecheck/build/runtime, nie same metadane.

## Ocena XSS i CSP

F3 nie dodaje skryptów stron trzecich, HTML od dostawcy ani `dangerouslySetInnerHTML`; niezaufane wartości renderuje React, komunikaty błędów są stałe. SDK wymaga dostępu JavaScript do własnej sesji; nie jest to niezamierzone ujawnienie. Dowody XSS obejmują payloady wejściowe i redakcję sesji. Pełna nonce-based CSP wymaga osobnego dopracowania zgodności App Router/streaming/OAuth i polityki środowiska (OPEN-013); nie deklarujemy jej wdrożenia ani odporności na dowolne wykonanie skryptu. Ochrona cache, no-referrer i nosniff pozostaje obowiązkowa niezależnie od tej oceny.

## Granica komendy zmiany hasła

Niezależny frontend review R1 wykrył możliwość zmiany bieżącego konta w drugiej karcie pomiędzy weryfikacją a browser SDK updateUser. Poprawka wykorzystuje selektywny POST `/auth/password`: jeden request-scoped server client, obowiązkowy kanoniczny Origin/Host, JSON i oczekiwana tożsamość z początkowego renderu, porównana z getUser przed updateUser. Browser formularz unieważnia się po zmianie tożsamości/logout. To granica konkretnej wrażliwej komendy, bez brokera ani proxy całego Supabase; nie zastępuje ochrony bezpośredniego Auth API. Dostępność nadal wyłącznie local fixture ze wspieranym `secure_password_change`; docelowa reautoryzacja, świeżość i skutki recovery pozostają OPEN-043/042.

## Uruchamianie lokalne

Wymagane Node24.22.2, pnpm12.16.1 i lokalny Linux Docker przez Unix socket. `pnpm install --frozen-lockfile`, następnie `pnpm exec playwright install chromium`. `pnpm test:auth:f3` tworzy osobny syntetyczny target, sprawdza tożsamość/obrazy/porty, stosuje niezmienione migracje fixture F2, buduje docelowe src/app i uruchamia dwa procesy Next za lokalnym proxy HTTPS3143/3144, prawdziwy Auth/Data API i browser suite. Żadne dane produktu nie są tworzone. Po sukcesie świeży target jest sprzątany; po błędzie zachowany do inspekcji. Powtórne świadome użycie zweryfikowanego fixture: `F3_TARGET_ID=<id> pnpm test:auth:f3`; nie wykonuje ponownych migracji. Jawne sprzątanie: `node scripts/auth/cleanup.ts <id>`, z kontrolą własności przed mutacją. Nie używać bare CLI ani kierować skryptów na cloud.

Lokalne certyfikaty testowe są generowane w ignorowanym katalogu fixture, nie trafiają do Git. Browser test akceptuje ten certyfikat; to nie dowód zaufanego publicznego TLS ani zgodności Google live. Supabase API fixture jest loopback HTTP56521, mail sink HTTP56524, DB56522; test cookie Secure jest wykonywany po stronie aplikacji HTTPS. 3143/3144 współdzielą host/cookies (same-site), są dwoma procesami testu SSR; negatywne foreign Origin testuje się oddzielnie. Ustawienia signup, potwierdzenie e-mail, JWT60s/OTP60s, minimalne hasło12 i secure_password_change są wyłącznie parametrami fixture.

## Pomiary polityk dostawcy — fixture, nie decyzje produkcyjne

W R2 JWT60s pozostawał akceptowany przez Data API około89.3–89.9s po zastosowaniu scope, z pierwszym401 około31.08–31.09s po exp. To odpowiada udokumentowanej [30-sekundowej tolerancji zegara PostgREST](https://docs.postgrest.org/en/stable/references/auth.html#time-based-claims-validation). Nie deklarujemy odmowy dokładnie w exp ani natychmiastowej revocation; testy oddzielają cofnięcie refresh i walidację access JWT. Tokeny pozostają wyłącznie w pamięci QA, dowód zawiera tylko czasy/liczby/scope.

Istniejący potwierdzony e-mail zwrócił user_already_exists, nowy zwrócił user bez session i identityCount1. UI i API nie mają w tej konfiguracji gwarancji nieenumeracji signup. Reset w fixture cofnął refresh obu innych sesji A, B nadal mógł refresh. Zwykła świeża sesja mogła zmienić hasło mimo secure_password_change=true; to ustawienie nie wymaga ponownego podania poświadczeń przy każdej zmianie. Sesji starszej niż24h nie testowano (NOT RUN, bez manipulowania auth.* i bez czekania24h). Docelowe zasady OPEN-013/041/042/043 pozostają niezależnymi decyzjami.

Ryzyka resztkowe przed produkcją: cookie tossing z sibling subdomains (ocena __Host- nazewnictwa OPEN-013), allowlista providera/site_url i niewykorzystywany fixturecallback3144 wymagają przeglądu. Jeśli refresh w proxy chwilowo zawiedzie, a późniejsze getUser w read-only SSR zrotuje token bez możliwości zapisania cookie, możliwa jest utrata dostępności sesji; stosowany wzorzec SDK nie daje gwarancji trwałej rozproszonej synchronizacji. Ochrona tożsamości pozostaje fail-closed, bez własnych lease/CAS.

## Historyczny przebieg R2

Kandydat `5c6787eb509304329cc0d08bb28b8d1d4f94f059`: produkcyjny build PASS, integracja SDK13/13 PASS; HTTPS Playwright6 PASS/3 FAIL. [Zredagowany dowód awarii](evidence/f3/r2-failed-run.json) zachowuje rezultat. Callbacki i właściwe negatywne PKCE/CSRF działały; ujawniono podwójne window.location.replace po logout (SDK event oraz handler) i nieprecyzyjny locator alert obejmujący również announcer Next. Osobny rzeczywisty probe wykazał brak usuwania nieobsługiwanych fragmentów implicit z URL mimo poprawnej odmowy ich sesji. Poprawki R3: jedno przekierowanie, usunięcie nieoczekiwanego fragmentu przed SDK, jednoznaczne locatory i czekanie na zakończoną nawigację; wymagane ponowienie browser suite.

Kontrola logów obejmuje oba procesy, build, output testów i rzeczywiste browser assets oraz wygenerowane HTML/RSC. Sprawdza dokładne prywatne wartości/canary, JWT poza jawnym anon key, przypisania tokenów i znane syntetyczne hasła. Nie deklaruje uniwersalnego wykrycia dowolnego standalone opaque refresh string bez nazwy pola lub znanego markera. Testowe session tokens pozostają w pamięci, brak ich trwałego rejestru.
