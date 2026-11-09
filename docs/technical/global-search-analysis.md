# Global Search — analiza i plan vertical slice

**Aktualizacja 2026-11-10 — [DEC-064](../decisions/product-decisions.md) APPROVED:** PO zatwierdził warianty 1A/2A/3A i autoryzował implementację, QA, niezależne review oraz jeden osobny PR bez merge, deploymentu ani provisioningu. Wcześniejsze oznaczenia PROPOSED/OPEN poniżej opisują stan historyczny analizy; warianty B nie zostały zatwierdzone. Wykonanie i dowody pozostają odrębne od decyzji.

**Data:** 2026-11-09. **Stan dokumentu:** DRAFT. **Wynik:** READY_FOR_OWNER_DECISION; nowe kontrakty poniżej są PROPOSED, nie APPROVED. Autoryzowana jest analiza i przygotowanie. Implementacja, PR, merge i deployment nie są obecnie autoryzowane.

**Zbadana baza:** lokalny `main`, `78d94b43f48997ea7561f4e1157a17a588788b2a`. Historia zawiera merge PR #26 (`3ba985e`) oraz późniejszy dokumentacyjny PR #27 (`78d94b4`). Na początku analizy working tree był czysty, a lokalne `origin/main..HEAD` puste. Jest to dowód lokalnego Git, bez odświeżania remote i bez weryfikacji aktualnego GitHub CI. Zachowano wszystkie zastane commity. Nie uruchamiano aplikacji, Dockera, migracji ani persistent DEV.

## 1. Rekomendowany rezultat

Jeden spójny przyrost i docelowo jeden osobny PR: **Global Search dla wszystkich sześciu grup wyników, wraz z rzeczywistymi notatkami i wielolinkowym kontekstem sprawy jako brakującymi zależnościami**. Topbar otwiera szybką nakładkę, „Wszystkie wyniki” prowadzi do pełnej strony. Oba widoki mają ten sam kontrakt dopasowania i dostępu. Trafienie otwiera konkretny rekord, link, notatkę lub wydarzenie, również przy zakończonej sprawie i poza pierwszą stroną historii.

To najmniejszy przyrost spełniający cały wskazany zakres. Samo indeksowanie istniejących tabel nie wykona FR-GS-005; opis sprawy ani opis zadania nie są notatką. Jedno `source_url` nie zastępuje docelowych wielu uporządkowanych odnośników. Kolejne kroki wykonania mogą być małymi commitami w jednym PR; nie pomijają żadnej grupy.

Nie jest potrzebny moduł dokumentów, import, nowa encja stanowiska, osobna usługa wyszukiwania ani kolejka indeksowania. Stanowisko zapisane w tytule lub opisie sprawy jest przeszukiwane jako rzeczywisty tekst; tytuł sprawy nie zostaje automatycznie uznany za stanowisko, a brak stanowiska pozostaje poprawny. Nie powstaje inferencja stanowiska ani fikcyjny backfill.

## 2. Podstawa i zgodność kanoniczna

| Źródło | Status / wiążący zakres | Zachowanie i planowany dowód |
| --- | --- | --- |
| [Discovery provenance](../product/discovery-provenance.md), [DEC](../decisions/product-decisions.md): DEC-038 | APPROVED: sprawy/stanowiska, firmy, kontakty, URL, notatki, opisy wydarzeń; grupowanie | Sześć grup, trafienia w rzeczywiste dane, TC-020 |
| DEC-014/015, BR-001/013/014 | APPROVED: wiele uporządkowanych URL, sprawa niezależna od ogłoszenia, URL korespondencji nie daje treści | Wielolinkowy kontekst; zero fetch; brak obowiązkowego stanowiska i URL |
| DEC-020/021/022; BR-015/016; FR/AC-HE-001/004/005 | APPROVED cel historii i inline notatki; szczegóły nowych pól/korekt OPEN | Jedna oś, odrębny zapis notatki, prawdziwe daty, bez zdarzeń aplikowania |
| DEC-010/012, BR-012, FR/AC-LC-021 | APPROVED: zakończona sprawa nadal dostępna | Wyszukanie i otwarcie zakończonej sprawy bez wznowienia |
| [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md): GS-001–008 | Zakres APPROVED; szczegóły OPEN-038 | Wszystkie osiem AC, pełna macierz w §7 |
| FR/AC-LC-023/025; UC/TC-007/020 | APPROVED wiele linków i ich bezpieczne znaczenie | Dwa portale w jednej sprawie, odrębne role, brak dostępu do korespondencji |
| FR/AC-NV-002, UC/TC-024 | APPROVED docelowo siedem modułów | Wspólny AppShell we wszystkich istniejących modułach; pełne siedem pozostaje częściowe do modułu Dokumenty |
| [UX Blueprint](../ux/blueprint.md), [wybory UX](../ux/blueprint-decisions.md): 1.4 A, 1.5 C; [UX-015](../ux/screen-blueprints.md), [F12](../ux/flow-contracts.md) | APPROVED: widoczne wejście, nakładka + pełna strona, grupy i kontekst | Desktop/mobile, wszystkie wyniki, konkretne trafienie, focus, loading/empty/error |
| F07, UX-005; wybór 1.27 A | Inline notatka i jedna historia; bez lokalnej wyszukiwarki/filtrów osi | Zapis z potwierdzeniem i dirty warning; kontekst z Global Search bez nowego lokalnego search |
| [TD 1.39 A](discovery-decisions.md), [ADR-0008](../decisions/adr/0008-postgres-fulltext.md) | APPROVED / ACCEPTED: PostgreSQL FTS + GIN i dopasowania uzupełniające | Indeksy, rzeczywiste zapytania, pomiary; bez ILIKE-only i zmiany silnika |
| DEC-051, [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), BR-030, FR/AC-AD-002 | APPROVED / ACCEPTED: zaufana tożsamość, Data API/RLS, prywatność właściciela | A/B/anon, bezpośredni RPC/Data API, listy/ID/count/snippet/relacje/cache |
| DEC-056/057/058/061/062/063 | APPROVED wyłącznie ich zakresy: korekty faktów, closure, katalogi, QC, Calendar, przypomnienia | Bez zmiany historii, uczestnictwa, receiptów/retry, statusów, zgód i wysyłek |
| DEC-050 | DEFERRED: semantyka i treść dokumentów | Brak indeksowania plików, embeddingów, odczytu prywatnych wiadomości |

