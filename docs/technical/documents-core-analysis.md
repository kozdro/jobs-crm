# Documents Core — analiza SDD i pakiet decyzji PO

**Data:** 2026-11-11. **Dokument:** zapis analizy poprzedzającej decyzję. PO następnie zatwierdził warianty 1A/2A/3A/4A i implementację Documents Core; źródłem obowiązującej decyzji jest [DEC-065](../decisions/product-decisions.md), a częściowe rozstrzygnięcia są w rejestrze OPEN. Poniższe oznaczenia PROPOSED i wyniki odnoszą się do chwili sporządzenia analizy, nie do stanu po decyzji. Merge, deployment i produkcyjny provisioning pozostają poza autoryzacją.

## 1. Baza, metoda i wynik

Lokalny HEAD jest dokładnie `b28877e49abae95cd68b0ed13c9a840011859e05`, merge PR #28, z rodzicami `78d94b43f48997ea7561f4e1157a17a588788b2a` i `13273c8c505327cb48f3b591cf3db90f40fe6d42`. Początkowy `git status --porcelain` był pusty. To potwierdzenie lokalnego Git i zgodności z bazą wskazaną przez PO; bez odświeżania remote lub ponownej oceny CI #28. Istniejące worktree i commity pozostawiono nietknięte. Nie uruchamiano usług, Dockera, zapytań do DEV ani migracji.

Zastosowano `analyze-requirement`, `plan-slice`, `clarify-requirements` oraz zasady raportowania `verify-acceptance`; instrukcje Supabase i Context7 dla aktualnych właściwości Storage. Zgodnie z poleceniem PO rozstrzygnięcia są jednym pakietem, bez sekwencji pojedynczych pytań. Orchestrator jest autorem dokumentu; `/root/documents_spec` (spec-analyst), `/root/documents_qa` (qa-engineer) i `/root/documents_security` (backend-engineer, analiza architektury i zagrożeń) pracowali bez zapisu i dalszej delegacji. Model odziedziczony; dokładny identyfikator i reasoning nieudostępnione. Te analizy nie są formalnym niezależnym review przyszłej implementacji.

**Rekomendacja:** jeden pełny przyrost Documents Core i docelowo jeden osobny PR: wszystkie FR-DO-001–010, działająca biblioteka i prywatne załączniki, trzy ścieżki dodania, niezmienne wersje, jawne wskazanie wersji wysłanej, autoryzowane pobieranie oraz kontrolowane usunięcie treści. Backend, UI, Storage, historia, testy i dokumentacja są częścią tego samego rezultatu. Sam upload lub osobny CRUD bez integracji z aplikowaniem nie spełniają zakresu.

## 2. Zgodność ze źródłami

| Źródło / ID | Status i zachowanie do zachowania | Dowód w przyszłym przyroście |
| --- | --- | --- |
| [Discovery provenance](../product/discovery-provenance.md), [DEC-039/040/041](../decisions/product-decisions.md) | APPROVED: biblioteka reuse, case-only, trzy ścieżki, wersje CV, konkretna wysłana wersja, link ≠ wysłanie | Trzy ścieżki, reuse w dwóch sprawach, A wysłane i B tylko powiązane |
| [FR-DO-001–010](../requirements/functional-requirements.md), [AC-DO-001–010](../quality/acceptance-criteria.md), dodatkowe 002-01, 005-01/02, 010-01/02 | APPROVED MVP; szczegóły polityk nadal OPEN | Pełna macierz §7, bez pominiętych formatów funkcjonalności |
| [BR-026/030](../domain/business-rules.md), [model](../domain/glossary-and-model.md), NFR-001 | APPROVED: powiązanie nie jest wysłaniem; prywatność właściciela | Brak fikcyjnych faktów; A/B/anon także poza BFF |
| [UX Blueprint](../ux/blueprint.md), [UX-012 i UX-005](../ux/screen-blueprints.md), [F04/F10](../ux/flow-contracts.md), [wybory UX](../ux/blueprint-decisions.md) | Zatwierdzone zachowania produktu; szczegóły listy rekomendowane pod delegacją UX nie stanowią nowej DEC. Biblioteka, sekcja sprawy, wersje, jawne działania, brak obowiązkowego CV | Pełne flow biblioteka → sprawa → aplikacja → historia; keyboard/mobile i brak automatycznego wysłania |
| [TD1.12 A /1.13 A /1.14 B /1.15 A](discovery-decisions.md), [ADR-0004](../decisions/adr/0004-private-storage-versions.md) | APPROVED / ACCEPTED: private Supabase Storage + metadane SQL; bytes immutable; sent-version osobno; kontrolowane usunięcie treści i tylko uzasadniony fakt | Pierwotne bajty A niezmienne po B; odmowa overwrite; usunięcie nie przepisuje faktów |
| DEC-051, [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), [SEC-01/02](security-and-privacy.md) | APPROVED / ACCEPTED: native Auth/SSR, user JWT/Data API/RLS, oba końce relacji; JWT może działać do expiry | Właściciel z zaufanego Auth, HTTP ACL i osobny replay JWT, bez brokera lub service-role w zwykłym CRUD |
| DEC-054/055/056/057/061/062/063/064 | APPROVED w swoich zakresach: fakty, korekty i void, zakończenia, QC, Calendar, przypomnienia, Search | Brak regresji statusów, historii, starych receiptów i ich replay; brak nowej wysyłki |
| [ADR-0009](../decisions/adr/0009-backup-retention-deletion.md), [operacje](operations-and-quality.md) | ACCEPTED: 7 dni rotacji kopii, deletion ledger/replay, RPO 1h/RTO 24h jako cele; wykonalność i szczegóły OPEN | Wąska kontrola delete/restore dokumentu lokalnie; pełny DR i infrastruktura osobno przed release |
| DEC-050, [ADR-0008](../decisions/adr/0008-postgres-fulltext.md), DEC-064 | DEFERRED: indeksowanie treści plików/OCR/semantyka. APPROVED: istniejące sześć grup Search | Search działa z Dokumentów; treść CV nie jest indeksowana i nie powstaje siódma grupa |
| FR/AC-NV-001/002, DEC-017/053 | APPROVED: siedem modułów, wspólna nawigacja/QC/Search i zatwierdzony UI foundation | Dokumenty stają się działającym siódmym modułem, regresja wejść i powrotów |

