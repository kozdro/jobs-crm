# Reminders & Follow-up Suggestions — kontrakt i plan

**Źródło:** PO w bieżącym zadaniu zatwierdził 1A/2A/3A z doprecyzowaniami i autoryzował implementację, QA, niezależny backend/frontend/security review i osobny PR bez merge/deploymentu. [DEC-063](../decisions/product-decisions.md) jest decyzją APPROVED; ten dokument opisuje jej granice, nie stan wykonania. Model/reasoning agentów: niedostępne w metadanych zadania; właściwe role i rzeczywiste identyfikatory sesji podaje raport.

## Macierz zgodności

| Źródło i status | Zachowana granica i test |
|---|---|
| Discovery DEC-016/027/028/037 APPROVED, BR-009/020/024 | Dashboard odróżnia sugestię; brak wysyłki/auto-close/auto-Task; historyczny import nie wyzwala zaległości; brak twierdzenia o braku odpowiedzi. TC-023/017. |
| DEC-054/056/060/062 APPROVED | Rzeczywisty datowany outbound i korekty/void są faktami lifecycle; zadania, close/reopen i Calendar zachowują swoje reguły. Testy zmian podstawy i mixed close. |
| UX Blueprint oraz UX-001/010, F09 | Odrębna sugestia, przejście do kontekstu lub świadomego formularza; stany puste, błędy i dostępność; bez domniemanego alarmu od samego terminu. Browser/keyboard QA. |
| Technical Discovery, ADR-0005 i przyjęta architektura Auth/RLS | Transakcje i idempotencja odpowiednich komend, izolacja właściciela na każdym końcu, bez service role w ścieżce użytkownika. Retry/rollback, A/B/anon, direct Data API/RPC. |
| ADR-0012 ACCEPTED, FQA-27/29 | Autonomiczny odczyt BFF może odnawiać sesję po stronie serwera. Testy rozdzielają awarię browser→Auth i browser→reminder BFF od dostępnego BFF z zaufaną tożsamością A/B; pełna awaria server→Auth bez fault injection pozostaje NOT RUN. |
| OPEN-008/009/040 PARTIALLY RESOLVED | Wyłącznie wyraźnie opisany zakres DEC-063; pozostałe reguły oraz e-mail i zgody nadal wymagają właściwych decyzji. |

## Kontrakt zachowania

1. Konfiguracja przypomnienia wyłączona domyślnie; świadoma data, godzina i strefa IANA są niezależne od opcjonalnego dnia terminu Task. Bez domyślnego progu i wysyłki. Przypomnienie dostępne w aktywnej aplikacji albo po ponownym wejściu, bez obietnicy dostarczenia poza nią. Walidacja czasu nie może cicho zmieniać wskazanego momentu przy zmianach DST.
2. Potwierdzenie i wyłączenie są jawne i trwałe; ponowne żądania ani ponowne wejście nie tworzą duplikatów. Wykonanie/anulowanie zadania wygasza aktywną konfigurację. Przywrócenie oraz zmiana terminu lub relacji wymagają ponownego świadomego potwierdzenia konfiguracji; nie ma automatycznej reaktywacji. Dotyczy również zmiany relacji przez odłączenie w atomowym close; zachowanie relacji nie jest jej zmianą. Operacje uwzględniają wyścigi i nie pozostawiają widocznego alarmu nieaktualnego zadania.
3. Reguła follow-up działa wyłącznie po świadomym ustawieniu przez użytkownika odstępu w dniach i strefy odniesienia, bez wartości domyślnej. Podstawą jest ważny, rzeczywiście zapisany kontakt wychodzący ze znanym dniem; czas zapisu nie zastępuje daty faktu. Sprawa musi być otwarta. Niepewne lub historyczne importowe pochodzenie wyklucza sugestię fail-closed. Zmiana podstawy przez nowszy fakt, korektę lub unieważnienie, a także close powodują aktualizację widoczności.
4. Odrzucenie jest świadome i trwałe dla danej podstawy; reopen nie przywraca tej samej odrzuconej sugestii. Sugestia nie jest Task, CalendarEvent ani faktem kontaktu; może otworzyć kontekst lub formularz zadania, nie zapisuje nic automatycznie. Nie twierdzi, że adresat nie odpowiedział.
5. Opcjonalny e-mail nadal jest celem MVP DEC-027, lecz implementacja i AC-TN-005 są osobnym przyszłym przyrostem. Push nie należy do pierwszego wydania. Publiczne bramki bezpieczeństwa, prywatności i operacji nie są zniesione. Bez zapisów prywatnych payloadów w browser storage; wąska zgoda na RAM jest opisana poniżej i nie zmienia DEC-061/062.

