# Companies & Contacts — QA

**Data:** 2026-10-31. **Podstawa:** DEC-058, zatwierdzone 1A/2A/3A z [kontraktu](companies-contacts-analysis.md). Autor testów i wykonania: `/root/companies_qa_run`, rola `qa-engineer`, model/reasoning odziedziczone — NOT EXPOSED, bez dalszej delegacji. Zastosowano plan-slice, implement-slice, verify-acceptance i harness delivery. QA nie jest niezależnym reviewerem własnych testów; review raportuje orchestrator.

## Środowisko i tożsamość

Node **24.22.2**, pnpm **12.16.1**, własne zależności z niezmienionego lockfile zainstalowane offline. Rzeczywiste syntetyczne konta Auth i użytkownicy JWT A/B/anon, PostgreSQL, Data API/RLS oraz produkcyjny HTTPS Chromium. Admin wyłącznie do syntetycznych fixtures, inspekcji katalogu, fizycznego upgrade'u i ograniczonego fault injection; nie autoryzuje właściwych operacji użytkownika.

Kandydat końcowego przebiegu R7: **`3666f4b2e87425010b4e81c34f9b7d6e3a9780c2`**. [Manifest źródeł](evidence/companies-contacts/qa-source-manifest.json) wykazuje **154/154 src/db/tests** identycznych SHA256 pomiędzy commitem, canonical worktree i runtime `/private/tmp/jobs-crm-cc-runtime`. Zmiany dokumentacji po tym commicie nie są nowym kandydatem aplikacji.

Kanoniczne porty566xx były zajęte. [Manifest infrastruktury](evidence/companies-contacts/qa-infra-adapters.json) dopuszcza wyłącznie lokalny adapter566xx→574xx w `scripts/recruitment/target.ts`, `scripts/recruitment/cleanup-plan.ts` i `supabase/recruitment-config.toml`; pozostałe źródła infrastruktury, w szczególności validation, są identyczne. Nowy własny target `companies-cc-r7`, projekt `jobs-crm-recruitment-94efb7-b5d838f84af0`, API57421/DB57422/mail57424, loopback-only. Persistent DEV, F3 i cloud nietknięte.

## Syntetyczny TTL i rzeczywisty refresh SSR

Przebieg R5 z dotychczasowym syntetycznym TTL60s ujawnił rzeczywistą odmowę odświeżenia: [metadane zamkniętego kontekstu](evidence/companies-contacts/qa-ssr-expiry-red.json) dowodzą żądania po wygaśnięciu JWT, HTTP307 do `/login` i skasowania cookies. Automatycznie śledzone przekierowanie w pierwotnym teście zwracało200 strony logowania; nie jest to poprawny refresh prywatnej strony. [GoTrue](evidence/companies-contacts/qa-ssr-provider-errors.json) w odpowiadającym czasie zwrócił400 `refresh_token_already_used`. Metadane nie zawierają tokenów ani prywatnych payloadów.