UC/TC-018 jest głównym scenariuszem; UC/TC-003 obejmuje aplikowanie bez ogłoszenia i konkretną wersję, UC/TC-031 ochronę dokumentu, UC/TC-034 izolację kont; UC/TC-024 nawigację. Źródła: [scenariusze](../quality/scenarios.md), [traceability](../quality/traceability.md). Ten przyrost nie dowodzi całego TC-036 dotyczącego eksportu i usunięcia konta.

## 3. Rzeczywisty stan kodu i zależności

| Obszar | Stan na bazie #28 | Konsekwencja |
| --- | --- | --- |
| Dokumenty | Brak modułu domeny, stron, modeli Document/DocumentVersion/case link/sent relation w `src/` i `db/recruitment/schema.ts` | Pełna nowa funkcjonalność, bez danych dokumentowych do biznesowego backfillu |
| Nawigacja | `src/components/workspace/sidebar.tsx:24`: Dokumenty bez href, niedostępne | Nowa trasa `/documents`, AppShell i kontekst sprawy; wykorzystać obecny Visual Language |
| Fakty | `src/modules/recruitment/domain/case-events.ts:3–31`: application/contact/invitation/stage-change bez referencji CV | Zintegrować z konkretnym application, nie polem „aktualne CV sprawy” |
| Komendy / auth | `src/app/recruitments/commands/route.ts`: getUser, identity binding, Origin/Host/Fetch-Site, prywatne nagłówki; `src/modules/identity/infrastructure/http.ts` | Wykorzystać wzorce, uzupełnić kontrolę strumienia pliku i nowe ścieżki dostępu |
| Historia | Migracje 0007–0010; `src/app/recruitments/history-commands/route.ts`, `case-history.tsx` i `history-corrections.tsx` | Zachować oryginały, rewizje, terminalny void i concurrency; CV nie jest osobną fikcyjną aplikacją |
| Search | Migracja `0022_global_search.sql`, `src/app/search/`, `src/components/recruitment/case-content-tools.tsx` | Regresja sześciu grup, notatek i linków; bez ekstrakcji treści plików |
| Storage | Profile `supabase/*config.toml` mają Storage wyłączone; `supabase/recruitment-config.toml:43–50`; `scripts/recruitment/target.ts:51–52` wyklucza storage-api/imgproxy | Istniejące testy nie dowodzą plików. Potrzebny prawdziwy Storage w disposable QA, bez zmiany persistent DEV |
| Migracje | Drizzle, `db/recruitment/migrations/0000–0022`, własny ledger i guard w `scripts/recruitment/target.ts` | Addytywna migracja po bieżącym ledgerze; nie zmieniać starych SQL/snapshotów i nie tworzyć równoległej historii Supabase CLI |
| Runtime i zależności | `package.json`: Node 24.22.2, pnpm 12.16.1; Next 16.4.3, supabase-js 2.118.0, ssr 0.12.7, CLI 2.122.0, Drizzle 0.45.4 | Zachować piny. Brak uzasadnienia zmiany frameworka, SDK lub infrastruktury; parser formatów ewentualnie wymaga oceny zależności przed dodaniem |

Podane wersje są odczytem manifestu, nie dowodem wersji uruchomionych procesów. Preflight przyszłych child runtimes musi je sprawdzić. Nie migrować ani uruchamiać start/reset DEV dla potrzeb analizy lub QA.

## 4. Jeden zbiorczy pakiet decyzji PO

Wystarczy zbiorczy wybór **1A / 2A / 3A / 4A** albo wskazanie odstępstw. Wszystkie szczegóły poniżej są PROPOSED. Warianty B są rzeczywistymi alternatywami w granicach zatwierdzonych decyzji; nie cofają immutable versions, private Storage ani możliwości usunięcia treści. Przyjęcie pakietu rozstrzyga wyłącznie wskazane podzakresy OPEN.

### 1 — Metadane, wersje i znaczenie wskazania „wysłano”

**Blokuje:** model i formularze Document/Version oraz rozszerzenie application i korekt. OPEN-036; zależnie OPEN-002/004 dla nowych pól i audytu. Nie pytamy ponownie o niezmienność bytes.

**1A — rekomendacja:**

