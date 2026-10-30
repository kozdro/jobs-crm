# Recruitment Lifecycle 3A — raport wykonania

**Stan:** PASS — lokalna implementacja, końcowe testy i niezależne review; publiczne udostępnienie nadal zablokowane OPEN-004. Brak publicznego wdrożenia. Data 2026-10-30. Baza main ac55059, branch feat/recruitment-lifecycle-3a. Źródło zatwierdzenia: DEC-054, jawne warianty PO 1A/2A/3A i pełna implementacja z osobnym PR; bez merge/deploymentu.

## Wynik i zakres

Dwie akcje na detalu istniejącej sprawy rejestrują aplikowanie lub kontakt inbound/outbound. Formularz wymaga świadomego potwierdzenia faktu, przyjmuje opcjonalny dzień bez godziny i uprzedza o ograniczeniu append-only. Zapis faktu i Kontakt rozpoczęty są atomowe; kolejne fakty pozostawiają status. Jedna paginowana historia odróżnia dzień faktu, nieznaną datę i czas rejestracji; nie tworzy backfillu ani fikcyjnych CV/zaproszeń. Retry tego samego zamiaru oraz identyfikatorowe recovery nie dublują faktów.

DEC-002/004/006/009/022/052/053/054; BR-003/004/007/014–018/021/026/030; podzakres FR-LC-002/004/005/006/014, FR-HE-001/002/003/005 oraz FR-AD-002. AC-LC-005-01/006-01/014-01 i AC-HE-001-01/002-03/003-02. TC-002/003/004 tylko częściowo (bez kanałów, CV i relacji osób). [Kontrakt, impact i plan](recruitment-lifecycle-3a.md), [traceability](../quality/traceability.md).

## Autorzy i zmienione obszary

- /root: DEC/OPEN, kontrakt, FR/AC/UC/traceability, raport, test zgodności siedmiu wcześniejszych migracji z rozszerzonym ledgerem.
- /root/lifecycle_backend (backend-engineer): db/recruitment/schema.ts, migracja 0007 i snapshot/journal, moduł domeny/aplikacji case-events, parser odczytu spraw, commands route, unit testy domeny/komendy.
- /root/lifecycle_frontend (frontend-engineer): formularz, historia, event-intent, detal i własne testy UI.
- /root/lifecycle_qa (qa-engineer): integracja real Auth/PostgreSQL/Data API, E2E lifecycle i runner serializujący oba pliki integracyjne.

Modele/reasoning odziedziczone, dokładne wartości NOT EXPOSED. Niezależne sesje reviewerów i oceniony kandydat są wskazane poniżej; autorzy nie oceniają własnych plików. Brak nowej decyzji architektonicznej/ADR: pozostają Drizzle, Supabase-native Auth/RLS i SECURITY INVOKER.

## Weryfikacja

Rzeczywisty runtime: Node v24.22.2 przez PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH, pnpm 12.16.1. Sam wrapper pnpm bez tej korekty wskazywał Node26; nie użyto go do końcowego runtime proof. Syntetyczne dane, bez cloud i bez mutowania persistent DEV/manual-dev.

| Kontrola | Wynik | Dowód |
|---|---|---|
| pnpm test:unit | PASS — 208 Vitest + 87 skryptów | .harness-runs/lifecycle-3a/unit-final-v2.log, exit0 |
| pnpm typecheck | PASS | .harness-runs/lifecycle-3a/typecheck-final-v4.log, exit0 |
| pnpm lint | PASS | .harness-runs/lifecycle-3a/lint-final-v4.log, exit0 |
| pnpm format:check | PASS | .harness-runs/lifecycle-3a/format-final-v4.log, exit0 |
| pnpm test:boundaries | PASS | wykonane lokalnie, kontrole FQA-02/03/04/06, exit0 |
| pnpm test:canary | PASS | build i skaner asset/HTML/RSC/DOM/logów, kontrola pozytywna i invalid-env rejection, exit0 |
| pnpm test:recruitment | PASS — finalny runner8 build, 43/43 integracja, 42/42 browser (13 lifecycle +29 regresji), exit0 | .harness-runs/lifecycle-3a-qa/runner-8.log i summary.json; snapshot103/103 plików src/db/tests identyczny |
| Pierwsze niezależne review backend/security | PASS statyczny, bez potwierdzonych findings | read-only Codex wrapper, candidate fingerprint18763a2f…eb1a, changedFiles[] |
| Pierwsze niezależne review frontend | FAIL — jedno P3 fokus po porzuceniu/powrocie formularza kontaktu | produktowy P3 zamknięty przez frontend review v2; historyczny FAIL zachowany |
| CI exact SHA | NOT RUN w chwili zapisu tego raportu przed publikacją; osobna bramka PR | aktualny final-SHA, wyniki wszystkich jobs i link run w opisie PR po wykonaniu; bez domniemania PASS |

