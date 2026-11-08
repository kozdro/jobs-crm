# Reminders & Follow-up — raport weryfikacji DEC-063

**Zakres i decyzje:** [kontrakt DEC-063](reminders-follow-up-contract.md), FR/AC-TN-004/007–010, DB-004, IM-013, UC/TC-023/037 i BR-009/020/024. Opcjonalny e-mail AC-TN-005 pozostaje niewykonanym celem MVP, a push poza pierwszym wydaniem. Implementacja nie wykonuje importu historycznego i nie wywodzi kontaktu z daty zapisu.

**Kandydat lokalny:** baza `b33c6c9365abfb9fef2e0a8422491ace6382e344` oraz diff DEC-063; test browser SHA-256 `4bfca2fc2f78caceea578f573ea9337a2e2e1bcb62ab2095ca3b1bbf388cf0f2`. Node 24.22.2, pnpm 12.16.1, syntetyczne konta, izolowany cel. Manifest SHA-256 `26d7f92c5ab854500451c0daafb5b1d759fe00df64bd7bf5b5b24c38ec14ce94` wiąże zmienione pliki poza tym raportem i traceability: w kolejności nazw UTF-8 haszowane są nazwa, bajt NUL i surowy SHA-256 treści każdego pliku. Raport i traceability dodano po teście wyłącznie dla wyników. Finalny commit i hosted CI są ustalane osobno przy publikacji PR.

| Kontrola | Wynik i granica |
|---|---|
| `pnpm test:unit` | PASS: Vitest 611/611 i Node 93/93 |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test:boundaries` | PASS |
| `CI=1 pnpm test:recruitment`, run `run-8ca7a739`, bez filtra, `caffeinate -i` | PASS exit 0: migracje 19/19, production build, integracja 184/184, HTTPS Chromium 189/189; cleanup-complete. Checkpoint migracji `74e8fe0492b59a73f5f8326ac4f00f20be0a4fbf34eff0439bfd93b9ff073e38`. Hash bezpiecznego wyjścia integracji `3080788e6eed66b8175c70178ce4e90b0c765d4b9f07f583b6174752e7f67856`, browser `b9fc34c8f07501414381766e00d2ce0574b9ca5cb1acbb998357c672dae1de06`. |
| Backend/frontend/security review | Niezależne read-only review oraz ponowne oceny: wcześniejsze P2 naprawione, brak otwartych potwierdzonych P0–P2 w ocenionym zakresie. Review nie zastępuje testów runtime. |
| Faktyczny importer, fizyczne zamknięcie karty, urządzenia fizyczne, rzeczywista technologia asystująca, e-mail | NOT RUN; importer i e-mail są osobnymi przyrostami. |

## Historia prób i diagnostyki

Pierwszy pełny runner miał FAIL 171/180 integracji; poprawiono regresję Quick Capture i oczekiwania katalogu migracji. Kolejna pełna próba została INTERRUPTED po PASS buildu i integracji. Po wznowieniu zachowano pełne FAIL 188/189 (test odczytów), 188/189 (timeout lifecycle), 183/189, 187/189 oraz osobny ponowny FAIL 188/189 (`run-1edce365`); nie są one nadpisywane późniejszym PASS. Podczas próby 183/189 host przeszedł w uśpienie; nie ustalono, że było to przyczyną poszczególnych błędów.

Dla testu odczytów bezpieczna diagnostyka wykazała, że przy `reads=5` licznik obejmował trzy GET poprzedniego Dashboardu i dwa GET Zadań. Test odizolowano przed pomiarem przez zamknięcie poprzedniego dokumentu, bez zmiany limitu `<=2` ani asercji pending/sukces; 15/15 powtórzeń PASS. Timeout lifecycle nie ma ustalonej przyczyny: powtórzenia diagnostyczne dały zarówno FAIL, jak i PASS, nie zmieniono limitów ani asercji. Instrumentowany pełny przebieg 189/189 jest osobny od końcowego nieinstrumentowanego PASS. Podsumowania błędów są redagowane i przechowywane poza repozytorium; podczas jednej diagnozy reuse nadpisał lokalny plik evidence, lecz pierwotny zredagowany log FAIL pozostał zachowany.

Merge, deployment i publiczna akceptacja nie są objęte tym raportem.

## Identyfikatory niezależnego review

Pierwszy finalny snapshot: backend `01a1b632-f32e-7201-b7a1-5936b62c9ae6`, frontend `01a1b632-f33b-7961-b8c4-4706c0453d18`, security `01a1b632-f33c-7433-8bbe-bd4950900080`; fingerprint wrappera `1049846bb1edb94204ee88b78417cd2679ad2681780d55f8f1b5635a382bf3d6`. Ponowna ocena poprawek: backend `01a1b637-0c45-7cc2-9bd3-d201d4eb2c25`, frontend `01a1b637-0c45-7f91-b90d-e53a97db536a`, security `01a1b637-0c45-7ef0-9434-a78d972381f5`; fingerprint wrappera frontend/security `73688ce9eaf57f3e9a6013f07f1f372abfedecfd5b9dd6adbb39b463c73ed263`. Dla backend r2 brak końcowego receipt wrappera po przerwaniu tury; sam raport podaje fingerprint `20af4cad02caf85ac4c062be2141c21499b40fa4ad5eb82dc5b8fe7974cad8e1`, a niezależna kolejna ocena backend posiada receipt. Kolejne oceny testu: backend `01a1b807-11a8-76c2-9f14-5e5eea6642f1`, frontend `01a1b807-11a8-7ae1-8fcc-2f2e6c8c6fe0`, security `01a1b807-11a8-7f93-bfd7-20843198fe14`. Wąskie końcowe review testu `01a1b932-9893-73b0-ad0c-7c934d6d2414` objęło SHA-256 wskazane powyżej. Wrapper `harness/scripts/review.py codex` uruchamiał oddzielne sesje read-only; wyniki i findings są zachowane w lokalnych zredagowanych transkryptach poza repozytorium.