- Dokument ma nazwę 1–160 punktów kodowych po trim, proponowaną z nazwy pliku i edytowalną; jawne oznaczenie „CV” tak/nie, domyślnie nie. Brak narzuconego słownika innych rodzajów, obowiązkowego opisu, języka lub stanowiska.
- Wersja ma automatyczny, stabilny numer w ramach dokumentu i opcjonalną etykietę do 160 punktów kodowych; oryginalną nazwę pliku oraz zweryfikowany typ/rozmiar i zaufany czas dodania. Numer/bytes/tożsamość nie są edytowalne; zmiana treści tworzy nową wersję. Nazwę/oznaczenie/etykietę można poprawić z kontrolą współbieżności i audytem, bez zmiany wysłanej tożsamości. Zmiana oznaczenia CV nie unieważnia wcześniejszego potwierdzenia wysyłki.
- Relacja robocza sprawy wskazuje wybraną konkretną wersję, nie ruchome „najnowsze CV”; zmiana wybranej wersji jest jawna. Biblioteczny dokument i jego wersje można wykorzystać w wielu sprawach bez ponownego uploadu. Case-only dokument nie staje się automatycznie biblioteką ani nie trafia do innej sprawy.
- Jeden ważny fakt `application` może wskazywać **wiele jawnie wybranych wersji CV**, bez limitu domenowego ich liczby i bez duplikatu tej samej wersji. Każda referencja wskazuje konkretny DocumentVersion. Nie są to dodatkowe aplikowania. Nie domyślamy się wysłania innych dokumentów lub przez sam kontakt inbound/outbound.
- Wskazanie możliwe przy zapisie aplikowania na istniejącej sprawie albo później przy konkretnym istniejącym application, również z nieznanym dniem i na zakończonej sprawie. Faktyczna aplikacja pozostaje świadomie potwierdzona; brak CV jest poprawny i nie oznacza „na pewno nie wysłano CV”. Brak dodatkowej wymyślonej daty wysyłki; czas przypisania jest techniczny, odrębny od dnia aplikowania.
- „Wysłano tę wersję” wymaga jawnego potwierdzenia niezależnego od dołączenia. Nowe application + referencje zapisują się w jednej transakcji SQL po przygotowaniu gotowych plików; błędna referencja wycofuje całą nową komendę. Późniejsze przypisanie nie tworzy kolejnego application ani nie zmienia statusu/etapu.
- Błędne wskazanie można poprawić lub wycofać przez audytowaną rewizję z zachowaniem oryginalnej tożsamości i wcześniejszych wskazań. Nigdy ciche UPDATE na „najnowszą wersję”. Void aplikacji zachowuje audyt referencji jako związanych z unieważnionym wpisem, nie jako ważne potwierdzenie; nie kasuje bytes i nie przepisuje innych aplikacji. Kontrola wersji obejmuje wyścigi z void i delete.
- Quick Capture zachowuje DEC-061 i cztery kroki. Po jego zapisie można wejść do utworzonej aplikacji i uzupełnić CV bez tworzenia nowego faktu. Nie dodajemy uploadu do atomowej komendy tworzenia sprawy; TC-003 i DO-005 pozostają w pełni wykonalne.

**1B — alternatywa:** ten sam kontrakt, ale **zero lub jedna wersja CV na konkretny application**; ponowny wybór jest korektą z audytem, nie drugim faktem. Prostszy wybór w UI, lecz wprowadza nowy limit biznesowy i nie reprezentuje kilku rzeczywiście wysłanych wariantów. Dlatego rekomenduję 1A.

### 2 — Odłączenie, usunięcie treści i minimalny ślad

**Blokuje:** delete, read model po delete, audyt, kompensacje i ich testy. OPEN-006/032/036, zależnie OPEN-005. ADR-0004 już dopuszcza usunięcie treści, a ADR-0009 ustala 7 dni kopii; nie proponujemy wiecznej blokady ani samego soft delete jako zamiennika fizycznej kasacji.

**2A — rekomendacja:**

- „Odłącz od sprawy” usuwa relację roboczą, nie historyczne wskazania wysłania ani biblioteczne bytes. Usunięcie samego powiązania nie usuwa pliku używanego w innych sprawach. Dla ostatniego powiązania case-only UI wymaga jawnego wyboru usunięcia treści albo anulowania; nie tworzy niewidocznego osieroconego pliku i nie przenosi go samoczynnie do biblioteki.
- „Usuń treść wersji” jest nieodwracalne; preview pokazuje wszystkie własne powiązania i fakty aplikowania, których dotyczy, a potwierdzenie jawnie obejmuje historycznie użyte wersje. Usunięcie całego dokumentu analogicznie obejmuje wszystkie wersje i skutki. Nie usuwa sprawy/application, innych wersji poza zatwierdzonym zakresem ani danych innych kont.
- Od zatwierdzenia delete dokument jest niedostępny dla nowych odczytów i nowych powiązań/wskazań. Nie obiecujemy cofnięcia pliku już pobranego ani przerwania każdego rozpoczętego transferu. Operacja pokazuje „usuwanie”, a sukces fizycznej kasacji dopiero po potwierdzeniu Storage API. Cel realizacji aktywnych bytes: do 24 godzin; nieudana kasacja pozostaje widoczna jako oczekująca/błąd z retry, bez fałszywego sukcesu.
- Po kasacji nie zachowujemy pliku, filename, nazwy, etykiety, hash treści ani rozmiaru/MIME w minimalnym historycznym śladzie. Pozostają wyłącznie opaque identyfikatory właściciela/dokumentu/wersji, stabilny numer wersji, powiązany fakt application, fakt niedostępności/usunięcia i zaufane czasy niezbędne do rozliczenia operacji. Historia pokazuje np. „Wysłana wersja 2 — treść usunięta”. Brak odtwarzania poprzednich nazw przez audyt, receipt, log lub cache.
- Ślad aplikowania/referencji utrzymujemy tak długo jak sam powiązany fakt w koncie; nie wprowadzamy automatycznej retencji spraw ani wygaśnięcia historii w tym przyroście. To wąska propozycja produktowej minimalizacji, nie deklaracja zgodności prawnej. Globalne usunięcie konta i ewentualne wyjątki prawne pozostają OPEN-032/046 i nie mogą być zastąpione retencją tego śladu „na zawsze”.
- Dla usuniętej wersji bez historycznego wskazania wysłania po potwierdzonej kasacji usuwamy jej prywatne metadane i audyt nazw/etykiet, a receipt minimalizujemy do rozliczenia operacji w ograniczonym czasowo ledgerze. Nie pozostawiamy bezterminowego dokumentowego tombstone. Dokument bez pozostałych wersji i bez uzasadniających referencji również znika; zachowany dokument z innymi wersjami nadal ma własną aktualną nazwę. Kasacja wersji usuwa jej dawne nazwy z audytu, nie nazwy odrębnych nadal przechowywanych dokumentów.
- Techniczny ledger usunięć zawiera jedynie opaque identyfikatory potrzebne do powtórzenia kasacji i zatrzymania odtworzenia danych z kopii; nie payload pliku. Wąska propozycja retencji ledgeru zakończonej operacji: 7 dni od potwierdzonej kasacji, a dłużej tylko do zakończenia rozpoczętego restore/replay, który obejmuje starszą kopię. Aktywny restore blokuje publikację danych do weryfikacji ledgeru; nie stosujemy bezterminowego wyjątku dla nieistniejącej kopii. Pełny proces backupów/restore wymaga potwierdzenia wykonalności przed release.
- Porzucony upload nie jest dokumentem ani historią; niedokończone próby wygasają po 24 godzinach, bytes i prywatne metadane są kasowane z retry. Limity miejsca obejmują pending bytes do fizycznej kasacji, aby nie dało się omijać quota.

