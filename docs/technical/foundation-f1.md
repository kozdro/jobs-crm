# Foundation F1 — scaffold, uruchamianie i dowody

**Data:** 2026-10-29. **Zakres:** PR-F1, bez merge i provisioningu. **Status weryfikacji:** w toku; wyniki poniżej aktualizowane wyłącznie po wykonaniu.

## Podstawa, autoryzacja i wpływ

PO w zadaniu „Jobs CRM — PR-F1 Application Scaffold & CI” autoryzował inicjalizację aplikacji, lokalne zależności, implementację, testy, niezależne review oraz commit/push/PR. Zadanie rozszerzyło F1 o Tailwind v4, shadcn/ui z Base UI i Lucide React; zapis decyzji: [ADR-0011](../decisions/adr/0011-frontend-foundation.md). Nie zatwierdza brandingu lub finalnego UX.

Źródła: [plan](foundation-plan.md), [frontend](foundation-frontend.md), [platforma](foundation-platform.md), [QA FQA-01–09](foundation-qa.md), ADR-0001/0010 ACCEPTED, NFR-001–003 APPROVED. FR/AC/BR/DEC/UC biznesowe: nie dotyczy, scaffold nie realizuje funkcji produktu. OPEN-012 jest częściowo rozstrzygnięty technologicznie; OPEN-015/017/033 pozostają otwarte dla brandingu i docelowego UI/QA. OPEN-002/013/042 nie blokują F1, ich zależny zakres nie jest implementowany.

Wpływ obejmuje narzędzia, build/CI, publiczną stronę techniczną, env i granicę client/server. Nie powstają dane ani wydarzenia historyczne, import, wyszukiwanie, Auth, polityki sesji, migracje, Supabase, worker ani zasoby Render. Health oznacza jedynie gotowość scaffold.

PR #4 (Harness) i #5 (Foundation Plan) scalone do main i zweryfikowane przed startem. Baza: `a00f865e4ffe2faf7cfc5f6bcd3825b43f706d44`; gałąź `feat/foundation-f1-scaffold`. Drzewo na starcie czyste, synchronizacja fast-forward only.

## Plan i własność plików

Model/reasoning: dziedziczone z runtime, dokładne ustawienia NOT EXPOSED. Główna sesja `/root` jest orchestrator/autorem dokumentacji; delegacja bez dalszego poziomu.

| Rola / sesja | Wyłączna własność zapisu / DoD |
|---|---|
| platform-engineer `/root/platform_engineer` | manifest, lockfile, runtime/manager, pnpm policy, env example, ignores, GitHub Actions; preflight, frozen install i jawne kroki CI |
| frontend-engineer `/root/frontend_engineer` | `src/`, frontend configs, komponenty i `tests/unit/env.test.ts`; strict TypeScript, Tailwind/shadcn/Base UI/Lucide, parser env, granica serwera i health |
| qa-engineer `/root/qa_engineer` | Vitest/Playwright config, `tests/e2e`, `scripts/test-*.mjs`; plan przed implementacją, rzeczywiste smoke i izolowane testy negatywne |
| orchestrator `/root` | dokumentacja, integracja dowodów, Git i PR, izolowana próba czerwonego CI |
| niezależni frontend/backend/security reviewerzy | wyłącznie odczyt przez `harness/scripts/review.py`; zero poprawek ocenianych plików |

Kroki: preflight wersji → manifest/scaffold → unit i testy negatywne → production build/start/smoke/canary → niezależny review → poprawki i ponowne testy → commit/push/CI exact SHA → PR bez merge. QA uczestniczyło w planowaniu FQA-01–09 przed pisaniem testów.

## Przypięte wersje

| Element | Wersja |
|---|---|
| Node.js / pnpm | 24.22.2 / 12.16.1 |
| Next.js / eslint-config-next | 16.4.3 / 16.4.3 |
| React / React DOM | 19.3.1 / 19.3.1 |
| TypeScript / ESLint | 6.0.3 / 9.39.5 |
| Prettier / eslint-config-prettier | 3.9.10 / 10.1.8 |
| Tailwind / @tailwindcss/postcss / PostCSS | 4.3.3 / 4.3.3 / 8.5.32 |
| shadcn CLI / Base UI / Lucide React | 4.23.0 / 1.9.0 / 1.63.0 |
| Zod / server-only | 4.6.7 / 0.0.1 |
| Vitest / Playwright | 5.0.5 / 1.64.1 |
| clsx / tailwind-merge | 2.1.1 / 3.7.0 |

