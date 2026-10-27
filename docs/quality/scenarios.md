# Scenariusze użytkowe i plan testów E2E — UC/TC

**Status:** `BASELINED`. Scenariusze odzwierciedlają zatwierdzone zachowania z discovery; konkretne dane testowe, komunikaty i wartości `OPEN-*` wymagają decyzji. **`TC-*` oznacza zaplanowany przypadek testowy, nie uruchomiony test.**

Scenariusze są testami zgodności specyfikacji, nie dekoracją dokumentacji. W każdym: warunek wejścia → kroki → wynik pozytywny → ważny test negatywny. Po implementacji zautomatyzuj odpowiednie `TC-*` oraz dodaj testy integracyjne i jednostkowe dla szczegółów.


## UC-001 — Zapisanie oferty bez aplikowania

**Test:** `TC-001` · **Wymagania:** `FR-LC-001`, `FR-LC-004`, `FR-QC-001`, `FR-QC-004`, `FR-QC-009`, `FR-QC-011` · **Reguły:** `BR-001`, `BR-004`, `BR-021`, `BR-029`
**Bramki:** `OPEN-002`

**Warunek początkowy:** Użytkownik ma URL lub podstawowe informacje o interesującej ofercie.

**Kroki:**

1. Otwórz Quick Capture z Dashboardu.
2. Wprowadź ręcznie ofertę lub jeden URL.
3. Zweryfikuj dane.
4. Wybierz Zapisz.
5. Przejrzyj kartę sprawy..

**Oczekiwany rezultat:** Powstaje sprawa Zapisane z linkiem, bez faktu wysłania CV. Użytkownik pozostaje na Dashboardzie.

**Ważny test negatywny / błąd:** Nie może powstać zdarzenie aplikowania ani automatyczne zaproszenie do rekrutacji.

## UC-002 — Wysłanie aplikacji przez formularz

**Test:** `TC-002` · **Wymagania:** `FR-LC-005`, `FR-LC-014`, `FR-LC-024`, `FR-QC-011`, `FR-HE-001` · **Reguły:** `BR-004`, `BR-007`, `BR-014`
**Bramki:** `OPEN-002`, `OPEN-026`

**Warunek początkowy:** Jest sprawa z ogłoszeniem i formularzem aplikacyjnym.

**Kroki:**

1. Otwórz sprawę.
2. Zarejestruj faktyczne wysłanie aplikacji przez formularz.
3. Wskaż kanał faktycznej aplikacji.
4. Sprawdź status i historię..

**Oczekiwany rezultat:** Sprawa rejestruje wysłaną aplikację/kontakt, ale nie trafia do W rekrutacji wyłącznie na podstawie wysyłki lub potwierdzenia.

**Ważny test negatywny / błąd:** Link do formularza przed użyciem nie oznacza wysłania.

## UC-003 — Spontaniczne wysłanie CV bez ogłoszenia

**Test:** `TC-003` · **Wymagania:** `FR-LC-001`, `FR-LC-002`, `FR-LC-005`, `FR-DO-004`, `FR-DO-005`, `FR-DO-006` · **Reguły:** `BR-001`, `BR-004`, `BR-026`
**Bramki:** `OPEN-002`, `OPEN-036`

**Warunek początkowy:** Kandydat rzeczywiście przesłał CV do firmy bez ogłoszenia.

**Kroki:**

1. Utwórz sprawę bez URL oferty.
2. Zarejestruj wysłanie CV/kontakt.
3. Powiąż konkretną wysłaną wersję CV.
4. Sprawdź historię..

**Oczekiwany rezultat:** Powstaje prawidłowa sprawa bez ogłoszenia i zapis rzeczywiście wysłanej wersji.

**Ważny test negatywny / błąd:** Brak stanowiska nie uniemożliwia rejestracji, a dodatkowo podpięte CV nie jest automatycznie wysłane.

## UC-004 — Wiadomość do CTO na LinkedIn bez CV

**Test:** `TC-004` · **Wymagania:** `FR-LC-001`, `FR-LC-002`, `FR-LC-006`, `FR-CC-004`, `FR-CC-007`, `FR-QC-002` · **Reguły:** `BR-001`, `BR-004`, `BR-018`
**Bramki:** `OPEN-002`