**2B — alternatywa:** identyczna kasacja/retencja, lecz zachowanie również pierwotnej nazwy/etykiety wysłanej wersji przy fakcie application aż do usunięcia tego faktu/konta. Ułatwia ludzką identyfikację, ale zachowuje potencjalne PII po delete i wymaga uzasadnienia tej retencji. Rekomenduję 2A dla minimalizacji; oba warianty zachowują niezmienną tożsamość wersji.

### 3 — Formaty, rozmiary i quota

**Blokuje:** walidację, konfigurację bucketów, formularze, kontrolę miejsca i testy graniczne. OPEN-007. W źródłach nie ma zatwierdzonej liczby ani allowlisty.

**3A — rekomendacja:** PDF, DOC, DOCX, TXT, JPEG i PNG; maksymalnie **20 MiB (20 × 1024² bytes) na plik**, **1 GiB na konto**, bez osobnego limitu liczby dokumentów, wersji i relacji. Wszystkie trzy ścieżki dodania i wersjonowanie mają te same reguły. Quota liczy fizyczne, również oczekujące bytes; reuse istniejącej wersji nie zużywa miejsca drugi raz. Przekroczenie odrzuca nowy upload bez kasowania starszych wersji i bez blokowania odczytów. Brak cichej kompresji lub konwersji.

Plik pusty, format niezgodny z rozszerzeniem/deklaracją, zaszyfrowany lub chroniony hasłem uniemożliwiającym walidację jest odrzucany. Formatów wykonywalnych, HTML/SVG i archiwów ogólnego przeznaczenia nie dopuszczamy; DOCX jest walidowany jako ograniczony kontener dokumentu, z ochroną przed bombą ZIP. Walidacja rozpoznaje strukturę formatu, a nie samo MIME klienta. Dla dokumentów Office odrzucamy wykryte makra/aktywne payloady; brak wykonalnej kontroli dla któregokolwiek dopuszczonego formatu jest jawną blokadą jego dostarczenia, nie powodem cichego ograniczenia allowlisty.

Pobieranie jako attachment, bez osadzania i wykonywania treści w aplikacji. Walidacja formatu nie jest certyfikatem braku malware; nie obiecujemy skanowania antywirusowego. W tym lokalnym przyroście nie przekazujemy CV zewnętrznemu skanerowi. Dopuszczenie publiczne musi jawnie ocenić pozostałe ryzyko malware, antyabuse, koszt i ewentualny skaner; jego provisioning wymaga osobnego dopuszczenia. Kwoty są propozycją zakresu, nie wyliczeniem ceny usługi.

**3B — alternatywa:** identyczne formaty i walidacja, **50 MiB na plik i 5 GiB na konto**. Większa swoboda dla skanów/portfolio, większe transfery, pamięć/streaming i koszt; nadal brak limitu liczby dokumentów. 3A jest rozsądniejszym punktem startowym, ale nie ogranicza załączników do samego PDF.

### 4 — Pobieranie i ochrona nieodwracalnego delete

**Blokuje:** zależny kontrakt sensitive operations, nie ponowny wybór Auth lub RLS. OPEN-013/032; dla silniejszego reauth zależnie OPEN-042/043.

**4A — rekomendacja:** pobieranie wymaga owner-authenticated request przy każdym nowym odczycie; bez funkcji udostępniania i przekazywalnych signed download URLs. Delete wymaga jawnego potwierdzenia skutków i bieżącej weryfikacji użytkownika/stanu konta u Auth provider przy inicjacji operacji; sam lokalny `getSession()` lub ważny podpis JWT nie wystarcza do inicjacji nieodwracalnej kasacji. Nie wymagamy ponownego wpisania poświadczeń do każdego usunięcia pliku. Komenda/zakres i potwierdzenie są związane z konkretnym ownerem, wersją oraz aktualnym preview; zmiana konta lub zakresu wymusza ponowne potwierdzenie.

To wąskie rozstrzygnięcie delete pojedynczych dokumentów, nie polityka eksportu lub kasowania całego konta. Ochrona musi obejmować także bezpośrednie Data API/Storage, bez alternatywnej ścieżki delete opartej jedynie na starym JWT. Szczegółowy mechanizm i minimalne uprawnienia mają wykazać implementacja i security review. Niedostępny Auth provider = odmowa inicjacji delete; istniejąca potwierdzona operacja może bezpiecznie dokończyć już zatwierdzony zakres.