Źródła domenowe: [model](../domain/glossary-and-model.md), [BR](../domain/business-rules.md), [lifecycle](../domain/recruitment-lifecycle.md). Szczegółowy zakres wyszukiwarki: [feature](../features/global-search.md), [traceability](../quality/traceability.md), [UC-020](../quality/scenarios.md). Starsze adnotacje o wyłączeniu Search z poprzednich slice'ów opisują ich granice, nie anulują Global Search.

## 3. Rzeczywisty stan aplikacji

| Obszar | Dowód w kodzie | Zależność / brak |
| --- | --- | --- |
| Sprawy i tekst stanowiska | `db/recruitment/schema.ts`: `recruitment_case.title/description`; `src/modules/recruitment/domain/recruitment-case.ts` | Dane istnieją; brak osobnego pola/encji stanowiska nie blokuje wyszukiwania zapisanego tekstu |
| Firmy i kontakty | `catalog_profile.type/name/email`, `catalog_relation`; `src/modules/companies-contacts/`; strony `/companies/[id]`, `/contacts/[id]` | Indeksować zapisane nazwy i kontaktowy e-mail, także samodzielne profile; nie wymyślać telefonu/adresu ani relacji |
| Linki | Wyłącznie `recruitment_case.source_url`; DATA-01 w [persystencji](data-and-persistence.md) | Brak CaseLink 0..n, formularza i kontraktu ról/korekt; potrzebny pakiet 3 |
| Notatki | Brak tabeli, domeny, API i edytora | Rzeczywisty bloker FR-GS-005 i TC-020; potrzebny pakiet 2 |
| Opisy wydarzeń | `recruitment_calendar_event.title/description`; `src/modules/recruitment/application/calendar.ts` | Dane istnieją. Search obejmuje wszystkie bieżące stany, również ogólne, odłączone i planowane wydarzenia |
| Fakty lifecycle | `recruitment_case_event`; bieżąca projekcja z migracji `0009_history_corrections_integrity.sql` | Nie mają pola description. Nie tworzyć go z etykiet application/contact/invitation; nie kopiować audit payloadów do wyników |
| Search / Topbar | Brak modułu Global Search, FTS/GIN search i tras; `src/components/workspace/app-shell.tsx` ma QC i konto | Nowa funkcja, nie poprawka istniejącej wyszukiwarki |
| Trafienie w historię | `case-history.tsx` ma `history-entry-${event.id}` tylko na bieżącej stronie; detal zna `historyPage` | Kotwica sama nie wystarcza. Potrzebny odczyt konkretnego wpisu albo resolver jego bieżącej strony |
| Trafienie w Calendar | `getCalendarEvent()` istnieje; `/calendar` i `CalendarPanel` nie obsługują celu z adresu | Wprowadzić wejście po ID także dla ogólnego/odłączonego wydarzenia i niezależnie od aktualnego zakresu dat |

Timeline zawiera powiązane odbyte CalendarEvent, a nie cały Calendar. Indeksowanie wyłącznie timeline pominęłoby część zatwierdzonych opisów. Bieżący opis wydarzenia nie może występować drugi raz jako kopia z audytu lub historii.

## 4. Jeden zbiorczy pakiet rzeczywistych decyzji PO

Wystarczy wskazanie **1A / 2A / 3A** albo zbiorczych odstępstw. Wszystkie poniższe szczegóły są PROPOSED. Żaden OPEN nie zostaje zamknięty przez ten dokument. Akceptacja wariantów rozstrzyga tylko opisany podzakres; zgoda na wykonanie musi być jawna, zgodnie z obecnym zakazem implementacji.

### 1 — OPEN-038: dopasowanie, wyniki i duże zbiory

**1A — rekomendacja:**

