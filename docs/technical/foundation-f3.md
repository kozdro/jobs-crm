# PR-F3 — Supabase-native Auth Integration

**Stan (2026-10-29): implementacja lokalna dostarczona, z jawnymi ograniczeniami poniżej.** Osobne zadanie PO autoryzuje kod, przypięte zależności, syntetyczne testy, niezależny review i PR. Bez merge, cloud, produkcji, Google credentials, F4 ani modelu RecruitmentCase. Pełny wynik CI na finalnym SHA jest publikowany w Checks/raporcie PR; poniżej są wykonane dowody lokalne, nie prognoza CI.

Docelowe adaptery i strony znajdują się w `src/app`, bez aplikacji PoC do późniejszego przepisywania. Zaimplementowano login, testowy signup, przygotowanie Google PKCE, reset e-mail, jawne scopes logout i request-scoped kontekst użytkownika. Nie oznacza to pełnej akceptacji Account Management ani publicznego wydania.

## Podstawa i granice

- ACCEPTED [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), APPROVED DEC-051, BR-030/NFR-001, niezmiennik FR/AC-AD-002. FR/AC-AD-003–006 jako pełne kontrakty nadal PROPOSED; zlecenie realizuje zatwierdzony podzakres Auth. UC/TC-034/035 tylko w pokrytym podzakresie. [AUTH v2](foundation-pocs.md), [FQA v2](foundation-qa.md), [karta F3](foundation-plan.md).
- PR #9 i #10 potwierdzone MERGED przez GitHub i ancestry. Czysty `main`, fetch i merge `--ff-only`; baza `ad8050f0e755fd8ee4a84feedccda56bdb3dd9ae`, branch `feat/foundation-f3-supabase-auth`.
- Wpływ: browser/server trust, cookies/refresh, redirect, CSRF, prywatny cache i RLS. Bez zmian lifecycle, historii, importu, wyszukiwania, CRM schema, Storage produktu, workera, eksportu/delete. F1/F2 raporty, migracje i `supabase/config.toml` niezmienione; minimalny dodatkowy profil Docker guard zachowuje domyślne zachowanie F2.
- OPEN-013/041/042/043 nadal otwarte: dopuszczenie publiczne, activation/abuse, TTL, sensitive reauth, recovery cross-device i konsekwencje dla sesji. Parametry fixture nie są polityką produkcyjną.

## Wersje i preflight

| Element | Pin |
|---|---|
| Nowe SDK | `@supabase/supabase-js 2.118.0`, `@supabase/ssr 0.12.7` |
| Runtime | Node `24.22.2`, pnpm `12.16.1` |
| App | Next `16.4.3`, React `19.3.1`, TypeScript `6.0.3` |
| F1 UI | Tailwind `4.3.3`, Base UI `1.9.0`, Lucide `1.63.0`; istniejące shadcn Card/tokens |
| Testy | Vitest `5.0.5`, Playwright `1.64.1`; Chromium `156.0.8078.4` |
| Supabase Local | CLI `2.122.0`, Auth `v2.197.0`, PostgREST `16.5`, PostgreSQL `17.11` |

Registry: peer SSR `supabase-js ^2.114.0`, JS Node `>=22`; przypięte wersje zgodne. Host shell miał Node24.22.0; pobrano oficjalny Node24.22.2 i sprawdzono SHASUMS, następnie używano tego executable w launcherach. Nie zmieniano pinów F2. `pnpm install --frozen-lockfile --offline` PASS; `pnpm audit --prod --json` PASS, zero advisories.

