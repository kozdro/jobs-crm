# Local Developer Experience — analiza i plan

Autoryzacja: PO, zadanie „Jobs CRM — Local Developer Experience Hardening”, 2026-10-30. Implementacja lokalnych narzędzi, testy, dokumentacja, niezależne review, commit/push/PR; bez merge, cloud i deploymentu. Baza: `81db9409479ae78f91f75e09d4db636c69691d7f`; GitHub potwierdził merge PR #12 przed utworzeniem `chore/local-dev-environment`.

## Requirement i wpływ

To zadanie narzędziowe: bez nowych produktowych FR/AC/BR/UC. Istniejące ADR-0001/0002/0012 (ACCEPTED), DEC-051/052 (APPROVED), BR-030 i FR/AC-AD-002 są granicami regresji. Scenariusze signup/recovery oraz RecruitmentCase create/read sprawdzają istniejące zachowanie, nie rozszerzają akceptacji całych FR/AC ani UC/TC-001/029/034. OPEN-002/024 pozostają PARTIALLY RESOLVED; pozostałe OPEN dotyczące modelu, lifecycle, publicznego Auth i infrastruktury produkcyjnej pozostają bez zmian. Brak zależnej nowej funkcji wymagającej ich rozstrzygnięcia.

PO zatwierdził: Local DEV = Next.js + Supabase Local/Studio/poczta; CI = jednorazowe izolowane instancje; przyszła produkcja = Render + Supabase Cloud. Nie ma Cloud DEV ani stagingu. To lokalny profil istniejącej architektury, bez zmiany ADR-0012 i systemu migracji.

Wpływ: skrypty start/stop/reset, Docker ownership/loopback, sekrety, certyfikaty, migracje i instrukcje. Bez zmian domeny, UI, historii biznesowej, importu i wyszukiwania. Ryzyka: kolizja portów/projektów, utrata danych, obcy proces/zasób, drift schematu lub ledgeru, błędny runtime pnpm, wyciek kluczy.

Preflight wykrył istniejące `.env.local`, `.recruitment-local/manual-dev` i pięć działających kontenerów na 56621/56622/56624. Są chronione przed mutacją. Nowy DEV używa 56721–56724 i aplikacji 3163, aby także testy RecruitmentCase mogły zachować 566xx. Nowy workflow nie udaje migracji starych kont: dotychczasowy target pozostaje dostępny oddzielnie; transfer wymaga jawnego planu i zgody właściciela danych.

## Plan i własność

Wszyscy autorzy dziedziczą model/reasoning sesji; dokładne wartości NOT EXPOSED. Bez dalszej delegacji przez autorów.