Zatwierdzenie 4A lub 4B obejmuje również **wąską serwerową zdolność walidacji/finalize oraz wykonania i retry kasacji** wyłącznie dla autoryzowanych operacji Documents. Oddzielone poświadczenia/tożsamości są niedostępne klientowi; brak ogólnego user CRUD i bezpośrednich praw użytkownika do ustawienia ready/verified lub obejścia komendy delete. Rekomendowany mechanizm: techniczne tożsamości/role z prawami ograniczonymi w SQL i Storage RLS do pending obiektów walidacji lub obiektów objętych zatwierdzoną kolejką kasacji; identyfikacja operatora zarządzana serwerowo, nigdy przez edytowalne user_metadata. Validator nie nadpisuje bytes; cleanup nie czyta treści i nie kasuje dowolnego path spoza kolejki. Rozdzielenie tych praw, obsługa sekretów oraz preflight rzeczywistych API należą do wykonania. Szeroki service-role z samym ograniczeniem w kodzie nie spełnia tej granicy. Threat model i ADR zapisane przed kodem uszczegóławiają zatwierdzenie tego zakresu, bez kolejnej rundy PO; nowe rozszerzenie uprawnień poza niego byłoby odrębną zmianą.

**4B — alternatywa:** dodatkowo wymagane ponowne logowanie właściwym wspieranym sposobem e-mail/hasło lub Google przed każdą nową operacją delete, bez okna wielokrotnego użycia. Silniejsza ochrona przed przejętą aktywną sesją, większe tarcie UX i zależność od potwierdzonego przepływu reauth dla obu dostawców. Refresh tokenu lub samo getUser nie może udawać ponownego logowania. Brak działającego wspieranego przepływu pozostaje BLOCKED, nie jest obchodzony własnym MFA.

## 5. Projekt techniczny i analiza wpływu

Poniższe są wyborami wykonawczymi w granicach pakietu; nie osobnym formularzem decyzji PO. Nazwy tabel są robocze, migracja powstaje dopiero po zatwierdzeniu pól i polityk.

- **Model:** Document (owner, biblioteka albo konkretna sprawa), immutable DocumentVersion (unikalny obiekt), CaseDocumentLink do wersji, osobna SentDocumentReference do konkretnego application, audyt rewizji, minimalny rejestr operacji upload/delete i idempotencji. Klucze/ograniczenia same-owner dla każdego końca relacji, RLS wszystkich prywatnych tabel, minimalne grants, invoker views/RPC. Case-only nie jest innym kontem ani modelem współdzielenia.
- **Pliki:** prywatny bucket; losowe klucze `owner/document/version`, bez filename/PII w path. Nowy object dla każdej wersji; upsert/overwrite/move/copy oraz bezpośrednie kasowanie gotowych treści nie mogą omijać reguł wersji i delete. Sam prefix ownera nie wystarcza: obiekt musi odpowiadać autoryzowanej próbie i właściwemu stanowi wersji.
- **Upload:** autoryzacja → rezerwacja miejsca/identyfikator próby → ograniczony strumień do private pending object → zaufana walidacja bytes → finalize SQL wersji, relacji i immutable receipt. Gotowy dokument pojawia się dopiero po zweryfikowanej obecności i zgodności obiektu. Rozmiar kontrolowany rzeczywistym odczytem, nie tylko Content-Length. Rezerwacja quota musi być transakcyjna przy równoległych uploadach.
- **Granica zaufania finalize:** klient nie nadaje stanu ready ani wyniku walidacji przez własny insert/RPC. Direct upload, jeśli zastosowany, trafia wyłącznie do pending; klient nie może podpisać pozytywnego wyniku, zmienić bytes po sprawdzeniu ani podstawić ścieżki innego intent. BFF używa klienta użytkownika dla zwykłych danych. Zaufany validator/cleanup realizuje wyłącznie granicę uprawnień objętą pakietem 4, udowodnioną testami bezpośrednich API; nie ogólne service-role CRUD.
- **Storage + SQL:** nie ma wspólnej transakcji dla bytes i DB. Po nieudanym finalize obiekt jest niedostępny jako gotowy, a cleanup jest ponawialny. Po utracie odpowiedzi odczyt receipt rozstrzyga wynik; ten sam owner/request/payload nie tworzy kolejnej wersji, zmieniony zamiar daje konflikt. Ponowienie nie odtwarza usuniętej treści lub odłączonej relacji. Nie usuwać bajtów przez SQL na `storage.objects`; korzystać ze Storage API.
- **Delete:** najpierw trwały zamiar, blokada nowych odczytów/relacji i kontrola współbieżności; potem fizyczna kasacja Storage API, minimalizacja metadanych i rozliczenie. Awarie każdego etapu mają jawny stan i retry. Sent-reference nie znika kaskadowo. Cleanup nigdy nie działa na dowolnym przekazanym przez klienta bucket/path/owner; tylko na zatwierdzonym zakresie operacji.
- **Historia:** osobne API/rejestr rewizji wskazań nie mutuje dawnych eventów/receiptów. Nowy kontrakt application z opcjonalnymi referencjami jest wersjonowany; historyczne payloady/klucze nadal odtwarzają dawny wynik bez dopisania CV. Integracja z DEC-056 zachowuje oryginały i rozróżnia korektę wskazania od nowej wysyłki. Etykiety bieżące nie udają utrwalonych faktów.
- **Odczyt:** właściciel listuje bibliotekę i wersje oraz pobiera konkretny plik po ID; case-only nie pojawia się jako reusable. Serwer nie ufa ownerowi z requestu; autoryzuje również oba końce relacji. Prywatne cache headers, no-referrer, nosniff, bezpieczny Content-Disposition; nazwy traktowane jako tekst. Brak tokenów/filenames/treści CV w URL, logach, analityce lub trwałym browser storage. Niezapisany plik/formularz tylko w pamięci aktywnej operacji; reload może wymagać ponownego wyboru pliku. Receipt przechowuje minimalne identyfikatory, nie bytes i nazwy po kasacji.
- **Migracje:** rozszerzenie istniejącego Drizzle ledgeru po 0022 z constraints/RLS/RPC; brak podmiany historycznych migracji. Upgrade i świeży start testowane na disposable bazie, poprzedzone sprawdzeniem ledgeru. Nie wypełniać sent-reference na podstawie linków, nazw plików, created_at lub dawnych faktów bez CV. W razie rollbacku aplikacji nie kasować nowych danych; preferowana poprawka forward.
- **Istotny ADR:** ADR-0004/0012 obejmują główną architekturę. Kontrakt stanów, kompensacji i ograniczonych uprawnień walidatora/cleanup zapisać w ADR przed kodem w granicach zbiorczo przyjętego pakietu 4. Jego zapis nie wymaga ponownego zatwierdzania tego samego wyboru. Nie ukrywać eskalacji pod nazwą rutynowego uploadu. ADR nie może zastąpić decyzji produktowych z §4; brak dowodu ograniczenia rzeczywistych uprawnień blokuje akceptację implementacji.

