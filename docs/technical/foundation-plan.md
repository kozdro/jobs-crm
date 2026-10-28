# Foundation Plan — SDD/AIDD

**Stan redakcyjny:** DRAFT, 2026-10-28. **Status planu wykonania:** PROPOSED do odrębnej autoryzacji PO. Niniejsze zadanie autoryzuje analizę, dokumentację, review oraz commit/push/PR; nie inicjalizację aplikacji, instalację pakietów, migracje, Supabase CLI ani provisioning. **Wszystkie opisane niżej testy aplikacji/PoC: PLANNED / NOT RUN.**

## 1. Executive summary

Foundation przeprowadza zatwierdzoną architekturę od dokumentacji do sprawdzalnych kontraktów. Najpierw mały scaffold Next.js i CI bez danych, potem izolowane Supabase Local oraz syntetyczne testy RLS, następnie osobne PoC sesji HttpOnly i atomowego RPC. Wynik eksperymentu może być negatywny; żaden z nich nie ustanawia polityki produktu. Pierwszy biznesowy slice wymaga osobnej zgody i zatwierdzenia modelu sprawy. Publiczne uruchomienie ma dalsze bramki sesji, prywatnych dokumentów, usuwania oraz odzyskiwania DB **i** obiektów Storage.

Największe ryzyka to odświeżanie i unieważnianie sesji przy HttpOnly-only, dostęp bezpośrednio przez Data API po revocation, granty/RLS funkcji oraz idempotencja po utracie odpowiedzi. Dzienny backup DB nie wystarcza do celu RPO ≤ 1 h i nie chroni zawartości Storage. Pozytywny review planu nie jest dowodem działania tych mechanizmów.

| Dokument szczegółowy | Zawartość |
|---|---|
| [Bramki i pierwszy slice](foundation-gates.md) | Każdy OPEN, statusy źródeł, impact i traceability biznesowe |
| [Kontrakty PoC](foundation-pocs.md) | Auth/BFF, RLS A/B, atomic RPC, kryteria sukcesu i przerwania |
| [Platforma i odzyskiwanie](foundation-platform.md) | Local, Drizzle, Render/worker/queue, CI, backup i restore |
| [Macierz QA](foundation-qa.md) | Kontrakt → test → środowisko → wynik oczekiwany → właściciel → etap |
| [Scaffold i kompatybilność](foundation-frontend.md) | Next/React/TS, granice UI/BFF i walidacja inicjalizacji |

## 2. Cel, źródła i wpływ

Plan rozwija fazę 1 z [implementation-plan](implementation-plan.md), zachowując fazy biznesowe i publiczne. Źródłem decyzji pozostają [Technical Discovery 1.1–1.40](discovery-decisions.md), [ADR-0001–0010 — ACCEPTED](../decisions/adr/README.md), [architektura](architecture.md), [dane](data-and-persistence.md), [security](security-and-privacy.md), [import/jobs](imports-and-jobs.md), [operacje](operations-and-quality.md), [gates](gates-and-impacts.md), [OPEN](../decisions/open-questions.md) oraz [NFR](../requirements/nonfunctional-requirements.md). To dokumenty źródłowe, nie kopie zastępowane przez plan.

- Zatwierdzone: modular monolith, App Router, Supabase PostgreSQL/Auth/private Storage, owner isolation z RLS, Data API w kontekście użytkownika, Drizzle do migracji, Render Web + osobny worker, pgmq, GitHub Actions/Vitest/Playwright.
- Zatwierdzone ograniczenia: stan/history/audyt osobno; żadnego Event Sourcingu, automatycznego scalania, komunikacji czy zamknięcia; import preview w pamięci i jeden atomowy commit. TD1.40 zastępuje TD1.26 w zakresie fetch URL. Foundation nie uruchamia ekstrakcji.
- Częściowe rozstrzygnięcia nie zamykają OPEN. NFR-001–003 są APPROVED; NFR-004–011 zachowują źródłowy OPEN mimo zatwierdzonych części technicznych. FR-AD-003–009 pozostają PROPOSED w źródłowych granicach; wybór Auth nie promuje ich do pełnego kontraktu.
- Impact obejmuje Identity/Account, wszystkie późniejsze odczyty i zapisy BFF, relacje/RLS, atomowość historii/importów, worker permissions, prywatność logów i odzyskiwanie. Foundation nie zmienia lifecycle, wyników, wyszukiwania ani UX biznesowego. Każdy późniejszy moduł wymaga własnej mapy FR/AC/BR/UC i testów regresji.

