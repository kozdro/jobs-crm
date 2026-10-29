# RecruitmentCase — pierwszy create/read slice

**Model: APPROVED**, PO 2026-10-29, zadanie „Jobs CRM — First Business Vertical Slice: RecruitmentCase + Manual Quick Capture”, wariant A; [DEC-052](../decisions/product-decisions.md). **Wykonanie:** [raport](recruitment-case-first-slice-report.md). Ten dokument formalizuje DATA-01 przed migracjami; nie zamyka całego modelu sprawy ani publicznego wydania.

## Requirement i impact analysis

APPROVED: DEC-001/002/003/004/009/017/018/029/031/032/047/052; BR-001/002/003/004/007/016/021/022/028/029/030. FR/AC-LC-001/004, QC-001/002/006/007/009/010, RW-005/009 i AD-002 oraz UC/TC-001/029/034 wyłącznie w poniższym podzakresie. Nie stanowi to pełnego PASS tych kontraktów. UX-006/F02: cztery kroki wymagane w obecnym zleceniu, z jawnym doprecyzowaniem starszego trzyetapowego Blueprintu.

Wpływ: zapis i odczyt własnych danych, walidacja, duplikaty, retry, sesje i cache prywatnych stron, minimalny shell oraz nowa obowiązkowa kontrola CI. Brak wpływu implementacyjnego na lifecycle, import, wyszukiwanie, dokumenty, historię i audyt: nie powstają ich tabele ani zdarzenia. OPEN-002/024 są PARTIALLY RESOLVED; pozostałe pola, formularze i zaawansowana deduplikacja pozostają OPEN. OPEN-025/026/028 mają określony tu minimalny zakres bez zamykania pełnych pytań. OPEN-005/046 wykluczają kaskadę usunięcia konta. ADR-0001/0002/0005/0012 pozostają ACCEPTED; nie jest potrzebna nowa architektura.

## Minimalny command i projekcje

`CreateRecruitmentCase { requestId: UUID, title: string, description?: string, sourceUrl?: string, allowDuplicate?: boolean }`. Właściciel jest ustalany przez zweryfikowany Supabase Auth i bazowe `auth.uid()`. Ewentualne `expectedUserId` jest wyłącznie warunkiem zgodności otwartej sesji, nigdy źródłem uprawnień.

Lista/szczegóły: `id, title, description, source_url, status, created_at`. Lista po `created_at DESC, id DESC`, strony po 25 rekordów, dodatkowy rekord wykrywa następną stronę. Parametr strony musi być walidowany. Bez count ujawniającego inne konta, filtrów, Kanbana, edycji i drawerów. Cudzy i nieistniejący ID mają ten sam neutralny wynik niedostępności. Nazwy i opisy są tekstem; URL jest świadomie otwieranym linkiem HTTP(S), bez HTML i bez fetch.

## DATA-01 — fizyczny model przed migracją

Jedna tabela `public.recruitment_case` jest dopuszczonym prostszym rozwiązaniem jednego zapisu (§10 zlecenia). `source_url` jest opcjonalnym pierwszym linkiem, nie nową regułą domenową „sprawa ma najwyżej jeden URL”. Przyszłe wielolinki BR-013 mogą zostać wydzielone przez osobną zatwierdzoną migrację. Nie dodajemy obecnie `case_link` ani tabel przyszłych modułów.

| Kolumna | Typ / null | Wartość i ograniczenie |
| --- | --- | --- |
| id | uuid NOT NULL PK | DB `gen_random_uuid()`; brak klientowego INSERT tej kolumny |
| owner_id | uuid NOT NULL | DB `auth.uid()`; FK `auth.users(id) ON DELETE NO ACTION`; brak klientowego INSERT |
| title | text NOT NULL | 1–160 punktów kodowych Unicode po trim; DB wymaga kanonicznej postaci |
| description | text NULL | do 2000 punktów kodowych; trim; pusta wartość → NULL |
| source_url | text NULL | jeden absolutny HTTP(S), walidacja także przy bezpośrednim Data API |
| status | text NOT NULL | DB default i CHECK `Zapisane`; brak klientowego INSERT/UPDATE |
| created_at | timestamptz NOT NULL | techniczne DB `now()`, nie data aplikowania; brak klientowego INSERT |
| request_id | uuid NOT NULL | UNIQUE(owner_id, request_id); identyfikator zamiaru zapisu |

Brak `updated_at`, gdyż nie implementujemy edycji. Statusy domenowe to nadal dokładnie `Zapisane`, `Kontakt rozpoczęty`, `W rekrutacji`, `Zakończone`; ograniczenie tej tabeli do pierwszego statusu dotyczy wyłącznie obecnego create/read. Bez nowego enumu i bez przejść. Indeksy: PK, UNIQUE(owner_id, request_id), owner + created_at DESC + id DESC oraz owner + title i owner + MD5(source_url) dla ostrzeżeń (zawsze z dokładnym porównaniem samego URL, bez limitu długości B-tree). Nie ma UNIQUE na tytule/URL.

