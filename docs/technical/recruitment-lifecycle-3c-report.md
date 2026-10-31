# Recruitment Lifecycle 3C — raport wykonania

Data: 2026-10-31. **PASS lokalnej implementacji i weryfikacji zatwierdzonego zakresu.** Bez merge/deploymentu; hosted CI dla końcowego PR head raportowane osobno. [Kontrakt i analiza SDD](recruitment-lifecycle-3c.md), DEC-057.

## Wynik końcowy

Kandydat testów: `25205782911f2bc22adda1f2b3d7c61048bd4d5c`. Produkt jest identyczny jak `33c858c88560ed7ccd9cdfe96d2539d255169446`; późniejszy delta wyłącznie zawęża selektory testu do treści aplikacji. **Runner r7 zakończył się naturalnie z exit 0:** produkcyjny build PASS, rzeczywisty Auth/Data API/RLS **83/83 PASS**, produkcyjny HTTPS Chromium **73/73 PASS**, bez pominięć. Unit **291 aplikacyjnych + 87 skryptowych PASS**, pełny typecheck/lint/format PASS na niezmienionym produkcie 33c. [Macierz QA i dowody](recruitment-lifecycle-3c-qa.md).

Niezależny backend review PASS na `91fcbee` pozostaje aktualny: później nie zmieniano backendu, SQL ani jego testów integracyjnych. Frontend i security re-review PASS na 33c, wszystkie trzy wcześniejsze P2 CLOSED. [Review delty testu 252](evidence/recruitment-lifecycle-3c/review-r4.json) również PASS, bez nowych findings; wrapper exit 0, changedFiles=[], identyczne fingerprinty przed/po `640b55568d7a61bf06578f6af8751691ac232fbf5feecb0965fb6a29a8d5be6e`. Reviewerzy nie uruchamiali testów.

Poniższe zapisy zachowują historię prób i review, w tym FAIL/NOT RUN; nie zastępują powyższego wyniku końcowego. R6: build i 83/83 integracje PASS, browser FAIL 72/73 z powodu selektora obejmującego także pusty Next route announcer poza main. Delta testu 252 zachowuje wszystkie asercje payloadu, odnowionej zgody, liczby POST i odzyskania pojedynczego zapisu. R7 wykonuje pełny poprawiony test.

[Manifest](evidence/recruitment-lifecycle-3c/qa-source-manifest.json) potwierdza 129/129 plików src/db/tests zgodnych bajtowo między runtime, checkoutem i commitem 252. [Dowód faktycznie wykonanego źródła Playwright](evidence/recruitment-lifecycle-3c/qa-playwright-source.json) wiąże `sourcesContent` z commitem, SHA256 `eaed778168b9d01af6f06fd00983883391fca6251e5bc6fcc89f7a66a000a1d3`. [Runtime](evidence/recruitment-lifecycle-3c/qa-runtime.json) zapisuje naturalny exit 0 oraz bezpieczne podsumowania outputu.

[Izolacja](evidence/recruitment-lifecycle-3c/qa-infra-adapters.json): 50 plików scripts/config porównanych, wyłącznie trzy kontrolowane adaptery 566xx→573xx w runtime poza PR; plik validation pozostaje identyczny. [Guarded cleanup](evidence/recruitment-lifecycle-3c/qa-cleanup.json) usunął tylko własne targety r1/r2/r3. Wszystkie **28/28** wcześniejszych kontenerów zachowały identyczne ID, nazwy i porty; fingerprint inventory przed/po identyczny. Persistent DEV nietknięty. Oryginalny worktree pozostał czysty na merge PR #17.

Obejrzane rzeczywiste zrzuty [375 px](evidence/recruitment-lifecycle-3c/qa-closure-form-375.png) i [1440 px](evidence/recruitment-lifecycle-3c/qa-closure-form-1440.png) uzupełniają testy układu/focusu/klawiatury przy 375/768/1024/1440. Nie dowodzą pełnego audytu WCAG ani testów fizycznego urządzenia.

## Cel, autoryzacja i kandydat

PO zatwierdził 1A/2A/3A/4A wraz z doprecyzowaniami cyklowego Nie aplikowano, trwałości kolejnych zakończeń, obowiązywania BR-011 dla przyszłych modułów i audytu korekt bez fikcyjnych zdarzeń. Autoryzowane pełne wykonanie i osobny PR; bez merge/deploymentu i mutacji persistent DEV/cudzych zmian. Baza8dee66bcfefc91876e7651743a9f777255ac002a, osobny worktree /private/tmp/jobs-crm-lifecycle-3c, branch feat/recruitment-lifecycle-3c. Decyzja/kontrakt b1af7ad, pierwszy kandydat produktu ecf3e8f3220d133cca76ac3c3f9913466722cd78.

Autorzy: /root orchestrator (docs/integracja), /root/lifecycle_backend (db/modules/BFF/unit), /root/lifecycle_frontend (UI/pages/unit), /root/lifecycle_qa (integration/E2E/runner/QA). Model/reasoning inherited NOT EXPOSED. Rozłączne zakresy zapisu, bez dalszej delegacji autorów; reviewerzy niezależni. Skills analyze-requirement/clarify-requirements/plan-slice/record-decision/implement-slice/verify-acceptance/review-change oraz Supabase/context7 zastosowane.

