# Recruitment Lifecycle 3C — QA

**Data:** 2026-10-31. **Status:** PASS w zatwierdzonym lokalnym zakresie DEC-057; pełne zadania/kalendarz i Global Search poza pokryciem. **Kandydat wykonania:** `25205782911f2bc22adda1f2b3d7c61048bd4d5c`. Produkt jest identyczny z `33c858c88560ed7ccd9cdfe96d2539d255169446`; późniejszy commit ogranicza tylko selektory testu do właściwego obszaru strony.

Autor testów i wykonania: `/root/lifecycle_qa`, rola `qa-engineer`, model/reasoning odziedziczone — NOT EXPOSED, bez dalszej delegacji. QA nie jest niezależnym reviewerem własnych testów; wyniki niezależnych review raportuje orchestrator. Zastosowano plan-slice, implement-slice i verify-acceptance oraz harness delivery. Podstawa: DEC-057 i wcześniejsze DEC-052/054/055/056, BR-003–012/015/016/030, FR/AC-LC-016–021, HE-001/002/003, AD-002; UC/TC-013 i częściowy UC/TC-012.

## Środowisko i tożsamość

Przypięte Node `24.22.2`, pnpm `12.16.1`, zamrożony lockfile, osobny runtime `/private/tmp/jobs-crm-3c-runtime`, syntetyczne konta, rzeczywisty lokalny Auth/Data API/RLS, production build i HTTPS Chromium. Żaden test nie używa persistent DEV ani cloud. Admin służy wyłącznie do syntetycznych fixtures, kontroli katalogu, fizycznego upgrade’u i dokładnie ograniczonych fault-injection probes; właściwe operacje biznesowe i izolacja są sprawdzane przez użytkownika A/B/anon i HTTP Data API.

Kanoniczne porty 566xx były zajęte przez wcześniejsze zasoby. Własne disposable targety korzystały wyłącznie z jawnego adaptera 566xx→573xx w runtime: `target.ts`, `cleanup-plan.ts`, `recruitment-config.toml`. Plik `validation.ts` znajduje się na allowliście adapterów, ale faktycznie pozostał identyczny. Kanoniczna infrastruktura repozytorium nie zmieniła portów. [Dowód 50 plików infrastruktury](evidence/recruitment-lifecycle-3c/qa-infra-adapters.json) wykazuje zero innych różnic.

[Manifest źródeł](evidence/recruitment-lifecycle-3c/qa-source-manifest.json): **129/129** plików src/db/tests ma identyczne SHA256 w canonical worktree, runtime i commicie kandydata. [Rzeczywisty cache transpilation Playwright](evidence/recruitment-lifecycle-3c/qa-playwright-source.json) zawiera finalny `sourcesContent` E2E o SHA256 `eaed778168b9d01af6f06fd00983883391fca6251e5bc6fcc89f7a66a000a1d3`, zgodny z kandydatem. Nie oparto dowodu wyłącznie na chwili skopiowania pliku.

## Wykonana weryfikacja

Rzeczywista komenda końcowa w runtime:

```sh
RECRUITMENT_TARGET_ID=lifecycle-3c-r3 \
PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH \
node scripts/recruitment/runner.ts
```

Jest to dokładny entrypoint skryptu `test:recruitment`. Wrapper oddzielnie zapisał naturalny exit code procesu Node — **0**, bez timeout/kill i bez maskowania kodu przez końcowy odczyt logu. [Bezpieczny log](evidence/recruitment-lifecycle-3c/qa-full-r7.log) i [receipt runtime](evidence/recruitment-lifecycle-3c/qa-runtime.json).

| Kontrola | Wynik |
| --- | --- |
| Guarded local target i migracje | PASS, 11/11 migracji, bez resetu DEV i zmiany wcześniejszych migracji |
| Production build | PASS, rzeczywisty child exit 0 |
| Integracja wraz z regresjami create/read, 3A, 3B, DEC-056 i nowym 3C | PASS **83/83**, 0 fail/skip/cancel |
| Production HTTPS browser wraz z wcześniejszymi scenariuszami | PASS **73/73**, exit 0, bez retry maskującego błędy |
| Top-level runner | PASS, natural exit **0** |
| Izolacja i cleanup własnych zasobów | PASS, tylko własne targety usunięte; **28/28** pierwotnych kontenerów zachowane z tymi samymi ID, nazwami i portami |

