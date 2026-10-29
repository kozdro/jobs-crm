# Foundation Plan — SDD/AIDD

**Aktualizacja PR-F1, 2026-10-29:** PO w zadaniu „Jobs CRM — PR-F1 Application Scaffold & CI” autoryzował inicjalizację, lokalne zależności, implementację, testy, niezależny review, commit/push/PR bez merge i provisioningu. Rozszerzenie obejmuje Tailwind CSS v4, shadcn/ui z Base UI i Lucide React — [ADR-0011](../decisions/adr/0011-frontend-foundation.md). Wyniki F1 i instrukcje: [raport F1](foundation-f1.md). Pozostałe etapy i testy zachowują statusy poniżej.

**Aktualizacja PR-F2, 2026-10-29:** osobne zadanie PO „Jobs CRM — PR-F2 Supabase Local, Drizzle & RLS A/B” autoryzuje lokalny syntetyczny PoC, migracje, testy, CI i publikację PR bez merge. Zakres, bieżące wyniki i ograniczenia: [raport F2](foundation-f2.md). F3–F6 pozostają PROPOSED / PLANNED / NOT RUN. Zgoda F2 nie obejmuje cloud, produkcji, deploymentu ani modelu sprawy.

**Baseline planu powstał 2026-10-28 jako PROPOSED.** Autoryzacje wykonania F1/F2 są odrębne od zatwierdzenia szczegółów produktu i wyników testów.