- Tekst: Unicode NFC, dopasowanie bez rozróżniania wielkości liter i polskich znaków, w tym jawne `ł/l`. Wszystkie wyrazy zapytania muszą wystąpić w przeszukiwanym tekście danego rekordu; dopuszczone pełne słowa i ich prefiksy. Interpunkcja nie uruchamia zaawansowanej składni wyszukiwarki. FTS + GIN jest podstawą wyszukiwania tekstowego; literalne dopasowania uzupełniają nazwy, e-maile i URL-e.
- URL i e-mail: dopasowanie całego zapisanego adresu albo literalnego ciągłego fragmentu, case-insensitive; `%`, `_`, cytaty i operatory nie są wildcardami/SQL. Szukamy również w ścieżce i query URL. Nie usuwamy parametrów ani nie utożsamiamy różnych publikacji.
- Polski tekst jest przeszukiwalny, ale **nie gwarantujemy automatycznego dopasowania wszystkich odmian fleksyjnych**; prefiks i znaki diakrytyczne mają powyższy jawny kontrakt. Nie zakładamy istnienia słownika `polish`. To rozstrzygnięcie otwartej morfologii, nie zmiana zatwierdzonego silnika.
- Kolejność grup: sprawy/stanowiska, firmy, kontakty, URL, notatki, opisy wydarzeń. Wewnątrz: dokładna zgodność całego pola, następnie zgodność literalnego fragmentu, następnie pozostałe trafienia tokenowe/prefiksowe według trafności FTS. Remis: czas utworzenia malejąco i stabilne ID rosnąco. Konkretny wzór rankingu jest wyborem wykonawczym w tych granicach, objętym testami.
- Nakładka pokazuje do 3 trafień na grupę i „Wszystkie wyniki”. Pełna strona: wszystkie grupy, filtr typu, po 20 rekordów na stronę w każdej grupie i dostęp do każdej dalszej strony. Nie ma limitu całkowitej liczby osiągalnych trafień. Parametry stron są walidowane; zmiana zapytania/filtra wraca na początek.
- Zapytanie: 1–200 punktów kodowych Unicode po trim; puste nie odpytuje bazy, przekroczone jest walidowane bez cichego ucięcia. Jednoznakowe zapytania są dozwolone. Rozmiary preview/stron nie są limitami liczby rekordów domenowych.
- Zakończone sprawy są zawsze uwzględniane w domyślnym zbiorze. Nie dodajemy nowego stanu archiwum ani osobnego filtra lifecycle; ewentualna przyszła archiwizacja musi jawnie rozszerzyć read model i testy. Obecnie nie ma danych archiwum do odfiltrowania.
- Prywatne zapytanie i wyniki tylko w owner-scoped RAM działającej aplikacji, także podczas przejścia nakładka → pełna strona → trafienie → powrót. Bez zapisu treści w URL, historii przeglądarki, browser storage, cookies, telemetrii lub trwałej historii zapytań. URL może zawierać typ i docelowe ID, nigdy tekst zapytania. Pełny reload traci zapytanie i pokazuje stan początkowy; logout/zmiana konta usuwa stan. To jawne wąskie dopuszczenie pamięci Search, nie rozszerzenie wyjątków DEC-062/063 na inne moduły.

**1B — alternatywa:** ten sam zakres, matching, prywatność i paginacja, ale w każdej grupie porządek chronologiczny `created_at DESC, id ASC`, bez priorytetu trafności. Jest prostszy i przewidywalny czasowo, ale starsze trafne notatki mogą być daleko. Rekomenduję 1A dla celu odnajdywania dawnego kontekstu.

Pełna fleksja PL nie jest zatwierdzona przez samo ADR-0008. Jeśli PO wymaga jej zamiast proponowanego kontraktu, należy wskazać to zbiorczo teraz: potrzebna jest weryfikacja dostępnego słownika i jego dostarczenia w docelowym PostgreSQL; bez cichego zastąpienia morfologii substringiem.

### 2 — OPEN-002/004/020: rzeczywiste notatki

**2A — rekomendacja:** owner-scoped Note przypisana do jednej własnej sprawy, również zakończonej; plain text 1–10 000 punktów kodowych po trim, bez obowiązkowego tytułu. Inline „+ Notatka”, jawny zapis, dirty warning, pełny odczyt i rozwijanie długiego tekstu. Notatka ma ID i serwerowy czas utworzenia; zwykła notatka jest na osi pod datą utworzenia. Opis wcześniejszego zdarzenia może mieć jawnie podany rzeczywisty nieprzyszły dzień lub oznaczenie daty nieznanej. Nieznany dzień nie staje się dzisiejszym ani datą utworzenia; kolejność osi zachowuje BR-015 i jej obszar dat nieznanych.

Korekta treści/dnia z before/after, kontrolą rewizji i zachowaniem oryginału/audytu; terminalne unieważnienie po świadomym potwierdzeniu, bez hard delete i bez przywracania w tym kontrakcie. Unieważniona notatka ma oznaczenie w historii i dostępne szczegóły właściciela, lecz nie jest domyślnym trafieniem Search. Search indeksuje tylko aktualną ważną treść; stare wersje dostępne z audytu, nie jako kolejne wyniki. Notes nie zmienia statusu, etapu, dat aplikacji ani uczestnictwa.

Zapis i korekty są atomowe i idempotentne, utrata odpowiedzi nie tworzy drugiej notatki. Replay używa zamrożonego payloadu; inny payload z tym samym kluczem daje konflikt. Niezapisany szkic i zamrożony payload pozostają tylko w pamięci bieżącego edytora; brak nowego trwałego recovery prywatnej treści. Wyjście wymaga rozstrzygnięcia dirty/niepewnego zapisu; po reloadzie stan rozpoznajemy z zapisanych danych/beztreściowego identyfikatora zamiaru, nie ślepym nowym create. Nie ustanawiamy ogólnej retencji ani polityki kasacji audytu.