Dowody w .harness-runs są lokalne i ignorowane, nie zawierają w raporcie sekretów ani prywatnej korespondencji. Lokalny build/kompilacja nie zastępują runtime AC. Browser keyboard/layout 375/768/1024/1440 PASS; cztery screenshoty375/1440 i geometria innerWidth=scrollWidth=visualViewport.width, root oraz QA obejrzeli formularz/historię. Dowody .harness-runs/lifecycle-3a-qa/visual/.

## Zachowane nieudane próby

- Typecheck początkowo FAIL: typowanie TransactionSql w nowym teście QA; poprawione przez autora, ponowny typecheck PASS.
- Pełne unit początkowo FAIL: 208 testów aplikacji PASS, 86/87 skryptów PASS; stara asercja liczby migracji7. Zmieniona na8 i dodany prefix7 jako test aktualizacji; ponowne 208+87 PASS.
- Format początkowo FAIL dla wygenerowanych metadata Drizzle; sformatowane, ponowne PASS.
- Runner1 FAIL przed DB: port56621 zajęty przez istniejący manual-dev; targetu nie zatrzymano ani nie resetowano.
- Runner2 FAIL na buildzie snapshotu: Turbopack odrzucił zewnętrzny symlink node_modules. Migracje0007 wykonane na odrębnym targetcie570xx; brak runtime AC. Naprawa infrastruktury testowej przez lokalną kopię tych samych zależności, bez zmiany kompilatora.

- Runner3 FAIL przed mutacją: błędny katalog uruchomienia snapshotu, brak manifestu; poprawiono cwd.
- Runner4 build PASS, integracja38/40: jedyny błędny test potomny upgrade fixture nie tworzył schematu recruitment_migrations, drugi FAIL był agregatem nadrzędnym. Dodano minimalny schemat migratora bez osłabienia asercji; targeted lifecycle15/15 i runner5 całość PASS.
- Claude frontend/security review NOT RUN (brak aktywnego logowania); zastąpione odrębnymi sesjami Codex przez identyczny read-only wrapper. Brak obejścia ograniczeń.

## Identyfikacja review i dowodów

Pierwsze trzy sesje Codex: backend01a18d83-b00e-71f1-8a45-06be9047e083; frontend01a18d84-b6f0-7760-93fd-74dc4d48c7e7; security01a18d84-b6f0-78b0-887b-8746e26e4e84. Każdy rodzic uruchomił dokładnie jednego generic subagent + canonical role. Wrapper wymusił sandbox read-only, approval never, wyłączył apps/plugins; każdy exit0 i changedFiles[], candidateBefore=candidateAfter18763a2fc8904d0e437832b1b6234bdafed949c970b3899c14179054e4eaeb1a. Nie jest to typed profile. W backend transcript odnotowano odmowę sandboxu operation_not_permitted; review ukończone bez eskalacji i bez mutacji. Pierwsze oceny korzystały z wcześniejszych dowodów, końcowy browser nie był jeszcze dostarczony w ich promptach — wynik browser39/39 jest dowodem QA, nie testem uruchomionym przez reviewera.

Weryfikacja runtime odbyła się w /private/tmp/jobs-crm-lifecycle-3a-kkdbtxlz, target run-5dc9f06d, projekt jobs-crm-recruitment-8521f6-ec57742b4d65. Polecenie: PATH z Node24.22.2, RECRUITMENT_TARGET_ID=run-5dc9f06d pnpm --config.verify-deps-before-run=error test:recruitment. Tylko trzy pliki infrastruktury testowej target.ts, cleanup-plan.ts i supabase/recruitment-config.toml różniły się adapterem566xx→570xx; pełne hashe/diffy w snapshot-manifest.json. Wszystkie103 pliki src/db/tests identyczne przed/po; zależności sklonowane lokalnie bez nowego install/zmiany kompilatora. Nie twierdzimy, że wykonywano niezmodyfikowany target566xx ani że symulowany Auth w dodatkowej tymczasowej bazie upgrade jest osobnym dowodem native Auth. Główny zestaw integracji używa realnego Auth/RLS/Data API.

## Poprawka i uzupełnienia po pierwszym review