**Warunek początkowy:** Użytkownik wysłał wiadomość do CTO, nie wysłał CV i nie ma aktywnego ogłoszenia.

**Kroki:**

1. Utwórz sprawę kontaktową.
2. Powiąż CTO jako kontakt.
3. Zarejestruj wiadomość.
4. Zapisz..

**Oczekiwany rezultat:** Sprawa pozwala zapisać kontakt z osobą przy statusie Kontakt rozpoczęty, bez fikcyjnej aplikacji i ogłoszenia.

**Ważny test negatywny / błąd:** Nie wolno domniemać, że CV zostało wysłane ani że nastąpiło kwalifikujące zaproszenie.

## UC-005 — Przejście od kontaktu do aktywnej rekrutacji

**Test:** `TC-005` · **Wymagania:** `FR-LC-007`, `FR-LC-008`, `FR-LC-014`, `FR-RW-008` · **Reguły:** `BR-004`, `BR-005`, `BR-006`, `BR-007`
**Bramki:** `OPEN-018`, `OPEN-034`

**Warunek początkowy:** W sprawie zapisano wcześniejszy kontakt; przyszło zaproszenie do kwalifikacyjnego etapu.

**Kroki:**

1. Otwórz sprawę.
2. Zarejestruj kwalifikujące zaproszenie.
3. Uruchom właściwy proces rozpoczęcia rekrutacji.
4. Sprawdź status i etap..

**Oczekiwany rezultat:** Status W rekrutacji jest uzasadniony zaproszeniem, a szczegółowy etap istnieje niezależnie od statusu.

**Ważny test negatywny / błąd:** Samo potwierdzenie otrzymania CV nie wystarcza do W rekrutacji.

## UC-006 — Kilka aplikacji do jednej firmy

**Test:** `TC-006` · **Wymagania:** `FR-LC-003`, `FR-CC-008`, `FR-CC-011`, `FR-RW-005` · **Reguły:** `BR-001`, `BR-002`, `BR-022`
**Bramki:** `OPEN-024`

**Warunek początkowy:** Jedna organizacja ma jedną istniejącą sprawę.

**Kroki:**

1. Zarejestruj drugi niezależny proces/stanowisko.
2. Otwórz profil firmy.
3. Sprawdź powiązania..

**Oczekiwany rezultat:** Profil firmy wskazuje dwie odrębne sprawy bez pomieszania ich etapów/historii.

**Ważny test negatywny / błąd:** Dopasowanie organizacji nie może prowadzić do automatycznego scalenia.

## UC-007 — Kilka publikacji jednej rekrutacji

**Test:** `TC-007` · **Wymagania:** `FR-LC-023`, `FR-LC-024`, `FR-LC-025`, `FR-QC-003`, `FR-QC-006`, `FR-QC-008`, `FR-RW-011`, `FR-GS-004` · **Reguły:** `BR-013`, `BR-014`, `BR-022`
**Bramki:** `OPEN-025`, `OPEN-026`

**Warunek początkowy:** Istnieją trzy URL-e różnych publikacji tej samej oferty.

**Kroki:**

1. Dodaj sprawę z główną publikacją.
2. Powiąż dwa dodatkowe źródłowe linki.
3. Otwórz szczegóły sprawy..

**Oczekiwany rezultat:** W jednej sprawie da się zachować wszystkie uporządkowane odnośniki; informacja o źródle i kanale rzeczywistej aplikacji nie zlewa się.

**Ważny test negatywny / błąd:** Trzy linki nie muszą automatycznie oznaczać trzech spraw, a treść cudzej korespondencji nie jest pobierana z URL-u.

## UC-008 — Kontakt od agencji z nieujawnionym pracodawcą

**Test:** `TC-008` · **Wymagania:** `FR-LC-002`, `FR-LC-006`, `FR-CC-002`, `FR-CC-003`, `FR-CC-004` · **Reguły:** `BR-001`, `BR-018`, `BR-028`
**Bramki:** `OPEN-002`

**Warunek początkowy:** Rekruter agencji zgłosił możliwość pracy, nie ujawniając klienta.

**Kroki:**

