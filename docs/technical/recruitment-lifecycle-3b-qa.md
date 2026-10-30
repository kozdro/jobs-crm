# Recruitment Lifecycle 3B — QA

Data: 2026-10-30. Autor: `/root/lifecycle_qa`, rola `qa-engineer`; model/reasoning odziedziczone, `NOT EXPOSED`. Zakres autoryzowany: DEC-055, analiza i plan 3B. Bez zmian produktu przez QA; własność testów integracyjnych/E2E, rejestracji suite w runnerze i tego raportu. Niezależne review oraz hosted CI raportuje orchestrator osobno.

## Kandydat i środowisko

Pełny run2: `f6db0d4e9429b8f87e593944c0ff2f35a7fd5910`, izolowany worktree `/private/tmp/jobs-crm-lifecycle-3b`, runtime kopia `/private/tmp/jobs-crm-3b-runtime`. Realny lokalny PostgreSQL 17, Supabase Auth/Data API/RLS i Chromium na produkcyjnym buildzie HTTPS; Node **24.22.2**, pnpm **12.16.1**. Tylko syntetyczne konta i sprawy. Nie używano persistent DEV ani cloud.

Komenda run2, z katalogu runtime:

```sh
env PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH RECRUITMENT_TARGET_ID=run-a58968f4 /Users/kozdro/.volta/tools/image/node/24.22.2/bin/node /opt/homebrew/bin/pnpm --config.verify-deps-before-run=error test:recruitment
```

Run1 tworzył ten sam target bez `RECRUITMENT_TARGET_ID`. Run2 jawnie użył własnego zachowanego targetu bez resetu, naprawiania poprzednich danych ani ponownego wykorzystania zamiarów: testy tworzą nowe syntetyczne konta/rekordy. Target: `run-a58968f4`, project `jobs-crm-recruitment-64a69a-4b64684eec69`. Ledger 9 migracji; run2 zastosował 0 nowych. Checkpoint: `bcc8dad457efc7ca8a1a93686351895fbc4e156256f7f40b27f50d2271e2f7a3`.

Porty 566xx były zajęte przez obcy target. Kopia runtime ma **wyłącznie trzy adaptery portów 5662x → 5712x**: `scripts/recruitment/target.ts`, `scripts/recruitment/cleanup-plan.ts`, `supabase/recruitment-config.toml`. Nie zmieniono tych profili w repozytorium. `src/**`, `db/**`, `tests/**`: **106/106 plików bajtowo identycznych** ze źródłem przed i po run2, potwierdzonych manifestem SHA256. `node_modules` jest lokalną kopią, bez zewnętrznego symlinka.

## Wyniki wykonania

| Próba / kandydat | Build | Realne DB/Auth/Data API | HTTPS Chromium | Wynik |
|---|---|---|---|---|
| Run1, snapshot początkowej implementacji | exit 0 | 53/53 PASS, 0 skipped/cancelled | 46 PASS / 3 FAIL, exit 1 | **FAIL**, zachowany |
| Run2, `f6db0d4` | exit 0 | 53/53 PASS, 0 skipped/cancelled | 50/50 PASS, exit 0 | **PASS**, pełny zakres suite |
| Run3, ten sam produkt + korekta oczekiwania przed screenshotem w teście 1440 | exit 0 | 53/53 PASS, 0 skipped/cancelled | **1/1 PASS**, wyłącznie test 1440 | **PASS**, kontrola celowana; nie ponowne 50/50 |

Run1 wykrył rzeczywisty błąd: po dwóch kolejnych zapisach etapów nowa akcja mogła użyć starej wersji przed zakończeniem odświeżenia serwerowych props. Frontend dodał dolną granicę wersji potwierdzonej wynikiem własnego zapisu; nie odświeża automatycznie już otwartego draftu. Run2 potwierdził zarówno sekwencyjne akcje bez fałszywego konfliktu, jak i prawdziwy konflikt konkurencyjnej zmiany, jawne odświeżenie, ponowne potwierdzenie i nowy klucz zamiaru.