Autor frontendu poprawił P3: powrót z potwierdzenia porzucenia kieruje fokus na nagłówek formularza, a faktyczne porzucenie na właściwy przycisk kontaktu/aplikowania. Własne12 unit i ESLint PASS. QA dodało aktywację klawiaturą po programowym focus() i asercje toBeFocused (w tamtym przebiegu naturalny Tab NOT RUN; późniejszy wynik opisano poniżej), logout A/login B podczas nieznanego wyniku i powrót A do recovery bez resubmit, embedded read zdarzenie↔sprawa A/B, rzeczywiste PostgreSQL session timezones UTC/Honolulu/Kiritimati, kontrolowany remis day+recorded_at z kolejnością UUID i sprawdzenie tożsamości/disjoint union stron historii. Dodatkowe kontrole domykają wskazane luki dowodowe; targeted lifecycle18/18 PASS po doprecyzowaniu HTTP206 i Content-Range w teście paginacji; pełny runner6 build+43/43 integracja+41/41 browser PASS, follow-up backend/security produktu PASS, frontend produktowy P3 zamknięty. Nowe P3 dokumentacyjne: deklaracja naturalnego Tab była zawyżona względem testu focus(); QA uzupełniło test o faktyczne Tab/Shift+Tab — wynik poniżej. Nie jest to defekt produktu, lecz błąd opisu dowodów, wymagający poprawki przed finalizacją. Konkurencja pozostaje testowana przez równoległe rzeczywiste requesty (Promise.all), bez wymuszenia każdego możliwego harmonogramu blokad; nie jest to dowód formalny wszystkich przeplotów.

## Drugie niezależne review

Wszystkie trzy wrappery read-only exit0, changedFiles[], candidateBefore=candidateAfter5ab8a9d57459aa10c445fdf84c3a03e995d84042a907fcc1aacad77271de0e8b. Backend i security: PASS statyczny produktu, nowe testy stref/kolejności/relacji ocenione pozytywnie. Frontend zamknął wcześniejszy produktowy P3 fokusu, ale wraz z backendem zgłosił P3 zawyżonego opisu „naturalnej” klawiatury: test używa focus(), więc nie dowodzi kolejności/osiągalności Tab. Raport skorygowany; późniejszy rzeczywisty test Tab/Shift+Tab opisano poniżej. Reviewerzy odczytali dowody runner6 build/43/41 PASS, nie uruchamiali ich sami. Pozostałe ograniczenia zachowane.

## Domknięcie opisu klawiatury — rzeczywisty test

QA zastąpiło programowe ustawianie fokusu w regresji dwoma scenariuszami kontaktu/aplikowania: dotarcie do przycisku wywołującego przez Tab, natywne radio Tab/ArrowDown, przejście pól daty, checkbox → submit → anulowanie, Tab/Shift+Tab w potwierdzeniu porzucenia, powrót na nagłówek i właściwy przycisk wywołujący. Test/helper nie wywołuje focus(). Targeted browser **2/2 PASS exit0**, dowód .harness-runs/lifecycle-3a-qa/browser-natural-tab-1.log. To dowód tych dwóch ścieżek, nie pełnego WCAG/technologii asystujących. Targeted2/2 PASS, późniejsze scoped review v3 zamknęło P3; wynik całego finalnego runnera podano poniżej. Backend/SQL/domena bez zmian od pierwszego review; produkt zmienił się tylko poprawką fokusu zamkniętą w v2.

Sesje v2: backend 01a18d8b-d09c-7632-a198-3b827ae6bb67, frontend 01a18d8b-d092-74c0-8d41-31684d229956, security 01a18d8b-d097-7662-ac1e-c956c7f9c0b3.

## Ostatnie domknięcie testu gotowości

Scoped backend/frontend review v3 zamknęły P3 opisu klawiatury: PASS, bez nowych findings, read-only exit0 i changedFiles[], fingerprint b44106f99e737e86df6c270add383906b5b1886e025da412871dda6c0427e5e0. Dwa rzeczywiste testy Tab/Shift+Tab kontaktu/aplikowania pozostały PASS. Reviewerzy odnotowali osobno runner7 FAIL41/42 browser przy build i43/43 integracji PASS: istniejący test viewport1440 wywołał programowe focus() na radio przed zakończeniem zaplanowanego przez produkt requestAnimationFrame przenoszącego fokus na nagłówek. Space trafił w nagłówek zamiast radio. QA dodało w tej pętli viewportów wyłącznie oczekiwanie expect(heading).toBeFocused() po otwarciu formularza i przed programową aktywacją. Bez sleeps, force click, zmian produktu i osłabienia toBeChecked(). Zachowane runner-7.log/evidence/error-context i manifest. Po tej poprawce finalny runner8 **PASS exit0: build,43/43 integracja,42/42 browser**, zero fail/skip/cancel. Frontend-v4 ocenił asercję i wyjaśnienie jako PASS bez findings. Właściwe podsumowanie summary.json zaktualizowane przez QA po zakończeniu procesu; wcześniejszy odczyt reviewerów widział jeszcze summary runner7, dlatego finalnie uzgodniono oba artefakty z logiem/evidence runner8.