1. Dodaj agencję i kontakt.
2. Zarejestruj sprawę inbound.
3. Pozostaw pracodawcę nieznanym.
4. Przejrzyj powiązania..

**Oczekiwany rezultat:** Istnieje sprawa agencji z kontaktem bez wymuszenia wskazania pracodawcy.

**Ważny test negatywny / błąd:** Agencja nie może zostać automatycznie uznana za pracodawcę docelowego.

## UC-009 — Indywidualny etap rekrutacji

**Test:** `TC-009` · **Wymagania:** `FR-LC-008`, `FR-LC-009`, `FR-LC-010`, `FR-LC-011`, `FR-LC-012`, `FR-LC-013` · **Reguły:** `BR-006`, `BR-015`
**Bramki:** `OPEN-003`, `OPEN-027`, `OPEN-034`

**Warunek początkowy:** W sprawie trwa rekrutacja z etapami.

**Kroki:**

1. Skonfiguruj indywidualny etap.
2. Przejdź do innego etapu z pominięciem jednego pośredniego.
3. Przejrzyj historię..

**Oczekiwany rezultat:** Etapy tej sprawy są personalizowane, a zmiany/pominięcia można odtworzyć.

**Ważny test negatywny / błąd:** Nie wolno globalnie nadpisać niepowiązanych spraw bez rozstrzygnięcia propagacji.

## UC-010 — Przełożenie rozmowy

**Test:** `TC-010` · **Wymagania:** `FR-HE-006`, `FR-HE-007`, `FR-HE-011`, `FR-HE-013`, `FR-DB-003` · **Reguły:** `BR-015`, `BR-017`, `BR-027`
**Bramki:** `OPEN-021`, `OPEN-037`

**Warunek początkowy:** Zaplanowana rozmowa ma termin i uczestników.

**Kroki:**

1. Otwórz wydarzenie.
2. Przełóż termin.
3. Sprawdź widok kalendarza i historię sprawy..

**Oczekiwany rezultat:** Nowy termin wydarzenia jest dostępny; wydarzenie nie staje się odbyte wyłącznie z powodu przesunięcia.

**Ważny test negatywny / błąd:** System nie tworzy fikcyjnego potwierdzenia odbycia pierwotnej rozmowy.

## UC-011 — Potwierdzenie wydarzenia po terminie

**Test:** `TC-011` · **Wymagania:** `FR-HE-008`, `FR-HE-011`, `FR-HE-012`, `FR-DB-003` · **Reguły:** `BR-017`, `BR-020`
**Bramki:** `OPEN-021`

**Warunek początkowy:** Termin rozmowy minął, wydarzenie pozostaje nierozliczone.

**Kroki:**

1. Otwórz Dashboard lub kalendarz.
2. Znajdź propozycję potwierdzenia.
3. Świadomie oznacz spotkanie jako odbyte..

**Oczekiwany rezultat:** Przed potwierdzeniem nie jest ono odbyte; po akcji użytkownika ma prawidłowy stan.

**Ważny test negatywny / błąd:** Sam upływ czasu nie może oznaczyć wydarzenia jako odbytego.

## UC-012 — Zamknięcie sprawy z otwartymi zadaniami

**Test:** `TC-012` · **Wymagania:** `FR-LC-016`, `FR-LC-017`, `FR-LC-018`, `FR-TN-011`, `FR-RW-008` · **Reguły:** `BR-008`, `BR-010`, `BR-011`
**Bramki:** `OPEN-001`, `OPEN-029`, `OPEN-040`

**Warunek początkowy:** Aktywna sprawa ma otwarte zadanie i przyszłe wydarzenie.

**Kroki:**

1. Wybierz Zakończ sprawę.
2. Podaj wynik.
3. Rozstrzygnij otwarte zadanie i wydarzenie.
4. Potwierdź.
5. Otwórz historię..

**Oczekiwany rezultat:** Zakończenie ma wynik, a każdy otwarty element został świadomie rozstrzygnięty; historia pozostaje.

**Ważny test negatywny / błąd:** Zamknięcie bez wyniku lub z nierozstrzygniętym elementem nie może przebiec w ukryciu.

## UC-013 — Wznowienie zamkniętej sprawy