## Pokrycie AC i ryzyk

| Podstawa | Wykonany dowód |
| --- | --- |
| AC-LC-016/-01; BR-008/009 | Brak/nieznany wynik i przyszły/niepoprawny dzień odrzucane bez mutacji; osiem wyników wybieranych jawnie, potwierdzenie rzeczywistej oferty wymagane, brak domyślnego wyniku w UI; upływ czasu nie generuje zamknięcia. |
| DEC-057 — Nie aplikowano | Ważna aplikacja blokuje wynik tylko w swoim cyklu. Wsteczny dzień nie przenosi aplikacji między cyklami. Korekta wcześniejszego zakończenia sprawdza jego cykl. Fizyczny upgrade obejmuje legacy `applied_case_revision=NULL`: odmowa korekty początkowego zakończenia na Nie aplikowano oraz dopuszczenie tego wyniku i korekty w kolejnym cyklu. |
| AC-LC-017/-01, LC-019/-01/-02; BR-010 | Close→reopen→close tworzy trzy odrębne wpisy, dwa różne zakończenia; wcześniejsze oryginały, wyniki, daty i snapshoty pozostają. Wznowienie nie tworzy kontaktu ani zaproszenia. |
| DEC-056/057; BR-005/007/016 | Void starego zaproszenia przy Zakończone zachowuje zamknięcie; preview wznowienia przelicza ważną podstawę, stare preview po korekcie jest odrzucane. Audytowana korekta wyniku/dnia nie zmienia statusu, cyklu ani liczby aktywności; oryginał i rewizje są czytelne w UI. |
| Retry, concurrency, rollback | Identyczny i równoległy retry dokładnie raz, payload mismatch, stare close/reopen/revision retry po kolejnych cyklach bez odtwarzania skutków; realne request races close/close, close/correction i reopen/reopen, ABA; wymuszone niepowodzenie AFTER UPDATE projekcji cofa zakończenie i stan. |
| AD-002, BR-030, SEC-02 | Właściciel A ma pozytywne odczyty oryginału/current/audytu; B/anon nie uzyskują danych przez listę, ID, request ID, count ani komendy. Obce powiązanie case–closure odrzucane. Dozwolony direct INSERT ma te same skutki i replay co RPC. Każde chronione pole próbowane niezależnie: id, owner, cycle, czas, previous/resulting status/etap oraz id/owner/czas/revision/before_values/after_values audytu; brak częściowych mutacji. PATCH/DELETE i arbitralny status odrzucane. |
| BFF | Rzeczywiste Origin, bound expectedUserId, anon refusal oraz private/no-store na odpowiedziach. |
| Historia i odczyt | 27 rzeczywistych wpisów faktów i lifecycle na dwóch stronach, brak utraconych/podwójnych ID, znane dni przed unknown, historyczne korekty i reload; zamknięta sprawa dostępna przez listę i detal. |
| Recovery i zgoda | Niedostarczony POST + reload ponawia identyczny zamiar raz. Przy odmawiającym sessionStorage: zero confirm POST; edycja po odmowie i nowy preview wymagają nowej zgody, wysyłany jest nowy wynik/dzień. Następnie rzeczywisty commit przez `route.fetch` i utrata odpowiedzi przez abort: trwały ten sam request pozostaje, porzucenie blokuje nowy zamiar, reload i odczyt odzyskują jeden zapis. Nie fabrykowano odpowiedzi biznesowej. |
| UX | Cancel/świadome porzucenie bez mutacji, return focus, klawiatura, rzeczywiste viewporty 375/768/1024/1440 i brak poziomego overflow. Obejrzano [375](evidence/recruitment-lifecycle-3c/qa-closure-form-375.png) i [1440](evidence/recruitment-lifecycle-3c/qa-closure-form-1440.png); controls/etykiety są czytelne. |

