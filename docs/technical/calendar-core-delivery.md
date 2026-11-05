# Calendar Core — task packet i dowody wykonania

**Migawka historyczna, nie raport końcowy.** Baza: `f6785b9a4776de4e4e34b5037e830a2f8d9bbf0b`; oceniany kandydat: `6d904d23f542ba81a9201633a9014767ac6a6908`. Ten dokument wiąże poniższe wyniki wyłącznie z tym kandydatem. W chwili jego przygotowania trwały poprawki po runtime i review; późniejszy diff lub commit wymaga osobnej weryfikacji oraz aktualizacji dowodów. Zapis decyzji, istnienie kodu ani sam test jednostkowy nie oznaczają spełnienia pełnego AC.

## Autoryzacja i zakres

**Późniejsze doprecyzowanie PO — DEC-062:** niezapisany szkic Calendar może pozostawać wyłącznie w pamięci RAM działającej aplikacji podczas przejścia między ekranami. Nie trafia do `sessionStorage`, `localStorage` ani na serwer i znika po pełnym odświeżeniu lub zamknięciu karty. To ograniczone dopuszczenie dodatkowej pamięci RAM względem DEC-061 nie obejmuje innych payloadów, trwałego przechowywania ani polityki retencji. Zatwierdzenie jest decyzją produktową; jego implementacja i testy wymagają osobnych dowodów na późniejszym kandydacie.

PO 2026-11-05 zatwierdził [DEC-062, warianty 1A–9A](../decisions/product-decisions.md), z wcześniejszymi P1/P2 w mocy, oraz zlecił pełną implementację, QA, niezależne backend/frontend/security review i osobny PR. Merge i deployment nie są autoryzowane. Calendar Core obejmuje własne wydarzenia ogólne i powiązane ze sprawą, historię planu i faktu, uczestników, Dashboard, oś sprawy i atomowe rozstrzygnięcie wydarzeń oraz Task przy close. Dane są właścicielskie, a upływ czasu nie tworzy faktu odbycia.

Zewnętrzna synchronizacja, komunikacja, przypomnienia i Global Search nie są realizowane w tym slice; ich wymagania nie są zniesione. Pełny TC-028 zależy również od niezależnej notatki inline. Pozostałe części OPEN-002/004/020/021/029/030/037 oraz OPEN-032 i bramki publiczne pozostają otwarte; zatwierdzenie Calendar nie ustanawia ogólnej polityki retencji. [DEC-061](../decisions/product-decisions.md) ogranicza dodatkowe przechowywanie prywatnych payloadów w przeglądarce. [ADR-0008](../decisions/adr/0008-postgres-fulltext.md) zachowuje docelowe wyszukiwanie opisów wydarzeń.

## Źródła i granice zgodności