Wpływ na lifecycle: brak nowego statusu/etapu, brak automatycznego wznowienia i zamknięcia. Wskazania dotyczą konkretnych aplikacji, także wielu w historii. Operacje biblioteki/attach/detach/nowej wersji nie tworzą faktów. Kalendarz, zadania i przypomnienia nie dostają nowych triggerów. Import dokumentów/CSV, eksport konta i account delete nie są zależnościami działania biblioteki; nie są przez ten przyrost uznane za wykonane. Pod przyszłe eksport/delete pozostają identyfikowalne ownership, brak orphan bytes i minimalny ślad.

## 6. Plan wykonania, ownership i osobny PR

Po zbiorczym zatwierdzeniu pakietu i autoryzacji pełnego wykonania przejść bez kolejnego Discovery do poniższych kroków. Zapis rzeczywistej odpowiedzi PO przez `record-decision` poprzedza zależny kod. Nie nadawać z góry nowego numeru DEC jako APPROVED ani nie zamykać całych OPEN-006/007/013/032/036.

Wspólne metadane tasków: model dziedziczony, identyfikator/reasoning jeśli dostępne, inaczej „nieudostępnione”; baza wskazanego merge lub jawnie uzgodniony nowszy kandydat; wymagania §2 i decyzja pakietu; środowisko disposable; bez dalszej delegacji, merge/deploymentu i persistent DEV. Każdy task korzysta z [szablonu](../templates/agent-task.md).

| Krok / rola | Wyłączny zakres zapisu i przekazanie | DoD |
| --- | --- | --- |
| Orchestrator + spec | `docs/decisions/*`, ten kontrakt, właściwe FR/AC/BR/feature/UX/traceability | Zapis źródła decyzji, częściowych OPEN i macierzy zgodności; brak wymyślonej akceptacji |
| UX przed frontendem | Nowy kontrakt UI w `docs/ux/`, bez zmian biznesowych poza pakietem | Biblioteka, trzy akcje, wersje, sent/correction/delete preview, stany błędów/niepewnego wyniku i keyboard |
| Platform-engineer | `scripts/recruitment/target.ts`, guardy zasobów, disposable config, odpowiednie skrypty DB i CI; runner tylko w tym handoffie | Rzeczywisty Storage w izolowanym profilu, własne ports/network/volume inventory, readiness i bezpieczny cleanup; testy guardów, brak dotknięcia DEV |
| Backend-engineer | `db/recruitment/schema.ts`, nowa historia migracji, `src/modules/documents/**`, `src/app/documents/**/route.ts`, domena/aplikacja i komendy application/history | Unit testy autora, RLS/constraints, upload/finalize/download/delete, retry/kompensacje i zachowane stare kontrakty; bez edycji UI/testów QA |
| Frontend-engineer | `src/components/documents/**`, strony `src/app/documents/**/page.tsx`, sidebar i sekcja sprawy/historia/formularz aplikowania; nie route handlers | Wszystkie FR-DO, stany, brak inferencji wysyłki, unit testy autora i uzgodniony kontrakt backendu |
| QA-engineer od planowania | `tests/integration/recruitment/documents*.test.ts`, `tests/e2e/recruitment-documents*.spec.ts`, syntetyczne fixtures | Implementacja macierzy §7; rzeczywiste bytes HTTP i A/B/anon, migracja upgrade, E2E/visual i regresje |
| Platform → QA handoff runnera | Po zakończeniu zmian platformy QA dostaje wyłączne prawo wpisania nowych integracji w runnerze | Brak dwóch autorów tego samego pliku; nowe testy faktycznie wykrywane i uruchamiane |
| Niezależni backend/frontend/security reviewerzy | Tylko read-only na zamrożonym kandydacie przez `harness/scripts/review.py` | Konkretny SHA/diff, zgodność Discovery/UX/ADR, findings bez poprawiania kodu; brak blockerów |
| Orchestrator | Raport, QA, traceability, finalny diff i osobny PR po przyszłej autoryzacji | Final-SHA dowody/CI, retained failures, stan PR jawny, brak merge/deploy |