**Test:** `TC-013` · **Wymagania:** `FR-LC-017`, `FR-LC-019`, `FR-LC-021`, `FR-HE-001` · **Reguły:** `BR-010`, `BR-012`, `BR-015`
**Bramki:** `OPEN-019`, `OPEN-020`

**Warunek początkowy:** Sprawa została zakończona z historycznym wynikiem.

**Kroki:**

1. Otwórz zakończoną sprawę.
2. Wznów.
3. Przejrzyj oś czasu.
4. Opcjonalnie ponownie zakończ..

**Oczekiwany rezultat:** Poprzednie zakończenie jest zachowane wraz z nowymi aktywnościami.

**Ważny test negatywny / błąd:** Wznowienie nie kasuje, nie przepisuje ani nie zamienia wcześniejszego wyniku.

## UC-014 — Ponowne aplikowanie po odmowie

**Test:** `TC-014` · **Wymagania:** `FR-LC-003`, `FR-LC-022`, `FR-CC-008`, `FR-CC-011` · **Reguły:** `BR-002`, `BR-010`, `BR-022`
**Bramki:** `OPEN-019`, `OPEN-024`

**Warunek początkowy:** Istnieje wcześniejsza zamknięta sprawa ze znaną odmową.

**Kroki:**

1. Utwórz nową sprawę dla nowego procesu tej firmy.
2. Zarejestruj faktyczne nowe aplikowanie.
3. Otwórz profil firmy..

**Oczekiwany rezultat:** Nowa i stara sprawa istnieją obok siebie, a stara odmowa pozostaje w historii poprzedniej.

**Ważny test negatywny / błąd:** Nie wolno bez pytania dopisać nowej aplikacji do starej sprawy ani jej scalić.

## UC-015 — Potencjalny duplikat podczas dodawania URL

**Test:** `TC-015` · **Wymagania:** `FR-QC-003`, `FR-QC-006`, `FR-QC-007`, `FR-QC-008` · **Reguły:** `BR-021`, `BR-022`
**Bramki:** `OPEN-024`, `OPEN-025`

**Warunek początkowy:** Istnieje sprawa odpowiadająca nowo podanemu URL-owi.

**Kroki:**

1. Otwórz Quick Capture.
2. Wprowadź pojedynczy URL.
3. Zweryfikuj wynik i informację o duplikacie.
4. Wybierz świadomie nową lub istniejącą sprawę..

**Oczekiwany rezultat:** Ostrzeżenie umożliwia decyzję; aktualizacja istniejącej jest możliwa tylko po wyborze użytkownika.

**Ważny test negatywny / błąd:** Nie wolno cicho scalać ani nadpisywać rekordów.

## UC-016 — Nieudany Smart Import

**Test:** `TC-016` · **Wymagania:** `FR-QC-002`, `FR-QC-003`, `FR-QC-004`, `FR-QC-005`, `FR-QC-011` · **Reguły:** `BR-001`, `BR-021`
**Bramki:** `OPEN-011`

**Warunek początkowy:** URL nie nadaje się do automatycznego odczytu albo zewnętrzna strona jest niedostępna.

**Kroki:**

1. Wprowadź jeden URL.
2. Otrzymaj informację o niepowodzeniu.
3. Wybierz fallback ręczny.
4. Uzupełnij dane i zapisz..

**Oczekiwany rezultat:** Można ręcznie dodać sprawę bez automatycznego uznania aplikowania.

**Ważny test negatywny / błąd:** Awaria parsera nie może uniemożliwić ręcznego wprowadzenia sprawy.

## UC-017 — Częściowy import XLSX z błędami i duplikatami

**Test:** `TC-017` · **Wymagania:** `FR-IM-001`, `FR-IM-002`, `FR-IM-003`, `FR-IM-004`, `FR-IM-005`, `FR-IM-006`, `FR-IM-007`, `FR-IM-008`, `FR-IM-009`, `FR-IM-010`, `FR-IM-011`, `FR-IM-012`, `FR-IM-013`, `FR-IM-014` · **Reguły:** `BR-021`, `BR-022`, `BR-023`, `BR-024`, `BR-025`
**Bramki:** `OPEN-001`, `OPEN-002`, `OPEN-010`, `OPEN-022`, `OPEN-023`, `OPEN-024`, `OPEN-035`