## Zachowanie i wpływ

Addytywna migracja0010 w istniejącym ledgerze Drizzle dodaje odrębne zakończenia/wznowienia oraz rewizje zakończeń; wcześniejsze migracje0000–0009 zachowane bajtowo (10/10). Brak fikcyjnego backfillu zakończeń. Projekcja uwzględnia barierę zamknięcia; stare korekty/void 3A/3B nie otwierają spraw. Snapshoty pozostają oryginalnym kontekstem. Wznowienie z preview przywraca stan uzasadniony nadal ważnymi faktami.

Nie aplikowano sprawdza ważne aplikacje w cyklu konkretnego zakończenia, także przy korekcie starego zakończenia. Cykl wyznacza kolejność zastosowania komend, nie dzień faktu. Legacy aplikacje z nieznaną rewizją należą do cyklu początkowego. Brak aplikacji w nowym cyklu nie usuwa starej aplikacji.

Wynik bez domyślnego wyboru z ośmiu zatwierdzonych wartości; wyniki oferty wymagają jawnego potwierdzenia. Opcjonalny nieprzyszły dzień/unknown i odrębny czas zapisu. Audytowane korekty wyniku/dnia zachowują oryginał, kolejne rewizje, before/after i zaufanego aktora/czas, bez nowej aktywności biznesowej i zmiany stanu.

BFF lifecycle-commands, walidatory domeny i prywatne odczyty/recovery, INVOKER/RLS i minimalne grants również dla bezpośredniego Data API. Monotoniczne rewizje, preview/confirm, transakcje i replay bez odtwarzania dawnych skutków. Wspólna paginowana historia faktów, zakończeń i wznowień. Recovery owner/case/request-bound, kontrola spóźnionych odpowiedzi, konflikt bez cichego rebase, cancel/focus.

Podstawa: FR/AC-LC-016–021, LC-014/015, HE-001/002/003, AD-002, nowe AC-LC-016-03/-04, LC-017-02/-03, LC-019-03, LC-015-04, LC-014-05, HE-002-06, BR-003–012/015/016/030; UC/TC-013 i podzakres012, regresje005/009/021. DATA-01/SEC-02 rozszerzone tylko w zatwierdzonym zakresie. Bez zmiany architektury/zależności/ADR.

## Weryfikacja i historia prób

Node24.22.2 / pnpm12.16.1, syntetyczne dane. Osobny lokalny target Auth/PostgreSQL/Data API i production HTTPS Chromium; bez cloud oraz persistent DEV. Trzy kontrolowane adaptery runtime573xx chronią zajęty kanoniczny profil566xx; validation pozostaje identyczny. Dokładny manifest podaje QA.

- PASS: pnpm test:unit, 287 testów aplikacji i87 skryptowych; typecheck, lint, format:check.
- PASS: pnpm test:boundaries i pnpm test:canary; kontrole granic i positive controls bez zmiany aplikacji.
- PASS historyczne częściowe: focused real3C15/15 oraz pełna integracja81/81 w r3; finalny browser/runner osobno poniżej.
- Pierwsze fullunit:277 aplikacyjnychPASS i86/87 skryptowych, FAIL stary licznik migracji10vs11. Dokładny fixture rozszerzony o nową migrację bez osłabiania ochrony ledgeru, finalne287+87PASS.
- Próba runtime r1: zmiana jeszcze niezamrożonej0010 po przygotowaniu własnego targetu; guard odmówił ledger/hash mismatch. Wyniki PGRST202 z częściowego setupu nie są akceptacją produktu. Własny target wycofany wyłącznie guardem, bez naprawiania ledgeru i bez dotykania wcześniejszych zasobów.
- r2: production buildPASS, fullintegrationFAIL78/80 (pojedynczy assertion dokładnej listy3 tabel, plus parent); zatwierdzone dwie nowe tabele dodano do dokładnej allowlisty, wszystkie kontrole RLS/grantów zachowane. r3: buildPASS i81/81 integrationPASS; browser w toku.

## Niezależny review

Osobne sesje rodziców read-only przez python3 harness/scripts/review.py codex <role> --timeout900, MCP/plugins wyłączone, dokładnie jeden generic subagent+canonical role w każdym. Osobny checkout kandydata ecf3e8f, autorzy nie są reviewerami. Backend i security statycznie PASS bez potwierdzonych findingsP0–P3; frontend w toku. Reviewerzy nie uruchamiali testów. Receipts/sesje i końcowy stan zostaną zapisane po zamknięciu wszystkich bramek.

## Ograniczenia i odłożony zakres

3C nie implementuje Task/CalendarEvent. Pełne AC-LC-018/TN-011/TC-012 NOT RUN; BR-011 nadal obowiązuje przyszłe moduły. Zamknięcie ma jawną bramkę odmawiającą działania po pojawieniu się znanych tabel wymagających integracji; nie jest to implementacja anuluj/zachowaj/odłącz. OPEN-029/040 i zależny OPEN-021 zachowane.