| Źródło | Status i zastosowanie | Weryfikacja wymagana dla wykonania |
| --- | --- | --- |
| [Discovery/provenance](../product/discovery-provenance.md), [DEC-062](../decisions/product-decisions.md), [BR](../domain/business-rules.md) | DEC-062 APPROVED; m.in. BR-011, 015–017, 019, 027. Provenance ujawnia brak pełnej pierwotnej transkrypcji Discovery. | Każdy wybór close, prawdziwy fakt, brak fikcyjnej obecności, wspólna historia i brak duplikacji. |
| [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [scenariusze](../quality/scenarios.md), [traceability](../quality/traceability.md) | FR/AC-HE-001–003, 005–013, CC-009/010, DB-003, LC-017/018, TN-011; UC/TC-010–013, 019, 022, części 024/028. Węższe wcześniejsze slice'y nie są pełnym dowodem Calendar. | Mapowanie każdego dotkniętego AC na wykonany test, środowisko i dokładny kandydat. |
| [UX Blueprint](../ux/screen-blueprints.md), [F08 i flow contracts](../ux/flow-contracts.md), [wybory UX](../ux/blueprint-decisions.md) | UX-001/005/011/013, agenda, świadomy wynik, rzeczywisty kontekst, formularz i historia; ochrona szkicu, focus i błędy. Wariantowy widok kalendarzowy jest rekomendacją Blueprintu. | Rzeczywisty browser, keyboard/focus, cancel, conflict, recovery, 200% tekst i viewporty; review nie zastępuje testu. |
| [Technical Discovery](discovery-decisions.md), [ADR-0001](../decisions/adr/0001-modular-nextjs.md), [ADR-0002](../decisions/adr/0002-relational-state-history.md), [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) | ADR ACCEPTED: modularny monolit, relacyjny stan/historia, trusted Auth, owner RLS i transakcyjny invoker. ADR-0012 zastępuje ADR-0003. | Direct Data API/RPC, A/B/anon, pełne relacje, minimalne grants, transakcja, audyt i niezależny security review. |

## Macierz zatwierdzenia → implementacja → dowód dla `6d904d2`

W kolumnie „test” podano testy i ścieżki przygotowane do oceny. **NOT VERIFIED** oznacza brak podstaw do nadania pełnego PASS danemu kontraktowi na tym SHA; liczby z częściowych prób poniżej nie certyfikują całego wiersza.

| DEC-062 | Wymagania i UX | Główna lokalizacja implementacji kandydata | Test / potrzebny dowód | Status kontraktu na `6d904d2` |
| --- | --- | --- | --- | --- |
| **1A** pola i relacja | AC-HE-006-01; UX-011 | `db/recruitment/migrations/0015_calendar_core.sql`; `src/modules/recruitment/domain/calendar.ts`; `src/components/calendar/calendar-panel.tsx` | `calendar.test.ts`: walidacja, własna/cudza sprawa, relacje, audyt; browser formularza | **NOT VERIFIED** — integracja zbiorcza FAIL, E2E NOT RUN. |
| **2A** termin, all-day i IANA | AC-HE-007-03–05; F08 | `calendar-time.ts`, `calendar.ts`, `calendar-panel.tsx`, migracja 0015 | `calendar-time.test.ts`, integracja precyzji, `recruitment-calendar.spec.ts` | **NOT VERIFIED** — potrzebny pełny runtime i browser. |
| **3A** strefa, DST i historia terminu | AC-HE-007-06; TC-010 | `calendar-time.ts`, `calendar-panel.tsx`, migracja 0015 | gap, dwa offsety, zmiana strefy i odtworzenie poprzedniego terminu: unit + integracja + browser | **NOT VERIFIED** — część testów E2E NOT RUN. |
| **4A** granica minionego terminu | AC-HE-011/012, AC-HE-012-02; UX-011 | `calendar-panel.tsx`, `calendar-time.ts` | kontrolowany czas i strefy, koniec/dzień/całodniowe, brak mutacji, otwarty szkic podczas zmiany grupy | **NOT VERIFIED** — pełny browser i jego race NOT RUN. |
| **5A** rzeczywiste rozliczenie | AC-HE-008–010, AC-HE-008-02; TC-011/022 | `calendar.ts`, `application/calendar.ts`, migracja 0015, `case-history.tsx` | świadomy wynik, actual/unknown, brak fikcyjnego planu i osobna data zapisu; unit + integracja + browser | **NOT VERIFIED** — E2E NOT RUN, pełna bramka integracji FAIL. |
| **6A** edycja i audytowane korekty | AC-HE-009-01, BR-015/016; F08 | `calendar-panel.tsx`, `form-logic.ts`, migracja 0015 | before/after, korekta wyniku i terminu bez nowego faktu, stale/recovery/rollback | **FAIL** — niezależne review wskazało P1: przywracanie szkicu pomija `restored.values` i może nadpisać jego treść; poprawki w toku. |
| **7A** jawne uczestnictwo | AC-HE-013/013-01, CC-009/010; TC-019 | migracja 0015, `application/calendar.ts`, Calendar i profil kontaktu | A/B/anon, relacje i direct API, jawny udział/unknown/korekta, jedno ID w dwóch sprawach, chronologia przed paginacją | **NOT VERIFIED** — focused Calendar 14/14 na już użytym celu nie zastępuje świeżego pełnego gate ani E2E. |
| **8A** zakończona sprawa | AC-HE-006-01; LC-017/018, TC-012/013 | migracja 0015, `application/lifecycle.ts`, UI sprawy | zmiany przy zakończonej bez wznowienia, powtórny close, uczestnicy oraz audyt po detach | **NOT VERIFIED** — pełny runner FAIL; wymagana powtórka upgrade i browser. |
| **9A** Dashboard i propozycja | AC-DB-003/003-01; AC-HE-012; UX-001/011 | `src/app/dashboard/page.tsx`, `calendar-panel.tsx` | nadchodzące i wymagające rozliczenia, aktualizacja zegara bez zmiany stanu, empty/error/focus | **NOT VERIFIED** — E2E NOT RUN, review zmian szkicu pozostaje otwarty. |
| **P1/P2 wcześniejsze** mieszany close i wznowienie | AC-LC-018/018-04/018-05, AC-TN-011; BR-011; TC-012/013 | migracja 0015, `application/lifecycle.ts`, `lifecycle.tsx` | Task + wszystkie trzy decyzje Calendar, stale zbiór/wersja, starsze RPC, rollback/retry, wznowienie i bezpośrednie API | **NOT VERIFIED** — przygotowane testy nie znoszą nieudanego pełnego gate; potrzebna świeża powtórka. |

## Role, własność i bramki

Model i poziom reasoning dla sesji agentów: **nieudostępnione**. `/root/backend` odpowiadał za `db/recruitment/` i `src/modules/recruitment/`, `/root/frontend` za `src/app/` i komponenty UI, `/root/qa` za testy integracyjne/E2E i rejestrację runnera; `/root/contract` utrwalił decyzję i kontrakty SDD. Każdy developer odpowiadał za własne unit testy. Własność przy poprawkach musi pozostać rozłączna. Niezależni reviewerzy pracują przez `harness/scripts/review.py` w osobnych rodzicach read-only, bez edycji i bez utożsamiania review z QA.

**DoD przed osobnym PR:** zatwierdzony zakres 1A–9A i P1/P2 pokryty rzeczywistymi dowodami; świeży izolowany runner z migracją, integracją i browser; A/B/anon oraz bezpośrednie API/RPC i wszystkie ścieżki close; nieotwarte findings blokujące oraz ponowny review zmienionych obszarów; aktualna dokumentacja/traceability; hosted CI dla dokładnego finalnego SHA. W przypadku zmian po teście/review wymagane są ponowne odpowiednie kontrole. Urządzenia fizyczne i technologie asystujące raportować osobno, jeśli nie były uruchomione.

## Dowody i ograniczenia migawki `6d904d2`

| Kontrola | Wynik i zakres |
| --- | --- |
| `pnpm test:unit` | **PASS:** 579/579 Vitest i 90/90 testów skryptów, Node 24.22.2; lokalny log `/tmp/calendar-unit-r5.log`. Nie jest to pełny test AC. |
| `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` | **PASS** dla tego kandydata według uruchomionych kontroli; build log `/tmp/calendar-build-r5.log`. |
| Izolowany `pnpm test:recruitment` | **FAIL:** migracje 16/16 i build PASS; etap integracji 167/169 PASS, 2 FAIL, 0 skipped; browser **NOT RUN**. Log `/tmp/calendar-qa-6d904d2.log`. Dalsza diagnoza wskazała błąd w rozszerzonym fixture fizycznego upgrade (`Invalid atomic capture intent`); przyczyna i poprawka wymagają potwierdzenia ponownym przebiegiem. |
| Focused Calendar po pełnym przebiegu | **PASS 14/14** na użytym, nie świeżym celu; diagnostyka, nie końcowy dowód wszystkich AC. |
| Backend/frontend/security re-review | **FAIL** dla `6d904d2`: P1 utrata treści odtworzonego szkicu, frontend wskazał też selektor E2E oraz kwestię zakresu storage lifecycle; security wskazał brak aktualnej macierzy dowodów. Ograniczenia i findings wymagają rozpatrzenia oraz re-review zmienionego kandydata. |
| Hosted CI / PR | **NOT RUN / NOT CREATED** w tej migawce. Nie ma finalnego SHA z kompletem wymaganych dowodów. |

Runner pracował w osobnym snapshotcie `/tmp/jobs-calendar-qa-6d904d2` na własnym celu `run-a194b0f2`; jedyny deklarowany patch środowiska mapował porty `57020–57024` na `57320–57324` (SHA-256 patcha `ef82a9c38fa71783c32b914c06e2a839d0900b6394ab30c13b32be5fdf7ada79`). Wykonano guardowany cleanup tylko własnego celu; receipt `/tmp/jobs-calendar-qa-6d904d2/.recruitment-local/run-a194b0f2/cleanup-complete.json`, SHA-256 `7db2a5365c08063fea61ecbff8103c6897da9937ee70ca68ad1f58b6fa80756d`. Obcy projekt zajmujący port `57021` i persistent DEV nie zostały przez ten cleanup usunięte. Ścieżki `/tmp` są lokalnymi, nietrwałymi dowodami.

**Następne kroki:** usunąć P1 i ustalić P2 bez zmiany zatwierdzonych reguł; potwierdzić przyczynę błędu fixture; zamrozić nowy kandydat; ponowić dotknięte unit, świeży pełny runner i niezależne review; zaktualizować tę macierz na podstawie wyników. Dopiero po wymaganych bramkach przygotować osobny PR i sprawdzić hosted CI dokładnego HEAD. Bez merge/deploymentu.
