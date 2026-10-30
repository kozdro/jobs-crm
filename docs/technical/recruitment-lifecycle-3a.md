# Recruitment Lifecycle 3A — kontrakt i plan

**APPROVED zakres produktu:** DEC-054, PO 2026-10-30: „Zatwierdzam warianty 1A, 2A i 3A”; osobna zgoda na pełną implementację i PR, bez merge/deploymentu. Baza: main ac55059 (PR #14), branch feat/recruitment-lifecycle-3a. Nie oznacza publicznego release.

## Requirement i granice DATA-01

DEC-002/004/006/009/022/052/053/054; BR-003/004/007/014–018/021/026/030. FR-LC-002/004/005/006/014 oraz FR-HE-001/002/003/005 w poniższym podzakresie; AC-LC-005/006/014, AC-HE-001/002/003. UC/TC-002/003/004 mają częściowe pokrycie: kanały, relacje osób i wersje CV pozostają poza przyrostem. OPEN-002/004/026/037 częściowo rozstrzygnięte; OPEN-004 nadal blokuje publiczne udostępnienie tej funkcji do ustalenia korekt błędnych wpisów. Brak daty jest zatwierdzonym zachowaniem UX F04, nie błędem walidacji.

## Kontrakt

- Wyłącznie istniejąca własna sprawa Zapisane lub Kontakt rozpoczęty. Jawne akcje: aplikowanie, kontakt inbound, kontakt outbound; jawne potwierdzenie faktu w UI.
- Dane biznesowe: rodzaj faktu, kierunek tylko dla kontaktu, opcjonalny dzień YYYY-MM-DD. Bez opisu/notatki/kanału, osób/CV/organizacji. Techniczne UUID sprawy, zdarzenia i zamiaru oraz owner z Auth i czas zapisu z DB.
- Data bez godziny jest dniem kalendarzowym, nie timestampem o domniemanej północy. Niepoprawny lub przyszły dzień odrzucany. Wybór wykonawczy lokalnego polskiego przyrostu: granica „dzisiaj” Europe/Warsaw; bez nowego ustawienia profilu. Czas rejestracji przechowywany jako timestamp i prezentowany jawnie osobno.
- Jeden fakt = jeden wpis; status zmienia się atomowo Zapisane → Kontakt rozpoczęty, bez osobnego fikcyjnego zdarzenia. Dalszy fakt przy Kontakt rozpoczęty pozostawia status. Data wsteczna nie cofa statusu. Dwa różne zamiary mogą zapisać dwa rzeczywiste fakty; nie jest to automatyczne reaplikowanie/wznowienie.
- Klucz zamiaru owner-scoped, identyczny payload replay, różny konflikt bez mutacji; utrata odpowiedzi i współbieżność bez duplikatów. Odczyt create/replay istniejącej sprawy działa także po jej przejściu do Kontakt rozpoczęty.
- Historia znanych dat najnowsza pierwsza, remisy deterministycznie czas rejestracji i UUID; niedatowane fakty w osobnym oznaczonym obszarze tej samej historii. Bez lokalnych filtrów/search. Odczyt ograniczony/paginowany, bez cichego zgubienia starszych wpisów.
- Append-only: brak edycji, usuwania, unieważniania i ręcznej korekty statusu; jasno komunikowany przed zapisem. Nie implementować obejścia ograniczenia przez nowy fikcyjny fakt. OPEN-004/020 pozostają dla przyszłego rozwiązania.
- Brak backfillu biznesowej historii z created_at, URL czy tytułu. Quick Capture nadal tworzy wyłącznie Zapisane bez faktu aplikowania.
- Owner-only RLS na faktach i relacjach; ochrona także bez BFF. Właściciel/czas nie są zaufanym inputem klienta. Minimalne granty, atomowość, INVOKER zgodnie z istniejącą architekturą. Bez service-role w user path, bez nowej zależności.

## Impact analysis

Nowa persystencja faktów oraz kontrolowana zmiana statusu rozszerzają create-only model i parser odczytu; wszystkie listy, detal, replay i ostrzeżenia duplikatów muszą przyjąć Kontakt rozpoczęty. Relacja zdarzenie–sprawa musi zachować owner isolation; nowe RPC/granty/triggery wymagają security review. UI korzysta z obecnego visual language, formularza akcji na detalu i jednej historii. Import, Search, Tasks, Calendar, Contacts, Documents nie są implementowane; przyszłe integracje powinny korzystać z tych samych faktów, nie kopii. Bez pobierania URL, wiadomości, auto-close i automatycznych kwalifikacji. Migracja zachowuje dane, UUID i poprzednią historię migracji; bez resetu persistent dev target.

## Plan delegacji i DoD

Model/reasoning ról: odziedziczone, dokładny identyfikator NOT EXPOSED. Orchestrator /root: dokumentacja i koordynacja. Backend /root/lifecycle_backend: db/recruitment/**, src/modules/recruitment/**, commands route i własne unit testy. Frontend /root/lifecycle_frontend: komponenty recruitment, detal, własne unit testy; transport nowej akcji uzgadniany z backendem przed zapisem. QA /root/lifecycle_qa: tests/integration/recruitment/** i tests/e2e/recruitment-lifecycle.spec.ts. Rozłączne ownership; bez delegacji kolejnego poziomu.

Kolejność: zapis decyzji → kontrakt/implementacja backend i frontend → testy jednostkowe autorów → QA rzeczywiste lokalne PostgreSQL/Auth/Data API i przeglądarka → zamrożony kandydat → niezależne backend/frontend/security review przez harness/scripts/review.py (read-only osobny rodzic) → poprawki i ponowne testy/review dotkniętego zakresu → raport/traceability → final SHA CI → otwarty PR. Review nie zastępuje testu.

QA mapuje AC-LC-005/006/014 i AC-HE-001/002/003: trzy fakty, świadome potwierdzenie/anulowanie, brak CV/pracodawcy/URL, poprawne daty i unknown, stabilna chronologia, status lista/detal/reload, rollback obu efektów, request replay/conflict/lost-response/race, dwa różne fakty bez utraty. A odczyt/zapis, B/anon odmowa, brak wycieku list/count/ID/relacji; spoofing owner/czas/status, unsafe origin i obce konto w BFF. Regresja create-only i idempotencji, bez fikcyjnej historii. Browser keyboard i 1440/1024/768/375; czytelna informacja append-only oraz odzyskiwanie po nieznanym wyniku.

Komendy: pnpm test:unit; pnpm typecheck; pnpm lint; pnpm format:check; pnpm test:boundaries; pnpm test:canary; pnpm test:recruitment (izolowany lokalny runner z build, real DB/Auth i Playwright). Runtime, kandydat, exit code/liczby i dowody w raporcie. Wszystkie testy 3A na etapie zapisu kontraktu: NOT RUN. DoD: testy zakresu PASS, brak otwartych blokujących findings, niezależne review, aktualne dokumenty i exact-SHA CI. Brak automatycznego merge/deploy.

## Źródła techniczne sprawdzone podczas wykonania

Context7 resolve-library-id → query-docs dla Supabase (2026-10-30): [Database Functions](https://supabase.com/docs/guides/database/functions) — SECURITY INVOKER, pusty search_path, jawne minimum grantów i owner authorization; nie używać DEFINER do obchodzenia błędów RLS. Changelog i [zmiana domyślnych grantów Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) sprawdzone; nowa tabela ma własne REVOKE/GRANT/RLS. Migracje pozostają w zatwierdzonym ledgerze Drizzle recruitment_migrations (zgodnie z istniejącym kontraktem projektu); nie tworzymy równoległego ledgeru Supabase CLI.
