# Foundation — scaffold Next.js, typy i granica BFF

**Stan:** DRAFT / PROPOSED plan wykonania, 2026-10-28. **Testy aplikacji:** wszystkie `PLANNED / NOT RUN`. Ten dokument nie autoryzuje instalacji ani inicjalizacji. Zakres etapów i osobna zgoda PO: [Foundation Plan](foundation-plan.md). Podstawa: [ADR-0001/0010 ACCEPTED](../decisions/adr/README.md), TD1.31/1.32/1.35–1.38 i [architektura](architecture.md). Scaffold nie realizuje biznesowych FR/AC; NFR-001–003 pozostają obowiązującymi ograniczeniami, otwarte szczegóły NFR-004–011 nie otrzymują domyślnych wartości.

## 1. Kompatybilny zestaw kandydatów

Weryfikacja **2026-10-28**: Context7 resolve→query dla Next.js i typescript-eslint; następnie oficjalne manifesty wydań w npm. Registry pokazuje opublikowane wydania i deklaracje kompatybilności, nie udany install/build. Piny poniżej są propozycją dla PR-F1; przed instalacją agent ponawia preflight security advisories, engines i peerDependencies. Nie instalowano pakietów ani nie generowano lockfile.

| Pakiet / runtime | Dokładny kandydat | Źródło i uzasadnienie |
|---|---|---|
| Node.js / pnpm | 24.22.2 LTS / 12.16.1 | Źródła i wybór linii LTS w [planie głównym](foundation-plan.md). `packageManager` i pin Node muszą odpowiadać CI/local. |
| next / eslint-config-next | 16.4.3 / 16.4.3 | [Next manifest](https://registry.npmjs.org/next/16.4.3), [config manifest](https://registry.npmjs.org/eslint-config-next/16.4.3); Next Node≥20.9; config ESLint≥9. |
| react / react-dom | 19.3.1 / 19.3.1 | [React](https://registry.npmjs.org/react/19.3.1), [DOM](https://registry.npmjs.org/react-dom/19.3.1); zgodna para i peer Next `^19`. |
| typescript | **6.0.3**, nie automatyczne latest | [Manifest TS6](https://registry.npmjs.org/typescript/6.0.3). Parser typescript-eslint8.72.1 deklaruje `>=4.8.4 <6.1.0`; latest TS7.0.2 poza zakresem. Nie stosować obejścia ukrywającego ostrzeżenie parsera ani dwóch kompilatorów w scaffold. |
| eslint | **9.39.5**, nie automatyczne latest | [Manifest ESLint9](https://registry.npmjs.org/eslint/9.39.5). Najnowszy ESLint10.13.0 nie mieści się w peerach części zależności eslint-config-next: [react7.37.5](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [import2.32.0](https://registry.npmjs.org/eslint-plugin-import/2.32.0), [jsx-a11y6.10.2](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2). |
| typescript-eslint | 8.72.1 w rozwiązywanym grafie config Next | [Manifest](https://registry.npmjs.org/typescript-eslint/8.72.1), [parser](https://registry.npmjs.org/@typescript-eslint/parser/8.72.1), [oficjalna polityka wersji](https://typescript-eslint.io/users/dependency-versions/). Nie dodawać osobnego frameworka lint; lockfile musi utrwalić wspierane rozwiązanie transitive deps. |
| prettier / eslint-config-prettier | 3.9.10 / 10.1.8 | [Formatter](https://registry.npmjs.org/prettier/3.9.10), [config](https://registry.npmjs.org/eslint-config-prettier/10.1.8); config wyłącza konfliktujące reguły, nie uruchamia Prettier jako reguły ESLint. |
| @types/node | 24.19.2 | [Manifest](https://registry.npmjs.org/@types/node/24.19.2); typy linii24, a nie latest26. Numer patch typów nie musi odpowiadać patch runtime. |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | [React types](https://registry.npmjs.org/@types/react/19.3.0), [DOM types](https://registry.npmjs.org/@types/react-dom/19.3.0); peer DOM types `^19.3.0`. |
| zod / server-only | 4.6.7 / 0.0.1 | [Zod manifest](https://registry.npmjs.org/zod/4.6.7), [marker manifest](https://registry.npmjs.org/server-only/0.0.1). Małe zależności wykonawcze **PROPOSED** do zatwierdzenia wraz z F1, nie dodane tym zadaniem. Zod tylko techniczne env/input; żadnych pól domeny. |
| vitest / @playwright/test | 5.0.5 / 1.64.1 | [Vitest](https://registry.npmjs.org/vitest/5.0.5), [Playwright](https://registry.npmjs.org/@playwright/test/1.64.1); Node24 mieści się w engines. Bez jsdom, jeśli testowane są pure env/parser i realny browser smoke. |

**Konkretny preflight F1:** upewnić się, że pobierane stabilne wydania odpowiadają pinom, parser akceptuje TS6.0.3, wszystkie peer dependencies rozwiązanego grafu mieszczą się w zakresach oraz brak wymagającego zmiany pinu komunikatu bezpieczeństwa. Nie używać `--force`/wyłączania kontroli peerów do maskowania konfliktu. Istotna zmiana stacku wraca do PO; zgodna poprawka pinu jest jawnie opisana i ponownie sprawdzona w PR. Transitive dependencies są utrwalone lockfile; bez automatycznych aktualizacji major i bez `latest` w manifeście.

## 2. Minimalny kontrakt PR-F1

Scaffold powstaje ręcznie lub przez kontrolowane przeniesienie minimalnych plików, po autoryzacji PO. W następnym zadaniu nie uruchamiać generatora z domyślnym nadpisywaniem `AGENTS.md`/harnessu. Nie wybierać Tailwind, UI kit, React Compiler, Cache Components ani dodatkowej biblioteki klienta jako skutku ubocznego generatora. Brak tych elementów w scaffold nie rozstrzyga późniejszych decyzji UX/stylowania. Jedna techniczna strona nie jest projektem biznesowego ekranu.

| Właściciel zapisu F1 | Pliki / komponenty do utworzenia lub doprecyzowania |
|---|---|
| Platform-engineer | `package.json`, `pnpm-lock.yaml`, `.node-version`, `pnpm-workspace.yaml` z `saveExact: true`, `strictPeerDependencies: true`, `pmOnFail: error` oraz polityką build scripts, `.github/workflows/app-ci.yml`, uzupełnienie `.gitignore` o artefakty Next/testów, `.env.example` bez sekretów i dokumentacja uruchomienia. CI PR ma jawne `permissions: contents: read`, bez write/OIDC/deploy credentials. Polityka dependency lifecycle scripts: `strictDepBuilds: true` i jawna wąska `allowBuilds` w `pnpm-workspace.yaml`, tylko przejrzane zależności/wersje; nieznany skrypt zatrzymuje install. Aktualne pnpm11/12 zastąpiło `onlyBuiltDependencies` przez `allowBuilds`, a ustawienia inne niż registry/auth przeniosło z `.npmrc` do YAML. Ten plik konfiguracji nie wprowadza monorepo ani dodatkowych pakietów. Źródła sprawdzone Context7 2026-10-28: [migracja pnpm](https://github.com/pnpm/pnpm.io/blob/main/docs/migration.md), [build settings](https://github.com/pnpm/pnpm.io/blob/main/docs/settings/build.md). Dokładna komenda bootstrapu pnpm sprawdzana przed użyciem; nie zakładać dostępnego Corepack. |
| Frontend-engineer | `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/health/ready/route.ts`, `src/shared/validation/env.ts`, `src/shared/server/env.ts` i własne unit testy parsera. |
| QA-engineer | `vitest.config.ts`, `playwright.config.ts`, `tests/e2e/foundation-smoke.spec.ts`, testy negatywnej granicy klient/serwer i wycieku syntetycznego canary. QA nie nadpisuje unit testów frontend-engineer; wspólny katalog ma jawne właścicielstwo konkretnych plików przed zapisem. |

`src/app/layout.tsx` zawiera poprawne html/body i język polski; strona zawiera semantyczne `main` i tytuł `h1`, bez logowania, formularza sprawy ani produktów demonstracyjnych. `/health/ready` zwraca dokładnie HTTP200 z niesekretnym stałym statusem; brak redirectu, informacji o env, wersji kluczy czy konfiguracji DB. W F1 nie ma zależności od Auth/DB, więc ten endpoint dowodzi tylko gotowości scaffold. Rozszerzenie go o zależności następuje osobnym kontraktem, bez udawania gotowości całej infrastruktury.

`tsconfig`: `strict: true`, `noEmit: true`, JSX/Next plugin i bundler resolution zgodne z dokumentacją przypiętego Next; alias `@/*` do `src/*`. Nie ustawiać `ignoreBuildErrors` ani luźniejszego configu produkcyjnego. Uwzględnić generowane `next-env.d.ts` i `.next/types/**/*.ts` zgodnie z rzeczywistym `next typegen`; generowane pliki/artefakty nie są źródłem domeny. Typecheck uruchomić w świeżym checkout bez `.next` — nie polegać na poprzednim buildzie. [Dokumentacja CLI/typegen](https://nextjs.org/docs/app/api-reference/cli/next), [TypeScript](https://nextjs.org/docs/app/api-reference/config/typescript).

ESLint flat config używa odpowiednich eksportów `eslint-config-next/core-web-vitals` i `eslint-config-next/typescript`, z config Prettier na końcu; brak `next lint`, które usunięto w Next16. Lint działa niezależnie od `next build`. Reguły granic obejmują rzeczywiste ścieżki scaffold; dokładamy domain→framework i między modułami wraz z powstawaniem kodu, nie pusty diagram zapewniający pozorny gate. Format-check stosuje się do listy nowych plików aplikacji/config/testów, bez masowego przeformatowania historycznej dokumentacji i harnessu.

Env: proponowane nazwy `APP_ENV` i `APP_ORIGIN` zgodne z [platformą](foundation-platform.md); parser techniczny jest czystą funkcją w `shared/validation`, adapter odczytu `process.env` w `shared/server` ma marker `server-only`. Tryb scaffold nie wymaga `SUPABASE_*`, `DATABASE_URL` ani OAuth secrets; wymagane wartości dotyczą dopiero aktywowanego, osobno autoryzowanego etapu. Nie ustalać produkcyjnych czasów sesji, limitów ani polityk przez default env. `next.config` musi być ładowalny przy `next typegen`/build bez usług; odczyt runtime sekretów nie może być niejawnie wymuszony podczas analizy config. Błędy parsera wskazują nazwę niepoprawnej zmiennej bez jej wartości. Test missing/invalid env dotyczy rzeczywiście zadeklarowanego kontraktu, nie wymyślonych credentials.

## 3. Planowane skrypty i walidacja

Poniższe skrypty jeszcze nie istnieją; wszystkie wyniki **PLANNED / NOT RUN**. Ostateczne wykonanie wymaga instalacji dopuszczonej osobnym zadaniem.

| Przyszły skrypt / procedura | Kontrakt |
|---|---|
| `pnpm typecheck` → `next typegen` i następnie `tsc --noEmit` | Typy tras generowane przed kompilatorem w clean checkout; strict errors blokują proces. |
| `pnpm lint` → `eslint . --max-warnings=0` z jawnymi ignores | Wykrywa błędne importy/reguły; zero warnings nie osiągane przez wyłączenie parser compatibility checks. |
| `pnpm format:check` → `prettier --check` listy aplikacji/config/testów | Oddzielna bramka formatowania zmienianego zakresu, bez rewrite repo. |
| `pnpm test:unit` → `vitest run` | Rzeczywiste unit testy konfiguracji: valid/missing/invalid env i redakcja sekretu; brak wykrytych testów jest FAIL. Pure parser nie wymaga importowania serwerowego adaptera w środowisku browser. |
| `pnpm build` → `next build`; `pnpm start` → `next start` | Build produkcyjny ze strict checking; start osobnym procesem, obsługa zamknięcia w test runner. |
| `pnpm test:e2e:foundation` → `playwright test --project=foundation` | Projekt foundation uruchamia produkcyjny build/start przez webServer, bez reuse dev server w CI. HTTP200/DOM strony, poprawny język, health200, brak błędu konsoli. |
| Kontrola negatywna server-only | W disposable snapshot QA dodaje testowy komponent kliencki importujący server adapter; build ma odmówić. Normalny kandydat pozostaje bez celowo uszkodzonego importu. |
| Syntetyczny sekret-canary | Wstrzyknięty wyłącznie testowo server env; zero wystąpień w publicznych JS/HTML/RSC, konsoli i zapisanych artefaktach. Nie używać prawdziwego credential. |

CI: frozen install → typegen/typecheck, lint, format, unit → production build → Playwright foundation. Czyste artefakty i przypięta wersja przeglądarki pasują do runnera. Kontrole harnessu zachowane jako osobna bramka. Pełna macierz poziomu/środowiska/właściciela/PASS-FAIL/etapu: [foundation-qa](foundation-qa.md).

## 4. Integracja z BFF w późniejszym PoC

Moduły `domain/application/infrastructure` i wspólne DTO są kierunkiem APPROVED, lecz szczegóły fizyczne pozostają PROPOSED. F1 nie tworzy pustych encji domenowych. `domain` nie importuje Next/React/Drizzle/Supabase; application zależy od jawnych portów; infrastructure implementuje porty. Publiczne kontrakty modułu nie eksportują jego repozytoriów SQL ani tokenów.

Server Components czytają przez serwerową usługę aplikacyjną; nie trzeba robić HTTP loopback do własnego Route Handler. Server Actions i Route Handlers traktujemy jako osiągalne wejścia: przy każdym uwierzytelnienie, autoryzacja właściciela, walidacja runtime i wymagane CSRF. Żaden layout/proxy sam nie zapewnia ochrony zapisu. BFF przekazuje user JWT do Data API, nie service-role. [Oficjalne wskazówki data security](https://nextjs.org/docs/app/guides/data-security) i [authentication](https://nextjs.org/docs/app/guides/authentication).

Client Components otrzymują minimalne DTO, nigdy obiekt sesji, JWT, refresh token, prywatne env czy SDK serwerowe. Bez browser Auth clienta, localStorage sesji ani przekazywania bearer do JS jako ułatwienia. Auth/refresh/OAuth i obsługa cookie powstają dopiero w [PoC Auth](foundation-pocs.md); użycie `@supabase/ssr` nie jest samo w sobie dowodem HttpOnly. Nie umieszczać prywatnych odpowiedzi ani `Set-Cookie` we współdzielonym cache; test A/B ma objąć także HTML/RSC/cache, nie tylko JSON API.

## 5. DoD i warunki zatrzymania

F1 jest gotowy, kiedy zatwierdzony zestaw przechodzi fresh install, wszystkie jego kontrole QA mają dowody na dokładnym SHA, nie wprowadzono usług/danych/kodu domeny, nie zmieniono instrukcji harnessu, oraz niezależny frontend/backend review nie pozostawia P0/P1. Security finding o env lub granicy serwera wymaga oceny i poprawy; sukces scaffold nie dowodzi bezpieczeństwa przyszłych sesji.

STOP zakresu zależnego: nierozwiązany konflikt wersji, konieczność omijania peer checks/strict TS, generator nadpisujący AGENTS, potrzeba produktu lub niezatwierdzonej polityki w env. Aktualizacje pinów lub zmiana configu po review wymagają ponownej dotkniętej weryfikacji. Poza zakresem F1: Supabase CLI/Docker/DB/migracje, sesje/cookies, formularze kont i spraw, provisioning, worker, biblioteki importu i design system.