AC-LC-021 częściowe lista/detal, Global Search poza zakresem. Automatyczne proponowanie nowej sprawy vs kontynuacji, niezależny PATCH statusu, void/retype zakończeń, retencja/harddelete/restore, import, globalne etapy, kontakty/CV/komunikacja i publiczne Auth/privacy/OPS pozostają poza zakresem. Publiczny release, fizyczne urządzenia/AT, pełny audyt WCAG i live OAuth NOT RUN.

Przynależność nowej aplikacji do cyklu wynika z momentu zastosowania komendy. Nigdy wcześniej niezapisany, opóźniony zamiar 3A bez tokenu cyklu stosuje się w cyklu aktualnym; nie jest to replay wcześniej zapisanego faktu. Skutecznie zapisane retry nie odtwarza starego skutku. Wsteczny dzień faktu sam nie przenosi aplikacji do dawnego cyklu.

Raport i QA muszą odróżniać testy od statycznego review; końcowy status i PR dopiero po wymaganych kontrolach. Bez merge/deploymentu.

## Niezależny review r1 — ecf3e8f

[Receipts i raporty](evidence/recruitment-lifecycle-3c/review-r1.json): backend PASS i security PASS bez potwierdzonych findingsP0–P3; frontend FAIL2P2. Każdy wrapper exit0, changedFiles[], fingerprintBefore=After633cd59977dabd1164cb6243ce8eef4c14d53895ae2fba2d09374da813f1ce16.

Frontend P2: (1) storage.setItem wyjątek + utrata odpowiedzi confirm + porzucenie formularza mogły zgubić jedyny command/requestId; (2) błędny tekst oczekiwany przez E2E paginowanej historii. Autor frontend naprawia1, QA poprawia2 oraz dodaje regresję1. Backend wskazał lukę testu legacyNULL oldclosure correction, security osobne próby każdego zaufanego pola; QA rozszerza oba dowody. Findings nie są zamknięte samym opisem — wymagane runtime i re-review.

r3 runner: buildPASS, integration81/81PASS, browserFAIL71/72 (jedyna porażka: znana rozbieżność tekstu asercji). r4 powtarza QA delta na dotychczasowym produkcie; nie jest końcowym dowodem planowanej poprawki1.

## Re-review r2 i kolejne próby

[Raporty i receipts](evidence/recruitment-lifecycle-3c/review-r2.json), kandydat91fcbee: backendPASS; frontend/securityFAIL ten sam nowyP2. Poprzednie2P2 CLOSED statycznie. Odmowa storage przedPOST pozostawiała frozen command mimo powrotu do edycji/nowego podglądu; zapis mógł wysłać stary wynik bez nowego potwierdzenia. Autor usuwa zamrożenie przed skuteczną persystencją; nowa regresja wymaga aktualnego payloadu i ponownej zgody po edycji.

r4: naturalexit0, buildPASS, integration83/83PASS, browser72/72PASS na produkcie sprzed poprawki storage — jawnie nie jest końcową akceptacją tej poprawki. r5: buildPASS, integrationFAIL81/83 (jeden negatywny test wrażliwości +parent), browserNOTRUN. Powód udowodniony na własnym wielokrotnie używanym targetcie: po1408 sprawach DataAPI przy wyłączonym na potrzeby kontrolnego testuRLS zwrócił206 range0–999/1408, zanim helper wymagający200 doszedł do asercji wycieku. Kontrolna diagnoza przywróciłaRLS=true. Bez waivera i bez osłabiania asercji; końcowy runner użyje świeżego własnego targetu po guarded cleanup poprzedniego.

## Re-review r3 — produkt33c858c

[Receipts i raporty](evidence/recruitment-lifecycle-3c/review-r3.json): frontendPASS i securityPASS, wszystkie3wcześniejszeP2 CLOSED, brak nowychfindings. Wrappery exit0/changedFiles[], fingerprintBefore=Afterb1ffa4447ff3a746fb5619b72b49a5c98f367280b486b239b1c08d2b825eed0a. BackendPASS91fc pozostaje aktualny, ponieważ później zmieniono wyłącznie frontendintent/UI i ich testy, bez zmiany ocenianego backendu/db/integration.

[Końcowe statics](evidence/recruitment-lifecycle-3c/static-checks-final.json):291aplikacyjnych+87skryptowychPASS, pełnytypecheck/lint/formatPASS na33c. Boundaries/canaryPASS na91fc; późniejszy delta nie zmienia kontrolowanych env/importów/granic. HostedCI dla końcowegohead raportowane osobno.

r6 na33c: buildPASS, integration83/83PASS, browserFAIL72/73 — jeden selector nowej regresji obejmował również pusty Next route announcer poza main. Snapshot potwierdził właściwy błąd braku wysyłki; asercje nie zostały osłabione. QA zawęziło alerty wyłącznie do main; jedyny testowy delta2520578 bez zmianproduktu. Pełnyr7 i niezależnyreview tego deltu są wymagane do zakończenia.