**Warunek początkowy:** Plik zawiera poprawne, błędne i potencjalnie zduplikowane wiersze oraz niepełną historię.

**Kroki:**

1. Wybierz XLSX.
2. Zmapuj kolumny/statusy.
3. Sprawdź preview.
4. Rozstrzygnij duplikaty i błędne wiersze.
5. Świadomie zatwierdź partial import.
6. Odbierz raport..

**Oczekiwany rezultat:** Zapisywane są tylko zaakceptowane wiersze, raport wskazuje pominięcia i powody, historyczne daty nie są wymyślane, zaległe sugestie nie powstają.

**Ważny test negatywny / błąd:** Bez jawnej zgody nie ma cichego zapisu tylko poprawnej części; ponowny import nie duplikuje po cichu.

## UC-018 — Wykorzystanie różnych wersji CV

**Test:** `TC-018` · **Wymagania:** `FR-DO-001`, `FR-DO-002`, `FR-DO-003`, `FR-DO-004`, `FR-DO-005`, `FR-DO-006`, `FR-DO-007`, `FR-DO-008`, `FR-DO-009` · **Reguły:** `BR-026`, `BR-030`
**Bramki:** `OPEN-006`, `OPEN-036`

**Warunek początkowy:** W bibliotece dostępne są dwie wersje CV.

**Kroki:**

1. Dodaj CV A z biblioteki do sprawy.
2. Zarejestruj wysłanie CV A.
3. Dodaj wersję B tylko do sprawy.
4. Przejrzyj historię aplikacji..

**Oczekiwany rezultat:** Historia wysłanej aplikacji wskazuje A, a B pozostaje tylko powiązaną wersją.

**Ważny test negatywny / błąd:** Samo dodanie B nie oznacza jej wysłania i nie nadpisuje historycznego A.

## UC-019 — Historia jednego rekrutera w kilku sprawach

**Test:** `TC-019` · **Wymagania:** `FR-CC-004`, `FR-CC-005`, `FR-CC-009`, `FR-CC-010`, `FR-HE-002`, `FR-HE-013` · **Reguły:** `BR-015`, `BR-019`, `BR-027`
**Bramki:** `OPEN-004`, `OPEN-030`

**Warunek początkowy:** Jedna osoba była uczestnikiem zdarzeń w dwóch sprawach.

**Kroki:**

1. Powiąż tę samą osobę z dwiema sprawami.
2. Zarejestruj dwa faktyczne wydarzenia.
3. Otwórz profil kontaktu.
4. Otwórz jedną ze spraw..

**Oczekiwany rezultat:** Historia osoby pokazuje oba faktyczne wydarzenia, a widok sprawy nie tworzy ich niezależnych kopii.

**Ważny test negatywny / błąd:** Zdarzenie trzeciej sprawy, w którym ta osoba nie brała udziału, nie pojawia się w jej historii.

## UC-020 — Globalne wyszukiwanie po notatce ze starszej rozmowy

**Test:** `TC-020` · **Wymagania:** `FR-GS-001`, `FR-GS-002`, `FR-GS-003`, `FR-GS-004`, `FR-GS-005`, `FR-GS-006`, `FR-GS-007`, `FR-GS-008`, `FR-NV-002`, `FR-LC-021`, `FR-LC-025` · **Reguły:** `BR-012`, `BR-014`, `BR-015`
**Bramki:** `OPEN-038`

**Warunek początkowy:** Dawna, zamknięta sprawa ma notatkę i opis wydarzenia z rozpoznawalnymi fragmentami.

**Kroki:**

1. Otwórz Global Search z dowolnego modułu.
2. Wpisz frazę z notatki.
3. Wybierz wynik.
4. Otwórz kontekst sprawy..

**Oczekiwany rezultat:** Wynik jest grupowany i otwiera prawidłowy kontekst; zamknięta sprawa pozostaje dostępna.

**Ważny test negatywny / błąd:** Wyszukiwanie nie próbuje odczytać prywatnej treści z podanego URL-u ani z pliku CV.

## UC-021 — Ręczna korekta statusu i DnD