## Szkic i recovery — doprecyzowanie DEC-063

PO 2026-11-07 dopuścił wyłącznie dla tego slice'a przechowanie szkicu i zamrożonego żądania w RAM działającej aplikacji między ekranami, owner-scoped. Logout lub zmiana konta nie może ujawnić tych danych; pełny reload lub zamknięcie karty usuwa je bez gwarancji odzyskania. Bez browser storage, cookies, logów ani dodatkowych magazynów. Identyczne zamrożone żądanie ponawia się z tym samym requestId; zmiana treści to nowy zamiar. Idempotencja, recovery, audyt i izolacja pozostają wymagane. Nie rozszerza to ogólnej polityki DEC-061/062.

## Wpływ i zakres

Task i jego status/termin/relacja, BR-011 close, RecruitmentCase close/reopen, aktualna projekcja faktów oraz ich korekty/void, Dashboard i kontekst zadania wymagają integracji. Należy zachować historię i nie robić fikcyjnego backfillu. Import jest niezrealizowaną zależnością: pochodzenie bez pewnego dowodu wyklucza podstawę. Global Search i komunikacja nie są rozszerzane. Dane i mutacje owner-scoped, również przy bezpośrednim ID i relacjach. Nie wprowadzać domyślnego progu ani pozornej realizacji e-mail. Brak wpływu na semantykę CalendarEvent poza testem braku skutków ubocznych.

## Plan QA i bramki

| FR/AC i UC/TC | Przypadki, poziom i dowód wymagany |
|---|---|
| TN-004 / AC-TN-004, TC-037 | Unit i integracja: off, niezależny termin, IANA/DST, due, ack/off, idempotentne retry, wykonanie/anulowanie, restore i zmiana terminu/relacji, mixed close; browser: aktywna aplikacja i reload. |
| TN-007–010, DB-004 / TC-023 | Unit/integracja: brak konfiguracji, daty i ważnego outbound, granica dnia w strefie, nowszy kontakt, korekta/void, close/reopen, odrzucenie tej samej podstawy, nowa podstawa; browser: odrębny element, kontekst/formularz bez automatycznego zapisu i bez twierdzenia o braku odpowiedzi. |
| IM-013 / TC-017 | Integracja/upgrade: historyczny i niepewny provenance nie generują zaległych sugestii; brak backfillu fikcyjnych zdarzeń. |
| AD-002 / granice zaufania | Rzeczywiste Auth owner A/B/anon, list/ID/relacje, bezpośredni Data API/RPC i odmowa modyfikacji obcych rekordów; stale/concurrency, rollback i replay. |
| TN-005 | E-mail NOT RUN, odrębny przyszły przyrost; nie liczyć jako PASS. |

QA uczestniczy w planowaniu i implementuje testy integracyjne/E2E; developerzy utrzymują unit testy własnego kodu. Backend i frontend pracują w rozłącznych przydzielonych plikach; dokumenty należą spec-analystowi. Niezależne backend/frontend/security review na zamrożonym kandydacie przez read-only wrapper; findings wracają autorowi, po zmianach ponowny review i adekwatne testy. Środowiska i komendy zapisuje raport wykonania z SHA, danymi syntetycznymi i wynikami PASS/FAIL/NOT RUN; nie dotykać persistent DEV ani zasobów innych osób. Chromium diagnostics to osobny operacyjny zakres, bez osłabiania testów i prywatnych danych w logach. Hosted CI musi dotyczyć końcowego SHA. DoD: weryfikacja zakresu i regresji, brak blokujących findings, aktualne traceability i osobny PR; bez merge i deploymentu.