Pozostałe dwa FAIL run1: nowy test błędnie oczekiwał ręcznego przycisku po reloadzie, gdy poprawne recovery już automatycznie pokazało sukces; asercję skorygowano do istniejącego kontraktu 3A, zachowując sprawdzenie pojedynczego zapisu i braku ponownej wysyłki. Dotychczasowy test zmiany A → B przekroczył ogólny timeout 30 s przy końcowej nawigacji do obcej sprawy; pozostawiono go **bez zmiany timeoutu i asercji**, w run2 przeszedł. Pierwotne wyniki nie są nadpisane przez późniejsze PASS.

Run2 screenshot nazwany początkowo `active-detail-1440.png` został wykonany przed końcem zapisu: dokładna nazwa przycisku znikała po zmianie na „Zapisywanie…”. To **defekt momentu przechwycenia dowodu**, nie dowód aktywnego stanu. Zachowano go jako `historical-pending-1440.png`. Po dodaniu oczekiwań na widoczne `W rekrutacji`, aktualny etap, jeden wpis historii i zamknięty formularz wykonano run3. Run3 ma osobny manifest **106/106** oraz czwartą, wyłącznie diagnostyczną zmianę runnera w kopii: `--grep "DEC055 invitation keyboard and long Unicode stage layout 1440px"`. Patch selekcji jest oddzielony od adapterów portów. Kod produktu i pozostałe testy są identyczne z run2; pełna suite po tej zmianie samych oczekiwań screenshotu nie była lokalnie ponawiana.

Run3 świeży target: `run-783d5906`, project `jobs-crm-recruitment-ad0ba1-94fdd90b3aee`; **9/9 migracji od zera**, ten sam checkpoint. Run3 używał powyższej komendy bez `RECRUITMENT_TARGET_ID`; selekcja browsera pochodziła z opisanego patcha kopii runnera.

## Pokrycie akceptacji

| Kontrakt w granicach DEC-055 | Wykonane dowody / wynik |
|---|---|
| LC-007/014, częściowy UC/TC-005 | Zaproszenie ze Zapisane i Kontakt rozpoczęty atomowo daje W rekrutacji + etap; dokładnie jeden rzeczywisty fakt bez fikcyjnego kontaktu/spotkania. Potwierdzenie aplikacji nie jest zaproszeniem. **PASS**. |
| LC-008/011/012/013, częściowy UC/TC-009 | Oddzielny status/etap; kolejne zaproszenie i jawna zmiana dowolnej indywidualnej nazwy, zachowane `stage_name`/`previous_stage`, wsteczny dzień nie cofa bieżącego stanu. **PASS** dla tego przyrostu, bez globalnego układu/słownika etapów. |
| Walidacja i HE-001/002/003 | Puste/whitespace/161 punktów kodowych, błędny i przyszły dzień odrzucone; trim i 160 emoji oraz 2024-02-29 przyjęte; data nieznana odróżniona od rejestracji. Zachowana regresja chronologii/paginacji i granic dnia Warszawy 3A. **PASS**. |
| Atomowość / retry / współbieżność | Jedna invitation + jeden stan; późniejszy błędny fakt w bulk wycofuje fakt/status/etap. Same-key race, konflikt payloadu, replay po progresji, różne konkurencyjne klucze, ABA z powrotem do tej samej nazwy, stare wersje i bezpośredni INSERT. **PASS**. |
| Regresja 3A i create/read | Dalszy kontakt/aplikowanie zachowują aktywny status i etap; mixed invitation/contact race nie gubi faktów; stary event/create replay nie cofa stanu. Upgrade 0000–0006 → 0007 → 0008 zachowuje wcześniejsze pola i rzeczywisty fakt 3A, bez backfillu. **PASS**. |
| AD-002 / BR-030 / SEC-02 | A ma własny odczyt/zapis; B nie poznaje cudzych list, ID, count, case↔event metadata i recovery key; anon odmowa odczytu eventów i nowego RPC. Próby zmiany stanu bez faktu, spoofing owner/czas/id/snapshot i edycja/usuwanie faktu odrzucone również bez BFF. Zachowane BFF Origin/auth i owner-bound recovery 3A. **PASS**. |
| Jawne potwierdzenie, cancel, recovery | Unconfirmed save bez zapisu; rzeczywiste anulowanie dirty invitation i stage-change bez mutacji. Lost invitation response + reload odzyskuje dokładnie jeden fakt bez prywatnego draftu w sessionStorage. **PASS**. |
| Klawiatura i responsive | Naturalny Tab od strony do inicjatora, Enter, focus nagłówka, Tab przez stage/native date/confirm/save/cancel, Shift+Tab i porzucenie z powrotem do właściwego inicjatora, dla invitation i stage-change. Widoki 1440/1024/768/375 bez poziomego overflow przy nazwie 160 emoji. **PASS** dla wykonanych kontroli; nie pełny audyt WCAG. |

