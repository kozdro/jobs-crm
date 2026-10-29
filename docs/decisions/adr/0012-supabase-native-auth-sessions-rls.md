# ADR-0012 — Supabase-native Authentication, Sessions and RLS

**Status:** ACCEPTED · **Data:** 2026-10-29 · **Zatwierdzający:** właściciel produktu. **Źródło:** zadanie PO „Jobs CRM — Supabase-native Architecture Rebaseline”, decyzja „wariant A — Supabase-native” z 2026-10-29. **Implementacja Auth/RPC:** NOT STARTED w tym zadaniu; wyłącznie dokumentacja, review i PR bez merge.

**SUPERSEDES:** [ADR-0003](0003-supabase-auth-rls.md) w całości jako aktualny kontrakt architektoniczny; nadal obowiązujące wybory są ponownie potwierdzone poniżej. Historia [TD 1.1–1.40](../../technical/discovery-decisions.md) pozostaje zachowana. [ADR-0005](0005-atomic-inmemory-import.md) pozostaje ACCEPTED.

## Kontekst i warianty

Poprzedni kontrakt TD 1.7/1.8 wymagał HttpOnly-only, serwerowego zarządzania tokenami, zakończenia dowolnej wskazanej innej sesji i silniejszej revocation niż natywny Supabase. Plan F3 rozwijał broker tokenów, opaque handles, trwały encrypted refresh-token store, AEAD, generacje/CAS i synchronizację odświeżania. Były to konsekwencje wcześniejszych wymagań, nie błąd historycznego discovery. PO zaakceptował ograniczenie tych gwarancji, aby zmniejszyć własną infrastrukturę.

Rozważono: **A — standardowy Supabase Auth/SSR (ACCEPTED)**; B — kontynuację własnego brokera i silniejszych gwarancji. B zwiększa zakres utrzymania bez potrzeby wynikającej z aktualnie zatwierdzonych wymagań.

Powiązania: NFR-001/004/008; BR-030; FR/AC-AD-002–006; FR-IM-005–014; AC-IM-008/011/014; OPEN-010/013/014/032/035/041/042/043/046. Zatwierdzenie technologii nie zatwierdza wszystkich szczegółów tych FR/OPEN.

## Decyzja: Auth, schemat i dostęp

- Supabase Auth jest jedynym głównym dostawcą tożsamości. MVP: e-mail/hasło, Google OAuth, samoobsługowa rejestracja, reset hasła e-mailem, wiele urządzeń, bez własnego MFA.
- Next.js korzysta z `@supabase/supabase-js` i `@supabase/ssr`, oficjalnych browser/server clients, standardowego PKCE, zarządzania sesją/refresh i cookies zgodnie ze wspieranym kontraktem SDK. Konkretne wersje i zgodność wymagają preflight przed implementacją; bez zmiany zależności w tym zadaniu.
- Rezygnujemy z bezwzględnego HttpOnly-only. Browser client potrzebuje dostępu do sesji zgodnie z SDK; nie obiecujemy nieczytelności wszystkich tokenów dla JavaScript. Nie dodajemy dowolnego alternatywnego przechowywania ani ujawniania tokenów. Nie tworzymy brokera, opaque handles, własnej kryptografii, server session store ani frameworka generacji/lease.
- Potwierdzamy wspólny schemat PostgreSQL z owner isolation, Data API z JWT użytkownika i RLS oraz Drizzle dla zatwierdzonych schematów/migracji i kontrolowanych operacji wewnętrznych. Uprzywilejowany Drizzle/service-role nie obsługuje zwykłych zapytań użytkownika z pominięciem RLS.
- Defense in Depth pozostaje: RLS tabel i relacji, walidacja wejść, autoryzacja operacji biznesowych i zaufana tożsamość. `owner_id` z klienta ani user-editable metadata nie stanowią źródła uprawnień.

## Granice browser / server / BFF / Data API

Browser client obsługuje standardowe operacje SDK w kontekście użytkownika. Server client służy SSR, walidacji tożsamości i operacjom wymagającym serwera; musi być tworzony w kontekście konkretnego requestu. BFF / Server Actions / Route Handlers mają zastosowanie tam, gdzie jest logika biznesowa lub granica zaufania; nie proxy'ują automatycznie wszystkich żądań. Data API chroni standardowe operacje JWT/RLS. PostgreSQL RPC obejmuje komendy wymagające atomowości wielu zapisów lub szczególnej logiki transakcyjnej.

Szczegółowe przypisanie konkretnych ekranów i komend do adapterów pozostaje **PROPOSED** do slice'a; macierz w [architekturze](../../technical/architecture.md) jest rekomendacją techniczną, nie nową polityką produktu. Modular monolith i natywne wejścia Next.js z ADR-0001 pozostają obowiązujące.