Walidacja TypeScript liczy punkty kodowe (`Array.from(value).length`), zgodnie z PostgreSQL `char_length`, a nie jednostki UTF-16. Otaczające białe znaki są usuwane tak jak `String.trim()`; SQL musi mieć jawny równoważny zestaw znaków. Odrzucane są NUL i samotne surrogate, których PostgreSQL text/JSON nie zapisze. Normalizacja nie zmienia wielkości liter, wewnętrznych spacji ani form Unicode NFC/NFD: porównanie nazw jest deterministycznie case-sensitive po trim.

URL: trim, parser `new URL`, wyłącznie `http:`/`https:`, absolutny host, zapis `URL.href` (techniczna kanonikalizacja hosta/default port/escape). Parametry, ich kolejność i fragment pozostają zachowane; nie usuwamy identyfikatorów publikacji. DB odrzuca inne schematy oraz wadliwą składnię adresu również poza BFF. Niskopoziomowy RPC/Data API wymaga serializowanych komponentów zgodnych z URL.href: odrzuca surowe segmenty ./.. (także percent-encoded), niekanoniczne userinfo/IPv6 i znaki wymagające percent-encoding w danym komponencie. BFF najpierw kanonikalizuje poprawny URL użytkownika, więc te reprezentacje wejściowe nadal są obsługiwane przez formularz. Query/hash, ich kolejność, znaczenie i istniejące escape’y pozostają zachowane. Forward migration ponownie waliduje URL CHECK dla istniejących wierszy, odmawiając niezgodnego upgrade bez przepisywania danych. Brak sieciowego pobierania HTML, metadanych, favicon, obrazów i żadnej zmiany allowlisty importera.

## Atomowość, duplikaty i idempotencja

Minimalne `public.create_recruitment_case(p_request_id uuid, p_title text, p_description text DEFAULT NULL, p_source_url text DEFAULT NULL, p_allow_duplicate boolean DEFAULT false)` jest `SECURITY INVOKER`, z pustym `search_path` i jawnymi schematami. Jedno wywołanie `supabase.rpc()` to jedna transakcja. Nie powstaje rejestr/framework idempotencji ani importer F4.

RPC serializuje tworzenie w obrębie właściciela blokadą transakcyjną, sprawdza istniejący `(owner_id, request_id)` i porównuje kanoniczny payload (title/description/sourceUrl; flagi allowDuplicate i expectedUserId nie są jego częścią). Ten sam klucz/payload zwraca `{kind:'replayed', case}`, inny payload daje HTTP409 bez zmiany istniejącego rekordu. Nowy poprawny zapis zwraca `{kind:'created', case}`. Unikalny indeks jest końcowym zabezpieczeniem również w wyścigu z dozwolonym bezpośrednim INSERT; obsługa konfliktu nie wymaga grantów UPDATE. Różni właściciele mogą użyć tego samego UUID.

Przed nowym zapisem RPC sprawdza wyłącznie własne sprawy: identyczny tytuł po powyższym trim LUB identyczny zapisany URL, jeżeli podano. Dopóki `p_allow_duplicate` nie jest świadomie ustawione po ostrzeżeniu, zwraca `{kind:'duplicates', matches}` bez mutacji; lista dopasowań jest ograniczona do 20 i informuje o większej liczbie, jeśli dotyczy. UI umożliwia otwarcie istniejącej, anulowanie albo świadome utworzenie nowej. Nie ma merge/UPDATE. Błąd sprawdzania daje błąd i zachowanie danych, nigdy komunikat „brak duplikatów”. Sprawdzenie w transakcji zamyka wyścig pomiędzy własnymi RPC; późniejszy niezależny bezpośredni INSERT nie stanowi globalnej gwarancji braku duplikatów biznesowych.

Klient utrzymuje UUID dla nierozstrzygniętego zamiaru, także przy retry i zachowaniu po odświeżeniu w tej samej karcie. Nie przechowuje payloadu ani tokenów w dodatkowym storage. Po sukcesie/świadomym nowym tworzeniu generuje nowy UUID. Utrata odpowiedzi nie oznacza rollbacku: UI zachowuje dane i ten sam klucz, daje retry; zmiana payloadu nierozstrzygniętego requestu nie może po cichu otrzymać nowego klucza i zdublować efektu. Przy odświeżeniu zachowany klucz umożliwia ustalenie zapisanego wyniku w kontekście tego samego ownera, bez przypisywania go kontu B. Po błędzie i nieznanym wyniku X/Escape/anulowanie umożliwiają jawne potwierdzenie „Porzuć ten zapis”: komunikat wyjaśnia, że porzucenie lokalnego zamiaru nie cofa ewentualnego zapisu w DB i zaleca sprawdzenie własnej listy. Dopiero ta świadoma decyzja czyści klucz i dopuszcza nowy zamiar. W trakcie requestu zamknięcie jest zablokowane. Odmowa401/403 ukrywa prywatny portal i prowadzi do logowania, zachowując wyłącznie owner-scoped klucz do późniejszego recovery.

## Dostęp i migracje