**2B — alternatywa:** identyczny kontrakt z limitem 2000 znaków, mniejszym zakresem pojedynczej notatki. Nie usuwa żadnego typu wyników, ale ogranicza dłuższe zapisy rozmów. Rekomenduję 2A; liczba 10 000 jest propozycją, nie odziedziczoną decyzją z Calendar.

### 3 — OPEN-025/026 i zależny OPEN-002/004: wiele linków

**3A — rekomendacja:** wiele uporządkowanych HTTP(S) CaseLink do jednej własnej sprawy, bez nowego limitu liczby linków. Role: `główne ogłoszenie`, `dodatkowe ogłoszenie`, `formularz aplikacji`, `strona firmy`, `profil`, `korespondencja`, `inne`, `nieokreślona`. Rola nie określa kanału rzeczywistego aplikowania. Nie wprowadzamy automatycznej unikalności głównego ogłoszenia ani scalania publikacji. Każdy link ma ID, rolę i kolejność; kolejność i role zmienia użytkownik jawnie. Kolejny link jest dopisywany na końcu.

Walidacja i kanonikalizacja zachowują dotychczasową ścieżkę HTTP(S)/`URL.href` i zgodność JS/SQL; nie odcinamy query ani fragmentu i nie dopowiadamy równoważności URL. Bez nowej heurystyki duplikatów lub nowego limitu długości URL. Identyczny aktywny adres w tej samej sprawie daje komunikat z istniejącym linkiem, bez kolejnej kopii; w innych sprawach pozostaje dozwolony i nie powoduje auto-merge.

Dodanie, korekta adresu/roli/kolejności i terminalne unieważnienie są jawne, atomowe, idempotentne oraz audytowane z kontrolą rewizji. Brak hard delete i automatycznego wznawiania sprawy. Search pokazuje aktywną bieżącą wersję linku, kieruje do konkretnego wiersza w sekcji sprawy, a nie automatycznie na zewnętrzny URL. Osobne świadome otwarcie zewnętrznego adresu zachowuje istniejące zabezpieczenia linków. Typ korespondencja nie powoduje odczytu wiadomości ani kwalifikacji kontaktu.

Dotychczasowy `source_url` otrzymuje rolę `nieokreślona`, zachowuje dokładny adres i pochodzenie legacy; nie nazywamy go arbitralnie głównym ogłoszeniem. Nie nadajemy mu fikcyjnej daty odkrycia/aplikowania. Szczegóły kompatybilności i jednego bieżącego źródła prawdy opisuje §5.

**3B — alternatywa:** zamiast zamkniętego słownika rola jest opcjonalną etykietą użytkownika 1–80 znaków po trim, brak = nieokreślona. Wielość, kolejność, korekty, audyt i brak inferencji pozostają takie same. Daje elastyczność, ale słabiej ujednolica rozróżnienie ról. Rekomenduję 3A, zgodne z kategoriami opisanymi w FR-LC-023.

### Kwestie, o które nie pytamy ponownie

FTS/GIN, Supabase-native Auth, Data API/RLS, izolacja właściciela, sześć grup, nakładka + pełna strona oraz wyszukiwanie zakończonych spraw są już rozstrzygnięte. OPEN-005 nie wymusza tworzenia archiwizacji. OPEN-013 wymaga implementacyjnych kontroli i testów Search, a nie ponownego wyboru modelu Auth. OPEN-006/007/032/041–046 pozostają bramkami właściwych modułów/publicznego wydania, nie wymagają zbiorczego rozstrzygnięcia dla lokalnego Search. NFR-006 pozostaje bez nowego SLA; pomiary nie ustanawiają normy produktowej. Uczestnictwo Calendar pozostaje według DEC-062, bez inferencji z kontakt–sprawa.

## 5. Plan techniczny i analiza wpływu

**Dane i migracje:** addytywne migracje Drizzle w istniejącym profilu `db/recruitment`, bez zmiany starych SQL/snapshotów/receiptów ani resetu. Notes i CaseLinks dostają niepodrabialnego ownera, RLS, FK sprawdzające oba końce relacji, ograniczone grants i invoker komendy. Chronione oryginały/revisions/audyt nie są dostępnymi do nadpisania zwykłymi tabelami klienta. Bez `SECURITY DEFINER` jako obejścia uprawnień.

**Kompatybilność URL — konkretny wariant bez uprzywilejowanego backfillu:** jedynym bieżącym modelem odczytu jest widok CaseLinkCurrent z `security_invoker=true`. Projektuje niepuste, niezmienne `recruitment_case.source_url` jako link legacy o stabilnej tożsamości `(legacy, case_id)`, roli nieokreślonej i pierwszej pozycji; dołącza nowe dodatkowe CaseLink. Korekta/zmiana roli/kolejności albo void legacy zapisuje wersjonowany override wskazujący tę samą własną sprawę. Widok wybiera override zamiast starego adresu; void wyklucza stare trafienie, nie powoduje fallbacku. Nowe linki mają tożsamość `(additional, link_id)`; identyfikatory są rozróżniane także w resolverze i wynikach. Nie ma kopiowania adresów ani nowej daty biznesowej przy migracji.