**Test:** `TC-021` · **Wymagania:** `FR-LC-014`, `FR-LC-015`, `FR-RW-008`, `FR-HE-003` · **Reguły:** `BR-005`, `BR-007`, `BR-008`, `BR-016`
**Bramki:** `OPEN-004`, `OPEN-018`, `OPEN-020`

**Warunek początkowy:** Sprawa ma błędnie przypisany status, lecz brak faktycznej aplikacji/zaproszenia.

**Kroki:**

1. Wybierz ręczną korektę.
2. Ustaw poprawny status zgodnie z dopuszczonym zakresem.
3. Przejrzyj historię.
4. Spróbuj DnD do statusu wymagającego dodatkowego faktu..

**Oczekiwany rezultat:** Korekta nie fabrykuje zdarzenia; DnD nie omija walidacji cyklu życia.

**Ważny test negatywny / błąd:** Nie wolno wstawić rzekomej aplikacji ani pozwolić na ciche Zakończone bez wyniku.

## UC-022 — Dodanie historycznej odbytej rozmowy

**Test:** `TC-022` · **Wymagania:** `FR-HE-001`, `FR-HE-002`, `FR-HE-010`, `FR-HE-013` · **Reguły:** `BR-015`, `BR-017`
**Bramki:** `OPEN-002`, `OPEN-004`, `OPEN-037`

**Warunek początkowy:** Rozmowa odbyła się kilka dni wcześniej i nie była planowana w CRM.

**Kroki:**

1. Otwórz sprawę.
2. Dodaj odbytą rozmowę bez tworzenia planowanego wydarzenia.
3. Wprowadź rzeczywistą datę.
4. Sprawdź oś czasu i datę wprowadzenia..

**Oczekiwany rezultat:** Wpis trafia na właściwe miejsce chronologiczne i nie udaje wcześniejszego planowania.

**Ważny test negatywny / błąd:** Dzisiejsza data zapisu nie zastępuje daty faktycznej rozmowy.

## UC-023 — Sugestia follow-upu bez wysyłki wiadomości

**Test:** `TC-023` · **Wymagania:** `FR-TN-004`, `FR-TN-005`, `FR-TN-006`, `FR-TN-007`, `FR-TN-008`, `FR-TN-009`, `FR-TN-010`, `FR-DB-004` · **Reguły:** `BR-009`, `BR-020`, `BR-024`
**Bramki:** `OPEN-008`, `OPEN-009`

**Warunek początkowy:** Istnieje sprawa z potencjalną potrzebą follow-upu, reguła została wcześniej zatwierdzona.

**Kroki:**

1. Otwórz Dashboard.
2. Zobacz sugestię.
3. Nie podejmuj działania.
4. Sprawdź listę zadań, komunikację i status..

**Oczekiwany rezultat:** Samo pokazanie sugestii nie tworzy zadania, nie wysyła wiadomości i nie kończy sprawy.

**Ważny test negatywny / błąd:** Brak odpowiedzi w CRM nie może być prezentowany jako gwarantowany brak odpowiedzi.

## UC-024 — Dashboard i globalna nawigacja od pierwszego wejścia

**Test:** `TC-024` · **Wymagania:** `FR-DB-001`, `FR-DB-002`, `FR-DB-003`, `FR-DB-004`, `FR-DB-005`, `FR-DB-006`, `FR-DB-007`, `FR-DB-008`, `FR-NV-001`, `FR-NV-002`, `FR-NV-003`, `FR-QC-001` · **Reguły:** `BR-020`, `BR-029`
**Bramki:** `OPEN-017`, `OPEN-039`

**Warunek początkowy:** Użytkownik loguje się pierwszy raz do aplikacji.

**Kroki:**

1. Zaloguj się.
2. Otwórz Dashboard.
3. Przejdź przez siedem modułów.
4. Otwórz wyszukiwanie i Quick Capture..

**Oczekiwany rezultat:** Dashboard ma operacyjne sekcje bez wymaganego onboardingu; Search i Capture są dostępne z każdego modułu.

**Ważny test negatywny / błąd:** Nie ma pełnego Kanbana ani osobnej listy ostatnich rekrutacji na Dashboardzie.

## UC-025 — Kontakt istnieje bez sprawy, komunikacja wymaga sprawy

