# Recruitment Lifecycle 3B — raport wykonania

Data: 2026-10-30. Baza main `94f962841cd3c669c320b8612ad2ab69aa68e2cd` (merge PR #15). Branch `feat/recruitment-lifecycle-3b`. Źródło autoryzacji: **DEC-055**, jawne zatwierdzenie PO wariantów 1A/2A/3A i pełnej implementacji, lokalnych migracji/testów, niezależnych review oraz osobnego PR; bez merge/deploymentu.

**Stan:** lokalne testy zakresu i niezależne review PASS; dowody wizualne potwierdzone; publikacja w toku. Publiczne udostępnienie nadal zablokowane OPEN-004. Hosted CI osobno dla finalnego SHA PR.

## Wynik i zakres

Na istniejącej własnej sprawie użytkownik rejestruje kwalifikujące zaproszenie do indywidualnie nazwanego etapu. Fakt, W rekrutacji i etap zapisują się atomowo; wcześniejszy kontakt/aplikacja nie są wymagane ani fabrykowane. Kolejne zaproszenie lub jawne przejście etapu zachowuje historyczne nazwy i status. Rzeczywista aplikacja/kontakt w aktywnej rekrutacji nie cofają stanu.

Nazwa etapu po trim 1–160 punktów kodowych; opcjonalny nieprzyszły dzień faktu lub data nieznana, osobno czas rejestracji. Wsteczna data porządkuje historię, nie odtwarza automatycznie aktualnego stanu. UI potwierdza ustawienie bieżącego etapu i uprzedza o lokalnym append-only. Status i etap prezentowane osobno na liście/detalu. Owner-scoped replay nie powtarza skutków; równoczesne przestawienie etapu wymaga świeżego odczytu i ponownego potwierdzenia, bez cichego nadpisania.

Podstawa: DEC-004/006/007/008/009/022/052/053/054/055; BR-003–007/015–017/030; FR-LC-007/008/011/012/013/014 oraz LC-005/006 i HE-001/002/003, AD-002 w podzakresie; AC-LC-007-01/008-01/011-01/012-01/013-01/014-02/005-02/006-02, AC-HE-001-01/002-04/003-03 i AC-AD-002. UC/TC-005/009 częściowo, regresje istniejącego create/read/3A. [Kontrakt/impact/delegacja](recruitment-lifecycle-3b-analysis.md), [traceability](../quality/traceability.md).

## Izolacja i ochrona cudzych zmian

Oryginalny katalog /Users/kozdro/Desktop/jobs-crm miał17 zmodyfikowanych śledzonych plików. Wszystkie17 były bajtowo identyczne z ac55059, czyli main sprzed3A; zakres to częściowe cofnięcie dokumentacji, schematu, parsera statusu i rejestracji testów3A. Autor/zamiar nieustalone. Nie wykonano reset/stash/restore ani żadnego zapisu do tych plików. Zachowano patch i manifest SHA256 w /private/tmp/jobs-crm-3b-isolation; kontrola17sum bez driftu.

Implementacja powstała wyłącznie w /private/tmp/jobs-crm-lifecycle-3b, od przypiętego merge3A; cudze diffy nie są częścią branch/PR. Analizę skopiowano ze źródła bez jej usuwania/przenoszenia. PR#15 potwierdzony również odczytem GitHub: merged=true, merge SHA94f9628; wcześniejsza awaria connectora i brak autoryzacji gh nie zostały uznane za dowód merge.

## Autorzy, pliki i architektura

- /root: DEC/OPEN i zależne dokumenty/AC/traceability, koordynacja, test akceptacji prefixów ledgeru7/8/9, raport i Git.
- /root/stage_backend (backend-engineer): db/recruitment/schema.ts, addytywne0008+snapshot/journal, domena/aplikacja i BFF commands, własne unit tests.
- /root/stage_frontend (frontend-engineer): formularz akcji, immutable historia, lista/detal, event-intent, własne unit UI; form-design w granicach Blueprintu.
- /root/lifecycle_qa (qa-engineer): integracja stages/upgrade/regresje, E2E lifecycle i runner, osobny raport QA.

Modele/reasoning odziedziczone, dokładne profile NOT EXPOSED. Rozłączne zakresy zapisu, bez dalszej delegacji autorów. Niezależne review przez osobnych rodziców read-only. Brak nowej architektury/ADR i zależności: istniejące Drizzle/recruitment_migrations, Supabase-native Auth/Data API/RLS i SECURITY INVOKER. Nie zmieniono poprzednich migracji ani nie seedowano etapów. Kolumnowe granty i triggery chronią bezpośredni Data API tak samo jak RPC.

Context7 resolve-library-id→query-docs /supabase/supabase: [Database Functions](https://supabase.com/docs/guides/database/functions), [Securing Data API](https://supabase.com/docs/guides/api/securing-your-api). Sprawdzono changelog i [zmianę domyślnych grantów](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically). Jawne minimalne granty/RLS, bez DEFINER ani service-role w user path; istniejący ledger ma pierwszeństwo przed ogólną procedurą nowego ledgeru CLI.

## Weryfikacja i dowody

Node v24.22.2 z /Users/kozdro/.volta/tools/image/node/24.22.2/bin na początku PATH; pnpm12.16.1 wywołany jawnym Node (systemowy shebang wskazywał26). Frozen offline install575pakietów, zero pobrań, bez zmiany lockfile. Komendy poniżej przez `pnpm --config.verify-deps-before-run=error`; syntetyczne lokalne dane.

| Kontrola | Wynik / kandydat | Dowód |
|---|---|---|
| test:unit | PASS235 Vitest +87 testów skryptów, f6db0d4 | .harness-runs/lifecycle-3b/unit-final.log, exit0 |
| typecheck | PASS, f6db0d4 | typecheck-final.log, exit0 |
| lint | PASS, f6db0d4 | lint-final.log, exit0 |
| format:check | PASS, f6db0d4 | format-final.log, exit0 |
| test:boundaries | PASS, 68142ed; konfiguracja/granice nie zmieniły się w poprawce UI | boundaries-1.log, exit0 |
| test:canary | PASS po poprawce UI, f6db0d4 | canary-final.log, exit0 |
| test:recruitment | PASS run2: production build,53/53 integracja,50/50 browser, f6db0d4 | /private/tmp/jobs-crm-3b-qa-evidence/run2.log; [raport QA](recruitment-lifecycle-3b-qa.md) |
| Backend/frontend/security review | PASS statyczny68142ed i followup f6db0d4, brak findings | /private/tmp/jobs-crm-3b-isolation/*review-*.jsonl i .meta |
| Hosted CI exact final SHA | NOT RUN przed publikacją; osobna bramka | finalny SHA/run/jobs będą zapisane w opisie PR po wykonaniu |

Dowody lokalne są ignorowane/poza repo i mogą być odtworzone z komend; w raporcie nie zapisujemy sekretów/PII. Pełne AC/UC i fizyczne AT nie są domniemane z częściowego pokrycia.

## Zachowane nieudane próby i poprawki

- Unit1:234 aplikacyjnePASS,86/87 skryptów; stara asercja8migracji wykryła rozszerzenie ledgeru do9. Poprawiono oczekiwaną liczbę, zachowano prefix7 i dodano prefix8. Powtórzenie234+87PASS, po poprawce UI235+87PASS.
- Format1:FAIL wyłącznie wygenerowane dwa JSON metadata Drizzle; Prettier i ponowny formatPASS. Run1 miał dokładnie2metadata różniące się białymi znakami, parsedJSON equal=true, pozostałe104pliki src/db/tests byte-exact. Run2 synchronizuje wszystkie106pliki z finalnym kandydatem.
- Własny frontend lint początkowoFAIL na kolejności deklaracji ref; naprawiono bez suppressions, ponownyPASS.
- Runtime run1: buildPASS, integracja53/53PASS, browser46/49FAIL. Jeden defekt UI: po kolejnych udanych zapisach i przed zakończeniem async RSC refresh nowy formularz brał starszą wersję; naprawiono floor wersji z potwierdzonego wyniku, bez rebasingu otwartego draftu. Unit regresja i pełne ponowienie QA. Drugi błąd testu: oczekiwanie ręcznego recovery po reload, gdy implementacja prawidłowo automatycznie odzyskała wynik; dopasowano do istniejącego kontraktu3A bez resubmit. Trzeci: istniejący test account-switch przekroczył30s na ostatnim goto; w run2 pozostawiony bez osłabienia, wynik raportowany osobno. Zachowano run1.log/error-context i dane; bez resetu.
- Uzupełniono luki pierwszego frontend review: realny Tab/ShiftTab i returnfocus dla obu nowych akcji, dirty cancel bez faktu i zmiany stanu oraz zapis nowego zamiaru po stale refresh i ponownym potwierdzeniu.

## Niezależne review

Pierwszy kandydat68142ed: backend01a18e01-ea29-7ca3-8589-fb59e2b26e87, frontend01a18e01-ece1-7af2-a2f0-a8579d900e6b, security01a18e01-f17f-7040-b1f4-3fac1d277752. Każdy PASS statyczny bez findings; wrapper exit0, changedFiles[], candidateBefore=candidateAfter a6178b23d76358540a45319d143707b6a8bd24066cea5bb460766a0eb6b96125.

Followup f6db0d4: backend01a18e05-ec16-7db0-ae03-dd3abad8378b, frontend01a18e05-e927-7e63-8c3e-fa953ce5c1da, security01a18e05-f08a-7380-9e8e-8bf5d6e4ec2c. Wszystkie trzy PASS statyczne, wrapper exit0, changedFiles[], candidateBefore=candidateAfter6070ff20252c9a4272805047d4f4765e0b83c196085f28ca5c3f7e05fa021ff7. W promptach/logach reviewerzy widzieli build/integrację53PASS i jeszcze niepełny browser;50/50PASS jest odrębnym dowodem QA, nie ich własnym testem. Każdy osobny rodzic przez harness/scripts/review.py codex z sandbox read-only, approval never, wyłączonymi MCP/apps/plugins, dokładnie jeden generic subagent + canonical role. To nie typed profile. Testy wykonywało QA, nie reviewerzy; statycznyPASS pierwszego przeglądu nie usunął późniejszego runtimeFAIL.

## Ograniczenia i odłożony zakres

OPEN-004 nadal blokuje publiczne udostępnienie do ustalenia korekt/audytu; lokalnie świadome append-only. Globalne/default etapy OPEN-003/027, pełna macierz status–etap OPEN-034, zamknięcia/wznowienia/korekta, Kanban/DnD, kalendarz/zadania, osoby/CV/kanały, importer/Search i publiczne Auth/privacy/ops poza przyrostem. Bez resetu/migracji persistentDEV, komunikacji, merge i deploymentu. Rzeczywiste race requesty nie dowodzą wszystkich przeplotów; fizyczne AT/liveOAuth/publicrelease NOT RUN.


## Domknięcie runtime i dowodów

Run2 zakończony exit0: build,53/53 integracja i50/50 HTTPS Chromium, zero nieudanych/pominiętych. Wszystkie106pliki src/db/tests byte-exact z f6db0d4 przed i po przebiegu; trzy wyłącznie infrastrukturalne adaptery566xx→571xx. Poprzedni timeout account-switch nie powtórzył się przy niezmienionym teście. Wszystkie44 wcześniejsze kontenery mają niezmienione ID/obrazy/stan/health/bindings. Szczegóły i cleanup w raporcie QA.

Root obejrzał mobilny formularz375: pola, informacja kwalifikacji/daty/append-only i przyciski czytelne bez poziomego overflow. Pierwszy screenshot nazwany active-detail-1440 pokazywał jeszcze Zapisywanie/Zapisane, bo exact selector przycisku znikał już przy zmianie tekstu na pending. Nie jest to dowód aktywnego detalu. Zachowano obraz jako historyczny pending; QA przenosi capture za asercje potwierdzonego statusu/etapu/historii i zamknięcia formularza, z osobnym targeted runtime. Brak zmiany produktu; pełny50/50PASS pozostaje dla f6db0d4, późniejsza korekta testu ma osobny wynik.


**Korekta capture — wynik:** targeted run3 exit0, production build +53/53 integracja +1/1 browser1440. Nowy target run-783d5906, jobs-crm-recruitment-ad0ba1-94fdd90b3aee,9fresh migracji; cleanup guardem zakończony,44obce kontenery bez zmian. Snapshot106/106src/db/tests odpowiada kandydatowi1c9c830 (ten sam produkt co f6db0d4),3adaptery portów i osobno ujawniony runner --grep wybierający1test. Nie opisujemy go jako ponownego50/50.

Root obejrzał poprawiony active-detail-1440.png: W rekrutacji, bieżący etap160emoji zawija się, formularz zamknięty, potwierdzenie sukcesu i jeden wpis zaproszenia z datą nieznaną. Aktywny stan potwierdzony obrazem i asercjami. Poprzedni screenshot zachowano jako historical-pending-1440.png. Frontend review korekty testu1c9c830: PASS bez findings, sesja01a18e09-a4c5-7920-a6b5-e630773c5374, wrapper exit0/changedFiles[], fingerprintBefore=After93bc6fcb45e0c537a65833f3735efada95c5ae513b23ea2515f81fed81556f19. Reviewer odczytał run3PASS, root/QA obejrzeli screenshot; reviewer nie uruchamiał testów ani nie oglądał obrazów.