Ten wariant zachowuje obecny bezpośredni INSERT i create/QC: pojedynczy zapis sprawy jest od razu widoczny jako jej link legacy, bez nowego triggera zapisującego link, nowych grants na starym create ani drugiej transakcji. `source_url` oraz dawne receipty pozostają oryginalnym wejściem/snapshotem dla fingerprint/replay. Widoki UI, Search i sprawdzanie duplikatów używają CaseLinkCurrent; stary snapshot nie jest wyświetlany jako drugi aktualny adres. Replay po korekcie/void nie zapisuje override ani nie przywraca starego adresu. Deduplikacja uwzględnia aktualne aktywne linki, bez zmiany reguły nazwy ani międzykontowego wycieku. Należy zaktualizować wszystkie bieżące konsumenty `source_url`, zachowując historyczny payload odpowiedzi replay i jego semantykę zamiaru.

Nowe dodatkowe linki/overrides i ich audyt korzystają z istniejącego wzorca command-ledger + chroniona projekcja (por. `0011_companies_contacts.sql` i `0012_catalog_intent_guard.sql`), z invoker komendą i triggerami walidującymi intencję. Bez bezpośredniego dowolnego zapisu projekcji/audytu. FK `(owner_id, case_id)`, jeden override na legacy, brak override dla pustego źródła oraz sprawdzenie duplikatów/kolejności pod blokadą własnej sprawy zapewniają integralność także poza BFF. Guard nie może ufać klientowemu znacznikowi „wykonuję RPC”. Wszystkie ścieżki bezpośredniego Data API i spoofowania receiptów wymagają testów. Nie przebudowujemy całego QC; zachowujemy frozen intent, fingerprint, duplicate warning, replay i niepewny wynik.

Dedupe korzysta z `EXISTS` aktywnego efektywnego linku, nie JOIN mnożącego sprawy. Potwierdzenie ostrzeżenia wiąże też aktualną zawartość/rewizję dopasowanych linków: korekta między warning a commit wymaga ponownego podglądu i świadomego potwierdzenia. Zachowane blokady ownera i ponowny odczyt request ID przy wyścigu z direct INSERT. Historyczne receipty i ich frozen payloady nie są przepisywane. Statyczną wykonalność tej konstrukcji potwierdził audyt backendowy; wykonanie na PostgreSQL pozostaje NOT RUN.

**FTS/read model:** indeksy na źródłowych bieżących danych i read-only agregacja przez niewielki `SECURITY INVOKER` RPC w tej samej bazie. To rekomendacja wykonawcza w granicach ADR-0008, bez nowej usługi, materializowanego magazynu czułych kopii ani workera. GIN dla FTS; uzupełniające indeksy/dopasowania dla adresów po weryfikacji dostępnych rozszerzeń. Nie zastępujemy istniejącego indeksu `md5(source_url)` nieograniczonym kluczem B-tree tekstu. Search wykonuje autoryzację przed count/rank/snippet/paginacją; żaden klientowy ownerId nie poszerza zakresu.

Jeden wynik per `(typ, source_id)`; M:N nie mnoży rekordów. Ta sama sprawa może mieć kilka prawdziwych trafień w odrębnych grupach, np. dwa różne linki i notatkę. Nie propagujemy sztucznie nazwy firmy do grupy spraw ani kontaktu do wydarzeń przez samą relację. Fragmenty pochodzą wyłącznie z aktualnej dozwolonej treści, są renderowane jako tekst. Audit i stare rewizje nie stają się wynikami. Zmiana danych i ich indeksowalnego stanu jest transakcyjna; następny odczyt widzi aktualny zapis bez background reindex.

**BFF/UI i prywatność:** zaufana tożsamość per request, użytkowy klient Data API; brak service-role. Odczyt Search przez body żądania, aby tekst nie trafiał do URL; istniejące kontrole origin/session, `private, no-store`, brak logowania payloadów. Rozróżnione loading, puste zapytanie, zero trafień, błąd i wygaśnięcie sesji. Stara odpowiedź nie nadpisuje nowego zapytania ani danych innego konta. Ramka wyników nie zapisuje prywatnych payloadów do storage. Otwieranie nakładki nie zapisuje niezwiązanego formularza; dirty guards muszą działać również przy nawigacji do wyniku.

**Recovery po reloadzie — wybór wykonawczy:** owner-scoped reconcile serializuje sprawdzenie receiptu z oryginalną komendą pod tą samą blokadą. Jeżeli zapis już wygrał, zwraca jego receipt; jeżeli zamiaru nie ma, zapisuje w istniejącym ledgerze beztreściowy fence klucza i sprawy, który uniemożliwia późną mutację. Pełny prywatny payload nie jest przechowywany w przeglądarce; w RAM działającego edytora retry wymaga identycznego zamiaru i ponownego odczytu stanu. Mechanizm zachowuje zakres DEC-064 i nie określa ogólnej polityki retencji. Bezpośredni Data API podlega temu samemu guardowi przed skutkiem triggera.