Context7 resolve→query: `/supabase/ssr`, `/supabase/supabase-js`, `/vercel/next.js`; dodatkowo oficjalne [SSR release](https://github.com/supabase/ssr/releases/tag/v0.12.7), [JS release](https://github.com/supabase/supabase-js/releases/tag/v2.118.0), [SSR guide](https://supabase.com/docs/guides/auth/server-side), [password security](https://supabase.com/docs/guides/auth/password-security), changelog markdown index i registry. Przejrzano zmiany [TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [TS5](https://supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0), ekspozycji Data API i gateway. Zgodność runtime jest weryfikowana testami, nie samą deklaracją wersji.

## Przepływy i bezpieczeństwo

- Oficjalny browser client; świeży server client dla request/render. `getUser()` weryfikuje bieżącego użytkownika, do UI przekazywane wyłącznie ID/e-mail. `getSession()` nie jest dowodem autoryzacji; metadata i klientowy owner nie nadają uprawnień.
- SDK zarządza storage, standardowymi cookies, refresh i koordynacją kart. Proxy przekazuje odświeżone cookies request/response i SDK cache headers. Prywatne odpowiedzi oraz callback/error mają private/no-store, no-referrer, nosniff. Cookies na aplikacyjnym HTTPS: Secure, SameSite=Lax, path `/`, dostępne browser SDK; bez obietnicy HttpOnly-only.
- E-mail login, self-signup z potwierdzeniem w lokalnym mail sinku, reset e-mail i nowego hasła. Formularze używają etykiet, semantyki status/alert, pending/disabled, focus feedback i neutralnego F1. Nie renderują komunikatów dostawcy ani nieznanych parametrów jako HTML.
- `/auth/callback`: PKCE `exchangeCodeForSession`, dokładne wewnętrzne cele `/account` i `/reset-password`, odmowa złego kontekstu/verifier/replay, duplikatów i niebezpiecznego next. Location wyłącznie z konfiguracji. Next odtwarza URL przez wewnętrzny listener: kontrola rzeczywistego Host jest ograniczeniem do kanonicznego hosta, nigdy źródłem redirect authority. Supplied Origin musi być zgodny; forwarded headers są ignorowane. Proxy musi zachować publiczny kanoniczny Host.
- Browser adapter nie wykrywa sesji w URL (`detectSessionInUrl:false`); kody PKCE wymienia wyłącznie serwer. Fragmenty są usuwane przed SDK także na `/account`, z zachowaniem history.state i query. Rzeczywisty kod SSR0.12.7 respektuje tę opcję. Adapter jest obecnie przeznaczony dla Auth/account bez legalnych anchorów; przyszłe użycie `#sekcja` wymaga przeglądu tego kontraktu.
- `POST /auth/password` to selektywna granica wrażliwej komendy: local fixture, dokładny Host i obowiązkowy Origin, JSON, opcjonalny Sec-Fetch-Site same-origin, walidacja i porównanie oczekiwanego ID z getUser; updateUser używa tego samego request-scoped klienta. Zmiana konta w drugiej karcie nie zmienia celu zapisu. Błędy i wszystkie cookie/cache mutations są zachowane, bez provider payload. Bramka nie zastępuje ochrony bezpośredniego Auth API.
- Jawne `local/global/others`, bez selected-session registry. Ochrona konta ukrywa treść przed nawigacją/pagehide, odmawia spóźnionej walidacji i weryfikuje sesję po pageshow. Jeden guard nawigacji usuwa podwójny redirect po SDK SIGNED_OUT.
- Data API/RLS wykonuje zapytania z JWT użytkownika; service-role istnieje wyłącznie w pamięci provisionera syntetycznych kont QA. A/B listy, bezpośrednie ID, relacje i owner/metadata spoofing sprawdzone przez rzeczywisty transport. Release nie ma tras fixture ani endpointu eksportującego tokeny.

Nie ma brokera, handles, własnej kryptografii sesji, CAS/lease/generation, własnego Auth frameworka ani automatycznego proxy całego Supabase. Nie dodano skryptów stron trzecich ani dangerouslySetInnerHTML. Pełna nonce CSP pozostaje oceną OPEN-013; nie deklarujemy odporności na dowolny XSS.

## APP_ORIGIN i flagi

`normalizeAppOrigin` przyjmuje absolutny HTTPS origin; HTTP tylko dla literalnych loopback hostów localhost,127.0.0.1,[::1]. Odrzuca credentials, whitespace/control chars, backslash, wildcard, zapis nie-ASCII, ścieżki także normalizowane, query i fragment. Wielkość liter hosta/default port/opcjonalny `/` są normalizowane przez URL.origin. Nie przyjmuje alternatywnych numerycznych zapisów loopback HTTP. Jedyny dozwolony origin jest jawnie skonfigurowany; brak wildcard/subdomain allowlist i wyprowadzania origin z Host/X-Forwarded-Host. Włączony Auth wymaga zgodności APP_ORIGIN i NEXT_PUBLIC_APP_ORIGIN. Lokalny production build F1 może korzystać z loopback HTTP; nie autoryzuje to publicznego deploymentu.

Jawna publiczna allowlista: NEXT_PUBLIC_AUTH_ENABLED, NEXT_PUBLIC_APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED, NEXT_PUBLIC_AUTH_LOCAL_TEST. Klucz publishable albo legacy anon, nigdy service-role/sb_secret. Flaga local test kontroluje UI oraz lokalną komendę aplikacji, **nie bezpośredni Auth API**. Przed wdrożeniem OPEN-013/041/043 wymagają ustawień samego dostawcy: signup, confirmations, recovery i ochrony poświadczeń. UI gating nie daje gwarancji antyenumeracji.

## Uruchamianie

Wymagane przypięte Node/pnpm oraz lokalny Linux Docker przez Unix socket:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:auth:f3
```

Runner tworzy własny syntetyczny target z unikalnym project ID, sprawdza manifest/konfigurację, obrazy, porty i endpointy, migruje niezmienione fixture F2, buduje docelowe src/app i uruchamia dwa procesy Next z lokalnym HTTPS. Nie uruchamiać bare Supabase CLI ani kierować na cloud. F2 pozostaje osobnym profilem/portami.

F3: app HTTPS3143/3144, API HTTP56521, DB56522, mail sink HTTP56524, wyłącznie loopback. Dwa procesy app są same-site, współdzielą host/cookies; obcy Origin testowany osobno. Certyfikaty testowe generowane w ignorowanym stanie fixture, browser akceptuje ten certyfikat. To nie dowód publicznego TLS do Auth ani Google.

Fixture: JWT60s/OTP60s, e-mail confirmations, minimum hasła12, secure_password_change=true. Nie są to wartości produkcyjne. Świeży target po sukcesie jest sprzątany; po awarii zachowany do inspekcji. Jawne wznowienie zweryfikowanego, zmigrowanego fixture: `F3_TARGET_ID=<id> pnpm test:auth:f3`. Cleanup: `node scripts/auth/cleanup.ts <id>` sprawdza cały znaleziony zakres własności przed pierwszym usunięciem, obsługuje częściowy startup i powtórzenie, zachowuje receipt/awarie. Local target preflight-a i kontrolowany cleanup-probe zostały usunięte wyłącznie przez ten guard; dwukrotny cleanup sprawdzony.

## Wykonane dowody lokalne

Aplikacja końcowa jest identyczna bajtowo z `src` kandydata `c97cba96272ec975920209adb8ba0ca12dc05557`. Późniejsze zmiany dotyczą QA, safe observations i raportu. [Manifest źródeł](evidence/f3/source-manifest.json), [runtime target](evidence/f3/runtime-preflight.json), [lokalne kontrole](evidence/f3/local-checks.json), [metadane review](evidence/f3/reviews.json), [końcowy SDK](evidence/f3/final-sdk.json), [targetowany browser case10](evidence/f3/final-browser-case-10.json).

| Kontrola | Komenda / środowisko | Wynik |
|---|---|---|
| Unit aplikacji | pnpm test:unit / Node24.22.2 | PASS 73/73 Vitest |
| Unit narzędzi | ta sama komenda | PASS 46/46 node:test |
| Typecheck/lint/format | pnpm typecheck, lint, format:check | PASS, exit0 |
| F1 boundaries | pnpm test:boundaries | PASS 7 kontroli sensitivity i boundary |
| F1 canary | pnpm test:canary / disposable build | PASS assets, HTML/RSC, HTTP/DOM/logs i negatywny build |
| F1 Playwright | pnpm test:e2e:foundation | PASS 3/3, 1280/375px i constant public readiness |
| F2 rzeczywiste Data API | pnpm test:integration:f2 | PASS 85/85 TAP, 249.8s, A/B/anon/CRUD/ID/relacje i sensitivity |
| F3 app build | pnpm test:auth:f3 / production build | PASS, docelowe src/app |
| F3 końcowy SDK | F3_TARGET_ID=preflight-a node --test scripts/auth/integration.ts; output wyłącznie pamięć/skan | PASS 13/13 TAP (12 subcases+parent), także JWT wycofanej other session dla others |
| F3 browser | pełny R4 plus powtórzony poprawiony case10 | R4:9 PASS/1 FAIL; po poprawce target10:1/1 PASS. To dwa wyniki, nie fikcyjny pełny lokalny 10/10 rerun |
| F3 log/artifact scans | runner, oba procesy/build/test output/static+generated HTML/RSC | PASS kontroli redakcji wykonanych etapów; historyczne FAIL suite nie stają się PASS skanu |
| Harness | sync.py --check, check.py | PASS; to nie testy aplikacji |
| Harness regression | python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v / snapshot źródeł | PASS 20/20, 8.683s |
| Supply chain | frozen offline install; pnpm audit --prod --json | PASS; zero advisories produkcyjnych |

Pełny final-SHA CI ponawia wszystkie F1/F2/harness/F3, w tym pełny browser suite. `Foundation required` nadal końcową bramką z zależnościami checks/production/harness/f2/f3; nie jest to twierdzenie o konfiguracji branch protection.

## AUTH / FQA v2

| ID | Dowód i stan lokalny |
|---|---|
| AUTH-01 / FQA-22 | PASS e-mail/hasło, odmowa błędnych danych, generic errors, redakcja |
| AUTH-02 / FQA-24/25 | PASS wspólnego lokalnego PKCE, verifier/context/replay i bezpiecznego callback; Google start/live NOT RUN — brak credentials/config |
| AUTH-03 / FQA-23 | PASS cookies SDK, XSS, private/no-store, A/B SSR/RSC i rzeczywista ochrona back/cache; prywatny persisted restore handler NOT RUN (poniżej) |
| AUTH-04 / FQA-26 | PASS getUser, per-request clients, fail closed, metadata bez authority |
| AUTH-05 / FQA-27 | PASS SDK8-way refresh, tabs/SSR/dwa procesy, real expiry, kontrolowane opóźnienie i utrata sieci refresh, retry/re-login |
| AUTH-06 / FQA-28 | PASS rzeczywisty cookie-auth POST, obcy/brak/null Origin, JSON/Host, login CSRF z ważnym kodem atakującego, implicit fragments |
| AUTH-07 / FQA-29 | PASS malformed/expired/reload/offline/back; native persisted handler NOT RUN |
| AUTH-08 / FQA-30 | PASS local: klient, cofnięty refresh, pozostałe A/B nietknięte |
| AUTH-09 / FQA-31 | PASS others/global:3 sesje A+B, refresh revocation i UI; bieżący klient others zachowany |
| AUTH-10 / FQA-32 | PASS lokalny mail/recovery/new password/expired/replayed/wrong-context; konto A→B nie zmienia hasła B; docelowa reauth/cross-device policy OPEN |
| AUTH-11 / FQA-33 | PASS JWT wycofanych sesji przed/po rzeczywistym oknie weryfikatora; local/global próbka current, others próbka odwołanej other; osobne current-client fields |
| AUTH-12 / FQA-34 | PASS RLS A/B/anon, listy/ID/relacje, SSR/RSC cache i zaufana tożsamość |
| AUTH-14 / FQA-57 | PASS syntetyczny signup, confirmation i izolacja nowego konta; istniejący vs nowy e-mail zmierzony, nie gwarantowana antyenumeracja |
| AUTH-13 / FQA-55 | SUPERSEDED / NOT APPLICABLE; nigdy warunek PASS |

Google live/start, stare 24h sesje i prywatny bfcache restore pozostają odrębnymi NOT RUN. Pełne FR/AC-AD i UC/TC-034/035 nie uzyskują pełnego PASS dla nieistniejących modułów produktu.

## Pomiary i ograniczenia

- JWT60s: wycofane refresh sessions miały nadal działający access JWT przez około90s po scope. Pierwsze401 dla końcowych próbek: exp+31.34–31.37s, zgodnie z udokumentowaną [30-sekundową tolerancją zegara PostgREST](https://docs.postgrest.org/en/stable/references/auth.html#time-based-claims-validation), polling0.5s. Nie obiecujemy odmowy dokładnie w exp ani natychmiastowej revocation. Tokeny tylko w pamięci; dowód ma scope/czasy/booleans.
- Nowy e-mail: user bez session, identityCount1; istniejący potwierdzony: user_already_exists. UI również obserwuje różne status/alert; brak gwarancji nieenumeracji w tej konfiguracji. OPEN-041/013 pozostają.
- Reset w fixture cofnął refresh obu innych sesji A; B pozostał uprawniony. Świeża zwykła sesja mogła zmienić hasło mimo secure_password_change=true. Sesji starszej24h nie testowano: NOT RUN, bez manipulowania auth.*. To pomiar do OPEN-042/043, nie zatwierdzenie produkcyjnej freshness policy.
- Chromium156 wykluczył prywatną stronę z bfcache przez no-store/JS requests/cookie changes. Test wymaga pozytywnego powodu CDP no-store, ponownego zweryfikowania właściciela po back oraz braku danych/401 po logout. Playwright goBack może zwrócić null; wtedy nagłówki sprawdza jawny rzeczywisty SSR request, co jest zapisane w backResponseSource. **Handler pageshow.persisted prywatnej strony: NOT RUN — przeglądarka nie dopuściła restore.** Nie zmieniano headers/cookies/TTL i nie wysyłano fałszywych events. [Diagnostyka](evidence/f3/bfcache-diagnosis.json) zachowuje również jedną nieskuteczną natywną próbę flagi browser; finalny test nie wymusza tej flagi.
- Awaria refresh jest kontrolowaną utratą sieci i odpowiedzią boundary Auth; nie przeprowadzono kill/restart całej usługi Auth podczas SSR. Live Google i pełny publiczny TLS dostawcy NOT RUN.
- Skan przechwytuje output tylko w ograniczonej pamięci (8MiB), wymaga dodatnich liczników, zerowych failures/skips i właściwych strict observations; sprawdza exact private keys/canary, JWT poza public anon, token assignments i znane hasła. Nie obiecuje uniwersalnego wykrywania standalone opaque refresh string. Wymóg pełnej suite wynika dodatkowo z QA/source review i manifestu; sam dodatni count nie certyfikuje kompletności testów.
- Przed produkcją: OPEN-013 — CSP, sibling-subdomain cookie tossing/__Host- i konfiguracja provider/site_url; nieużywany fixture redirect3144 pozostaje jawny (aplikacja odrzuca niekanoniczny Host). Jeśli proxy refresh chwilowo zawiedzie, a read-only SSR później odświeży sesję bez możliwości zapisu cookie, możliwa jest utrata dostępności sesji; brak własnej rozproszonej gwarancji. Prywatna treść pozostaje ukryta przy braku walidacji; po logout tekst może być przez chwilę w pamięci karty do nawigacji, bez wyświetlenia.

## Delegacja, review i historia

Skills analyze-requirement/plan-slice/implement-slice/verify-acceptance/review-change załadowane i zastosowane; Supabase/Context7 użyte do preflight. Model/reasoning autorów NOT EXPOSED; role i sesje root, backend_f3, frontend_f3, platform_f3, qa_f3. Ownership rozłączny: backend identity/proxy/handlers/unit; frontend strony/components/unit; platform fixture/CI/pins; QA integration/E2E od planowania; root env/origin/dokumentacja/integracja.

Review przez niezmieniony `harness/scripts/review.py`: Codex osobny read-only parent, approval never, apps/plugins/MCP wyłączone, dokładnie jeden generic subagent z kanoniczną rolą; Claude tylko Read/Grep/Glob. Rzeczywiste session_meta/turn_context potwierdziły parent-child lineage i sandbox. CLI runtime Codex reviewer gpt-6.1-sol; Claude claude-opus-5-5; reasoning NOT EXPOSED. Reviewerzy nie pisali kodu ani nie uruchamiali testów. Wszystkie ukończone wrappery miały exit0, changedFiles=[] i before=after.

| Zakres/kandydat | Wynik |
|---|---|
| R1 e8ac1de | Frontend/backend FAIL P2; security static PASS z4P2; naprawione w R2 |
| R2 5c6787e | Frontend/backend/security static PASS; P2 zamknięte |
| R3 350331f | Frontend/backend/security static PASS; bez P0/P1, jawne P3 |
| R4 c97cba9 | Backend/security static PASS; account-fragment P3 zamknięte; potwierdzono uczciwy podział cache/privacy vs niewykonany restore |
| Końcowy test delta 33009ea | Backend static PASS, brak P0–P3; sampling wycofanej other poprawny |

Strony i komponenty UI są niezmienione od R3; finalny src od R4. Późniejsze QA/report delty mają niezależny końcowy review w raporcie PR. Pozostałe P3 nie blokują lokalnego zakresu: przyszłe legalne anchory adaptera i kompletność suite ponad same counts (opisane powyżej). Decyzje produkcyjne pozostają OPEN.

Nie nadpisano awarii wynikiem PASS: R1 browser3PASS/3FAIL (callback internal port i history assumption), [R2 6PASS/3FAIL](evidence/f3/r2-failed-run.json) (double navigation/locator), [R3 9PASS/1FAIL](evidence/f3/r3-failed-run.json) (wymuszona eligibility), [R4 9PASS/1FAIL](evidence/f3/r4-failed-run.json) (nullable response). Poprawki i wykonane ponowienia są rozdzielone w dowodach; review nie zastępuje runtime.

## Następny biznesowy slice

PROPOSED: mały ręczny RecruitmentCase/Quick Capture z odczytem wyłącznie własnych danych, po zatwierdzeniu modelu/OPEN-002 i DATA-01 oraz osobnym zleceniu. Bez uruchamiania F4/RPC importu, workera i Storage produktu w F3. Publiczne wydanie nadal wymaga właściwych polityk kont i pozostałych release gates.