Piny Foundation Plan zachowane. Nowe zależności wynikają z rozszerzenia PO: CLI dystrybuuje kod komponentów, Base UI daje primitives, Lucide ikony; clsx/tailwind-merge obsługują utility `cn`. Rejestry wydań, engines/peers, lifecycle scripts i advisories sprawdzane przed instalacją; lockfile jest jedyny. pnpm zachowuje politykę minimalnego wieku wydań (`minimumReleaseAgeStrict`); wybrano Lucide 1.63.0 zamiast świeżego 1.64.0 wymagającego wyjątku. `unrs-resolver@1.12.2` ma jawnie odmówiony fallback postinstall, ponieważ natywne pakiety są przypiętymi optional dependencies; nie przyznano blanket allow dla scripts.

Sprawdzono [oficjalny security update Next z 14 października](https://nextjs.org/blog/nextjs-security-update-october-14-2026) (poprawka 16.4.1; używamy 16.4.3) i [React RSC advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) (poprawka 19.3.1). Audit całego grafu zgłosił jeden LOW w dev-only `deepmerge@4.3.1` przez shadcn CLI, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), bez opublikowanej poprawki; status runtime i ocena niezależnego security review poniżej.

## Uruchamianie

Wymagane dokładne Node i pnpm z tabeli (Node także w `.node-version`, pnpm w `packageManager`). Nie jest potrzebny Corepack ani konto chmurowe. Po przygotowaniu tych wersji:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Scaffold działa bez pliku env i bez usług. `.env.example` opisuje wyłącznie techniczne APP_ENV/APP_ORIGIN; nie dodawaj Supabase/Auth credentials w F1. Sekrety i `.env.local` pozostają poza Git. Jawny tryb produkcyjnego środowiska wymaga skonfigurowanego origin zgodnie z parserem; produkcyjny build/start scaffold można testować bez usług.

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:boundaries
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e:foundation
pnpm test:canary
pnpm start --hostname 127.0.0.1 --port 3100
```

Smoke uruchamia własny produkcyjny serwer po `pnpm build`; port 3100 musi być wolny. Build/start i canary nie dowodzą gotowości przyszłej bazy/Auth. Testy negatywne działają w usuwalnych snapshotach, nie psują drzewa release.

## Dodawanie komponentów

`components.json` wybiera `base-nova`, `neutral`, CSS variables, Tailwind v4, RSC, aliasy w `src/` i Lucide. Po przeglądzie aktualnego registry można dodać zatwierdzony komponent przez przypięty lokalny CLI:

```sh
pnpm ui add <nazwa-komponentu>
```

Najpierw sprawdź potrzebę i zakres, potem diff wygenerowanego kodu i zależności; wszystkie nowe zależności zachowują dokładne piny. Nie nadpisuj własnych komponentów bez review. Kod shadcn jest własnością repozytorium; zmiany wymagają testów, dostępności i review. Stosuj nazwane importy ikon Lucide, ukrywaj dekoracyjne ikony i nadaj dostępną nazwę przyciskom ikonowym. Nie inicjalizuj całego katalogu, motion ani dark mode jako skutku ubocznego.

## Struktura utworzonych plików

```text
src/app/{layout.tsx,page.tsx,globals.css,health/ready/route.ts}
src/components/ui/{card.tsx,badge.tsx,LICENSE}
src/lib/utils.ts
src/shared/{validation/env.ts,server/env.ts}
tests/{unit/env.test.ts,e2e/foundation-smoke.spec.ts}
scripts/{test-fixture.mjs,test-boundaries.mjs,test-canary.mjs}
.github/workflows/app-ci.yml
package.json, pnpm-lock.yaml, pnpm-workspace.yaml, .node-version, .env.example
components.json, postcss.config.mjs, next.config.ts, tsconfig.json
eslint.config.mjs, .prettierrc.json, .prettierignore
vitest.config.ts, playwright.config.ts
```

Zainstalowano tylko Card (z CardHeader/CardContent) i Badge. Card jest komponentem serwerowym, Badge używa Base UI `useRender`/`mergeProps`; upstream MIT zachowano w lokalnym LICENSE. Bez cva, motion i drugiej biblioteki ikon. Zmiany dokumentacji obejmują ten raport, Foundation Plan/frontend/QA, indeksy, README oraz ADR-0011; brak zmian dokumentacji domenowej i harnessu.

## Weryfikacja i review

Środowisko lokalne: macOS arm64, Node24.22.2, pnpm12.16.1, Playwright1.64.1, przypięty Chromium1248 (156.0.8078.4). Wyłącznie loopback i dane syntetyczne, bez usług. Weryfikacja dotyczy źródeł kandydata F1, a dokładny commit i CI identyfikuje PR.

| FQA / kontrola | Komenda / obserwacja | Wynik |
|---|---|---|
| FQA-01 | Fresh disposable install `pnpm install --frozen-lockfile`; 542 pakiety, strict peers/engines; lock SHA256 `aa19849a3aeee84ddee05a19f58e8420773fb5133773f77727762b364e3f38fd` bez zmiany | PASS, exit0 |
| FQA-02 | `pnpm typecheck`: `next typegen && tsc --noEmit`, fresh typy; izolowana próba null→string ma wykryć wyłączenie strictNullChecks | PASS, exit0; strict-null fixture odrzucony |
| FQA-03 | `pnpm lint`, `pnpm format:check`, niezależne negatywne fixtures ESLint/Prettier przez `pnpm test:boundaries` | PASS, exit0; naruszenia dają oczekiwane niezerowe wyniki |
| FQA-04 | `pnpm test:boundaries`: 5 kontroli czułości, w tym zakazany import UI w ESLint; skopiowany Client Component importuje rzeczywisty server env; Next odmawia z diagnostyką server-only | PASS; brak modułów domenowych do testowania |
| FQA-05 | `pnpm test:unit`: 18 przypadków valid/missing/invalid/redaction; bez DB/Auth | PASS 18/18 |
| FQA-06 | `pnpm test:canary`: build/static assets/HTML/RSC/DOM/logi i błędny env; scanner positive control | PASS, exit0; scanner wykrywa kontrolny wyciek |
| FQA-07 | `pnpm build` oraz produkcyjny start na jawnie ustawionym porcie przez Playwright | PASS |
| FQA-08 | `pnpm test:e2e:foundation`: desktop1280, mobile375, health200 JSON bez redirect/cookie; Tailwind computed styles/Card/Badge/Lucide/no client errors | PASS 3/3 |
| FQA-09 | Rzeczywisty CI PR exact head SHA i izolowany czerwony PR z failed typecheck/test, skipped production oraz failed final gate | NOT RUN — przed publikacją |
| Harness | `python3 harness/scripts/sync.py --check`, `check.py`, `python3 -m unittest discover -s harness/scripts -p 'test_*.py' -v` w czystym snapshocie plików kandydata | PASS, 20/20; nie są testami aplikacji |
| Audit runtime | `pnpm audit --prod --json` | PASS, zero podatności |
| Audit cały graf | `pnpm audit --json` | exit1: jedno LOW dev CLI opisane wyżej, bez ukrywania wyniku |

SHA256 manifestu sześciu plików QA (`shasum -a 256 vitest.config.ts playwright.config.ts tests/e2e/foundation-smoke.spec.ts scripts/test-fixture.mjs scripts/test-boundaries.mjs scripts/test-canary.mjs | shasum -a 256`): `1af477701038a3693981dd659aa59ce7be3a6d95e62722cee4a673758c9ebfd2`. Wszystkie kontrole lokalne wykonano 2026-10-29, exit0 poza jawnym pełnym audit i oczekiwanymi ujemnymi fixtures.

Pierwsza próba testów harnessu w roboczym checkout została przerwana: test setup kopiuje całe drzewo wraz z node_modules. Niezmienione testy uruchomiono w czystym snapshocie źródeł bez artefaktów i przeszły 20/20; CI harness ma osobny checkout bez instalacji zależności. Harness nie był modyfikowany.

Niezależne frontend/backend/security review: kandydat zamrożony, oczekuje wykonania. Reviewerzy muszą mieć osobnego rodzica read-only i nie są autorami implementacji. Pozostałe źródła i statusy: FQA-10–56, Auth/RLS/RPC/Storage/worker/DR: NOT RUN, poza F1.

## CI i ochrona gałęzi

CI ma minimalne `contents: read`, uruchamia checki na head SHA PR, bez deploymentu i sekretów usług. Końcowa bramka wymaga sukcesu każdej zależności, również przy błędzie/pominięciu wcześniejszych jobów.

Odczyt GitHub rulesets `includes_parents=true` 2026-10-29: pusta lista. Odczyt `branches/main/protection`: 403 „Resource not accessible by integration”. Nie potwierdzono więc egzekwowania required checks przez branch protection. Osobny krok administratora: sprawdzić istniejącą ochronę i wymagać `Foundation required` oraz review; samo istnienie workflow nie blokuje merge. Nie modyfikowano ochrony gałęzi.

## Następny krok

PR-F2 wymaga osobnej autoryzacji: disposable Supabase Local, Drizzle i syntetyczne testy RLS A/B zgodnie z planem; bez fizycznego modelu RecruitmentCase przed OPEN-002 i powiązanymi bramkami.
