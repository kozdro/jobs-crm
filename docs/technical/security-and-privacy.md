# Bezpieczeństwo, prywatność i threat model

**Zatwierdzono:** Supabase-native Auth/SSR zgodnie z [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), 2026-10-29: samoobsługowa rejestracja, e-mail/hasło + Google OAuth, reset e-mailem, wiele urządzeń, bez własnego MFA; Data API/JWT/RLS, private Storage, eksport CSV/XLSX i samoobsługowe usunięcie konta w źródłowym zakresie. **VALIDATION REQUIRED:** przyszła implementacja i ustawienia polityk, nie runtime PASS tego zadania.

## Model zagrożeń

| Zagrożenie | Granica | Kontrola / plan testu |
|---|---|---|
| IDOR/BOLA | Browser/server → Data API | JWT verification, owner authorization, RLS/grants; A/B/anon, listy/ID/relacje i RPC. |
| Escalation / bypass RLS | service-role/Drizzle/RPC/views | Bez service-role w user path, deny by default, INVOKER, minimalne EXECUTE; review widoków i obu właścicieli relacji. |
| XSS i kradzież sesji | Browser client/cookies/tokeny dostępne JS | Escaping/sanitization niezaufanej treści, bezpieczne renderowanie i zależności; testy XSS i braku tokenów w DOM/URL/logach/telemetrii. SDK nie chroni przed dowolnym wykonaniem JS. |
| CSRF / session fixation / OAuth login CSRF | Cookies, Actions/Handlers, callback | Kontrole odpowiadające faktycznym endpointom/cookies, wspierane PKCE/redirects, kontrola origin tam, gdzie wymagana; SameSite nie stanowi samodzielnego dowodu. |
| Token/session leakage i cache A/B | Refresh, SSR, response cookies, CDN | Per-request server client, poprawne propagowanie cookies/nagłówków SDK, brak współdzielonego cache prywatnych odpowiedzi/Set-Cookie, redakcja. |
| JWT replay po logout | Auth → Data API/Storage | Jawna informacja o ważności do expiry; testy oddzielają logout/refresh od access JWT; sensitive ops mają dodatkową weryfikację/reauth. |
| Cross-account file | Storage / signed URLs | Private buckets, storage.objects RLS, autoryzacja przed wydaniem URL, lifetime według zatwierdzonej polityki, test A/B/anon. |
| SSRF | Domena/redirect/DNS/subresources | Allowlista + checks na każdym hopie i testy rebinding; niedozwolona domena bez fetch. |
| Untrusted files | CSV/XLSX/upload | Limity po zatwierdzeniu, MIME/content verification, parser limits, zip bombs/formula injection. |
| Duplicate/partial import | Retry/atomic RPC | Minimalny user-scoped klucz/rejestr i fingerprint; atomic efekt+wynik, rollback, grants/RLS i ochrona rejestru przed podmianą klienta. |
| Deleted-data resurrection | Backup restore | Niezależny deletion ledger i bramka ekspozycji do replay/weryfikacji; zgodnie z ADR-0009 i OPEN-046. |
| Sekrety/PII w raportach | Browser/logi/CI/export | Service-role/provider secrets wyłącznie w uprawnionym server runtime; brak tokenów, haseł, treści CV/korespondencji i prywatnych notatek w logach. |

## Sesja Supabase-native — SEC-01

Obowiązuje oficjalny wzorzec `@supabase/supabase-js` + `@supabase/ssr`: browser/server clients, PKCE, natywne refresh i cookies zgodne ze wspieranym SDK. Nie obowiązuje HttpOnly-only: browser client może czytać sesję w sposób wymagany przez SDK. To nie uprawnia do dowolnego kopiowania tokenów do własnego storage, DOM, URL, logów czy raportów. Nie projektujemy brokera, opaque handles, własnego encrypted token store, AEAD, generacji/CAS ani rejestru urządzeń.

