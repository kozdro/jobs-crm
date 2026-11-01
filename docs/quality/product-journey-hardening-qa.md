# Product Journey UX Hardening — QA

2026-11-01. **Finalny runtime PASS w niezależnym zakresie hardeningu.** Kandydat kodu/testów: `4941924df40d7affbcd90d2a721f9f80ed6d7199`; produkt identyczny z `0f93627`, późniejsza delta wyłącznie w regresjach. Baza main: `637f330f6dc1215ad2479dd699b8814397e5b5de`. QA: `hardening_qa`, model/reasoning inherited / NOT EXPOSED. [Task packet i zgodność źródeł](../technical/product-journey-hardening-task.md), [analiza i kwestie PO](../technical/product-journey-hardening-analysis.md). Zastosowano plan-slice i verify-acceptance; brak dalszej delegacji.

| Kontrola | Wynik i dokładny zakres | Dowód |
| --- | --- | --- |
| Pełny lokalny production HTTPS Chromium | **PASS129/129, natural exit0**, `eb461e453a9277fa24ce03e46b2afc3b32f42513`; 118 istniejących +11 nowych. Przed późniejszym fixem fragment allowlist i5testami nav/security | [Full R2](../technical/evidence/product-journey-hardening/qa-full-suite-r2.json) |
| Finalny focused production HTTPS Chromium | **PASS16/16, natural exit0**, `4941924`; 11hardening +5nav/security, osobny świeży target | [Focused R6](../technical/evidence/product-journey-hardening/qa-focused-r6-pass.json) |
| Rzeczywiste integracje Auth/Data API/PostgreSQL/RLS | **PASS133/133, exit0**, 0failed/skipped/cancelled w pełnym R2 i finalnym R6 | Receipts R2/R6 |
| Migracje i production build | **PASS14/14**, build exit0 na obu świeżych targetach; finalny R6 skan24browserfiles +15generatedresponsefiles | Receipt R6 |
| Nawigacja detalu i wizualne | **PASS** 1440/1024/768/375, klawiatura/focus/hash/scroll i brak page overflow; summary/journey dodatkowo1440/375; obejrzano8PNG | [Visual hashes/dimensions](../technical/evidence/product-journey-hardening/qa-visual-r6.json) |
| Właściciel przy atakach fragmentem | **PASS15obserwacji**; bootstrap/reload scrub, same-document owner unchanged; bez tokenów w dowodach | [Proof R6](../technical/evidence/product-journey-hardening/qa-fragment-bootstrap-owner-r6.json) |
| Tożsamość source i cleanup | **PASS904regularfiles +28symlinks bez zmian runtime**,4jawne adaptery; własne zasoby0, baseline44/227/10zachowany | [Source after](../technical/evidence/product-journey-hardening/qa-runtime-after-r6.json), [preservation](../technical/evidence/product-journey-hardening/qa-preservation-final.json) |
| Fizyczny telefon, touch/soft keyboard/safe areas, Safari/Firefox, AT, rzeczywisty zoom | **NOT RUN**; dostępny desktop Chromium i zmieniony viewport | Nie deklarujemy certyfikacji WCAG ani hardware QA |
| Pełne Quick Capture create+fact | **BLOCKED_DECISION**; nowy kontrakt atomowy wymaga PO, bez zmiany docelowego Blueprintu | Analiza / propozycja PO |

## Zgodność i pokrycie

Źródła: Discovery przez DEC-014/015/029–032/049 i provenance; UX Blueprint §3/§8/F02/F04/F05/UX-006; DEC-052/053/054–060; FR/AC-QC/LC/HE/CC/RW/TN; BR-007/011/016/020/030; UC/TC-001/012(Task)/024/030; ADR-0010 i ADR-0012. Technical Discovery nie jest samodzielną zgodą na nową semantykę. Zadanie QA wymagało weryfikacji źródeł przed implementacją; test nie zastępuje decyzji PO.

`recruitment-product-journey-hardening.spec.ts` —11przypadków:

- Dwie ciągłe podróże1440/375 przez rzeczywisty UI: capture → aplikowanie/kontakt → zaproszenie/etap → firma/osoba →3Task → atomowe anuluj/zachowaj/odłącz → odczyty Tasks/Dashboard/Workspace → reopen bez reaktywacji → korekta z oryginałem/rewizją i bez fikcyjnych faktów.
- Dwa przypadki Task summary create/edit: równocześnie pusty tytuł i opis2001, błędy pól oraz podsumowanie, linki klawiaturowo ustawiają focus, dane pozostają i nie powstaje częściowy rekord. Poprawny zapis działa; późniejsza błędna edycja nie zmienia zapisanej rewizji.
- QC zachowuje cztery kroki, pomocniczy wybór sytuacji, opcjonalność, back/forward, save-next reset i dirty guard także przy samej sytuacji. Osobne6save-only (pięć zatwierdzonych sytuacji +brak wyboru) zawsze dają Zapisane/nullstage/zeroevent/lifecycle, także „Wykonana aplikacja” i „Kontakt”.

`recruitment-product-journey-navigation.spec.ts` —5przypadków:

- Cztery szerokości1440/1024/768/375: natywny fragment entry/reload, focus i pozycja sekcji, niezapisany Task zachowany przez skróty/Back/Forward, brak zapisu DB, jawne discard i prawdziwy filtrowany powrót Workspace SPA. Reload sprawdza istniejący fallback, nie wymyśloną trwałą pamięć kontekstu.
- Rzeczywisty JWT syntetycznego B w zwykłym fragmencie i suffixie `case-history&access_token=...` na detalu A oraz/account. Każdy bootstrap poprzedza odrębna ścieżka/dashboard; wymagany scrub i właściciel A. Native same-document sprawdza niezmieniony owner i tę samą generation; reload ponownie wymaga scrub i nowej generation. Dokładny legalny fragment na/account jest niedozwolony. Wszystkie15bezpiecznych proof records potwierdzają oczekiwania.

Istniejąca pełna suite R2 wykonała dodatkowo owner A/B/anon, listy/bezpośrednie ID/relacje, idempotencję, rollback, stale writes, korekty/void/orphan i retry/recovery. To nie jest dowód wszystkich kombinacji w jednej sesji ani ukończenie całego TC-012 z CalendarEvent/TC-024. Calendar/Reminders/DnD/import/dokumenty/pełny Dashboard pozostają oddzielnymi funkcjami.

## Odtworzenie i izolacja

Komenda: `PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH /Users/kozdro/.volta/tools/image/node/24.22.2/bin/node scripts/recruitment/runner.ts`.

R2: `/private/tmp/jobs-crm-hardening-runtime-20261101`, świeży `run-332868d0`. R6: `/private/tmp/jobs-crm-hardening-focused-20261101`, świeży `run-f63e1d61`, bez reuse danych diagnostic/integration. Fizyczna lokalna kopia istniejących dependencies, bez install i bez symlinku poza root Turbopack. Dokładny Git archive kandydata +jawne adaptery tylko kopii: target.ts/cleanup-plan.ts/recruitment-config.toml prefiks5662→5762; focused dodatkowo testMatch dwóch plików. Nie zmieniono product/schema/Auth kontraktów w runtime. [Manifest R6](../technical/evidence/product-journey-hardening/qa-runtime-manifest-r6.json). Pełny R2 nie pomijał dwóch testów rzeczywistego expiry.

Cleanup manifest-aware przez stopRecruitmentTarget: automatyczny R2/R6, jawny własnego diagnostic run-a7f575de. [Cleanup R2](../technical/evidence/product-journey-hardening/qa-owned-cleanup-r2.json), [R5](../technical/evidence/product-journey-hardening/qa-owned-cleanup-r5.json), [R6](../technical/evidence/product-journey-hardening/qa-owned-cleanup-r6.json). Końcowo kontenery44/44, volumes227/227, networks10/10, missing0/added0. Persistent DEV, oryginalny checkout i obce zasoby bez ingerencji. Bez merge/deploymentu. Hosted CI exact-head raportuje orchestrator odrębnie.

## Zachowana historia FAIL i ograniczeń

- Setup R1: zbyt krótki PATH nie obejmował Dockera; odmowa przed targetem. Przywrócenie PATH z jawnym Node rozwiązało problem. [Receipt](../technical/evidence/product-journey-hardening/qa-setup-fail.json). Pierwszy lint nowego testu wykrył unused import Page; usunięty, ESLint/Prettier/list16PASS. To nie wyniki runtime AC.
- Frontend review wykrył rzeczywisty problem: pierwotny Auth guard usuwał legalne fragmenty przy inicjalizacji/reload. Frontend dodał exact6fragment allowlist tylko na dokładnym UUIDdetail, bez suffixów/dekodowania, z detectSessionInUrl:false. Stary fullrun nie został mutowany.
- Review testu wykrył błędne oczekiwanie trwałego Workspace return po reload. Rozdzielono reload/fallback od SPAfilteredreturn, bez zmiany persistence produktu.
- Focused R3 na0dc53ed: **FAIL15/16**. Diagnostic R4/R5 na własnym retained target: **FAIL0/1**, powtórzona zbyt szeroka asercja hash removal po native-only zmianie fragmentu. W R5 performance.timeOrigin jest identyczne i ownerA pozostaje; directbootstrap ma nową generation i hashfalse. [R3](../technical/evidence/product-journey-hardening/qa-focused-r3-fail.json), [R4](../technical/evidence/product-journey-hardening/qa-diagnostic-r4-fail.json), [R5](../technical/evidence/product-journey-hardening/qa-diagnostic-r5-fail.json), [dowód generation](../technical/evidence/product-journey-hardening/qa-fragment-generation-r5.json). Zachowano stare źródła i error-context.
- Po tym dowodzie test rozdziela bootstrap od native-only i reload; security invariant jest sprawdzany na każdym etapie. Nie dodano niezatwierdzonego hashchange listenera ani nie osłabiono ochrony SDK. Finalny świeży R6 potwierdza16/16; nie kasuje wcześniejszych FAIL i nie jest lokalnym pełnym rerun134testów.

QA zmienił tylko2pliki testów, ten raport i bezpieczne artefakty. Review niezależne jest obowiązkiem oddzielnych sesji orchestratora; pozytywny test nie nadaje reviewPASS. Pełne Działanie w Quick Capture nadal wymaga jawnego kontraktu PO; brak ten nie został ukryty pod „MVP simplification”.