**Rebaseline 2026-10-29:** decyzja PO wariant A Supabase-native — [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), zastępujący ADR-0003. Niniejsza aktualizacja autoryzuje wyłącznie dokumentację i PR. Karty F3–F6 są planem do osobnej autoryzacji wykonania. Historia poprzedniego planu pozostaje w [bazie przed rebaseline](https://github.com/kozdro/jobs-crm/blob/5f5c8c8df3a51a337295566565eca398f4bca3ae/docs/technical/foundation-plan.md).

## 1. Executive summary

Foundation korzysta z wykonanych F1/F2 i przechodzi do integracji Supabase Auth/SSR w docelowym App Router. Browser i server client SDK obsługują sesję; BFF istnieje tam, gdzie wnosi logikę lub granicę zaufania. Data API wykonuje zwykły CRUD z JWT i RLS. Nie powstaje własny broker, magazyn handles, kryptografia sesji ani framework transakcyjny.

Ryzyka wymagające testów to XSS i wyciek tokenów dostępnych przeglądarce, SSR refresh/cookies, cache A/B, CSRF właściwy dla endpointów, OAuth/PKCE i izolacja RLS. Logout używa local/global/others; ważny JWT może działać do expiry. Ta akceptacja nie ustala TTL ani ochrony operacji wrażliwych. Publiczne wydanie nadal wymaga polityk kont, Storage i DB+Storage DR. Review dokumentów nie jest dowodem runtime.

| Dokument szczegółowy | Zawartość |
|---|---|
| [Bramki i pierwszy slice](foundation-gates.md) | Każdy OPEN, statusy źródeł, impact i traceability biznesowe |
| [Kontrakty PoC](foundation-pocs.md) | Auth/SSR, RLS A/B, minimalny atomic RPC, kryteria sukcesu i przerwania |
| [Platforma i odzyskiwanie](foundation-platform.md) | Local, Drizzle, Render/worker/queue, CI, backup i restore |
| [Macierz QA](foundation-qa.md) | Kontrakt → test → środowisko → wynik oczekiwany → właściciel → etap |
| [Scaffold i kompatybilność](foundation-frontend.md) | Next/React/TS, granice UI/BFF i walidacja inicjalizacji |

## 2. Cel, źródła i wpływ

Plan rozwija fazę 1 z [implementation-plan](implementation-plan.md), zachowując fazy biznesowe i publiczne. Źródłem decyzji pozostają [Technical Discovery 1.1–1.40](discovery-decisions.md), [rejestr ADR i supersession](../decisions/adr/README.md), [architektura](architecture.md), [dane](data-and-persistence.md), [security](security-and-privacy.md), [import/jobs](imports-and-jobs.md), [operacje](operations-and-quality.md), [gates](gates-and-impacts.md), [OPEN](../decisions/open-questions.md) oraz [NFR](../requirements/nonfunctional-requirements.md). To dokumenty źródłowe, nie kopie zastępowane przez plan.

- Zatwierdzone: modular monolith, App Router, Supabase PostgreSQL/Auth/private Storage, owner isolation z RLS, Data API w kontekście użytkownika, Drizzle do migracji, Render Web + osobny worker, pgmq, GitHub Actions/Vitest/Playwright.
- Zatwierdzone ograniczenia: stan/history/audyt osobno; żadnego Event Sourcingu, automatycznego scalania, komunikacji czy zamknięcia; import preview w pamięci i jeden atomowy commit. TD1.40 zastępuje TD1.26 w zakresie fetch URL. Foundation nie uruchamia ekstrakcji.
- Częściowe rozstrzygnięcia nie zamykają OPEN. NFR-001–003 są APPROVED; NFR-004–011 zachowują źródłowy OPEN mimo zatwierdzonych części technicznych. FR-AD-003–009 pozostają PROPOSED w źródłowych granicach; wybór Auth nie promuje ich do pełnego kontraktu.
- Impact obejmuje Identity/Account, późniejsze odczyty i zapisy browser/server/Data API, relacje/RLS, atomowość historii/importów, worker permissions, prywatność logów i odzyskiwanie. Foundation nie zmienia lifecycle, wyników, wyszukiwania ani UX biznesowego. Każdy późniejszy moduł wymaga własnej mapy FR/AC/BR/UC i testów regresji.

Dla technicznego scaffold nie ma nowego produktowego FR ani UC; zastosowanie mają NFR-001–003 i ADR-0001/0010. PoC weryfikują techniczne założenia ADR-0012/0005/0007/0009, nie realizują jeszcze FR kont/importu. Dokładna mapa przyszłego biznesowego zakresu i statusów: [foundation-gates](foundation-gates.md).

## 3. Proponowana struktura i kontrakty przekrojowe

Układ rozwija propozycję z architecture.md. Nazwa folderu nie zatwierdza encji, pól, publicznego endpointu ani działania. Puste moduły nie muszą powstać w pierwszym PR.

```text
src/
  app/                           # UI, layouts, Server Actions i Route Handlers
  modules/
    identity/                    # docelowe adaptery PR-F3; bez własnego brokera
      domain/
      application/
      infrastructure/
    <zatwierdzony-modul>/         # dopiero po osobnym kontrakcie domeny
      domain/
      application/
      infrastructure/
  shared/
    contracts/                   # publiczne DTO bez tokenów, SQL i prywatnej infrastruktury
    validation/                  # walidacja danych wejściowych i konfiguracji
    server/                      # server-only: env, request context, log redaction
  worker/                        # dopiero PR-F5; osobny entrypoint
supabase/                        # konfiguracja local; nie fizyczny model sprawy
experiments/foundation/           # oddzielone syntetyczne PoC; wyłączone z release
  rls/
tests/{unit,integration,e2e}/
```

Granice: domain nie importuje Next/React/Supabase/Drizzle; application definiuje przypadki użycia i porty; infrastructure realizuje porty. Inny moduł używa jawnego publicznego kontraktu modułu, nigdy jego prywatnej infrastruktury. Shared nie staje się wspólną domenową bazą encji. Test statyczny granic lub lint ma wykrywać zakazane importy oraz import `shared/server` z komponentu klienckiego. W scaffold wystarczy rzeczywista granica konfiguracji, bez atrap RecruitmentCase.

Server Components odczytują przez serwerową usługę aplikacyjną; nie wykonują HTTP do własnego Route Handler tylko w celu współdzielenia logiki. Server Actions są publicznie osiągalnymi wejściami komend z pełną walidacją/tożsamością/autoryzacją. Route Handlers służą callbackom i technicznym kontraktom HTTP. Nie polegamy wyłącznie na layout/proxy dla ochrony. Każde wejście odtwarza zaufany kontekst; `owner_id` z payloadu nie jest tożsamością. Zwykła ścieżka: browser/server client z user JWT → Data API → RLS; Server Action/Route Handler tylko przy potrzebnej logice lub granicy zaufania. Bez service-role i runtime Drizzle omijającego RLS. Szczegółowa [macierz w architekturze](architecture.md) odróżnia zatwierdzony podział ADR-0012 od przypisań PROPOSED.

Dane prywatne i odpowiedzi ustawiające cookie nie mogą trafić do współdzielonego cache/CDN/RSC payload z tokenami; brak eksperymentalnego cache jako domyślnego obejścia. Walidacja runtime na każdej granicy (proponowany Zod, do akceptacji w PR-F1) i walidacja config oddzielone od przyszłych reguł domenowych. TypeScript strict nie zastępuje walidacji runtime. Walidator błędu nie wypisuje wartości sekretu. DTO biznesowe nie zawierają access/refresh tokenów; sesją browser zarządza SDK, bez ręcznego przekazywania tokenów przez RSC/props. Schemat pól Jobs CRM pozostaje za OPEN-002.

Env: `.env.example` zawiera wyłącznie nazwy i bezpieczne opisy; `.env.local` i sekrety są ignorowane. Publiczny prefiks tylko dla rzeczywiście publicznej konfiguracji. Browser Auth client jest zatwierdzony; używa publicznego URL i publishable key, który nie zastępuje tożsamości. Sekrety DB/migratora/workera nigdy nie trafiają do `NEXT_PUBLIC_*`, klienta ani CI PR z forków. Minimalny scaffold działa bez Auth/DB i nie wymaga pustych sekretów produkcji. Szczegółowa macierz env i granic: [platforma](foundation-platform.md).

## 4. Wersje i kompatybilność — sprawdzone 2026-10-28

Rekomendacje są PROPOSED. Sprawdzenie publikacji oraz deklarowanych engines/peers nie jest testem instalacji/build. Przed instalacją w PR-F1 agent potwierdza niezmienione wersje, ostrzeżenia bezpieczeństwa i zgodność macierzy; drift wymagający zmiany zestawu opisuje w PR, a istotną zmianę architektury przekazuje PO. Nie używa `latest`, canary ani prerelease w docelowym manifeście.

| Element | Kandydat / etap | Dowód i ograniczenie |
|---|---|---|
| Node.js | **24.22.2 LTS**, PR-F1 | [indeks wydań Node](https://nodejs.org/dist/index.json), wydanie 2026-10-27; [LTS policy](https://nodejs.org/en/about/previous-releases). Dojrzała linia 24 zamiast automatycznego przejścia na nową linię 26. |
| Package manager | **pnpm 12.16.1**, PR-F1 | [metadane wydawcy](https://registry.npmjs.org/pnpm/12.16.1); Node24 spełnia także ostrzejsze udokumentowane minimum Node22+ linii pnpm11/12 ([migracja](https://github.com/pnpm/pnpm.io/blob/main/docs/migration.md)). Dokładny `packageManager` i jeden lockfile; nie polegać na globalnym pnpm/Corepack bez preflight wersji. |
| Next.js / eslint-config-next | **16.4.3 / 16.4.3**, PR-F1 | [manifest Next](https://registry.npmjs.org/next/16.4.3), [config](https://registry.npmjs.org/eslint-config-next/16.4.3), [instalacja](https://nextjs.org/docs/app/getting-started/installation): Node ≥20.9, App Router; lint uruchamiany osobno. |
| React / react-dom | **19.3.1 / 19.3.1**, PR-F1 | [React](https://registry.npmjs.org/react/19.3.1), [react-dom](https://registry.npmjs.org/react-dom/19.3.1); para zgodna z peer Next `^19`. |
| TypeScript, ESLint, Prettier | **6.0.3 / 9.39.5 / 3.9.10**, PR-F1; uzasadnienie w [scaffold](foundation-frontend.md) | Nie wyciągać zgodności parsera TS z samego minimum TypeScript ≥5.1 w Next. Weryfikacja parsera/config wymagana przed install. |
| Vitest / Playwright | **5.0.5 / 1.64.1**, PR-F1 i kolejne | [Vitest](https://registry.npmjs.org/vitest/5.0.5) akceptuje Node24; [Playwright](https://registry.npmjs.org/@playwright/test/1.64.1) Node ≥20. Pin runnera i odpowiadających mu przeglądarek. |
| Supabase SDK / SSR | **2.118.0 / 0.12.7**, dopiero PR-F3 | [SDK](https://registry.npmjs.org/@supabase/supabase-js/2.118.0) Node ≥22; [SSR](https://registry.npmjs.org/@supabase/ssr/0.12.7) peer SDK `^2.114.0`. SDK i SSR są zatwierdzoną drogą browser/server. Wskazane wersje to historyczni kandydaci, nie nowe piny: przed F3 obowiązkowy aktualny preflight kompatybilności i changelog, bez zmiany zależności w rebaseline. |
| Drizzle ORM / Kit / Supabase CLI | **0.45.4 / 0.31.11 / 2.122.0**, PR-F2 | [platforma](foundation-platform.md) podaje źródła i preflight DB/extension versions. Wersję lokalnego PostgreSQL i obrazów zapisuje rzeczywisty preflight; nie zgadywać z numeru CLI. |
| Pozostałe zależności | Według scaffold/platform, tylko potrzebne danemu PR | Typy Node muszą odpowiadać Node24, nie globalnemu latest26. Driver migracji i walidator wymagają przypięcia oraz uzasadnienia; bez tRPC, frameworka DI, telemetry SDK lub parserów importu w scaffold. Wyjątek zatwierdzony 2026-10-29: Tailwind v4, shadcn/ui + Base UI oraz Lucide React według ADR-0011. |

Weryfikacja dokumentacji: Context7 `resolve-library-id` → `query-docs` dla Next.js oraz źródła oficjalne i metadane publikacji; indeks Context7 wskazywał także starsze wersje niż bieżący registry. O wyborze pinu decyduje jawne wydanie stabilne i macierz kompatybilności, nie numer przykładu z canary. Dokładny lockfile powstanie dopiero w autoryzowanym PR implementacyjnym. Aktualizacje zależności: osobny review, changelog/security advisories, typecheck/lint/build/test; zakaz automatycznych major upgrades i ignorowania peer errors.

## 5. Kolejność małych PR

Identyfikatory PR-F* są lokalnymi nazwami planu, nie nowymi FR/AC ani numerami GitHub. Każdy PR wymaga osobnej autoryzacji wskazanego zakresu. Bieżące wyniki F1/F2 wskazują raporty; F3–F6 pozostają **PLANNED / NOT RUN**. Wspólny DoD: konkretna baza/kandydat, implementacja tylko przydzielonego zakresu, dowody QA, niezależny review, brak P0/P1, aktualna dokumentacja i zero sekretów. Review security jest dodatkowe tam, gdzie wskazano; nie nadaje zgody na cloud ani produkt.

### PR-F1 — minimalny scaffold i CI bez usług

- **Cel/zakres:** uruchamialny App Router + React/strict TS, ESLint flat config, Prettier, runtime env z trybem bez usług, Tailwind v4 (CSS-first/PostCSS), shadcn/ui + Base UI, Lucide React, jedna neutralna techniczna strona i health response bez informacji o zależnościach. Unit test konfiguracji, Playwright smoke; bez logowania i UI spraw.
- **Decyzje/zależności:** zgoda PO na tę kartę, kandydatów wersji/małe zależności wykonawcze udzielona 2026-10-29; ADR-0001/0010 obowiązują. Brak zależności od OPEN-002 lub publicznej rejestracji. Preflight wersji przed install.
- **Role/pliki:** platform-engineer: manifest, lock, Node/pnpm pin, `.github/workflows/app-ci.yml`; frontend-engineer: `src/app/{layout,page}.tsx`, health Route Handler, `tsconfig.json`, `next.config.ts`, lint/format, `src/shared/{server,validation}`; QA: `tests/`, config Vitest/Playwright. Ownership konkretnych plików ustalić przed zapisem. Review frontend + backend dla config oraz security dla env, client/server i CI.
- **Testy/DoD:** fresh checkout frozen install; strict typecheck, lint, format, production build/start; unit env success/missing/secret redaction, client/server import rejection, Playwright HTTP/DOM smoke, negatywny sekret-canary bundle scan; CI na dokładnym SHA. Szczegóły w [QA](foundation-qa.md).
- **Ryzyka/STOP:** peer incompatibility, niejawne generator defaults zmieniające AGENTS/harness, ujawnienie env, warunek instalatora poza zakresem. STOP przy konieczności modelu domenowego, nowych polityk Auth/hosting lub zależności nieuzasadnionych kartą.
- **Poza zakresem:** Supabase CLI/Docker, migracje/DB, Auth SDK, worker, cloud, cookies/sesje, RecruitmentCase, finalny design system, instalatory przepisujące instrukcje repo.

### PR-F2 — izolowany local DB/migracje i syntetyczny RLS

Autoryzacja wykonania udzielona 2026-10-29; implementacja i dowody: [F2](foundation-f2.md). Poniższa karta zachowuje kontrakt zakresu; nie jest zbiorczym wynikiem testów.

- **Cel/zakres:** odtwarzalne Supabase Local, jeden tor wykonywania migracji Drizzle, techniczne fixture owner/child, jawne granty, deny-by-default RLS. Schemat wyłącznie w eksperymencie; żadnego RecruitmentCase.
- **Decyzje/zależności:** PR-F1; osobna zgoda na lokalne kontenery i syntetyczne PoC oraz disposable target, bez resetu cudzych baz. Dokładny local DB/CLI pin i procedura migracji z [platformy](foundation-platform.md). OPEN-002 pozostaje otwarte.
- **Role/pliki:** platform: `supabase/config.toml`, `drizzle.config.ts`, wrappery lokalnego target preflight, CI integration job; backend: `experiments/foundation/rls/` schema/SQL/grants; QA: integration fixtures, macierz A/B. Niezależny backend/security review.
- **Testy/DoD:** dwa fresh create→migrate→test, ponowne migrate bez zmian, brak schema drift, real Data API JWT A/B/anon, wszystkie bezpośrednie CRUD/relacje/views/RPC z macierzy; fixture uzyskuje tokeny bezpośrednio z lokalnego Auth HTTP, bez produktowego BFF. Kolumna BFF macierzy jest wykonywana dopiero po F3, przed F6. Testy migracyjne nigdy jako superuser dowód RLS. RLS musi przejść przed Auth integracją z danymi.
- **Ryzyka/STOP:** błędny projekt/port/ledger, schemat Auth/Storage zniszczony migratorem, brak równoważnych rozszerzeń/grantów, bypass roli testowej. STOP i raport; brak auto-repair. Poza zakresem fizyczne encje CRM i produkcyjne migracje.

### PR-F3 — Supabase-native Auth Integration

**Stan:** karta gotowa do osobnej autoryzacji implementacji po akceptacji dokumentacyjnego PR; runtime **PLANNED / NOT RUN**.

- **Cel/zakres:** docelowe `@supabase/supabase-js` + `@supabase/ssr` browser/server clients; email/password i self-service signup; Google OAuth/PKCE start/callback i przygotowanie konfiguracji providera; reset email z lokalnym mail sink; standardowe refresh i cookies SDK; jawne local/global/others; ochrona tras i operacji, zaufana tożsamość, RLS A/B, cache i obsługa błędnej/wygasłej sesji. Signup lokalny testowany, publiczne udostępnienie po OPEN-041. Bez obietnic natychmiastowej revocation JWT.
- **Źródła/zależności:** zmergowane F1/F2 (PR #8), zaakceptowany rebaseline ADR-0012; NFR-001/004, BR-030, FR/AC-AD-002–006 i UC/TC-034/035 w pokrytym podzakresie. FR-AD-003–006 pozostają PROPOSED jako pełne kontrakty. Nowe wykonanie wymaga odrębnego zadania PO, lokalnego target identity i preflight wersji bez automatycznej aktualizacji F2 pinów.
- **Plan plików/ownership — PROPOSED:** backend: `src/modules/identity/{application,infrastructure}/`, browser adapter w infrastrukturze bez importu server-only, request-scoped server adapter w server-only części, callback/komendy `src/app/` i ewentualny `src/proxy.ts` zgodny z aktualnym Next; konfiguracja/redakcja `src/shared/{server,validation}/`. Frontend: wyłącznie ekrany Auth i stany (dokładne rozłączne trasy ustalić w task packet). QA: `tests/{integration,e2e}/` i fixtures bez publicznych hooków. Platform: potrzebne env/local HTTPS/CI, `package.json` i lockfile dopiero po autoryzacji instalacji. Nie zmieniać schematu CRM ani kodu harnessu. Dokładna lista plików i właścicieli przed zapisem.
- **Metadane/delegacja:** orchestrator, backend-engineer, frontend-engineer dla ekranów, qa-engineer od planowania; niezależny backend/frontend review i security-reviewer przez harness. Model/reasoning z runtime albo NOT EXPOSED; autor i reviewer różne sesje. Developer pisze unit, QA integracje/E2E.
- **Kroki:** potwierdzić bazę/F2 i wejścia → preflight SDK/SSR/Next i istniejących granic → docelowe adaptery → login/signup/logout/reset i PKCE → ochrona wejść/cache/RLS → unit/integration/E2E i CI → niezależne review → dokumentacja/dowody/PR bez merge. Bez oddzielnej dużej aplikacji eksperymentalnej i późniejszego przepisywania w F6.
- **Testy:** AUTH-01–12/14, FQA-22–34/57 v2 w [QA](foundation-qa.md), właściwa macierz RLS; email/login/signup, cookies/refresh/reload i równoległe żądania/taby, trzy sesje A i B, scopes i odrębne odświeżenie unieważnionych sesji, replay JWT do exp, OAuth negatywny i live osobno, reset link i błędy, zaufana tożsamość/getClaims vs getUser, XSS/CSRF/cache/logi/sekrety; ocena CSP i skryptów zewnętrznych PROPOSED w OPEN-013, bez domyślnego narzucenia polityki; signup istniejącego e-maila i właściwości odpowiedzi SDK według OPEN-041. AUTH-13/FQA-55 są SUPERSEDED / NOT APPLICABLE. Komendy istniejące F1/F2 plus przyszłe jawnie nazwane projekty Auth w zatwierdzonym PR; brak pustych PASS/skips. Nie uruchamiać ich w rebaseline.
- **DoD:** docelowy root production build ze sprawdzonymi adapterami, rzeczywiste konta A/B/anon i obsługa wielosesyjna; adekwatne unit/integration/E2E/static/build/CI na dokładnym SHA; lokalny i live OAuth osobne wyniki, brak credentials = NOT RUN, a nie pełna akceptacja Google. Brak P0/P1, brak wycieku prywatnych danych, sekretów lub tokenów do logów/URL/RSC; browser SDK dostęp do sesji jest oczekiwany. Każde niepokryte AC/polityka jawnie odłożone, bez ogłoszenia całego Account Management ukończonym. Udokumentowane SDK cookies, ograniczenia i komunikaty logout.
- **Wejścia/STOP:** przed kodem korzystającym z APP_ORIGIN określić normalizację i dozwolone schematy redirect/Origin (odroczenie security F1). OPEN-013/042/043 blokują tylko zależne polityki: produkcyjne TTL, świeżość reautoryzacji, recovery cross-device/skutki resetu. Mogą być najpierw zmierzone w jawnych lokalnych fixtures bez promowania ich do polityki. OPEN-041 przed publicznym signup; brak Google credentials blokuje live test, nie lokalne adaptery. STOP przy RLS bypass, cache A/B leak, sekrecie w bundle, potrzebie niezatwierdzonej polityki, niezgodnym target lub zmianie poza kartą. Zachować dowody błędów; bez automatycznego repair.
- **Poza zakresem:** broker, opaque handles, encrypted refresh store, AEAD/CAS/generation/lease framework, rejestr urządzeń i selected-other-session revoke, własne MFA, natychmiastowa revocation JWT, account export/delete, produkcyjne polityki retencji/TTL, CRM model/migracje, import/RPC/worker, cloud/deploy. Konfiguracja Google poza lokalną może wymagać osobnej autoryzacji zasobów.

### PR-F4 — Minimal Native PostgreSQL RPC / Import Transaction Validation

**Rekomendacja PROPOSED:** realizować minimalną funkcję i testy w docelowym CSV/XLSX import slice po zatwierdzeniu domeny; osobny duży etap F4 nie jest zależnością ręcznego RecruitmentCase/Quick Capture ani zwykłego CRUD. ADR-0005 pozostaje ACCEPTED. F2 dowodzi podstawowego INVOKER/RLS, lecz nie pełnego import retry.

- **Zakres/pliki:** backend — mała funkcja PostgreSQL w istniejącym torze migracji Drizzle i wywołanie `supabase.rpc()` w module importu; QA — testy HTTP Data API/DB A/B/anon, unit walidacji i integracyjne awarii. Dokładne pliki po OPEN-002/010/022/023/024/035; bez trwałego stagingu. Jedna transakcja PostgreSQL na świadomie zatwierdzony wsad, również przy jawnym wyborze podzbioru wierszy.
- **Minimalny kontrakt:** preferowane SECURITY INVOKER, minimalne EXECUTE/table grants i RLS, rollback błędu, minimalny user-scoped key/registry jeśli potrzebny dla retry; wynik i znacznik idempotencji commitują razem. Brak niezależnych insert requestów udających wspólną transakcję, uprzywilejowanego runtime Drizzle, koordynatora/workflow/exactly-once engine lub kolejki do zwykłego importu.
- **Testy/DoD:** RPC/FQA v2 z QA: multi-record atomic commit, rollback, A/B/anon i grants, utrata odpowiedzi po commit + retry bez duplikacji, ten sam key/inny payload = konflikt, podstawowa współbieżność i ochrona registry. Brak P0/P1 po backend/security review; IM-01 przed udostępnieniem importu. Runtime nadal NOT RUN.
- **Alternatywa warunkowa PROPOSED:** mały izolowany test native RPC przed importem tylko po wskazaniu konkretnej luki technicznej i osobnym zleceniu, bez rozbudowy frameworka. Nie blokuje CRUD. STOP przy naruszeniu atomowości/RLS lub wymaganiu nowej polityki domenowej. Idempotencję ręcznego zapisu rozwiązuje jego własny kontrakt, bez zależności od importer-specific RPC.

### PR-F5 — worker/queue przed pierwszą funkcją background

Planowane, nieautoryzowane wykonanie: minimalny worker pgmq, lease/ack/retry/idempotencja efektu, SIGTERM i least privilege zgodnie z ADR-0007 oraz [platformą](foundation-platform.md). Uruchomić dopiero przed rzeczywistą funkcją background. Zależności to F2 i kontrakt tej funkcji; brak obowiązkowego import RPC/F4 przed workerem i brak F5 przed ręcznym CRUD. Osobna autoryzacja kodu/zasobów; cloud/koszty/deploy odrębnie. QA FQA-43–48 i backend/security review w zależnym zakresie, bez obietnicy exactly-once efektów.

### PR-F6 — weryfikacja integracji, bez przepisywania aplikacji

Historyczny osobny etap przenoszenia brokera i eksperymentalnej aplikacji do root jest SUPERSEDED przez ADR-0012. **Rekomendacja PROPOSED:** release/integration checks wykonywać w każdym docelowym slice; osobny PR tylko gdy pozostanie konkretny brak. F3 integruje od razu root Auth adapters, więc F6 nie jest sztuczną bramką CRUD. FQA-56 nadal chroni runtime release przed trasami/helperami fixture F2; testy instrumentowane i release mają osobne dowody. Powtórzyć adekwatne Auth/RLS na dokładnym buildzie przy zmianie granic; worker/RPC tylko gdy używane. Niezależny review i dokumentacja nie zastępują testów. Backup/restore i public release gates pozostają.

Przed publicznym uruchomieniem potrzebne są dalsze małe zadania operacyjne: obiekty private Storage i autoryzacja, deletion ledger, backup/restore rehearsal i kosztorys/plan produkcji. Szczegółowy podział i DoD w [platformie](foundation-platform.md). Nie blokują PR-F1 ani lokalnego PoC, ale blokują publiczny release zgodnie z OPS-01/SEC-02.

## 6. Bramki i Definition of Done

**Foundation Planning (to zadanie):** kompletny plan i macierze, źródła aktualności, wszystkie role autorskie zaangażowane, niezależne backend/security/QA review, P0/P1 usunięte; odnośniki/diff/harness zweryfikowane; wyłącznie dokumenty w commit/push/PR bez merge. Brak testów aplikacji jest oczekiwanym NOT RUN, a brak wymaganego review jest nieukończoną bramką.

**Foundation runtime (przyszłość):** F1/F2 zachowują historyczne wyniki; F3 wymaga rzeczywistych dowodów integracji SDK/SSR, braku przecieków A/B i ujawnień sekretów, powtarzalnych migracji oraz CI/review na dokładnym SHA. Browser session tokens są zarządzane przez SDK. Rollback/retry RPC dowodzony dopiero w zależnym import slice; eksperymentalne fixture nie są kodem release. F5 przed użyciem background, a nie koniecznie przed manualnym biznesowym slice'em. Testy mają właścicieli i etapy w [QA](foundation-qa.md). Żadnego arbitralnego progu coverage: pokrywamy kontrakty i zagrożenia, nie procent dla samego wskaźnika.

**Biznesowy slice:** PO autoryzuje opisany w [gates](foundation-gates.md) minimalny RecruitmentCase + manual Quick Capture + odczyt własnych spraw, po wymaganych OPEN i kontraktach historii/idempotencji/DTO. Publiczne udostępnienie logowania/rejestracji wymaga odrębnych bramek; importer pozostaje późniejszym slice. Nie zawężamy po cichu zatwierdzonego MVP; jest to etap developmentu, nie oferta publicznego wydania.

**Publiczny release:** spełnione właściwe SEC/DATA/IM/OPS/QA gates z [gates-and-impacts](gates-and-impacts.md), public-signup/account/deletion/legal details oraz pomiar RPO/RTO dla DB+Auth+Storage+queue/ledger. Do czasu wykonania restore cele są nieweryfikowane. Nie wolno oznaczać całego Foundation PASS na podstawie build ani review dokumentu.

## 7. Następne zadanie gotowe do autoryzacji PO

`PR-F3 — Supabase-native Auth Integration`: pełna karta w §5. Wymaga akceptacji rebaseline i odrębnego zlecenia implementacji; obecne zadanie kończy się dokumentacją, review i PR bez merge. F1/F2 są wykonane, nie są ponownie proponowanym następnym zadaniem.

Kolejność PROPOSED: rebaseline → F3 → decyzje domenowe i ręczny vertical slice → dalsze moduły; F4 wraz z importem, F5 przed pierwszym background, F6 kontrole w każdym slice. Nie anuluje to funkcji publicznego MVP ani SEC-02/IM-01/OPS-01.

## 8. Historyczne pochodzenie baseline planu i procedura review

Baza: `0d20415c7209d857849d864b1e542dc2fe2ac50b` na zsynchronizowanym main; merge PR #4 `5d36b68` jest przodkiem bazy. Gałąź: `docs/foundation-plan`. Autorzy korzystają z natywnych subagentów z kanonicznymi rolami; nazwany profil został odrzucony przez bieżące API, zastosowano fallback z delivery. Nazwa zadania nie jest dowodem załadowania TOML. Model/reasoning delegowanych sesji dziedziczony; dokładne ustawienie nieudostępnione.

Przed publikacją orchestrator uruchamia istniejące `sync.py --check`, `check.py`, testy harnessu oraz kontrolę diffu i względnych linków zmienionych dokumentów. Nie dodaje nowego walidatora całej specyfikacji. Na zamrożonym kandydacie osobne sesje backend/security przez `harness/scripts/review.py`, QA review odrębnym zadaniem oceny. Po zmianach po review ponawia ocenę dotkniętego zakresu. Dokładne SHA/sesje, wyniki i zamknięte findings raportuje PR; nie wpisujemy przewidywanych PASS do planu.

### Pochodzenie rebaseline 2026-10-29

Źródło decyzji/autoryzacji: zadanie PO „Jobs CRM — Supabase-native Architecture Rebaseline”, wariant A zatwierdzony 2026-10-29; wyłącznie dokumentacja, review, commit/push/PR bez merge, Auth/RPC/instalacji/migracji/nowych eksperymentów/provisioningu. PR #8 potwierdzony MERGED przez GitHub; czysty main po fetch/ff-only zawiera merge `5f5c8c8df3a51a337295566565eca398f4bca3ae`. Gałąź `docs/supabase-native-rebaseline`; branch implementacyjny F3 nietknięty.

Plan zastosowany przed edycją: analiza ID/statusów i źródeł → rozłączne aktualizacje architektury, wymagań i QA → integracja planów/OPEN/UX → kontrola wyłącznie dokumentacyjnego diffu, względnych linków i traceability → istniejące sync/check/testy harnessu → zamrożenie kandydata → niezależne specification/backend/security review przez `review.py` → poprawki i ponowne review dotkniętego zakresu → commit/push/PR. Bez nowego walidatora i bez runtime Auth/RPC.

Role: spec-analyst przygotował analizę i handoff bez edycji zgodnie z rolą; autor dokumentacji zastosował FR/AC/NFR/OPEN/UX; backend-engineer opracował ADR/architekturę/security; qa-engineer od planowania aktualizował kontrakty i macierz; orchestrator zintegrował plan, bramki i indeksy. Przypisania plików rozłączne. Modele/reasoning autorów nieujawnione jako dokładne konfiguracje runtime: NOT EXPOSED; nie wnioskujemy ich z nazwy narzędzia. Reviewerzy niezależni od autorów, sesje read-only przez harness; backend-reviewer ocenia też specyfikację, security-reviewer granice zaufania. Dokładny kandydat, sesje, wyniki i ewentualne findings są w PR; niniejszy plan nie przewiduje PASS. F1/F2 i dowody pozostają historyczne, F3/F4 runtime NOT RUN.