RLS SELECT/INSERT `TO authenticated` z `(select auth.uid()) = owner_id`. Jawne granty: SELECT oraz INSERT tylko `request_id,title,description,source_url`; żadnego UPDATE/DELETE/REFERENCES/TRIGGER dla zwykłego klienta. Owner/status/id/created_at są DB defaults chronionymi przez column grants i CHECK. Anon/PUBLIC nie mają dostępu do tabeli ani EXECUTE. RPC/helpery mają minimalne jawne EXECUTE tylko tam, gdzie potrzebne; żadnego DEFINER, widoków ani service-role w ścieżce użytkownika. Testy obejmują także Data API, nie tylko komendę BFF.

Drizzle jest jedynym właścicielem historii produktu: `db/recruitment/schema.ts`, `db/recruitment/migrations`, `drizzle.recruitment.config.ts`, osobny nieeksponowany ledger `recruitment_migrations`. Pięć historycznych migracji F2 i `foundation_poc` pozostają nietknięte. Oddzielny guarded lokalny profil/target sprawdza Docker ownership, loopback, wersje, konfigurację i exact migration ledger przed mutacją; brak resetu, `drizzle push`, cloud i cudzych zasobów. Nowe SQL/RLS/grants/funkcje podlegają niezależnemu backend/security review.

## UX i granica historii

Minimalny shell udostępnia tylko rzeczywiste ekran wejścia, listę, szczegóły i konto. Zgodnie z DEC-018 prywatne wejście po zalogowaniu wymaga uczciwego minimalnego Dashboardu, bez udawania siedmiu modułów i bez przebudowy Auth.

Quick Capture: Sytuacja → Dane → Działanie → Podsumowanie. Sytuacja nie tworzy DB słownika; nazwa jedyna obowiązkowa, opis pod „Więcej szczegółów”. Jedyna akcja „Zapisz tylko sprawę”. Kroki nie zapisują DB. Zapis zostaje w bieżącym widoku, potwierdza toastem i „Otwórz sprawę”; save-next czyści kreator i zmienia klucz, pokazując dostępny status sukcesu z linkiem wewnątrz otwartego modala. Dirty Escape/X/anulowanie pytają o odrzucenie, tło nie zamyka, focus i klawiatura są obsługiwane. Błąd zachowuje dane i nie pokazuje sukcesu.

`created_at` opisujemy „Dodano do CRM”. Utworzenie nie oznacza aplikacji, CV, kontaktu ani zdarzenia w dacie biznesowej. Nie tworzymy HistoryEntry, AuditChange ani fikcyjnej osi czasu. Bez zasobów chmurowych, signup produkcyjnego, workera, importera i kolejnego modułu.

## Plan wykonania i weryfikacji

Model/reasoning autorów: dziedziczone z sesji, dokładny identyfikator jeśli runtime udostępnia; w przeciwnym razie NOT EXPOSED. Root jest orchestrator/autorem tego kontraktu i raportu. Rozłączne ownership:

| Rola | Pliki / wynik | Test i DoD |
| --- | --- | --- |
| spec-analyst | DEC/OPEN, zależne źródła i analysis | spójny APPROVED/PARTIALLY RESOLVED/OPEN, częściowe traceability; bez kodu |
| backend-engineer | db/recruitment, src/modules/recruitment, business command route, własne unit | Unicode/URL/payload, atomic retry/409, minimalny SQL/RLS i walidacja |
| frontend-engineer / UX | src/components/recruitment, strony Dashboard/list/details, własne unit | zaakceptowane cztery kroki, błędy/dirty/focus, brak fikcyjnych modułów |
| qa-engineer | tests/integration/recruitment, tests/e2e/recruitment-* | real HTTP JWT A/B/anon, spoof/count/replay/concurrency, desktop/mobile, negative control tylko disposable |
| platform-engineer | scripts/recruitment, osobny config/ledger/runner, CI, copy filter | guarded bootstrap/migrate/cleanup, frozen pins, business job w Foundation required |
| root | integracja, proxy private paths, raport | regresje F1/F2/F3/harness i pełne final-SHA CI, scoped commit/push/PR bez merge |

Przed migracjami: spójny zapis DEC/DATA-01 i przegląd powyższego modelu. Następnie implementacja oraz unit, typy/lint/format, real migracje/RLS/integracja, Playwright, produkcyjny build, wszystkie istniejące kontrole F1/F2/F3 i harness. Niezależny backend/frontend/security review przez `harness/scripts/review.py`, osobny read-only parent, zamrożony kandydat i dowody; reviewer nie naprawia ani nie uruchamia testów. Naprawy → dotknięte testy → ponowny review. Finalny raport podaje komendy, środowisko, kandydata i PASS/FAIL/NOT RUN; publikacja tylko po spełnieniu wymaganych bramek, bez merge.

Pełna macierz QA: [plan testów](recruitment-case-test-plan.md). Szczegóły zależności: [analiza](recruitment-case-first-slice-analysis.md). Lista, własne szczegóły i ręczne zapisanie sprawy oznaczają PARTIAL COVERAGE pełnych FR/AC/UC; pozostałe funkcje i polityki pozostają OPEN lub NOT RUN. Rekomendacja następnego slice'a wymaga osobnej autoryzacji PO.