Pliki QA: `tests/integration/recruitment/stages.test.ts` (9 nowych subtestów), `lifecycle.test.ts` (nowy nieobsługiwany kind zamiast dawnego odrzucenia invitation i nazwa testu upgrade), `lifecycle-upgrade.ts`, `tests/e2e/recruitment-lifecycle.spec.ts` (8 nowych testów), `scripts/recruitment/runner.ts` (dołączenie stages suite). Pozostała suite zachowana.

## Dowody i izolacja

Bezpieczne lokalne dowody: `/private/tmp/jobs-crm-3b-qa-evidence/`:

- `run1.log`, `run1-evidence.json`, `run1-test-results/`: zachowane FAIL i ich kontekst. `product-manifest.json` oraz `run1-source-delta.json`: run1 różnił się później wyłącznie formatowaniem dwóch JSON metadata, z potwierdzoną równością parsed JSON.
- `run2.log`, `run2-evidence.json`, `run2-product-manifest.json`, `run2-final-proofs.json`, `run2-port-adapter.patch`: pełne PASS i exact-source proof. Runner przeskanował 19 plików browser artifacts i 15 generowanych odpowiedzi; build/logi/assets przeszły kontrolę sekretów i materiału sesyjnego.
- `run3.log`, `run3-evidence.json`, `run3-product-manifest.json`, `run3-port-adapter.patch`, `run3-browser-selection.patch`, `run3-source-test-change.patch`: końcowy screenshot 1440, świeży upgrade i jawnie celowana selekcja jednego testu.
- `invitation-375.png`: formularz zaproszenia przed zapisem. `active-detail-1440.png`: końcowy aktywny detal ze statusem, bieżącym etapem i historią, po oczekiwaniu na zakończenie zapisu. Poprzedni nieadekwatny screenshot zachowany jako `historical-pending-1440.png`.
- `containers-before.json`, `containers-after-run1.json`, `containers-after-run2.json`, `containers-after-cleanup1.json`, `containers-after-run3-cleanup.json`: **44/44 istniejące wcześniej kontenery** mają identyczne ID, nazwę, image ID, running/status/health oraz bindingi portów. Nie odczytywano do raportu ich env/secrets.
- `run2-cleanup-started.json`, `run2-cleanup-complete.json`, `cleanup.log`: jawne guarded cleanup wyłącznie `run-a58968f4` po wykonaniu testów, bez resetu. `run3-cleanup-complete.json`: standardowe guarded cleanup własnego świeżego targetu po PASS. Manifest/config i dowody zachowane; identyfikatory zużyte.

## Granice

**NOT RUN:** fizyczne technologie asystujące, pełna macierz urządzeń/przeglądarek, pełny audyt WCAG, publiczne Auth/OAuth/release, globalne/default etapy, Kanban/DnD, zamknięcia/wznowienia, korekty, importer i kalendarz. Nie przypisujemy pełnego PASS wszystkim UC/TC-005/009 ani całemu FR-LC-009/010. OPEN-004 nadal blokuje publiczne udostępnienie. Raport nie jest potwierdzeniem niezależnego review, hosted CI, merge ani deploymentu.