Server `getSession()` nie wystarcza do zaufanej autoryzacji. `getClaims()` potwierdza podpis/ważność JWT, ale nie dowodzi aktualnej revocation sesji. Gdy znaczenie ma bieżący stan użytkownika, potrzebna jest weryfikacja przez Auth (np. wspierane `getUser()`) oraz odpowiednia autoryzacja/reautoryzacja dla operacji. Samo `getUser()` nie jest ponownym podaniem poświadczeń ani uniwersalną gwarancją natychmiastowego odcięcia każdej powierzchni.

## Sesje i świadomie zaakceptowane ograniczenia JWT

Obsługujemy natywne scopes logout: `local` — bieżąca sesja, `global` — wszystkie, `others` — pozostałe z zachowaniem bieżącej. Przyszła implementacja przekazuje scope jawnie; nie polega na domyślnym `global` biblioteki. Nie wymagamy zakończenia jednej dowolnej wskazanej sesji innego urządzenia ani własnego rejestru urządzeń.

Wylogowanie/cofnięcie refresh tokenów nie unieważnia natychmiast już wydanego access JWT: może on pozostać ważny do `exp`, również w Data API. To zaakceptowane ograniczenie, nie failing test brokera do naprawienia. Testy rozdzielają usunięcie standardowej sesji klienta, odmowę dalszego refresh w danym scope i ważność starego access JWT. Komunikaty nie obiecują natychmiastowego odcięcia wszystkich tokenów. Czasy JWT/sesji, timeouty i ustawienia dostawcy pozostają OPEN-013/042; nie ustalamy wartości domyślnych jako polityki produktu.

Zmiana poświadczeń, usunięcie konta, eksport wrażliwych danych i analogiczne operacje wymagają właściwej reautoryzacji/weryfikacji bieżącego użytkownika lub stanu konta, według OPEN-032/043/046 i właściwych polityk. Stosujemy wspierane mechanizmy Supabase; bez nieudokumentowanych modyfikacji `auth.*`. Nie zakładamy, że JWT przestaje działać na każdej powierzchni po usunięciu konta.

Dodatkową ochronę zmiany poświadczeń trzeba egzekwować również wspieranymi mechanizmami/konfiguracją Supabase Auth: sama bramka BFF jest omijalna przez bezpośrednie Auth API. Wybór ustawień i wymaganej świeżości pozostaje OPEN-013/043; sprawdzić ich rzeczywiste ograniczenia, bez uznawania `getUser()` za reauth. Reautoryzacja eksportu/delete chroni ich konkretną komendę, nie odcina odczytów już dozwolonych ważnym JWT w Data API i nie gwarantuje ochrony przed całą eksfiltracją po kradzieży tokenu.

## Bezpieczeństwo pozostające obowiązkiem

NFR-001, BR-030 i FR/AC-AD-002 pozostają niezmiennikami. Wymagane są: izolacja A/B i anon, RLS/grants oraz relacje obu właścicieli, private Storage i jego polityki, walidacja danych/URL, XSS i CSRF odpowiednie dla faktycznych endpointów/cookies, bezpieczne redirects/PKCE, redakcja tokenów, zakaz service-role/sekretów w browser oraz niezależne testy/review. Browser-accessible session tokens zwiększają znaczenie ochrony XSS i zależności klienta; SDK nie zapewnia odporności na dowolne wykonanie skryptu.

Kradzież refresh tokenu może pozwalać na dalsze odnawianie sesji, więc ochrona nie ogranicza się do expiry jednego access JWT. Reakcja na kompromitację używa wspieranej revocation właściwych sesji (np. global), z jawnym pozostałym oknem access JWT; skutki resetu hasła wymagają pomiaru i polityki OPEN-043. **PROPOSED dla F3 / OPEN-013:** ocenić CSP i minimalizację skryptów stron trzecich jako dodatkowe ograniczenie XSS; konkretną politykę, zgodność SDK/OAuth i testy zatwierdzić w slice, bez gwarancji odporności na dowolny skrypt.

Prywatne odpowiedzi i odpowiedzi ustawiające cookies nie mogą trafiać do współdzielonego cache w sposób ujawniający sesję/dane. Przekazywanie odświeżonych cookies request/response oraz wymaganych nagłówków cache musi odpowiadać aktualnemu adapterowi SDK. Szczegóły i testy: [security](../../technical/security-and-privacy.md), [QA](../../technical/foundation-qa.md).

## Transakcje natywne i relacja do ADR-0005

Standardowy CRUD używa Data API/RLS. Import zatwierdzonych wierszy pozostaje jedną atomową transakcją PostgreSQL przez niewielką funkcję i jedno `supabase.rpc()`. Preferujemy `SECURITY INVOKER`, minimalne EXECUTE grants i RLS tabel; eskalacja do DEFINER wymaga konkretnego uzasadnienia i niezależnego security review. Request PostgREST stanowi transakcję; wyjątek DB powoduje rollback. Seria niezależnych insertów HTTP nie realizuje tego kontraktu.