Zainstalowany SDK odświeża z marginesem90s; TTL60s powoduje natychmiastowe rotacje także w kolejnych odczytach SSR. Oficjalne [zalecenia Supabase](https://supabase.com/docs/guides/auth/sessions#what-are-recommended-values-for-access-token-jwt-expiration) odradzają wartości poniżej5min. Orchestrator zatwierdził wyłącznie zmianę syntetycznego profilu RecruitmentCase na **300s** w nowym własnym targetcie. Nie jest to polityka produkcyjna ani rozstrzygnięcie OPEN-042; F3 i konfiguracja persistent DEV pozostały bez zmian. Stare targety posprzątano ich oryginalnymi manifestami przed skopiowaniem nowego template'u, bez obchodzenia guardów.

Końcowy test zamyka stronę przed snapshotem cookies, odczytuje rzeczywiste `expires_at` i `exp`, czeka do późniejszej wartości+2s, bez fałszowania JWT/cookies lub zegara dostawcy. `maxRedirects:0` wymaga200 dokładnego prywatnego URL, Set-Cookie, rzeczywistej zmiany cookies, private/no-store na HTML i RSC, a po lokalnym logout odmowy dostępu. Timeout420s obejmuje oczekiwanie na faktyczne wygaśnięcie300s.

## Wykonana weryfikacja i komenda

Pełny entrypoint skryptu `pnpm test:recruitment` w runtime:

```sh
RECRUITMENT_TARGET_ID=companies-cc-r7 \
PATH=/Users/kozdro/.volta/tools/image/node/24.22.2/bin:$PATH \
node scripts/recruitment/runner.ts
```

| Kontrola R7 | Wynik |
|---|---|
| Izolowany target, 13/13 migracji i checkpoint | PASS |
| Produkcyjny build | PASS, child exit0 |
| Integracje wraz z pełnymi istniejącymi regresjami | PASS **105/105**, bez fail/skip/cancel |
| Produkcyjny HTTPS browser | PASS **92/92**, exit0, bez skip/retry maskujących błędy |
| Top-level runner | PASS, natural exit **0**, bez timeout/kill |
| Guarded cleanup i zasoby | PASS **44/44** wcześniejszych kontenerów o tych samych ID/nazwach/image/portach; własne targety usunięte |

Końcowy [log metryk](evidence/companies-contacts/qa-full-r7.log), [natural exit receipt](evidence/companies-contacts/qa-exit-r7.json), [wynik runnera](evidence/companies-contacts/qa-runtime.json), [tożsamość usług](evidence/companies-contacts/qa-runtime-identity.json) i [cleanup](evidence/companies-contacts/qa-cleanup.json) potwierdzają wykonanie. Nie utrwalono raw output procesów w runnerze. Wszystkie wymagane kontrole tego lokalnego runtime zostały wykonane; hosted CI i niezależne review raportuje orchestrator osobno.

Ledger końcowy:13/13, checkpoint `d6c0d096a138c50ff38c6b8c9731825a1b3cec5b04d0c7d468b1e48a094bcdd7`. Zamrożona0011 ma SHA256 `61836b881f1acbaab4370f85abd9a9087ca01713c9df7103188c34fedc67689c`, addytywna0012 `bcd6f346bb3b831ded2be7d4c26d62830bdc8a31d3ccc818208554bc227acf6a`. Nie naprawiano ledgeru ani nie zmieniano0011 po migracji.

[Rzeczywiście skompilowany i wykonany źródłowy plik Playwright](evidence/companies-contacts/qa-playwright-source.json) ma SHA256 `f3ee709a2744c393f85468a02784a88d681052d5e148bbd382ecf0681a309b34`, zgodny z commitem kandydata; nie oparto dowodu wyłącznie na chwili kopiowania. Ponowne porównanie154/154 plików po zakończeniu potwierdziło brak driftu canonical/runtime/commit.

Obejrzano [formularz375px](evidence/companies-contacts/qa-form-375.png), [1440px](evidence/companies-contacts/qa-form-1440.png) i [200% tekstu przy375px](evidence/companies-contacts/qa-text200-375.png). Formularze i przyciski zawijają się, fokus e-mail jest widoczny; automatyczne asercje potwierdziły brak poziomego overflow i zachowanie input→Tab→e-mail. To nie jest pełny audyt WCAG/AT.

## Macierz AC i ryzyk

| Podstawa | Testowane zachowanie |
|---|---|
| AC-CC-001/006, TC-025 podzbiór | Samodzielny kontakt bez pustej sprawy; własne listy, profile, direct ID i minimalne korekty. |
| AC-CC-002/003, TC-008 podzbiór | Osoba, agencja i pracodawca odrębne; pracodawca może być nieznany; brak fikcyjnego profilu „Nieznany”. |
| AC-CC-004/005 | Dwie osoby w sprawie i ta sama osoba w dwóch procesach; M:N z organizacjami bez klonowania profili i inferencji afiliacji. |
| AC-CC-008/011, TC-006/014 podzbiór | Wyłącznie jawne relacje na profilach; jedna organizacja ma dwie niezależne sprawy; kontekstowe role i ich atomowa korekta. |
| DEC-058 / OPEN-024 | NFC/whitespace/lowercase, e-mail bez usuwania +tag/kropek, owner-only ostrzeżenia; wybór istniejącego lub świadomy osobny profil, bez merge i nadpisywania. Nowe dopasowanie i zmiana jego rewizji wymagają ponownego potwierdzenia. |
| Idempotencja i współbieżność | Zgodny replay, payload conflict, równoległe zamiary, edit/edit, attach/attach, role/detach, stare retry po odłączeniu i ponownym powiązaniu bez odtwarzania skutków. |
| Integralność komendy/audytu | Próby bezpośredniego INSERT/UPDATE/DELETE pól systemowych, audytu i projekcji; PostgREST ignore/merge z wykorzystanym kluczem nie tworzą nieaudytowanych skutków; późny błąd bulk cofa cały zapis. |
| AD-002 / BR-030 / TC-034 podzbiór | A pozytywnie; B i anon bez list/ID/count/dedup/audit/recovery oraz obu końców relacji. Bezpośredni Data API/RPC, owner spoof i relacje A→B/B→A z rollbackiem. |
| BFF / SSR / prywatność | Origin/CSRF i expectedUserId; prywatne HTML/RSC i API bez wspólnego cache; brak nazw/e-maili formularza w browser storage/logach; rzeczywisty expiry refresh i logout na nowych trasach. |
| Audyt i historia | Edycja danych i odłączenie zachowują audyt dostępny na firmie, kontakcie i sprawie także po zniknięciu aktywnego wiersza. Powiązanie nie dziedziczy zdarzeń. Snapshot statusu, etapu, cyklu, faktów, rewizji i zakończeń pozostaje identyczny. |
| Fizyczny upgrade | Kolejne dawne migracje zachowują historyczne dane;0011 nie fabrykuje profili i relacji;0012 zachowuje istniejące profile, relacje, komendy i audyt utworzone na0011. Minimalny Auth substrate tego testu nie jest samodzielnym dowodem RLS. |
| Recovery i zgoda | Niedostarczony POST i dostarczony zapis z utratą odpowiedzi; retry tego samego UUID, brak nowej zgody/nowego klucza w niepewnym stanie; potwierdzenie duplikatu create/edit nie uruchamia kolejnego zamiaru. Edycja profilu nie gubi niepewnego zamiaru relacji. |
| UX | Paginacja list i selektorów poza25 rekordów, błędy bez fałszywej pustej listy, klawiatura/focus, niezaufany HTML jako tekst,1440/1024/768/375 oraz 200% tekstu przy375px. |

## Rzeczywiste findings i zachowana historia FAIL

Pełne lokalne artefakty: `/private/tmp/jobs-crm-cc-qa-evidence/`. Nie przepisano wcześniejszych niepowodzeń na PASS.

- **R1 — FAIL:** produkcyjny build PASS; integracje102/104. Nowy fixture zamknięcia podawał `expected_closure_revision:null`, podczas gdy istniejący kontrakt3C wymaga0 przy close. Nie zmieniono produktu ani asercji regresji; fixture korzysta następnie z rzeczywistego preview. Browser NOT RUN.
- **R2 — FAIL102/104:** omyłka katalogu roboczego w przygotowaniu runtime ponownie skopiowała starą wersję fixture. Proces zakończył się naturalnie; nie jest akceptacją poprawki. Nie mutowano działającego testu ani ledgeru.
- **R3 — FAIL:** integracje104/104 PASS; browser85/87. Historyczny test nawigacji miał dokładną allowlistę dwóch tras; rozszerzono ją do czterech rzeczywiście zatwierdzonych modułów, zachowując odmowę pozostałych. Test focus1440px wyprzedzał celowe requestAnimationFrame z focusem nagłówka; dodano oczekiwanie na ten fokus przed sprawdzeniem input→Tab→e-mail, bez usuwania asercji klawiatury.
- **Niezależny review / realny P1:** direct INSERT komendy z `ON CONFLICT DO NOTHING` wykonywał projekcję w BEFORE trigger przed pominięciem konfliktu. [Rzeczywisty probe](evidence/companies-contacts/qa-consumed-key-probe.json) na JWT: profile1→2, komendy/audyt1→1, HTTP201, regression exit1. Addytywna0012 zachowała zamrożoną0011; ten sam probe po guarded upgrade: profile1→1, komendy1→1, HTTP409 i exit0. Nowa integracja obejmuje ignore/merge, create/edit/attach/detach/role oraz bulk rollback. Canonical RPC nadal odtwarza zapisany wynik.
- **Niezależny review / P2:** potwierdzenie duplikatu po dostarczonym zapisie i utracie odpowiedzi mogło wygenerować nowy klucz; przeładowanie profilu mogło zgubić niepewny zamiar relacji. Poprawki zachowują dokładny zamiar, a nowe testy wymuszają rzeczywistą utratę odpowiedzi po commit, bez podstawienia fikcyjnego sukcesu.
- **Niezależny review / P2:** nowe trasy nie były w matcherze proxy. Dodano właściwe trasy i testy; sam brak Set-Cookie w starym teście nie był dowodem przyczyny. Faktyczne niepowodzenie z TTL60s i jego porównanie opisano wyżej.
- **R4 — FAIL:** integracje103/105. Dodatkowy fixture fizycznego upgrade'u przekazał JSON.stringify przez serializer parametru JSONB; funkcja dostała JSON string zamiast object i odmówiła22023. Poprawiono wyłącznie fixture na statyczne jsonb_build_object z parametrami prymitywnymi. Targetowany plik lifecycle18/18 PASS przed kolejnym pełnym przebiegiem; HTTP suite CC osobno21/21 PASS. Browser NOT RUN.
- **R5 — FAIL:** integracje105/105 PASS; browser90/92. Rzeczywisty overflow200% miał383px przy innerWidth/visual375px: przyciski „Powiąż ze sprawą” i „Poprzednia strona” przekraczały prawą krawędź. Lokalna poprawka katalogu pozwala zawijać tekst, bez clippingu; [po poprawce](evidence/companies-contacts/qa-text200-after.json) scrollWidth375 i brak offenderów, [przed](evidence/companies-contacts/qa-text200-before.json)383. Druga porażka to udowodniony prywatny SSR307 z reuse refresh tokena przy patologicznie krótkim TTL60s; nie wyłączono testu, lecz wymaga on obecnie rzeczywistego expiry300s i prywatnego200 bez przekierowań.
- **R6 — FAIL:** integracje105/105 PASS; browser91/92. Rzeczywiste expiry300s → prywatne SSR200/Set-Cookie/nowe cookies oraz200% tekstu uzyskały indywidualny PASS. Jedyna porażka wystąpiła później: test ręcznie wysłał nieprawidłowe `?_rsc=synthetic-cc`, a Next16.4.3 prawidłowo zwrócił307 normalizacji klucza cache na tej samej prywatnej ścieżce. [Zainstalowany kod i rzeczywisty probe](evidence/companies-contacts/qa-rsc-protocol.json) dowodzą, że przy samym nagłówku RSC:1 bez Flight state/prefetch poprawny klucz jest pusty `?_rsc`; taki request daje200 text/x-component z private/no-store. Poprawiono wyłącznie request fixture, pozostawiając maxRedirects0 i wzmacniając asercje content-type oraz private. Żadne przekierowanie do login/obcej ścieżki nie jest akceptowane. Bez zmiany Auth lub konfiguracji aplikacji.
- **R7 — PASS:** finalny kandydat3666f4b,105/105 integracji i92/92 browser, natural exit0; pełne rzeczywiste expiry300s/privateSSR/RSC/cache/logout oraz200% tekstu. Po wykonaniu guard posprzątał wyłącznie własne zasoby;44/44 wcześniejszych kontenerów zachowało tożsamość i mapowania.
- **Security P2 / opcjonalne diagnostyki:** usunięto dodatkowe utrwalanie raw stdout runnera, którego reprezentacja różniła się od normalizowanej treści poddanej scannerowi. W produkcie/runnerze pozostały dotychczasowy scanner, bezpieczne metryki i required counts. Lokalne diagnostyki fixture używały zweryfikowanej normalizowanej reprezentacji, nie raw logów z niezweryfikowanymi sekretami.

## Ograniczenia

AC-CC-007/009/010 pozostają **NOT RUN / poza przyrostem**: brak komunikacji i modelu rzeczywistego uczestnictwa w wydarzeniach. Negatywny test braku dziedziczenia historii nie zalicza dodatniej historii osoby. TC-006/008/014/025 i34 tylko w podzakresie katalogu/relacji; pełny TC-019/025/034 oraz dokumenty i Global Search nie uzyskują PASS.

Fizyczne urządzenia, technologie asystujące, pełny audyt WCAG, rzeczywisty zoom przeglądarki, live OAuth, publiczny release i polityki retencji/usuwania pozostają NOT RUN/OPEN. 200% oznacza rzeczywiste zwiększenie tekstu html do32px, a nie deklarację testu każdego rodzaju powiększenia. Nie deklarujemy wszystkich możliwych przeplotów concurrency. Bez merge/deploymentu.