Fizyczny upgrade używa minimalnego syntetycznego Auth substrate w osobnej bazie na własnym targetcie; jest dowodem migracji i zachowania danych, a nie samodzielnym dowodem RLS. Izolację dowodzą osobne rzeczywiste testy HTTP A/B/anon.

## Zachowane nieudane przebiegi

Pełne lokalne artefakty: `/private/tmp/jobs-crm-3c-qa-evidence/`. Nie zmieniono dawnych prób w PASS.

- **R1 — invalid setup / FAIL:** migracja 0010 została skopiowana podczas zapisu backendu; następny sync wykrył zmianę hash i guard odmówił dalszej migracji. Wcześniejsze RPC zwracały PGRST202 w częściowym snapshotcie. Nie naprawiano ledgeru ani nie resetowano bazy; usunięto tylko własny target i utworzono świeży po jawnej blokadzie zapisu SQL. To nie jest dowód akceptacji produktu.
- **R2 — FAIL 78/80 integracji:** dotychczasowa dokładna allowlista publicznych tabel miała trzy pozycje; zatwierdzony 3C dodał dwie. Rozszerzono ją do dokładnie pięciu, zachowując wszystkie kontrole RLS, grantów i INVOKER.
- **R3 — FAIL 71/72 browser:** nowy test używał błędnej etykiety unknown date; poprawiono oczekiwanie do rzeczywistego „Data zdarzenia nieznana”, bez zmiany zachowania produktu.
- **R4 — PASS 83 integracji / 72 browser dla wcześniejszego kandydata:** nie certyfikuje późniejszych poprawek recovery znalezionych niezależnym review.
- **R5 — FAIL 81/83 integracji:** wielokrotnie użyty własny target przekroczył limit 1000 wyników Data API. Istniejący negatywny test czułości po celowym wyłączeniu RLS oczekuje 200 przed asercją wycieku; odpowiedź była 206. [Kontrolowany dowód](evidence/recruitment-lifecycle-3c/qa-reused-target-diagnosis.json): 1408 rekordów, `0-999/1408`, 1000 zwróconych, RLS przywrócone. Nie osłabiono asercji. Własny target usunięto guardem; finalny profil miał 293 rekordy przed ostatnim pełnym przebiegiem, poniżej limitu.
- **R6 — FAIL 72/73 browser:** nowy test storage miał niejednoznaczny globalny locator alert — realny komunikat odmowy zapisu oraz pusty Next route announcer. Snapshot potwierdzał poprawne „Nie wysłano operacji”. Ograniczono locator do main. Właściwa cała ścieżka recovery została dopiero wykonana i zaliczona w R7.
- **R7 — PASS:** końcowy kandydat, 83/83 integracji i 73/73 browser; natural exit 0, tożsamość źródeł i cleanup opisane powyżej.

## Ograniczenia i odłożony zakres

**NOT RUN / poza zatwierdzonym zakresem:** pełne TC-012 z rzeczywiście otwartymi Task/CalendarEvent, efekty anuluj/zachowaj/odłącz z OPEN-029/040 i zależnego OPEN-021, Global Search z pełnego AC-LC-021, fizyczne urządzenia, technologie asystujące, pełny audyt WCAG, live OAuth i publiczny release. Nie deklaruje się pokrycia wszystkich możliwych przeplotów współbieżności.

Lokalne ograniczenie 3C nie uchyla BR-011. Przyszłe moduły muszą integrować rzeczywiste otwarte działania i atomową decyzję użytkownika; nie wolno uznać obecnego braku takich obiektów za docelową implementację rozstrzygania zadań. Brak merge/deploymentu. [Cleanup](evidence/recruitment-lifecycle-3c/qa-cleanup.json) potwierdza końcowe 28/28 wcześniejszych kontenerów i brak obcych zmian zasobów.