Dla technicznego scaffold nie ma nowego produktowego FR ani UC; zastosowanie mają NFR-001–003 i ADR-0001/0010. PoC weryfikują techniczne założenia ADR-0003/0005/0007/0009, nie realizują jeszcze FR kont/importu. Dokładna mapa przyszłego biznesowego zakresu i statusów: [foundation-gates](foundation-gates.md).

## 3. Proponowana struktura i kontrakty przekrojowe

Układ rozwija propozycję z architecture.md. Nazwa folderu nie zatwierdza encji, pól, publicznego endpointu ani działania. Puste moduły nie muszą powstać w pierwszym PR.

```text
src/
  app/                           # UI, layouts, Server Actions i Route Handlers
  modules/
    identity/                    # tworzone wraz z PoC, nie gotowy model sesji
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
  auth/
  rpc/
tests/{unit,integration,e2e}/
```

Granice: domain nie importuje Next/React/Supabase/Drizzle; application definiuje przypadki użycia i porty; infrastructure realizuje porty. Inny moduł używa jawnego publicznego kontraktu modułu, nigdy jego prywatnej infrastruktury. Shared nie staje się wspólną domenową bazą encji. Test statyczny granic lub lint ma wykrywać zakazane importy oraz import `shared/server` z komponentu klienckiego. W scaffold wystarczy rzeczywista granica konfiguracji, bez atrap RecruitmentCase.

Server Components odczytują przez serwerową usługę aplikacyjną; nie wykonują HTTP do własnego Route Handler tylko w celu współdzielenia logiki. Server Actions są publicznie osiągalnymi wejściami komend z pełną walidacją/tożsamością/autoryzacją. Route Handlers służą callbackom i technicznym kontraktom HTTP. Nie polegamy wyłącznie na layout/proxy dla ochrony. Każde wejście odtwarza zaufany kontekst; `owner_id` z payloadu nie jest tożsamością. Zwykła ścieżka: server-only user JWT → Data API → RLS, bez service-role i bez runtime Drizzle omijającego RLS.

Dane prywatne i odpowiedzi ustawiające cookie nie mogą trafić do współdzielonego cache/CDN/RSC payload z tokenami; brak eksperymentalnego cache jako domyślnego obejścia. Walidacja runtime na każdej granicy (proponowany Zod, do akceptacji w PR-F1) i walidacja config oddzielone od przyszłych reguł domenowych. TypeScript strict nie zastępuje walidacji runtime. Walidator błędu nie wypisuje wartości sekretu. DTO nie zawierają access/refresh tokenów. Schemat pól Jobs CRM pozostaje za OPEN-002.