**Test:** `TC-025` · **Wymagania:** `FR-CC-001`, `FR-CC-006`, `FR-CC-007`, `FR-CC-009` · **Reguły:** `BR-018`, `BR-019`
**Bramki:** `OPEN-002`

**Warunek początkowy:** Istnieje osoba kontaktowa, ale nie ma sprawy.

**Kroki:**

1. Utwórz profil osoby.
2. Spróbuj zapisać komunikację.
3. Wybierz/utwórz sprawę.
4. Zapisz komunikację..

**Oczekiwany rezultat:** Profil kontaktu może istnieć samodzielnie; wiadomość zostaje powiązana z konkretną sprawą.

**Ważny test negatywny / błąd:** Nie wolno tworzyć korespondencji bez wskazania sprawy.

## UC-026 — Zapobieganie przypadkowemu ponownemu importowi

**Test:** `TC-026` · **Wymagania:** `FR-IM-007`, `FR-IM-011`, `FR-IM-014` · **Reguły:** `BR-022`, `BR-025`
**Bramki:** `OPEN-010`, `OPEN-035`

**Warunek początkowy:** W przeszłości zakończono import danego wsadu danych.

**Kroki:**

1. Spróbuj zaimportować ten sam plik i mapowanie drugi raz.
2. Przejrzyj informację o ryzyku.
3. Zweryfikuj zapisane sprawy..

**Oczekiwany rezultat:** Potencjalne powtórzenie jest wykryte, a dane nie są bez ostrzeżenia tworzone ponownie.

**Ważny test negatywny / błąd:** Skutki celowego ponowienia i reguła haszowania nie mogą być arbitralnie zaimplementowane przed OPEN-035.

## UC-027 — Praca na Kanbanie i liście z drawerem

**Test:** `TC-027` · **Wymagania:** `FR-RW-001`, `FR-RW-002`, `FR-RW-003`, `FR-RW-004`, `FR-RW-005`, `FR-RW-006`, `FR-RW-007`, `FR-RW-009`, `FR-RW-010`, `FR-RW-011` · **Reguły:** `BR-003`, `BR-006`, `BR-015`
**Bramki:** `OPEN-017`, `OPEN-028`, `OPEN-034`

**Warunek początkowy:** Użytkownik ma sprawy w czterech statusach, w tym zakończone i sprawę z etapem.

**Kroki:**

1. Otwórz Rekrutacje.
2. Sprawdź domyślny Kanban i zwinięte Zakończone.
3. Rozwiń je i sprawdź etapy na kartach.
4. Wybierz filtry i sortowanie.
5. Przełącz na listę.
6. Otwórz drawer i pełną stronę sprawy..

**Oczekiwany rezultat:** Te same sprawy są prezentowane w obu widokach, statusy mają cztery kolumny, stage jest odrębny, historia na pełnej stronie centralna.

**Ważny test negatywny / błąd:** W MVP nie ma zapisywania własnych filtrów; filtrowanie nie modyfikuje spraw ani faktów.

## UC-028 — Notatka inline i rozliczenie nieodbytego wydarzenia

**Test:** `TC-028` · **Wymagania:** `FR-HE-003`, `FR-HE-004`, `FR-HE-005`, `FR-HE-006`, `FR-HE-009` · **Reguły:** `BR-016`, `BR-017`
**Bramki:** `OPEN-004`, `OPEN-017`, `OPEN-021`

**Warunek początkowy:** Sprawa ma wydarzenie zaplanowane i użytkownik chce dopisać krótką notatkę.

**Kroki:**

1. Dodaj notatkę inline.
2. Otwórz dedykowaną akcję bardziej złożonego wydarzenia.
3. Rozlicz planowane spotkanie jako nieodbyte.
4. Przejrzyj historię..

**Oczekiwany rezultat:** Krótka notatka jest wprowadzana kontekstowo, złożona operacja korzysta z dialogu, wydarzenie nieodbyte nie staje się odbyte.

**Ważny test negatywny / błąd:** Zmiana terminu ani korekta danych nie może tworzyć fikcyjnego odbycia.

## UC-029 — Seria pojedynczych wpisów Quick Capture