Backend i frontend mogą pracować równolegle po kontrakcie API; platforma i QA ustalają osobny handoff runnera. Nie uruchamiać wszystkich reviewerów przed zamrożeniem kandydata. Przed implementacją/verification/review załadować odpowiednio `implement-slice`, `verify-acceptance`, `review-change`; formalny Codex review wymaga odrębnego rodzica read-only, nie dziecka z prawem zapisu. Nieudany wrapper = NOT RUN review.

Przyszła implementacja korzysta z nowego własnego worktree/branch od zweryfikowanej bazy, bez reset/stash/rebase zastanych prac. Manifest zasobów przed/po oraz cleanup wyłącznie własnych zasobów. Brak startu/resetu/migracji persistent DEV, provisioningu chmury lub płatnych usług. Jeden PR obejmuje pełny rezultat, choć może mieć małe przeglądalne commity.

## 7. QA — macierz i dowody

| Wymaganie / ryzyko | Test i poziom | Właściciel |
| --- | --- | --- |
| AC-DO-001/009 | Biblioteka bez sprawy; nowy reusable dokument po reload; loading/error nie są pustą listą; integracja + browser | QA |
| AC-DO-002/002-01/007 | Jedna wersja w dwóch własnych sprawach, bez ponownego uploadu/kopii logicznej; niezależne sent-reference; retry bez duplikatu | QA + unit backend |
| AC-DO-003/008/009 | Trzy ścieżki; case-only nie pojawia się w bibliotece/drugiej sprawie; „biblioteka i sprawa” ma spójny efekt | QA |
| AC-DO-004/005/005-01/005-02, TC-018/003 | A/B rozróżnialne; A wysłane, B tylko linked; pobrane A ma pierwotne bytes; kolejne wersje/rename/relink nie zastępują A | QA + unit domeny |
| AC-DO-006, BR-026 | Upload, library, attach/detach, zmiana wersji nie tworzą application/contact/invitation; aplikowanie bez CV poprawne; brak zmiany etapu/statusu | QA + unit |
| Pakiet 1, DEC-056 | Wiele aplikacji i wybrana kardynalność CV, późniejsze przypisanie bez nowego faktu, korekta/wycofanie, void, unknown date, zakończona sprawa; race void/delete/send i retry | QA + unit backend |
| AC-DO-010/010-01/010-02, TC-031/034, SEC-02 | A pozytywnie; B i anon negatywnie: UI/BFF/Data API/Storage HTTP, lista/count/znane ID/path, metadane/treść/audyt/receipt; oba końce relacji | QA |
| Granice Storage | Próby spoof owner/path, cudzy version/case/event, overwrite/upsert/move/copy/delete, listing i signed URL endpoints, bezpośrednie ustawienie ready/finalize; klient nie wystawia permitu, stary JWT bez permitu nie inicjuje delete; credential operatora nie daje ogólnego CRUD ani prawa do obiektu poza autoryzowaną operacją | QA + security review |
| Upload/finalize | Awaria przed/po bytes, przed SQL, po SQL przed odpowiedzią; ten sam zamiar, różny payload, współbieżne wersje, quota reservations, rzeczywisty brak obiektu i podmiana bytes | QA + unit backend |
| Pakiet 2/delete | Preview wszystkich skutków, last case-only link, delete shared wersji, natychmiastowa odmowa nowych odczytów, potwierdzenie kasacji przez Storage API, retry po awarii także po wygaśnięciu sesji inicjatora, minimalizacja audit/receipt/cache wersji wysłanych i niewysłanych, brak resurrection | QA |
| Pakiet 3 | 0, limit i limit+1 bytes oraz quota; rozszerzenie/MIME/struktura niezgodne, uszkodzone/zaszyfrowane Office/PDF, aktywna zawartość i zip bomb; Unicode/HTML/path/header injection w filename | QA + unit walidatora |
| Pakiet 4, SEC-01 | Origin/Host/CSRF, XSS/nosniff/attachment, A→B cache, wygasła sesja, logout/back-forward, aktualny Auth check delete i próby ominięcia bez BFF. Stary JWT odrębnie od revocation refresh | QA |
| Migracje/historia | Fresh cały ledger i upgrade z b28877e na syntetycznych wcześniejszych danych; porównanie dawnych faktów, closure, stage, audit, receiptów i RPC; brak fikcyjnego backfillu | QA/backend |
| DEC-064/050, TC-020/024 | Wszystkie sześć grup Search nadal działa owner-scoped; unikatowy tekst wyłącznie wewnątrz CV nie daje trafienia; Search/QC i 7 modułów działają z Dokumentów | QA |
| UX-012/005 | Wszystkie ścieżki, dirty/cancel, postęp uploadu, błąd zachowujący dane w RAM, konflikt/unknown-result/recovery, długie nazwy/wiele wersji, focus/keyboard/Escape i powrót | QA/frontend |
| Responsive/a11y | Realny production HTTPS browser 375/768/1024/1440, reflow/powiększenie 200%, etykiety/statusy/błędy, touch/focus; screenshot dopiero po załadowaniu treści | QA; frontend-reviewer niezależnie |
| OPS/delete restore | Lokalna symulacja przywrócenia kopii i replay ledgeru z blokadą udostępnienia; osobno dowód fizycznej kasacji. Nie dowodzi chmurowych kopii/realnego DR/RPO/RTO | QA/platform |