`local` kończy bieżącą sesję; `global` wszystkie; `others` pozostałe, pozostawiając bieżącą. Nie wymagamy zakończenia jednej dowolnej wskazanej innej sesji. Zakres ma być przekazywany jawnie. Po logout/cofnięciu refresh tokenów wydany access JWT może działać do expiry, również bezpośrednio w Data API; test nie może wymagać natychmiastowego odrzucenia jako warunku PASS. Usunięcie użytkownika także nie daje automatycznej gwarancji natychmiastowej nieważności JWT. Komunikaty i wyniki rozdzielają lokalną sesję SDK, refresh i replay starego access JWT.

Serwer nie ufa samemu `getSession()`, danym user/owner z payloadu ani user-editable metadata. `getClaims()` weryfikuje podpis/expiry, lecz nie bieżące cofnięcie sesji. Gdy potrzebny jest aktualny stan użytkownika, korzystamy z weryfikacji przez Auth (np. wspieranego `getUser()`) oraz właściwej autoryzacji. Sama weryfikacja usera nie zastępuje reautoryzacji dla operacji szczególnie wrażliwych. Nie obiecujemy, że jedna metoda wywołana w BFF unieważni JWT na każdej powierzchni.

SEC-01 obejmuje testy login/signup, refresh i równoległych requestów według kontraktu SDK, wszystkie scopes logout/wiele sesji, błędne i wygasłe sesje, recovery e-mail, OAuth/PKCE/bezpieczne redirects, zaufaną tożsamość, CSRF/XSS, cookies, cache A/B oraz obserwację JWT do expiry. Prywatne odpowiedzi i Set-Cookie muszą być chronione przed cache leakage; adapter przekazuje odświeżone cookies request/response i właściwe nagłówki cache. Real Google bez credentials to **NOT RUN**. Przed publicznymi kontami wymagane są pozytywne dowody właściwych testów i zamknięcie zależnych polityk; wycofany broker nie pozostaje bramką.

Kradzież refresh tokenu może umożliwiać dalsze odnawianie sesji; expiry access JWT nie rozwiązuje całego incydentu. Stosować wspierane cofnięcie właściwych sesji, np. global, dokumentując pozostałą ważność access JWT. Nie obiecywać, że reset hasła zawsze realizuje tę samą revocation bez testu/polityki OPEN-043. **PROPOSED w F3 / OPEN-013:** ocenić CSP i minimalizację skryptów stron trzecich jako dodatkową kontrolę XSS; konkretny wariant i testy zależą od zatwierdzonego slice'a, bez narzucania nowej infrastruktury.

## RLS i dostęp — SEC-02

NFR-001, BR-030 i FR/AC-AD-002 pozostają nienaruszalne. Użytkownik ma dostęp wyłącznie do swoich spraw, załączników, kontaktów, firm, historii i wyników wyszukiwania. Każda prywatna tabela w eksponowanym schemacie wymaga RLS i minimalnych grants; UPDATE obejmuje USING i WITH CHECK. Polityki opierają się na zaufanej tożsamości, nie user-editable metadata. Widoki są invoker lub nie są eksponowane. Relacje chronią oba końce; samo istnienie FK nie autoryzuje dostępu.

BFF autoryzuje operacje biznesowe, gdy są tam realizowane; zwykły CRUD może korzystać bezpośrednio z user-scoped Data API z pełnym RLS. Uprzywilejowany Drizzle/service-role nie zastępuje tego modelu. Worker ma tylko jawnie wymagany dostęp; nigdy dowolny odczyt na żądanie podanego user_id. Private Storage wymaga własnych testów obiektów, metadanych i URL; syntetyczne F2 nie jest dowodem gotowości Storage produktu.

## Operacje wrażliwe, usuwanie i eksport