**Test:** `TC-029` · **Wymagania:** `FR-QC-003`, `FR-QC-009`, `FR-QC-010`, `FR-QC-012`, `FR-NV-003` · **Reguły:** `BR-021`, `BR-029`
**Bramki:** `OPEN-011`, `OPEN-017`

**Warunek początkowy:** Użytkownik ma dwa niezależne URL-e do zapisania.

**Kroki:**

1. Otwórz Quick Capture.
2. Zapisz jedną sprawę przez Zapisz i dodaj kolejną.
3. Dodaj drugi URL osobno.
4. Zapisz..

**Oczekiwany rezultat:** Można dodać dwa kolejne rekordy, każda operacja przyjmuje jeden URL, a bieżący widok modułu nie jest utracony.

**Ważny test negatywny / błąd:** Nie pojawia się masowy import wielu URL-i ani rozszerzenie przeglądarki jako wymóg MVP.

## UC-030 — Zadania bez terminu i ich prezentacja

**Test:** `TC-030` · **Wymagania:** `FR-TN-001`, `FR-TN-002`, `FR-TN-003`, `FR-TN-004`, `FR-DB-002` · **Reguły:** `BR-011`, `BR-020`
**Bramki:** `OPEN-002`, `OPEN-009`, `OPEN-040`

**Warunek początkowy:** Użytkownik ma ogólną czynność i czynność związaną z rekrutacją.

**Kroki:**

1. Dodaj zadanie ogólne bez terminu.
2. Dodaj zadanie do sprawy z tytułem i opisem.
3. Otwórz Zadania, Dashboard i kartę sprawy.
4. Zweryfikuj przypomnienie wewnątrz aplikacji..

**Oczekiwany rezultat:** Oba zadania istnieją z właściwym kontekstem, bez wymogu terminu, i są widoczne w odpowiednich modułach.

**Ważny test negatywny / błąd:** Brak terminu nie blokuje zapisu; sugestia nie staje się automatycznie zadaniem.

## UC-031 — Ochrona prywatnego dokumentu

**Test:** `TC-031` · **Wymagania:** `FR-DO-010`, `FR-DO-001` · **Reguły:** `BR-030`
**Bramki:** `OPEN-006`, `OPEN-013`, `OPEN-032`

**Warunek początkowy:** W aplikacji istnieje dokument CV użytkownika; sposób autoryzacji wymaga rozstrzygnięcia.

**Kroki:**

1. Otwórz uprawniony kontekst dokumentu.
2. Spróbuj uzyskać dostęp z kontekstu bez prawa do tego pliku.
3. Sprawdź wynik..

**Oczekiwany rezultat:** Uprawniony użytkownik widzi swój dokument, a nieuprawniony dostęp nie ujawnia zawartości ani prywatnych metadanych.

**Ważny test negatywny / błąd:** Nie wolno uznać tego testu za gotowy bez zatwierdzonego modelu kont/uprawnień.

## UC-032 — Długa cisza w sprawie nie kończy procesu

**Test:** `TC-032` · **Wymagania:** `FR-LC-020`, `FR-TN-007`, `FR-TN-008`, `FR-TN-009`, `FR-TN-010` · **Reguły:** `BR-009`, `BR-020`
**Bramki:** `OPEN-008`

**Warunek początkowy:** Sprawa pozostaje otwarta bez zapisanej odpowiedzi przez długi czas.

**Kroki:**

1. Przeglądaj status po upływie czasu.
2. Sprawdź możliwą sugestię i historię.
3. Otwórz sprawę..

**Oczekiwany rezultat:** Sprawa nie jest samoczynnie Zakończone, a brak odpowiedzi w CRM nie jest nazywany potwierdzonym milczeniem rekrutera.

**Ważny test negatywny / błąd:** Bez akcji użytkownika nie pojawia się automatyczny wynik zakończenia ani wysłana wiadomość.

## Stan planu testów

- `TC-001`–`TC-032`: **PLANNED / NOT EXECUTED** — aplikacja i prototyp nie powstały.
- Każdy scenariusz powiązano z wymaganiami, ale nie każde drobne FR wymaga osobnego E2E; pełną relację pokazuje [traceability](traceability.md).
- Testy bezpieczeństwa, własności danych, awarie importu i walidacje są rozszerzane w [strategii testów](test-strategy.md).