Minimalny user-scoped klucz/rejestr operacji i fingerprint zachowują zatwierdzony retry bez cichych duplikatów, razem z efektem w tej samej transakcji. Rejestr ma być chroniony przed podmianą/usunięciem przez zwykły klient; jego konkretne grants/RLS/API wymagają projektu i testów slice'a. Nie zapisujemy stagingu wierszy, nie budujemy uniwersalnego frameworka transakcji/idempotencji, coordinatora, workflow engine ani exactly-once execution. Zwykły import nie wymaga kolejki.

ADR-0005 nie jest zastępowany. Jego wymóg dowodu atomowości, RLS i retry może zostać spełniony w docelowym slice importu; nie oznacza obowiązkowego dużego PR-F4 przed ręcznym CRUD. [Foundation Plan](../../technical/foundation-plan.md) rekomenduje tę kolejność jako plan, a nie autoryzację implementacji.

## Konsekwencje i operacje

Mniej własnych komponentów sesyjnych i kluczy kryptograficznych, lecz większa zależność od rzeczywistego kontraktu SDK/Auth. Nadal potrzebne są bezpieczna konfiguracja OAuth/e-mail, monitoring bez tokenów, aktualizacje i testy regresji. OPEN-014 obejmuje potrzebne sekrety dostawcy/środowiska, bez nieistniejących kluczy brokera. Backup/Storage/delete z ADR-0004/0009 i worker z ADR-0007 zachowują kontrakty; worker dopiero przed rzeczywistą funkcją background. Nie zmieniamy statusów innych ADR.

## Weryfikacja i granice dowodu

F1/F2 i ich historyczne raporty pozostają bez zmian. Nowy F3 i przyszły import/RPC mają **PLANNED / NOT RUN**. Plan obejmuje login/signup, refresh i współbieżność zgodnie z SDK, trzy logout scopes/wiele sesji, OAuth/PKCE/redirects, reset e-mail, błędne/wygasłe sesje, zaufany kontekst, XSS/CSRF/cache, RLS A/B i obserwację JWT do expiry. Real Google OAuth bez credentials to NOT RUN. Dla RPC: atomic multi-write, rollback, grants/RLS, retry po utracie odpowiedzi, brak duplikatów, konflikt payloadu i podstawowa współbieżność. Wycofane testy brokera są jawnie SUPERSEDED / NOT APPLICABLE, nigdy PASS. [Kontrakty F3/F4](../../technical/foundation-pocs.md) i [macierz FQA](../../technical/foundation-qa.md) zachowują ID i historyczne wyniki.

## Odwracalność

Przed implementacją zmiana dotyczy dokumentów, więc rollback wymaga nowej jawnej decyzji/supersession, bez migracji danych. Po wdrożeniu inny Auth/model sesji wymaga nowego ADR, analizy mapowania tożsamości, migracji aktywnych sesji/redirects i testów RLS. Nie pozostawiamy równoległego ukrytego brokera „na przyszłość”.

## Oficjalne źródła — sprawdzone 2026-10-29

Context7: resolve-library-id → `/supabase/ssr` i `/supabase/supabase`, następnie query-docs; porównano z poniższymi stronami. Źródła potwierdzają możliwości dostawcy, nie wykonanie integracji Jobs CRM ani wybrane wartości polityk.

- [Server-side Auth](https://supabase.com/docs/guides/auth/server-side), [Advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide): browser/server clients, cookies, PKCE, odświeżanie, weryfikacja tożsamości i cache; bez gwarancji HttpOnly-only.
- [Sessions](https://supabase.com/docs/guides/auth/sessions), [Sign out](https://supabase.com/docs/guides/auth/signout): scopes i ważność access JWT do expiry.
- [Passwords](https://supabase.com/docs/guides/auth/passwords): signup, login i recovery; końcowa konfiguracja dostawcy i zachowanie aplikacji do przyszłej weryfikacji.
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Functions](https://supabase.com/docs/guides/database/functions): owner policies, metadata, invoker i uprawnienia funkcji.
- [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html): pojedynczy request w transakcji, rollback przy błędzie DB.
- [Supabase changelog](https://supabase.com/changelog): preflight kompatybilności przed przyszłym F3; ta aktualizacja nie wybiera nowych wersji zależności.

W przeglądzie changelogu sprawdzono powiązane noty: [jawna ekspozycja nowych tabel Data/GraphQL API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [wycofanie CBC TLS najwcześniej 2026-11-10](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) i [przyszłe minimum TypeScript 5.0+ SDK](https://supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0). To wejścia do przyszłego preflight targetu, kompatybilności i grantów, bez aktualizacji pinów, rozszerzeń ani wykonywania zapytań w rebaseline.

Uzupełnienia po security review zweryfikowano w [Password security](https://supabase.com/docs/guides/auth/password-security) (wspierane opcje ochrony zmiany hasła, ich warunki i ograniczenia), [signUp](https://supabase.com/docs/reference/javascript/auth-signup) (odpowiedź dla istniejącego konta zależy od konfiguracji) i [Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) (operacja serwerowa z uprawnieniem administracyjnym). Nie ustalają one polityki Jobs CRM ani nie autoryzują tych operacji w tym zadaniu.
