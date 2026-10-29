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

Publiczna konfiguracja to jawna allowlista build-time NEXT_PUBLIC_AUTH_ENABLED, NEXT_PUBLIC_APP_ORIGIN, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED i NEXT_PUBLIC_AUTH_LOCAL_TEST. Key to publishable lub legacy anon, nigdy service-role. Syntetyczny admin key występuje wyłącznie w pamięci fixture QA. Flaga local test ogranicza nierozstrzygnięte signup/recovery do loopback; nie ustanawia polityki produkcyjnej.

## Otwarte decyzje

OPEN-013: dopuszczenie publiczne, ustawienia ochrony operacji i ewentualna docelowa CSP; OPEN-041: aktywacja/potwierdzenia/abuse przed publicznym signup; OPEN-042: TTL i ustawienia sesji; OPEN-043: recovery cross-device, sensitive reauth, skutki dla pozostałych sesji. Fixture służy pomiarowi, nie ich zamknięciu. Brak natychmiastowej revocation access JWT jest zatwierdzonym ograniczeniem ADR-0012. Parametry fixture nie są SLA ani wartościami produkcyjnymi.

## Weryfikacja i dowody

PENDING — do uzupełnienia rzeczywistymi komendami, targetami, wynikami i dokładnym kandydatem. Live Google NOT RUN: brak autoryzowanych credentials. Nie wykonywać merge ani F4.

## Preflight zależności i dokumentacji

Przypięte nowe zależności: `@supabase/supabase-js 2.118.0`, `@supabase/ssr 0.12.7`; peer SSR `supabase-js ^2.114.0`, silnik JS `node >=22`. Zachowane: Next `16.4.3`, React `19.3.1`, TypeScript `6.0.3`, Tailwind `4.3.3`, Base UI `1.9.0`, Lucide `1.63.0`, CLI Supabase `2.122.0`, pnpm `12.16.1`, wymagany Node `24.22.2`. Host shell początkowo miał Node `24.22.0`; do zależności i weryfikacji użyto pobranego z oficjalnych dystrybucji Node `24.22.2` po sprawdzeniu SHASUMS, z przypiętym executable w launcherach.

2026-10-29: Context7 resolve-library-id → query-docs dla `/supabase/ssr`, `/supabase/supabase-js`, `/vercel/next.js`; oficjalne [SSR releases](https://github.com/supabase/ssr/releases/tag/v0.12.7), [JS releases](https://github.com/supabase/supabase-js/releases/tag/v2.118.0), [SSR server Auth](https://supabase.com/docs/guides/auth/server-side), [password security](https://supabase.com/docs/guides/auth/password-security), [Next 16.4](https://nextjs.org/blog/next-16-4) i metadata registry. Uwzględniono zmianę SSR `setAll(cookies, headers)`: nagłówki cache przekazywane przy pierwszym zapisie, dlatego klient serwerowy jest per-request; cookies i cache headers muszą przetrwać redirect/error/proxy.

Przejrzano [changelog Supabase](https://supabase.com/changelog) (markdown index pobrany przez curl po odmowie formatu przez reader), [CBC TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [wymaganie TS5](https://supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0), zmiany ekspozycji Data API i self-hosted gateway. Nie wykonano aktualizacji pinów F2 ani cloud. TS6/Node24 spełniają wymagania SDK; zgodność aplikacji dowodzą dopiero typecheck/build/runtime, nie same metadane.

## Ocena XSS i CSP

F3 nie dodaje skryptów stron trzecich, HTML od dostawcy ani `dangerouslySetInnerHTML`; niezaufane wartości renderuje React, komunikaty błędów są stałe. SDK wymaga dostępu JavaScript do własnej sesji; nie jest to niezamierzone ujawnienie. Dowody XSS obejmują payloady wejściowe i redakcję sesji. Pełna nonce-based CSP wymaga osobnego dopracowania zgodności App Router/streaming/OAuth i polityki środowiska (OPEN-013); nie deklarujemy jej wdrożenia ani odporności na dowolne wykonanie skryptu. Ochrona cache, no-referrer i nosniff pozostaje obowiązkowa niezależnie od tej oceny.