Istniejące polecenia do przyszłego uruchomienia: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment`. Ostatnie obejmuje build, rzeczywiste lokalne Auth/DB i production HTTPS Playwright, lecz **dopiero po rozszerzeniu runnera o Storage i nowe testy** będzie dowodem Documents. Integracje są rejestrowane jawnie w `scripts/recruitment/runner.ts`; nowy plik bez wpisania do runnera nie daje pokrycia. Nowe E2E mają prefiks `recruitment-` zgodny z istniejącym configiem.

Node 24.22.2 / pnpm 12.16.1, Docker i Chromium; własne wolne porty według guardowanego manifestu zamiast przejmowania cudzych 3152/3153 lub targetu. Rozszerzenie zasobów Storage obejmuje guardy obrazów, network, loopback publishing, readiness, wolumeny i cleanup. Stare allowlisty nie są automatycznie dowodem bezpieczeństwa nowych kontenerów. Pliki testowe wyłącznie syntetyczne; dowody bez CV, tokenów i PII.

DoD przyszłego PR: pełna macierz na identyfikowalnym finalnym kandydacie, rzeczywiste Storage HTTP i bytes, migracja upgrade, brak blokujących findings backend/frontend/security, aktualne dokumenty i green CI **dokładnego finalnego head SHA**. Zmiana po review/testach wymaga ponownej oceny dotkniętego zakresu. Zachować wcześniejsze FAIL i ich dowody; zielony retry nie dowodzi przyczyny błędu. Sam SQL catalog, mock transport lub opinia reviewera nie zastępują runtime. Nie uznawać pełnych TC-034/036 lub produkcyjnych SEC/OPS za PASS na podstawie podzakresu.

## 8. Co blokuje teraz, a co dopiero wydanie

| OPEN | Rozstrzygnięte wcześniej | Nadal potrzebne / bramka |
| --- | --- | --- |
| 006 | Private Storage i kontrolowana kasacja treści | Pakiet 2: skutki, ślad/retencja, czasy i last case-only link; blokuje zależny kod |
| 007 | Object Storage wybrany | Pakiet 3: formaty, liczby i zachowanie quota; blokuje upload policy. Import CSV/XLSX nadal osobno |
| 013 | Native Auth/SSR/Data API/RLS, zaakceptowana ważność JWT do expiry | Pakiet 4 sensitive delete; techniczne zabezpieczenia i ich testy w slice. Ogólne polityki publicznego Auth/abuse/recovery nadal release gate |
| 032 | Kierunek prywatności, self-delete i backupów, nie kompletna polityka prawna | Wąska minimalizacja/retencja plików w pakiecie 2/4; globalna prywatność, eksport/delete konta i wyjątki prawne nadal otwarte |
| 036 | Bytes immutable, sent relation oddzielna; usunięcie treści dopuszczone | Pakiet 1/2: metadane, kardynalność, powiązanie z application, korekty i reprezentacja po delete |
| 002/004/005 | Częściowe rozstrzygnięcia wcześniejszych slice’ów | Tylko zależny podzakres dokumentów z pakietu 1/2; nie ponowne projektowanie całej domeny |
| 014/042/043/045/046 | Stack, kierunek kont i DR już wybrane w swoich zakresach | Koszty/sekrety, globalne sesje/recovery, eksport i self-delete całego konta, backup Storage i realny DR: poza implementacją tego modułu, przed właściwym udostępnieniem |

Nie ma blokera ponownego wyboru dostawcy, immutable/mutable, silnika Search, brokera Auth lub frameworka. Nie ograniczamy FR-DO pod pretekstem MVP. Odrębny account-management/DR przyrost pozostaje potrzebny, ale nie jest warunkiem samej lokalnej implementacji pełnego Documents Core.

## 9. Aktualne wyniki i źródła zewnętrzne

- **PASS — kontrola statyczna:** lokalny Git potwierdza dokładną bazę; przeanalizowano źródła, istniejący kod/config/ledger i plan pokrycia. To nie jest PASS aplikacji ani Storage.
- Analityk i inżynier ponownie sprawdzili pakiet read-only; uwagi o retencji niewysłanych wersji oraz domknięciu decyzji o uprawnieniach validator/cleanup uwzględniono. To partnerska ocena analizy, nie formalny niezależny review implementacji. `git diff --check` zakończył się exit 0 dla zmian śledzonych; nowy dokument odczytano osobno.
- **NOT RUN:** testy produktu, upload/download/delete Storage, migracje, browser/visual/a11y, CI i formalny niezależny review implementacji — etap analizy, brak nowego kandydata produktu.
- **BLOCKED:** zależna implementacja do zbiorczego rozstrzygnięcia §4 i dopuszczenia etapu wykonania; żadna propozycja nie podnosi sama statusu OPEN.
- **FAIL:** brak uruchomionych testów produktu, więc nie ma nowych wyników FAIL; nie interpretuje to historycznych wyników #28.

Aktualna dokumentacja pobrana 2026-11-11 przez Context7 resolve-library-id → query-docs (`/supabase/supabase`): [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [authenticated downloads](https://supabase.com/docs/guides/storage/serving/downloads), [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Storage schema](https://supabase.com/docs/guides/storage/schema/design), [delete objects](https://supabase.com/docs/guides/storage/management/delete-objects). Wnioski: private ≠ automatyczne owner ACL; RLS obowiązuje także download; signed URL przekazuje dostęp na czas ważności; ograniczenia MIME/bytes bucketa nie zastępują zaufanej walidacji treści; SQL usuwający metadata nie usuwa bytes — potrzebne Storage API. Są to właściwości dokumentowane, nie dowód runtime tego repo.

Sprawdzono [changelog](https://supabase.com/changelog.md): dostępna informacja o CLI v3 i zmianie domyślnych targetów nie jest powodem aktualizacji przypiętego v2.122.0. W tym zadaniu nie zmieniano zależności, konfiguracji usług ani stanu środowisk.