## Końcowy werdykt i zamrożony kandydat

| Review | Wynik | Sesja nadrzędna | Fingerprint przed=po, changedFiles[] |
|---|---|---|---|
| backend v3 | PASS — brak otwartych findings w ocenionym zakresie | 01a18d91-215d-7f70-a939-f77078644bf1 | b44106f99e737e86df6c270add383906b5b1886e025da412871dda6c0427e5e0 |
| frontend v4 | PASS — brak otwartych findings w ocenionym zakresie | 01a18d94-bb93-7db3-b1fd-67b262f1c6ab | 07cafaddd2fbe66578a5d8e18a5e7b37ffc25ded9070e616d551e688350e1697 |
| security v2 | PASS — brak otwartych findings w ocenionym zakresie | 01a18d8b-d097-7662-ac1e-c956c7f9c0b3 | 5ab8a9d57459aa10c445fdf84c3a03e995d84042a907fcc1aacad77271de0e8b |

Backend+security oceniły pełny wcześniejszy kandydat, kolejne przebiegi objęły wyłącznie dotknięte poprawki/testy/dowody. Wszystkie historyczne produktowe i dokumentacyjne P3 zamknięte; brak otwartych findings. Review runtime (wymuszone read-only) wykonane, natomiast testy runtime wykonywało QA, nie reviewerzy. Końcowe product/db/test103/103 SHA256 zgodne ze snapshotem bez driftu (snapshot-manifest.json). Po finalnym review zmieniono tylko wynikowe metadane raportu/PR, bez kodu i testów.

Końcowe summary.json i runner-8-evidence.json potwierdzają43/43 integracji i42/42 browser. Naturalne Tab/Shift+Tab: tylko dwa desktopowe przepływy kontakt/aplikacja; cztery szerokości: odrębna aktywacja klawiaturą i geometria. Fizyczne AT i pełny audyt WCAG NOT RUN. Weryfikacja zachowania istniejącej sprawy po fizycznej migracji i pełne RLS/Auth są odrębnymi dowodami opisanymi wyżej.

## Ograniczenia i bramki

Brak edycji/usuwania/unieważniania historii jest świadomie zatwierdzonym ograniczeniem 3A. **OPEN-004 pozostaje otwartą bramką przed publicznym udostępnieniem funkcji**, nie docelową polityką retencji. OPEN-020 (korekta statusu), kanały OPEN-026, godziny/strefy kalendarza OPEN-037, osoby/CV, etapy, zamykanie/wznawianie, import, Search i publiczne Auth/privacy/ops pozostają poza przyrostem. Nie wysyłamy komunikacji, nie fetchujemy URL i nie wyprowadzamy biznesowych faktów z technicznych dat. Testy fizycznych technologii asystujących/live OAuth/publicznego release: NOT RUN, poza zakresem.

Nie wykonano merge ani deploymentu. PR i exact-SHA CI są finalnym krokiem publikacji; wynik zewnętrzny jest raportowany oddzielnie od lokalnego PASS.

## Sprzątanie izolowanego targetu

PASS exit0: stopRecruitmentTarget zweryfikował i usunął tylko run-5dc9f06d / jobs-crm-recruitment-8521f6-ec57742b4d65 na570xx:5 kontenerów,1 wolumen,1 sieć.44 pozostałe kontenery zachowały identyczne ID/obrazy/stan/bindings/networks, w tym manual-dev566xx(5 running) i DEV567xx(7 running). Dowody cleanup-summary.json/cleanup-receipt.json/cleaned-target-manifest.json w ignorowanym katalogu QA. Nie resetowano ani nie migrowano persistent DEV/manual-dev.

## Publikacja PR

[PR #15 — Recruitment Lifecycle 3A](https://github.com/kozdro/jobs-crm/pull/15), otwarty bez merge/deploymentu. Commit produktu i dowodów d0a8305d8f922d5c1fa77b2bf4befcc275a0da1f; następująca aktualizacja raportu dodaje wyłącznie ten link. Lokalnie testowany produkt/db/test103/103 odpowiada manifestowi QA i nie zmienił się po review. Hosted CI wykonuje się po publikacji dla finalnego HEAD PR; jego aktualny wynik, dokładny SHA i run URL są zapisywane w opisie PR po sprawdzeniu wszystkich11 jobs. Ten zapis przed wykonaniem CI nie nadaje mu PASS.