Zmiana poświadczeń, usunięcie konta, eksport wrażliwych danych i analogiczne operacje wymagają właściwej reautoryzacji, weryfikacji aktualnego użytkownika lub stanu konta. Wspierane mechanizmy Supabase dobiera przyszły slice; szczegółowe polityki pozostają OPEN-032/043/046 oraz OPEN-013/042. Bez nieudokumentowanych modyfikacji `auth.*` i bez założenia, że sam refresh revocation odcina stary JWT wszędzie.

Bramka BFF nie zabezpiecza bezpośredniego Supabase Auth API zmiany poświadczeń. Wymagana ochrona musi być egzekwowana wspieranymi mechanizmami/konfiguracją dostawcy, a ich warunki i ograniczenia zweryfikowane; wybór ustawień nadal OPEN-013/043. Reauth eksportu/delete chroni komendę, nie wszystkie odczyty danych już dostępne ważnym JWT przez Data API. Przy kradzieży tokenu nie obiecujemy pełnej ochrony przed eksfiltracją.

**PROPOSED do slice'a delete / OPEN-046:** wspierane serwerowe Admin API może wymagać osobnej wąskiej operacji uprzywilejowanej, po weryfikacji bieżącego użytkownika i właściwym potwierdzeniu/reauth. Zakaz service-role w zwykłym user CRUD nie oznacza przeniesienia delete do browsera ani nieudokumentowanego SQL na auth.*; admin credential pozostaje oddzielony, minimalizowany i testowany. Ta propozycja nie autoryzuje implementacji ani nie zmienia RLS zwykłych operacji.

- Eksport CSV/XLSX danych tabelarycznych, dokumenty oddzielnie; autoryzacja, formula injection i brak sekretów. Ocena obowiązków prawnych i zakres historii: OPEN-032/045.
- Archiwizacja ≠ nieodwracalne usunięcie bytes. Minimalny fakt rzeczywistej wysyłki można zachować tylko zgodnie z polityką usunięcia/retencji.
- Usunięcie konta: reauth + potwierdzenie, bez okresu cofnięcia, idempotentne usuwanie aktywnych danych/plików i bezpieczny restore. Kontrakt blokady dostępu i wszystkie osiągalne powierzchnie należy zweryfikować przed udostępnieniem tej funkcji; nie utożsamiać blokady sesji klienta z natychmiastową nieważnością JWT. Prawne wyjątki, czasy i minimalizacja deletion ledger pozostają OPEN-032/046.

## Otwarte polityki i źródła dowodów

OPEN-013/042: TTL, timeouty, ustawienia sesji i operacyjna ochrona; OPEN-041: aktywacja i antyabuse, przy zatwierdzonym self-signup; OPEN-043: szczegóły recovery i skutki zmiany poświadczeń; OPEN-014: potrzebne sekrety dostawcy/środowiska, bez kluczy brokera; OPEN-032/046: wrażliwy eksport/usunięcie i prywatność. Pozostałe OPEN-002/005/006/007/044/045 obowiązują w odpowiednich slice'ach. Nie zamykamy całych OPEN przez wybór SDK.

Oficjalne źródła, ich sprawdzenie 2026-10-29 i granice dowodu: [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md). Bieżące bramki: [gates](gates-and-impacts.md), planowana [macierz QA](foundation-qa.md). Runtime nowego F3/RPC: **PLANNED / NOT RUN**; historyczne dowody F1/F2 pozostają w swoich raportach.

**Wykonanie F3, osobna autoryzacja 2026-10-29:** aktualne dowody SDK/SSR, RLS A/B, Origin/PKCE/CSRF, XSS, cache i log redaction oraz ograniczenia opisuje [raport F3](foundation-f3.md). Historyczne NOT RUN dotyczą etapu rebaseline. Bramka aplikacji i flaga UI nie zabezpieczają bezpośredniego Auth API; publiczne signup/recovery i sensitive reauth nadal wymagają ustawień dostawcy i decyzji OPEN-013/041/042/043.