| Autor / rola | Własność zapisu | DoD / dowód |
| --- | --- | --- |
| platform_local / platform-engineer | scripts/local-dev poza migratorem i QA; supabase/local-dev-config.toml; opcjonalny parametr existing cleanup-plan | Trwała tożsamość, guard Docker, loopback, natywny Next HTTPS, restart tych samych zasobów, bezpieczny control socket, reset exact-target |
| backend_local / backend-engineer | scripts/local-dev/migrations.ts i migrations.test.ts | Istniejący Drizzle/ledger, prefix/checkpoint i drift przed mutacją, advisory lock, tylko brakujące migracje |
| qa_local / qa-engineer | scripts/local-dev/*.qa.test.ts i acceptance*.ts | Negatywne guardy oraz rzeczywisty Auth/mail/Studio/RLS/persistence na nowym DEV |
| root / orchestrator | package.json, next.config.ts, tsconfig.f2.json, ignore/env/README, filtry snapshot/test-boundaries, dokumentacja, integracja i Git | Exact runtime, regresje, zamrożenie kandydata, review, otwarty PR i final-SHA CI |
| odrębni backend/security reviewerzy | wyłącznie odczyt przez harness/scripts/review.py | Niezależne findings, brak mutacji kandydata; poprawki wracają do autorów |

## Macierz weryfikacji

| Wymaganie zlecenia | Test / środowisko | Autor |
| --- | --- | --- |
| Start i czytelne odmowy | node:test: narzędzia, port, tożsamość; runtime fresh start na macOS/Docker | platform + QA |
| Auth/PKCE/poczta/Studio | Playwright i HTTP na nowym DEV, syntetyczne konta | QA |
| Migracje, ledger, drift | unit i rzeczywisty PostgreSQL/Data API; brak podwójnych migracji | backend + QA |
| Trwałość i Ctrl+C/stop | konto + sprawa → stop/start → te same ID i ledger | QA + root |
| Reset i izolacja | negatywne inventory/confirmation, snapshot obcych zasobów przed/po; bez resetu starych danych | QA + root |
| Regresje | typecheck/lint/format/unit/boundaries/canary/build/F1/F2/F3/Recruitment; hosted CI exact SHA | root |
| Review | oddzielne read-only sesje backend/security na zamrożonym kandydacie | harness |

Każdy wynik będzie PASS/FAIL/NOT RUN z komendą, środowiskiem i ograniczeniami. Nie wolno uznać unit ani static review za dowód persistence. Reset nowego DEV wymaga osobnego jawnego potwierdzenia konkretnego targetu; zwykłe testy nie nadają zgody na usunięcie danych właściciela. Brak wymaganej weryfikacji pozostawia DoD otwarte.

## Wykonane dowody lokalne (2026-10-30)

macOS, lokalny Docker Desktop Unix socket, faktyczny Node 24.22.2 / pnpm 12.16.1. Bez nowych zależności, zmian historycznych migracji i provisioning cloud.

| Kontrola | Komenda / procedura | Wynik |
| --- | --- | --- |
| Frozen install | pnpm install --frozen-lockfile z przypiętym Node w PATH | PASS |
| Unit | pnpm test:unit | PASS — 148 Vitest + 87 node:test |
| Typy/lint/format | pnpm typecheck; pnpm lint; pnpm format:check | PASS; lint wyklucza wyłącznie lokalny stan i wygenerowane buildy |
| F1 | pnpm test:boundaries; pnpm test:canary; pnpm build + pnpm test:e2e:foundation w odizolowanym snapshotcie | PASS — 7 boundary, 3 canary, build, 3/3 browser |
| F2 | pnpm test:integration:f2 | PASS — 85/85 rzeczywistych testów PostgreSQL/Data API/RLS |
| F3 | pnpm test:auth:f3 | PASS build,SDK 13/13, browser 10/10 i guarded cleanup |
| Harness | sync.py --check; check.py; unittest na snapshotcie źródeł | PASS,20/20 unit; odrębnie od testów aplikacji |
| Pełny DEV R5 | node scripts/local-dev/acceptance.ts --confirm jobs-crm-dev-ae6ae7601190 | PASS — 10 etapów: signup/mail/PKCE/login/logout/recovery,UIcase,A/B/anon,Studio,checkpointrefusal,resetrefusal,stop2x/restart/sameID+case+ledger,Ctrl+C,brak zmian obcych zasobów i chronionych plików |
| Definicja sekwencji | Na własnym syntetycznym targetcie zmiana INCREMENT1→2, odmowa migracji, exact restore1, ponowienie | PASS — odmowa przed callbackiem checkpointu; applied 0, total 7, ledger bez zmian |
| Log diagnostyczny | rzeczywista ścieżka poza checkoutem; stat UID/0700/0600 | PASS; redakcja wzorców nie jest uniwersalną gwarancją |
| Reset wykonany | dokładnie jobs-crm-dev-4f19e52a67f7 po osobnym potwierdzeniu PO w sesji | PASS; archiwizacja dowodów,bez usunięcia starego manual-dev |
| RecruitmentCase pełny runner lokalnie | pnpm test:recruitment | NOT RUN: chroniony manual-dev zajmuje 566xx; uruchomienie wymagałoby naruszenia izolacji. Pełna regresja będzie wykonana przez izolowane hosted CI |
| Hosted CI final SHA | Application CI / Foundation required | NOT RUN w tym lokalnym snapshotcie przed publikacją; wynik exact head SHA jest w Checks i opisie PR |

Nieudane próby zachowane: pierwszy bootstrap odmówił hostowego mountu Studio i ogólnego prune; zastosowano dokładne mapowanie snippets na własny wolumen. Kontrola Studio root 307 wymagała probe konkretnego `/project/default` 200. R1–R4 akceptacji miały 7 PASS i FAIL przy logowaniu po restarcie; przeniesienie logu poza repo nie usunęło całego problemu. R5 przeszedł identyczną suite 10/10 po wspieranym `--webpack`, z tym samym kontekstem przeglądarki. Brak produkcyjnego builda w pierwszej próbie F1 snapshotu poprawiono przez wymagany build przed udanym browser 3/3. Duplikaty wygenerowanych plików types zachowano poza aktywnym katalogiem; finalny typecheck przeszedł.

Review R1 wykrył P1 wyboru endpointu Docker; poprawka i regresje zamknęły go w R2. Backend/security R2–R4 static PASS, zamknięte P2/P3, read-only wrappery exit0, changedFiles=[], before=after. Końcowa delta `--webpack`, wykluczenia lint i ten raport wymagają końcowego review; wynik i identyfikatory sesji są w PR. Runtime i CI są odrębne od opinii statycznej.

Fingerprint uzupełniono w trakcie testów o definicje sekwencji. Metadane wyłącznie dwóch targetów utworzonych przez to zadanie porównano z niezależnym replayem: stare checkpointy/ledger identyczne, nowe fingerprinty identyczne; skorygowano wyłącznie checkpointy tych syntetycznych fixtures. Nie dodano automatycznej adopcji. Oryginalny manual-dev nie został zmieniony. Zatrzymany niezależny replay i dowody awarii zachowano do inspekcji; DEV po R5 ma zatrzymaną aplikację i działające usługi z zachowanymi syntetycznymi kontami/sprawami.