Env: `.env.example` zawiera wyłącznie nazwy i bezpieczne opisy; `.env.local` i sekrety są ignorowane. Publiczny prefiks tylko dla rzeczywiście publicznej konfiguracji. Nawet publishable key nie oznacza pozwolenia na browser auth SDK. Sekrety DB/migratora/workera nigdy nie trafiają do `NEXT_PUBLIC_*`, klienta ani CI PR z forków. Minimalny scaffold działa bez Auth/DB i nie wymaga pustych sekretów produkcji. Szczegółowa macierz env i granic: [platforma](foundation-platform.md).

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
| Supabase SDK / SSR | **2.118.0 / 0.12.7**, dopiero PR-F3 | [SDK](https://registry.npmjs.org/@supabase/supabase-js/2.118.0) Node ≥22; [SSR](https://registry.npmjs.org/@supabase/ssr/0.12.7) peer SDK `^2.114.0`. SSR jest opcjonalnym adapterem PoC, nie dowodem HttpOnly ani planem browser clienta. |
| Drizzle ORM / Kit / Supabase CLI | **0.45.4 / 0.31.11 / 2.122.0**, PR-F2 | [platforma](foundation-platform.md) podaje źródła i preflight DB/extension versions. Wersję lokalnego PostgreSQL i obrazów zapisuje rzeczywisty preflight; nie zgadywać z numeru CLI. |
| Pozostałe zależności | Według scaffold/platform, tylko potrzebne danemu PR | Typy Node muszą odpowiadać Node24, nie globalnemu latest26. Driver migracji i walidator wymagają przypięcia oraz uzasadnienia; bez UI kit, tRPC, frameworka DI, telemetry SDK lub parserów importu w scaffold. |

Weryfikacja dokumentacji: Context7 `resolve-library-id` → `query-docs` dla Next.js oraz źródła oficjalne i metadane publikacji; indeks Context7 wskazywał także starsze wersje niż bieżący registry. O wyborze pinu decyduje jawne wydanie stabilne i macierz kompatybilności, nie numer przykładu z canary. Dokładny lockfile powstanie dopiero w autoryzowanym PR implementacyjnym. Aktualizacje zależności: osobny review, changelog/security advisories, typecheck/lint/build/test; zakaz automatycznych major upgrades i ignorowania peer errors.

## 5. Kolejność małych PR

Identyfikatory PR-F* są lokalnymi nazwami planu, nie nowymi FR/AC ani numerami GitHub. Każdy PR wymaga osobnej autoryzacji wskazanego zakresu. Wszystkie testy poniżej **PLANNED / NOT RUN**. Wspólny DoD: konkretna baza/kandydat, implementacja tylko przydzielonego zakresu, dowody QA, niezależny review, brak P0/P1, aktualna dokumentacja i zero sekretów. Review security jest dodatkowe tam, gdzie wskazano; nie nadaje zgody na cloud ani produkt.

### PR-F1 — minimalny scaffold i CI bez usług

- **Cel/zakres:** uruchamialny App Router + React/strict TS, ESLint flat config, Prettier, runtime env z trybem bez usług, jedna techniczna strona i health response bez informacji o zależnościach. Unit test konfiguracji, Playwright smoke; bez logowania i UI spraw.
- **Decyzje/zależności:** osobna zgoda PO na tę kartę oraz kandydatów wersji/małe zależności wykonawcze; ADR-0001/0010 obowiązują. Brak zależności od OPEN-002 lub publicznej rejestracji. Preflight wersji przed install.
- **Role/pliki:** platform-engineer: manifest, lock, Node/pnpm pin, `.github/workflows/app-ci.yml`; frontend-engineer: `src/app/{layout,page}.tsx`, health Route Handler, `tsconfig.json`, `next.config.ts`, lint/format, `src/shared/{server,validation}`; QA: `tests/`, config Vitest/Playwright. Ownership konkretnych plików ustalić przed zapisem. Review frontend + backend dla config.
- **Testy/DoD:** fresh checkout frozen install; strict typecheck, lint, format, production build/start; unit env success/missing/secret redaction, client/server import rejection, Playwright HTTP/DOM smoke, negatywny sekret-canary bundle scan; CI na dokładnym SHA. Szczegóły w [QA](foundation-qa.md).
- **Ryzyka/STOP:** peer incompatibility, niejawne generator defaults zmieniające AGENTS/harness, ujawnienie env, warunek instalatora poza zakresem. STOP przy konieczności modelu domenowego, nowych polityk Auth/hosting lub zależności nieuzasadnionych kartą.
- **Poza zakresem:** Supabase CLI/Docker, migracje/DB, Auth SDK, worker, cloud, cookies/sesje, RecruitmentCase, design system, instalatory przepisujące instrukcje repo.

### PR-F2 — izolowany local DB/migracje i syntetyczny RLS

- **Cel/zakres:** odtwarzalne Supabase Local, jeden tor wykonywania migracji Drizzle, techniczne fixture owner/child, jawne granty, deny-by-default RLS. Schemat wyłącznie w eksperymencie; żadnego RecruitmentCase.
- **Decyzje/zależności:** PR-F1; osobna zgoda na lokalne kontenery i syntetyczne PoC oraz disposable target, bez resetu cudzych baz. Dokładny local DB/CLI pin i procedura migracji z [platformy](foundation-platform.md). OPEN-002 pozostaje otwarte.
- **Role/pliki:** platform: `supabase/config.toml`, `drizzle.config.ts`, wrappery lokalnego target preflight, CI integration job; backend: `experiments/foundation/rls/` schema/SQL/grants; QA: integration fixtures, macierz A/B. Niezależny backend/security review.
- **Testy/DoD:** dwa fresh create→migrate→test, ponowne migrate bez zmian, brak schema drift, real Data API JWT A/B/anon, wszystkie bezpośrednie CRUD/relacje/views/RPC z macierzy; fixture uzyskuje tokeny bezpośrednio z lokalnego Auth HTTP, bez produktowego BFF. Kolumna BFF macierzy jest wykonywana dopiero po F3, przed F6. Testy migracyjne nigdy jako superuser dowód RLS. RLS musi przejść przed Auth integracją z danymi.
- **Ryzyka/STOP:** błędny projekt/port/ledger, schemat Auth/Storage zniszczony migratorem, brak równoważnych rozszerzeń/grantów, bypass roli testowej. STOP i raport; brak auto-repair. Poza zakresem fizyczne encje CRM i produkcyjne migracje.

### PR-F3 — PoC Auth + HttpOnly BFF

- **Cel/zakres:** jeden zamknięty eksperyment wg [kontraktu Auth](foundation-pocs.md), serwerowe logowanie/password reset/PKCE callback, cookie/refresh/CSRF, dwie sesje, revocation i izolacja A/B.
- **Decyzje/zależności:** PR-F1/F2; autoryzacja testowych tożsamości, lokalnego HTTPS oraz ewentualnego odrębnego testowego Google OAuth clienta. Bez danych produkcji i bez publicznego signup. OPEN-013/042 to bramka promocji kontraktu, nie zakaz pomiaru. Dopuszczony wariant eksperymentu wymaga jawnego zakresu; nowy stanowy magazyn/zmiana modelu sesji → PO przed implementacją wariantu.
- **Role/pliki:** backend `experiments/foundation/auth/`, serwerowe adaptery i callback routes w oddzielnym project-dir Next `experiments/foundation/auth/web/`, bez tras PoC w produkcyjnym `src/app`; frontend techniczny ekran testowy; platform config local HTTPS/secret injection; QA auth/concurrency/browser tests. Backend i security review niezależne; izolacja/crypto/rotacja magazynu brokera objęta AUTH-13/FQA-55, po review modelu kluczy i manifestu przed implementacją.
- **Testy/DoD:** macierz Auth i revocation z foundation-pocs + foundation-qa, log/DOM/storage/bundle/cookie assertions i replay starego JWT przez Data API. Wyniki lokalne/mock Google i prawdziwy Google rozdzielone. Brak prawdziwego Google = NOT RUN dla tego kryterium, nie pełny PASS PoC.
- **Ryzyka/STOP:** refresh race, utrata cookie, nieosiągalna granularna revocation lub wymagany nowy model sesji. Porażka → dowody i warianty PROPOSED dla PO, bez JS-readable fallbacku tokenów. Poza zakresem publiczna rejestracja i kompletne Account Management UI/polityki.

### PR-F4 — PoC atomowego SECURITY INVOKER RPC

- **Cel/zakres:** syntetyczny batch parent/child + minimalny registry idempotencji w jednej transakcji, bez parsera CSV/XLSX, stagingu i importu CRM.
- **Decyzje/zależności:** PR-F2; integracja z realnym BFF PR-F3 przed wspólną akceptacją Foundation. Sam RPC można mierzyć z prawdziwymi JWT fixture. Osobna zgoda na eksperyment, nie zatwierdzenie OPEN-010/024/035 dla importu biznesowego.
- **Role/pliki:** backend `experiments/foundation/rpc/` SQL/migracje i adapter BFF eksperymentu; QA transaction/race/fault tests; backend/security review.
- **Testy/DoD:** wszystkie próby atomowości, A/B, duplicate key/payload mismatch, jednoczesność i utrata odpowiedzi z [PoC](foundation-pocs.md); dokładnie jeden efekt i ta sama tożsamość wyniku po retry; brak częściowych rekordów/registry przy błędzie; nieeksponowany registry odporny na bezpośrednie manipulacje przez user Data API i późniejszy replay (RPC-12).
- **Ryzyka/STOP:** SQL poza user RLS, implicit PUBLIC EXECUTE, timeout/payload limits, odrębny registry commit, swallow exception. Zmiana na SECURITY DEFINER lub service-role w user path wymaga osobnego security review i decyzji jeśli zmienia ADR. Poza zakresem pełny import i parametry domenowe.

### PR-F5 — worker/queue i konfiguracja deploy bez provisioningu

- **Cel/zakres:** oddzielny entrypoint worker, syntetyczny job pgmq, lease/ack/retry/idempotencja, SIGTERM, health/log contract i konfiguracja Render Web/Worker. Brak akcji na kontach użytkownika i fetch URL.
- **Decyzje/zależności:** PR-F2/F4; polityka uprawnień po security review; autoryzacja kodu lokalnego. Cloud/ceny/produkcyjne sekrety to osobna późniejsza decyzja, nie merge config.
- **Role/pliki:** platform `src/worker/`, konfiguracja Render/CI i runbooki; backend minimalny handler i uprawnienia; QA queue/fault tests; backend/security reviewer.
- **Testy/DoD:** lokalny restart/lease expiry/duplicate job, niedostępna kolejka, SIGTERM bez utraty pracy, owner metadata bez wycieku, no public queue access, nie ma „exactly once” dla skutków biznesowych; config review bez deploymentu.
- **Ryzyka/STOP:** eskalacja uprawnień konsumenta, retry storm, sekret w payloadzie, auto-provisioning. Poza zakresem Smart Import, headless, scheduler i produkcyjny deploy.

### PR-F6 — przyjęcie wyników i techniczna integracja przed biznesem

- **Cel/zakres:** zredagowane wyniki PoC na dokładnych kandydatach, finalne techniczne kontrakty, decision receipts/ADR tylko po faktycznej decyzji; integracja wyłącznie zatwierdzonych adapterów Auth/BFF i user context z root App Router, bez testowych hooków/routes/fixture. Minimalny zaakceptowany techniczny session store może powstać dopiero po decyzji o wyniku PoC; bez RecruitmentCase. Eksperymentalny project-dir/build pozostaje poza release. To techniczny PR integracji i dowodów przed biznesowym CRUD; jeśli model sesji wymaga nowego projektu, wraca do PO przed tym PR.
- **Decyzje/zależności:** PR-F1–F4 PASS dla używanych fundamentów oraz zaakceptowany przez PO dokładny kontrakt sesji/brokera i jego manifest przed promocją; szczegóły trwałego brokera i poświadczenia DB Web wymagają record-decision oraz ADR po faktycznej decyzji, przed promocją, bez nowego ADR w tym zadaniu; F5 wymagany przed funkcją worker, może nastąpić później niż manual Quick Capture jeśli PO osobno autoryzuje taki harmonogram. OPEN domenowe z [gates](foundation-gates.md) rozstrzygnięte dla następnego slice'a.
- **Role/pliki:** backend `src/modules/identity/{application,infrastructure}`, zatwierdzone techniczne migracje sesji i `src/shared/server` user context; frontend `src/app` wyłącznie prawdziwe Auth callback/entrypoint, bez ekranów CRM; orchestrator + spec-analyst `docs/technical/` raporty/kontrakty; QA dowody. Niezależny backend/frontend/security review i QA review planu. Nie zmieniać statusów na podstawie opinii technicznej.
- **Testy/DoD:** re-run powiązanych testów z tym samym kontraktem (AUTH/RLS, a RPC tylko gdy adapter promowany): grupa black-box na dokładnym root release buildzie bez hooków, zewnętrzny proxy/observer, oraz odrębna grupa instrumentowana tego samego SHA dla wewnętrznych barier. Każda ma osobny status/hash i sprawdzenie równoważności; instrumentowany build nie zastępuje dowodu release (szczegóły F6 w QA). Testy eksperymentu nie wystarczają do integracji. Każdy nieuruchomiony zakres ma NOT RUN/powód; brak otwartych P0/P1, zaakceptowany plan pierwszego slice'a, PoC fixtures/routes nie trafiają do wykonywalnego/publikowanego runtime output release (FQA-56: manifest runtime/tras i negatywny HTTP/start z flagą eksperymentu); osobny build eksperymentu nie jest artifactem deploymentu. Backup/restore nadal osobną bramką publicznego uruchomienia.
- **Ryzyka/STOP:** dowody z innego SHA/środowiska, redakcja ukrywająca porażkę, nierozstrzygnięta zmiana architektury. Poza zakresem samo wdrożenie produktu.

Przed publicznym uruchomieniem potrzebne są dalsze małe zadania operacyjne: obiekty private Storage i autoryzacja, deletion ledger, backup/restore rehearsal i kosztorys/plan produkcji. Szczegółowy podział i DoD w [platformie](foundation-platform.md). Nie blokują PR-F1 ani lokalnego PoC, ale blokują publiczny release zgodnie z OPS-01/SEC-02.

## 6. Bramki i Definition of Done

**Foundation Planning (to zadanie):** kompletny plan i macierze, źródła aktualności, wszystkie role autorskie zaangażowane, niezależne backend/security/QA review, P0/P1 usunięte; odnośniki/diff/harness zweryfikowane; wyłącznie dokumenty w commit/push/PR bez merge. Brak testów aplikacji jest oczekiwanym NOT RUN, a brak wymaganego review jest nieukończoną bramką.

**Foundation runtime (przyszłość):** F1 kontrole i F2/F3/F4 PoC z rzeczywistymi dowodami i zaakceptowanymi kontraktami; brak przecieków między A/B, brak JS-readable tokenów, powtarzalne migracje, udowodniony rollback/retry RPC, CI/review na dokładnym SHA; eksperymenty nie są kodem release. F5 przed użyciem background, a nie koniecznie przed manualnym biznesowym slice'em. Testy mają właścicieli i etapy w [QA](foundation-qa.md). Żadnego arbitralnego progu coverage: pokrywamy kontrakty i zagrożenia, nie procent dla samego wskaźnika.

**Biznesowy slice:** PO autoryzuje opisany w [gates](foundation-gates.md) minimalny RecruitmentCase + manual Quick Capture + odczyt własnych spraw, po wymaganych OPEN i kontraktach historii/idempotencji/DTO. Brak logowania publicznych kont i brak importu automatycznego. Nie zawężamy po cichu zatwierdzonego MVP; jest to etap developmentu, nie oferta publicznego wydania.

**Publiczny release:** spełnione właściwe SEC/DATA/IM/OPS/QA gates z [gates-and-impacts](gates-and-impacts.md), public-signup/account/deletion/legal details oraz pomiar RPO/RTO dla DB+Auth+Storage+queue/ledger. Do czasu wykonania restore cele są nieweryfikowane. Nie wolno oznaczać całego Foundation PASS na podstawie build ani review dokumentu.

## 7. Następne zadanie gotowe do autoryzacji PO

**Proponowany tytuł:** `Foundation F1 — minimalny scaffold Next.js i CI bez usług`.

- **Etap:** Implementation → Verification → niezależny Review → Documentation Update; start dopiero po zgodzie PO na kartę PR-F1. Zgoda na ten plan i jego publikację nie wystarcza.
- **Rola/model/reasoning:** orchestrator dobiera złożoność i jawnie zapisuje runtime model/reasoning, a jeśli niedostępne — `NOT EXPOSED`; platform-engineer + frontend-engineer, QA od planowania, niezależny frontend-reviewer i backend-reviewer. Nie narzuca modelu jako ADR. Autorzy i reviewerzy muszą być różnymi sesjami; Codex review przez istniejący wrapper read-only.
- **Źródła:** ADR-0001/0010 ACCEPTED; NFR-001–003 APPROVED; TD1.31/1.32/1.35/1.36/1.37; AGENTS/workflow, ta karta, scaffold i QA. FR biznesowe: nie dotyczy w tym PR.
- **Wejścia:** zmergowany Foundation Plan, aktualne czyste selected checkout/main, jawna autoryzacja F1, powtórzony preflight wersji. Nie wymaga zamykania OPEN-002/013/042; nie dotyka zależnego zakresu.
- **Dozwolone pliki:** wyłącznie lista PR-F1 i [scaffold](foundation-frontend.md), dokumentacja uruchomienia i dowodów. Zachowaj AGENTS/CLAUDE i cały harness; bez instalatora nadpisującego instrukcje. Nie twórz pustych katalogów domeny dla pozoru gotowości.
- **Kroki:** sprawdź bazę i zakres → przypnij potwierdzone wersje → ręcznie minimalny scaffold → env/server boundary i techniczny health → rzeczywiste unit/smoke → CI → review → opis wyników i PR bez merge.
- **DoD/testy/STOP/out of scope:** dokładnie karta PR-F1 i przypisane wiersze QA. Odpowiedzią końcową są komendy/wyniki na dokładnym SHA i link PR; żadne przyszłe PoC nie mogą być przedstawione jako wykonane.

## 8. Pochodzenie i procedura oceny planu

Baza: `0d20415c7209d857849d864b1e542dc2fe2ac50b` na zsynchronizowanym main; merge PR #4 `5d36b68` jest przodkiem bazy. Gałąź: `docs/foundation-plan`. Autorzy korzystają z natywnych subagentów z kanonicznymi rolami; nazwany profil został odrzucony przez bieżące API, zastosowano fallback z delivery. Nazwa zadania nie jest dowodem załadowania TOML. Model/reasoning delegowanych sesji dziedziczony; dokładne ustawienie nieudostępnione.

Przed publikacją orchestrator uruchamia istniejące `sync.py --check`, `check.py`, testy harnessu oraz kontrolę diffu i względnych linków zmienionych dokumentów. Nie dodaje nowego walidatora całej specyfikacji. Na zamrożonym kandydacie osobne sesje backend/security przez `harness/scripts/review.py`, QA review odrębnym zadaniem oceny. Po zmianach po review ponawia ocenę dotkniętego zakresu. Dokładne SHA/sesje, wyniki i zamknięte findings raportuje PR; nie wpisujemy przewidywanych PASS do planu.