**Kontekst:** resolver po `(typ, id)` ponownie autoryzuje i odczytuje aktualną relację. Sprawa/firma/osoba → istniejący detal. Link → konkretny aktualny wiersz CaseLinks. Notatka → konkretny wpis, również poza pierwszą stroną osi. Wydarzenie → konkretny CalendarEvent; ogólne lub odłączone nie prowadzi do historycznej sprawy. Przy zmianie relacji między wyszukaniem i kliknięciem używamy nowej relacji, bez starego fallbacku z audytu. Błąd/nieistniejące/cudze ID nie ujawnia danych ani istnienia; dla własnego unieważnionego wpisu można pokazać jego aktualne oznaczenie. Focus i scroll muszą wskazać widoczny cel, nie tylko sekcję.

**Historia, import i działania:** Notes włącza się do istniejącej mieszanej, paginowanej osi z jej regułami dat. Linki są danymi sprawy i audytem, nie nowym faktem aplikowania. Wyszukanie/otwarcie nie zmienia statusów, etapów, zakończeń, zadań, Calendar, uczestników, sugestii, przypomnień ani e-maili. Import nadal nie jest implementowany; przyszły zapis ma używać tych samych modeli/constraints, bez równoległego indeksu lub fabrykowania provenance. Nie powstają dokumenty ani nowa polityka retencji/usuwania.

