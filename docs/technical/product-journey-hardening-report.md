# Product Journey UX Hardening — raport

2026-11-01. Baza aktualnego `main`: `637f330f6dc1215ad2479dd699b8814397e5b5de` (fetch potwierdzony przed pracą i publikacją). [PR #22](https://github.com/kozdro/jobs-crm/pull/22), osobny worktree i gałąź `feat/product-journey-ux-hardening`. Końcowy kod/testy: `4941924df40d7affbcd90d2a721f9f80ed6d7199`; późniejsze dokumenty/dowody są raportowane odrębnie, bez zmiany kodu. Bez merge, deploymentu i ingerencji w persistent DEV/cudze zmiany.

## Zgodność z decyzjami

[Analiza kanoniczna](product-journey-hardening-analysis.md), [task packet i kontrola przed implementacją](product-journey-hardening-task.md), [QA i komendy](../quality/product-journey-hardening-qa.md). Podstawa: Discovery/provenance i DEC-014/015/029–032/049, Blueprint §3/8/9 i wybory 1.12–1.14, F02/F04/F05, DEC-052/053/054/059/060, FR/AC-QC/TN/RW, BR-007/011/016/020/029/030, UC/TC-001/012(Task)/013/027/030, Technical Discovery i obowiązujące ADR-0001/0002/0010/0012. Zatwierdzone zakresy i późniejsze zastąpienia zachowane; implementacja hardeningu nie zmieniła znaczenia FR/AC/BR ani ADR. Po jej wykonaniu PO jawnie zatwierdził kontrakt P1/P2/P3 w DEC-061, bez implementacji rozszerzenia.

- Quick Capture zachowuje **Sytuacja → Dane → Działanie → Podsumowanie** zgodnie z późniejszym DEC-052. Pięć opcjonalnych Sytuacji pochodzi z Blueprintu; to pomocniczy szkic/podsumowanie, bez DB enumu, statusu lub faktu. Save-only działa dla każdej intencji i bez wyboru.
- Docelowe opcjonalne Działanie z Blueprint/F04 nadal obowiązuje i **nie jest ukończone** przez ten przyrost. PO wybrał: „Przed rozszerzeniem Działania przygotować w tym zadaniu szczegółowy kontrakt atomowy do mojej akceptacji; niezależny UX realizować dalej.” [Kontrakt P1/P2/P3](quick-capture-atomic-action-proposal.md) został następnie **APPROVED przez PO (DEC-061)**, bez implementacji i bez domniemania zgody na jej rozpoczęcie. Obejmuje atomowość, duplikaty, pełny zamiar, receipt/recovery, legacy i świadomy UX; akceptacja kontraktu jest zapisana; implementacja pozostaje osobnym zadaniem.
- Minimalny guard procesu: macierz Discovery/Blueprint/TD/DEC/ADR w task packetach, obowiązek kontroli przed kodem i w review, instrukcja zawsze dołączana przez wrapper do Codex/Claude oraz test rzeczywistego promptu obu runtime’ów. Bez zmiany sandboxu, narzędzi i uprawnień; nie jest to automatyczny walidator semantyki.

## Wykonane poprawki

1. Rzeczywisty wybór pięciu Sytuacji, zachowanie przy powrocie, dirty guard po samym wyborze, reset/discard/save-next i pomocnicze podsumowanie. DTO, zapis, duplikaty i recovery save-only bez zmiany.
2. Podsumowanie wszystkich błędów Task obok istniejących błędów inline, linki ustawiające focus w polach. Walidacja i protokół zapisu bez zmiany.
3. Sześć natywnych skrótów do istniejących sekcji detalu, bez ukrywania danych, filtracji historii i zmiany kolejności. Testy focus/scroll/draft/Back/Forward/powrotu z filtrami przy 1440/1024/768/375.
4. Integracja z istniejącym guardem URL: dokładnie sześć fragmentów tylko na trasie UUID detalu. Pozostałe usuwane **przed inicjalizacją SDK**; `detectSessionInUrl:false`, PKCE, sesje i RLS bez zmian. Zmiana samego fragmentu w już otwartym dokumencie nie obiecuje ponownego uruchomienia guarda; nie może zmienić właściciela sesji. [Kontrakt F3](foundation-f3.md) i niezależny security review obejmują tę granicę.

Wpływ ograniczony do UX szkicu/focus/nawigacji i guardu prezentacyjnych fragmentów. Brak nowych zależności, migracji, polityki biznesowej, automatyzacji komunikacji, importu lub Search. Historia, relacje, close/reopen i zadania mają przekrojowe regresje na tej samej sprawie.

## Wykonane kontrole

| Kontrola | Wynik i dokładny zakres |
| --- | --- |
| Unit | PASS **534 aplikacyjne** na kodzie `0f93627` + **87 skryptowych** na `eb461e4`; późniejsze zmiany wyłącznie testu browser i dokumentów |
| TypeScript, lint, format | PASS na `0f93627`; późniejszy test nawigacji lint/format i TypeScript ponownie sprawdzone |
| Harness sync/check + testy procesu | PASS, **21/21**; nie są testami aplikacji |
| Boundaries / canary | PASS_R2 / PASS_R3 na wcześniejszym podzakresie; setup FAIL zachowane, bez zmiany kodu kontroli |
| Pełny lokalny production HTTPS browser | PASS **129/129** na `eb461e4` (118 istniejących +11 nowych); build i integracje **133/133 PASS**, natural exit0 |
| Finalny świeży target `4941924` | Build PASS, integracje **133/133 PASS**, browser **PASS16/16**, natural exit0 (16 przypadków, nie pełna suite) |
| Końcowe hosted CI | Dokładny opublikowany head i stan wszystkich jobs w PR; starszy run nie certyfikuje późniejszego SHA |
| Fizyczne telefony, Safari/Firefox, AT, rzeczywisty zoom | NOT RUN; testy rozmiarów to desktop Chromium z zadanym viewportem |

Środowisko: Node24.22.2, production build + HTTPS Chromium, rzeczywiste lokalne Auth/JWT/Data API/PostgreSQL/RLS, dane syntetyczne, świeże izolowane targety. Manifesty wiążą Git/source/runtime i jawne port adapters; focused config selection jest osobnym adapterem, nie zmianą produktu. [Dowody](evidence/product-journey-hardening/) i [local checks](evidence/product-journey-hardening/local-checks-r1.json). Wyniki pełnej suite i selekcji pozostają oddzielne.

## Niezależne review i historia FAIL

| Review | Wynik / kandydat / granice |
| --- | --- |
| Backend/process | **PASS_STATIC** `08ae103`: prompt guard, macierz/skills/workflow, bez rozszerzenia uprawnień |
| Frontend R1/R2 | Historyczne **FAIL_STATIC**: blanket scrub legalnych anchorów, brak kontekstowych testów, nieaktualny opis testcount; R2 potwierdził zgodność kanoniczną/naprawę guarda i wskazał błędne oczekiwanie persistence po reload |
| Frontend R3 | **PASS_STATIC delty** `0f93627→0dc53ed`: rozdzielenie reload od powrotu w tej samej sesji SPA; bez zmiany modelu storage produktu |
| Security R2 | **PASS_STATIC** `0f93627`: exactallowlist/URL/SDK/PKCE/grants, proces bez rozszerzenia uprawnień; granice propozycji atomowego QC |
| Security R4 | **PASS_STATIC delty** `0dc53ed→4941924`: rozdzielenie bootstrap/native-only/reload zachowuje session-injection invariant; produkt/guard bez zmiany |

Każde review to odrębny rodzic read-only przez `harness/scripts/review.py`, dokładnie jeden native generic subagent + canonical role; bez edycji, testów reviewerów i dalszej delegacji autora. Dotychczasowe wrappery exit0, changedFiles=[] i identyczne fingerprinty przed/po. Zakres finalny składa się z tych ocen, nie deklarujemy jednego pełnego review końcowego SHA. [Proces](evidence/product-journey-hardening/process-review-r1.md), [frontend R1](evidence/product-journey-hardening/frontend-review-r1.md), [R2](evidence/product-journey-hardening/frontend-review-r2.md), [R3](evidence/product-journey-hardening/frontend-review-r3.md), [security](evidence/product-journey-hardening/security-review-r2.md).

Zachowane błędy przygotowania: skrócony PATH bez Docker; unused import testu; dependencies symlink w snapshot kontrolnym; zbyt wczesny canary przed końcem kopiowania dependencies. Naprawiono konfigurację/test, nie obchodzono ochron ani asercji produktu.

Finalny focused R3 był **FAIL 15/16**, R4/R5 diagnostyczne FAIL odtworzyły błąd oczekiwania testu, nie przejęcie sesji. Test wymagał hash scrubbing po native same-document navigation bez inicjalizacji SDK. [Pomiar generacji dokumentu i właściciela](evidence/product-journey-hardening/qa-fragment-generation-r5.json) wykazał first entry: nowy dokument/hashfalse/ownerA; same-document: identyczna generacja/hashtrue/ownerA. Poprawiono test rozdzielając bootstrap/native-only/reload, zachowując wymóg niezmienności właściciela i scrub przed SDK. Dowody FAIL i poprzedni test zachowane; nie osłabiono implementacji guarda ani `detectSessionInUrl:false`.

## Ograniczenia i następny krok

Zgodność sprawdzono względem dostępnych kanonicznych dokumentów i późniejszych jawnych decyzji; provenance wskazuje brak pełnej pierwotnej transkrypcji Discovery. Pełne QC Działanie nie jest wdrożone; kontrakt P1/P2/P3 został zatwierdzony DEC-061, a implementacja wymaga osobnego zadania PO. Calendar/Reminders/DnD, pełny Dashboard/TC-024 i CalendarEvent w TC-012 nie są wykonane tym PR; publiczne Auth/privacy/OPS pozostają odrębnymi bramkami.

Autorzy z rozłącznymi zakresami: hardening_spec (analiza/propozycja), hardening_frontend (UI/URL), hardening_qa (E2E/izolowany runtime), root (proces/packet/integracja/dokumentacja). Model/reasoning inherited NOT EXPOSED. Stan i preservation zasobów po końcowym cleanup w raporcie QA; istniejące dane persistent DEV nie były targetem testów.

Finalne dowody: [focused R6](evidence/product-journey-hardening/qa-focused-r6-pass.json), [15 rekordów owner/bootstrap](evidence/product-journey-hardening/qa-fragment-bootstrap-owner-r6.json), [source after](evidence/product-journey-hardening/qa-runtime-after-r6.json), [preservation](evidence/product-journey-hardening/qa-preservation-final.json), [security R4](evidence/product-journey-hardening/security-review-r4.md). Końcowy sourceafter: 904 regularne pliki i28symlinks bez dryfu,4jawne adapteryruntime. Cleanup wyłącznie własnych targetówPASS;44/44kontenery,227/227volumes,10/10networks bazowych zachowane, added0/missing0. Brak otwartych findings implementacyjnych w ocenionym zakresie; wynik review nie zastępuje decyzji PO; akceptację kontraktu zapisuje DEC-061.

Pierwsze hosted CI [run41329664121](https://github.com/kozdro/jobs-crm/actions/runs/41329664121) na starszym `0dc53ed` zakończyło się FAIL: integracje133/133PASS, browser133/134PASS i1FAIL; pozostałe9jobs sukces, agregat Foundation requiredFAIL. Capture runnera ukrywa szczegóły pojedynczej asercji; nie przypisujemy tego zdalnego FAIL konkretnej przyczynie bez oddzielnego dowodu. Lokalny R3/R4/R5 udokumentował opisany błąd oczekiwania. Finalny head po poprawce testu i commitcie dokumentacji otrzymuje osobne pełne CI; wynik raportowany w PR bez przepisywania historii FAIL.

## Uzupelnienie po uwadze PO: pochodzenie audytu i akceptacja kontraktu

Lokalne raporty i artefakty Product Journey Audit byly moimi wynikami oraz wynikami moich agentow z poprzedniego zadania. Nazwanie ich cudzymi zmianami bylo bledem raportowania; nie stanowily zmian innego autora wymagajacych wykluczenia z PR. Dodano [raport historyczny](../quality/product-journey-audit.md), [browser QA](../quality/product-journey-browser-audit.md), [SDD](../quality/product-journey-sdd-audit.md) oraz [dowody i manifest importu](evidence/product-journey-audit/README.md). Baza637f330, historyczne SHA i FAIL zachowane.

| Historyczny finding | Stan po hardeningu |
| --- | --- |
| P3 brak summary Task | NAPRAWIONY; aktualna regresja wymaga summary, dwoch linkow i focus |
| P2 bardzo dlugi mobilny detal | USPRAWNIONY szescioma skrotami; brak deklaracji skrocenia dokumentu lub pelnego usuniecia problemu usability |
| Dwie przekrojowe podroze i poprawki asercji | Przejeto/rozwinieto w biezacym hardening.spec.ts; stary test i diagnostic braku summary zachowano jako .ts.txt poza testDir |
| Pozostale siedem scenariuszy z analizy SDD | Nie oznaczono zbiorczo jako zamkniete; potrzebne osobne dowody dla wszystkich wariantow |

Po przedstawieniu szczegolowego kontraktu PO odpowiedzial: "Akceptuję kontrakt P1/P2/P3; implementacja pozostaje osobnym zadaniem." [DEC-061](../decisions/product-decisions.md) zatwierdza kontrakt, bez autoryzacji implementacji, migracji, merge lub deploymentu. Wczesniejsze PROPOSED/BLOCKED_DECISION w opisie przebiegu powyzej sa historia sprzed tej odpowiedzi; aktualna blokada dotyczy rozpoczecia osobnego zadania implementacyjnego, nie akceptacji samego kontraktu.

Uzupelnienie dotyczy wylacznie dokumentow, dowodow i rejestracji decyzji PO; kod/testy/harness pozostaja identyczne z7bca9bc, dla ktorego pelne CI run41331347000 bylo PASS11/11 (133integracje/134browser). Nie przypisuje sie tego wyniku nowemu head bez weryfikacji.