**Aktualne źródła techniczne:** zastosowano skills `analyze-requirement`, `plan-slice`, `clarify-requirements`, `context7-mcp`, `supabase:supabase`; QA zastosowało też `verify-acceptance` do planu dowodów. Context7: resolve PostgreSQL → `/websites/postgresql` → dokumentacja [słowników](https://www.postgresql.org/docs/current/textsearch-dictionaries.html), [listy słowników](https://www.postgresql.org/docs/current/textsearch-psql.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html), [unaccent](https://www.postgresql.org/docs/current/unaccent.html). PostgreSQL nie wymienia wbudowanego polskiego stemmera; pliki Ispell nie są dostarczane przez standardową dystrybucję. Dostępność rozszerzeń i plan na przypiętym obrazie nadal NOT RUN. [Changelog Supabase](https://supabase.com/changelog.md) sprawdzono 2026-11-09; nie planuje się aktualizacji przypiętego CLI v2 ani SDK w tym slice. Żaden research nie zastępuje testu lokalnego runtime.

## 6. Plan wykonania i własność plików po zgodzie

Model i reasoning: dziedziczone z sesji; dokładne wartości nieudostępnione. Nie deklarujemy fikcyjnego override. Obecne zadania analityczne: `search_spec` (spec-analyst), `search_code` (backend-engineer, audyt), `search_qa` (qa-engineer, plan), bez zapisu i dalszej delegacji. Ich wyniki nie są niezależnym code review przyszłej implementacji.

| Kolejność / właściciel | Rozłączny zakres zapisu | Podstawa i DoD |
| --- | --- | --- |
| 1. Orchestrator / spec-analyst | DEC, zależne OPEN, FR/AC, ten dokument, traceability | Po odpowiedzi zastosować `record-decision`; zachować źródło PO, rozstrzygnąć tylko podzakres 1/2/3. Przed kodem ponowić macierz kanoniczną |
| 2. QA już w planowaniu | `tests/integration/recruitment/global-search.test.ts`, nowe testy Notes/Links, `tests/e2e/recruitment-global-search.spec.ts` i fixtures | GS-001–008, HE, LC, AD/NV; przygotować wartościowe przypadki kontraktowe i negatywne przed zależną implementacją; ich brak działania na starym kodzie nie jest regresją baseline |
| 3. UX, następnie frontend | Opracowanie stanów UX-015/F07/F12 we właściwych docs/ux, następnie przekazanie własności dokumentów orchestratorowi | W granicach 1A/2A/3A: overlay, strona, notatki/linki, focus, dirty state, konkretne trafienie, mobile; bez nowego discovery architektury |
| 4. Backend engineer | `db/recruitment/schema.ts`, nowe migracje/meta; `src/modules/global-search/`, moduły Notes/Links; backendowa projekcja historii i kompatybilność create; `src/app/search/data/route.ts`, trasy komend nowych danych; własne unit | Dane → poprawny owner-scoped read model → FTS/RPC. Atomowość, RLS, zgodność dawnych komend, brak fikcyjnych wydarzeń |
| 5. Frontend engineer | `src/components/global-search/`, `src/app/search/page.tsx`, `app-shell.tsx`, komponenty Notes/Links, detal sprawy i Calendar target UI; własne unit | Pełny UX, sześć grup, wszystkie wyniki, rzeczywiste konteksty. Nie edytuje backendowych route handlers |
| 6. QA / integracja | Wyłącznie testy i `scripts/recruitment/runner.ts`; przy potrzebie zmiany CI przekazanie osobnemu platform-engineer | Jawna lista integracji runnera musi zawierać nowe testy. Nazwa E2E `recruitment-*.spec.ts` pasuje do istniejącego wzorca. Deweloperzy nie edytują równolegle testów QA |
| 7. Niezależni reviewerzy | Bez zapisu ocenianych plików | Backend, frontend i security na zamrożonym kandydacie, z oddzielnymi sesjami i ponowieniem po poprawkach |
| 8. Orchestrator | Dokumentacja, raporty, traceability, opis osobnego PR | Finalne dowody i CI dla dokładnego SHA; publikacja PR dopiero w zakresie późniejszej jawnej autoryzacji. Bez automatycznego merge/deploymentu |

Przed startem użyć `implement-slice`, przed wykonaniem QA `verify-acceptance`, przed review `review-change`. W task packetach podać autora, sesję, bazę, dokładnego kandydata, pliki, wymagania i DoD. Przekazania plików wspólnych są sekwencyjne; orchestrator rozstrzyga je przed zapisem. Limit równoległości harnessu pozostaje zachowany.

Prace implementacyjne w osobnym worktree od uzgodnionej aktualnej bazy. Najpierw ponownie zinwentaryzować Git i własne zasoby. Nie resetować/stashować/przenosić zastanych zmian; nie przełączać istniejącego main. Nie zatrzymywać cudzych procesów ani kontenerów.

## 7. Macierz akceptacji i testów

Każdy poniższy test jest **PLANNED / NOT RUN**. Autor unit: właściwy developer; integracji/E2E: QA. Reviewer: backend dla SQL/domeny, frontend dla UX, security dla granic dostępu/prywatności.

| ID / ryzyko | Planowany dowód | Poziom |
| --- | --- | --- |
| AC-GS-001 | Rozpoznawalne stanowisko w tytule/opisie, dwie różne sprawy o tej samej nazwie, brak URL/firmy/stanowiska | Unit + DB + browser |
| AC-GS-002/003 | Wyszukanie firmy i nazwy/e-maila kontaktu, właściwe profile, samodzielny kontakt, brak mnożenia przez M:N | DB + browser |
| AC-GS-004; AC-LC-023/025 | Kilka różnych ról URL jednej sprawy; pełny adres/ścieżka/query/literalne znaki; właściwy wiersz; zero fetch i fikcyjnych faktów | DB + browser/network |
| AC-GS-005; HE-001/004/005; TC-020 | Rzeczywisty zapis notatki w UI, zamknięta dawna sprawa, unikalna fraza, wynik → konkretny wpis poza pierwszą stroną osi | Pełny E2E + DB |
| AC-GS-006 | Bieżący opis Calendar wszystkich stanów, ogólny/odłączony, dawny i poza bieżącym zakresem dat; właściwy wpis po zmianie relacji | DB + browser |
| AC-GS-007/008 | Fraza we wszystkich sześciu grupach, brak duplikatów tego samego źródła, zgodny ranking nakładki/strony, konkretna nawigacja | DB + browser |
| AC-LC-021; BR-012 | Zakończona sprawa odnajdywalna, bez wznowienia/status change | DB + browser |
| 1A / OPEN-038 | NFC, PL/EN, ł/l, diakrytyka/case, prefiksy, wiele tokenów AND, interpunkcja/operatory, krótkie zapytania, 0/1/200/201 kodowych, SQL injection literalnie | Unit + real PostgreSQL |
| Duże zbiory | >3 i >20 trafień w każdej grupie, remisy/stabilny porządek, każdy dalszy wynik osiągalny, walidacja stron, brak podwajania przy niezmienionych danych | DB + browser |
| Korekty i void | Stary tekst przestaje pasować, nowy pasuje; void bez aktualnego trafienia; audyt dostępny właścicielowi, bez indeksowania oryginałów i receiptów | DB + browser |
| Notes/Links mutacje | Replay, inny payload/same key, utrata odpowiedzi, conflict rewizji, rollback, daty known/unknown, porządek linków, duplicate URL w tej samej vs innej sprawie | Unit + DB + E2E |
| Upgrade / QC | Świeża baza i syntetyczny upgrade sprzed GS; zachowane UUID/URL/role unknown/historia/ledger. Legacy od razu widoczny przez CaseLinkCurrent bez backfillu; stary create/replay/direct INSERT, frozen QC, dedupe na aktywnych linkach; void override bez fallbacku, replay nie cofa korekty | DB + istniejące regresje QC |
| AC-AD-002; BR-030; TC-034 część Search | A ma dostęp. B/anon nie uzyskują treści, ID, typów, snippetów, counts, istnienia ani audytu; listy, direct ID, RPC/Data API z pominięciem BFF, spoof owner, oba końce relacji | Real Auth/JWT/Data API/RLS |
| Prywatność UI | Logout, zmiana konta i późne odpowiedzi, brak cache leakage, tekst nie trafia do URL/logów/storage/artefaktów, XSS jako tekst | Browser + security review |
| UX-015/F12 i F07 | Widoczne wejście ze wszystkich istniejących modułów; 1440/1024/768/375, nakładka/pełna strona/powrót, Tab/Shift+Tab/Escape, focus celu i triggera, dirty cancel, loading/empty/error/retry, długie dane | Production HTTPS Chromium + manual a11y |
| Regresje BR | Search nie wywołuje aplikowania, auto-merge, odbycia, zamknięcia, zmiany uczestników, zadania, przypomnienia ani e-maila; brak plików/korespondencji fetch | Integracje + browser |
| ADR-0008 / NFR-006 | Katalog indeksów i RLS, poprawne plany, syntetyczny pomiar `EXPLAIN (ANALYZE, BUFFERS)` z liczebnością i rozkładem per owner | PostgreSQL, bez domniemanego SLA |

Nie wymagamy użycia GIN przez planner dla malutkiej tabeli. Mierzymy rzeczywisty plan i warunki skali. Pełny TC-034 nadal obejmuje dokumenty, a pełny TC-024/AC-NV-002 siedem modułów; Search nie nadaje im pełnego PASS, dopóki brakujące moduły i ich testy nie istnieją. Nie tworzymy atrap Dokumentów tylko dla zielonego testu. Nieprzetestowane technologie asystujące i realne urządzenia raportujemy osobno.

**Komendy istniejące, do wykonania po implementacji:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm build`, `pnpm test:recruitment`. Runner recruitment obejmuje rzeczywiste migracje, integracje i production HTTPS browser; nie dokładamy fikcyjnego `pnpm test:search`. Usunąć zbędne powtórzenia builda, jeśli wymagany runner wykonał identyczny check na tym samym kandydacie.

Środowisko: Node 24.22.2, pnpm 12.16.1; sprawdzić również `pnpm exec node --version`. Własny jednorazowy syntetyczny target runnera i ownership manifest. Zajęte porty 3152/3153 oznaczają konflikt do rozwiązania we własnej konfiguracji albo STOP, nie zgodę na zabicie procesu. Bez pożyczania `RECRUITMENT_TARGET_ID`, `dev:local:reset`, migracji persistent DEV, cloud SQL lub globalnego Docker cleanup. Sprzątanie wyłącznie potwierdzonych własnych zasobów. Dowody bez tokenów, prywatnych payloadów i rzeczywistych danych.

## 8. Review, dokumentacja i warunki osobnego PR

Po zamrożeniu kandydata: niezależny backend-reviewer (SQL, migracje, source_url/QC, domena), frontend-reviewer (Blueprint, pełna nawigacja, stany i a11y), security-reviewer (RLS, grants/invoker, snippets/counts/ID, query privacy, nowe prywatne dane). Codex review przez oddzielnego read-only rodzica `harness/scripts/review.py`, nie jako dziecko sesji zapisującej; procedura w [harness](../harness/README.md). Claude reviewer ma tylko Read/Grep/Glob. Brak rzeczywistego ograniczenia oznacza NOT RUN review. Nie uruchamiano teraz review implementacji, ponieważ nie ma takiego kandydata.

Po poprawkach: ponowić dotknięte testy i review; nie powoływać się na ocenę starego diffu. Dla finalnego SHA wymagane hosted CI z istniejącymi jobs checks/production/harness/f2/f3/recruitment i required. Zachować osobno pierwotne FAIL/timeout i późniejsze retry. Zielony retry nie dowodzi przyczyny nieustalonego błędu.

W wykonaniu aktualizować razem: rejestry DEC/OPEN, feature Global Search oraz History & Events/Recruitment Lifecycle, logiczny model danych, właściwe FR/AC, scenariusze i traceability, UX-015/F07/F12 oraz osobne raporty delivery/QA/review. Nie przepisywać historycznych ograniczeń i wyników poprzednich slice'ów jako aktualnych PASS. Nowy ADR nie jest potrzebny dla realizacji ADR-0008; istotna zmiana architektury wymaga odrębnej jawnej decyzji i ADR.

DoD przyszłego PR: wszystkie AC-GS-001–008 działają na prawdziwych danych, Notes i CaseLinks mają pełne zatwierdzone kontrakty i testy, właściwe konteksty są osiągalne, izolacja A/B/anon udowodniona, zgodność migracji/QC zachowana, zero blokujących findings, kompletna traceability oraz dokładny finalny SHA z wymaganym CI. PR dopiero po jawnej zgodzie obejmującej jego publikację; merge/deployment i provisioning pozostają oddzielne.

## 9. Wynik bieżącego zadania

| Kontrola | Status | Dowód / granica |
| --- | --- | --- |
| Stan Git, zakres specyfikacji i audyt kodu | PASS — analiza statyczna | Baza powyżej; odczyt kanonicznych źródeł, modułów/schematu i obecnych testów; delegowane spec/backend/QA |
| Spójność planu i lokalne odnośniki | PASS — kontrola dokumentacji | Spec-analyst: zakres 1A/2A/3A; backend: wykonalność invoker view dla legacy INSERT. Lokalny skrypt sprawdzający cele Markdown i `git diff --check`; nie są to testy aplikacji |
| Pakiet decyzji i plan | PROPOSED / READY_FOR_OWNER_DECISION | §4: 1A/2A/3A; §6–8: właściciele, QA, review, osobny PR |
| Zależna implementacja | BLOCKED do decyzji i autoryzacji | OPEN-038, pola/korekty Notes oraz CaseLink; obecne zlecenie zabrania implementacji |
| Testy aplikacji, migracje i runtime QA | NOT RUN | Celowo niewykonane w analizie; brak kandydata Global Search |
| Niezależne review kodu i hosted CI Global Search | NOT RUN | Brak implementacji/SHA slice'a; plan i opinie analityczne nie są code review |
| PR / merge / deployment | NOT RUN | Poza bieżącą autoryzacją |

Analiza nie rozstrzyga ogólnej retencji, hard delete, archiwizacji, treści dokumentów, importu ani publicznego release. Pozostają istniejącym docelowym zakresem i właściwymi OPEN, a nie ukrytymi ograniczeniami Search.
