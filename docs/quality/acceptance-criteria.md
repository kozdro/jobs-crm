# Kanoniczne kryteria akceptacji (AC)

**Stan:** `BASELINED`; `AC-*` to weryfikowalna formalizacja zatwierdzonego zakresu `FR-*`. Przypadki zależne od `OPEN-*` nie mogą być traktowane jako kompletne testy wdrożeniowe do momentu rozstrzygnięcia szczegółów.

**Struktura:** zachowujemy główne AC i dodajemy niezależne kryteria z sufiksem `-01`, `-02` itd. Pełną listę dla każdego FR zawiera [traceability](traceability.md). Niczego nie uruchomiono.


## LC — Recruitment Lifecycle & Stages

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-LC-001** | Mając spontaniczną kandydaturę bez stanowiska i ogłoszenia, gdy użytkownik zapisuje dozwolony minimalny zestaw danych, wtedy powstaje sprawa bez wymagania URL-u ani nazwy stanowiska. | FR-LC-001 |
| **AC-LC-002** | Dla każdego z pięciu wariantów źródłowych użytkownik może zarejestrować sprawę bez podstawiania fikcyjnych akcji z pozostałych wariantów. | FR-LC-002 |
| **AC-LC-003** | Mając istniejącą sprawę firmy, gdy użytkownik rejestruje drugi odrębny proces tej firmy, wtedy oba procesy pozostają osobnymi sprawami i są powiązane z tą samą organizacją. | FR-LC-003 |
| **AC-LC-004** | Dla każdej nowej i zapisanej sprawy status należy do czterech wartości z BR-003 i nie można wybrać Wstrzymane. | FR-LC-004 |
| **AC-LC-005** | Mając sprawę Zapisane, gdy użytkownik świadomie rejestruje wysłanie CV lub formularza, wtedy można rozpoznać kontakt/aplikację, ale status W rekrutacji nie jest nadany z samego tego faktu. | FR-LC-005 |
| **AC-LC-006** | Mając wiadomość od rekrutera albo własną wiadomość do CTO bez CV, gdy użytkownik rejestruje kontakt w sprawie, wtedy zachowany jest fakt kontaktu bez dopisywania wysłania CV. | FR-LC-006 |
| **AC-LC-007** | Mając potwierdzenie wysłania aplikacji bez zaproszenia, nie można na jego podstawie uznać statusu W rekrutacji; mając kwalifikujące zaproszenie, istnieje jawny przebieg rozpoczęcia rekrutacji. | FR-LC-007 |
| **AC-LC-008** | Gdy użytkownik odczytuje szczegóły sprawy, status i etap są prezentowane jako odrębne informacje, a nazwa etapu nie zastępuje statusu. | FR-LC-008 |
| **AC-LC-009** | Gdy użytkownik konfiguruje etap sprawy, dostępny jest domyślny zestaw standardowych etapów, których konkretne nazwy wymagają zatwierdzenia. | FR-LC-009 |
| **AC-LC-010** | Gdy użytkownik modyfikuje globalną konfigurację etapów, może zapisać ją jako konfigurację globalną bez automatycznego przesądzenia zmian etapów istniejących spraw. | FR-LC-010 |
| **AC-LC-011** | Gdy użytkownik ustawia indywidualny etap lub układ etapów w sprawie, zmiana jest dostępna dla tej sprawy bez obowiązku identycznej zmiany w innych sprawach. | FR-LC-011 |
| **AC-LC-012** | Mając etapy pośrednie, gdy użytkownik przechodzi do późniejszego etapu zgodnie z dozwolonym procesem, system nie wymusza zaliczenia wszystkich wcześniejszych etapów. | FR-LC-012 |
| **AC-LC-013** | Gdy użytkownik zmienia etap z jednego na inny, przeszła zmiana pozostaje możliwa do odtworzenia w historii sprawy. | FR-LC-013 |
| **AC-LC-014** | Gdy użytkownik wybiera działanie aplikacji, kontaktu, zaproszenia, etapu, zakończenia lub wznowienia, operacja jest identyfikowalna jako odpowiednia akcja, a nie dowolne ustawienie pola. | FR-LC-014 |
| **AC-LC-015** | Gdy użytkownik koryguje niepoprawny status, system nie tworzy wpisu „wysłano aplikację” ani „zaproszenie”, jeżeli tych faktów nie zarejestrowano. | FR-LC-015 |
| **AC-LC-016** | Gdy użytkownik próbuje zamknąć sprawę bez wyniku, nie powstaje zakończenie; po świadomym wskazaniu zatwierdzonego wyniku zakończenie jest możliwe. | FR-LC-016 |
| **AC-LC-017** | Mając zamkniętą sprawę, gdy użytkownik ją później wznawia i ponownie kończy, poprzednie zakończenie nadal pozostaje możliwe do odtworzenia. | FR-LC-017 |
| **AC-LC-018** | Mając otwarte zadanie lub wydarzenie, gdy użytkownik rozpoczyna zamknięcie, system wymaga świadomego rozstrzygnięcia każdego otwartego elementu przed zakończeniem operacji. | FR-LC-018 |
| **AC-LC-019** | Mając Zakończone i historię zakończenia, gdy użytkownik wznawia sprawę, istniejący wynik pozostaje w historii, a sprawę można kontynuować. | FR-LC-019 |
| **AC-LC-020** | Mając sprawę bez wpisu o odpowiedzi przez długi czas, wtedy sama długość przerwy nie tworzy zakończenia ani nie zmienia statusu na Zakończone. | FR-LC-020 |
| **AC-LC-021** | Gdy sprawa ma status Zakończone, można otworzyć jej informacje i odnaleźć ją w globalnym wyszukiwaniu. | FR-LC-021 |
| **AC-LC-022** | Mając wcześniejszą odmowę, gdy użytkownik aplikuje do nowego procesu tej samej firmy, może utworzyć nową sprawę bez usuwania poprzedniej historii. | FR-LC-022 |
| **AC-LC-023** | Mając jedną sprawę z ofertą opublikowaną w dwóch portalach, można dodać oba linki i odróżnić ich role bez tworzenia obowiązkowo dwóch spraw. | FR-LC-023 |
| **AC-LC-024** | Mając ofertę znalezioną na jednym portalu i aplikację wysłaną na stronie firmy, można zarejestrować odrębnie źródło odkrycia i faktyczny kanał wysyłki. | FR-LC-024 |
| **AC-LC-025** | Gdy użytkownik zapisuje URL rozmowy, system nie przedstawia automatycznie jej treści jako pobranej lub odczytanej z tego faktu. | FR-LC-025 |

## RW — Recruitment Workspace

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-RW-001** | Gdy użytkownik otwiera moduł Rekrutacje bez wyboru alternatywy, widzi Kanban, a nie listę ani Dashboard. | FR-RW-001 |
| **AC-RW-002** | Gdy użytkownik przegląda Kanban, kolumny są zgodne z BR-003 i nie ma kolumny Wstrzymane. | FR-RW-002 |
| **AC-RW-003** | Gdy użytkownik pierwszy raz widzi Kanban, kolumna Zakończone jest zwinięta, a działanie rozwinięcia umożliwia jej przejrzenie. | FR-RW-003 |
| **AC-RW-004** | Mając sprawę ze szczegółowym etapem, użytkownik widzi etap na karcie oraz status wynikający z kolumny jako odrębne dane. | FR-RW-004 |
| **AC-RW-005** | Po zmianie widoku z Kanbana na listę użytkownik widzi ten sam zbiór spraw z zachowaniem statusów i powiązań. | FR-RW-005 |
| **AC-RW-006** | Gdy użytkownik stosuje filtr, sortowanie lub szybki widok, zmienia się prezentacja spraw, nie ich statusy ani zawartość. | FR-RW-006 |
| **AC-RW-007** | Użytkownik nie otrzymuje w pierwszym MVP funkcji trwałego zapisywania własnej konfiguracji filtrów. | FR-RW-007 |
| **AC-RW-008** | Gdy użytkownik przeciąga sprawę do statusu wymagającego brakującego wyniku lub zaproszenia, cicha zmiana bez prawidłowej akcji/walidacji nie jest możliwa. | FR-RW-008 |
| **AC-RW-009** | Z listy/Kanbana użytkownik może wykonać szybki podgląd, a z niego przejść do pełnej strony sprawy. | FR-RW-009 |
| **AC-RW-010** | Po otwarciu pełnej strony historia jest centralnym elementem, a nie główną zakładką odseparowaną od innych informacji. | FR-RW-010 |
| **AC-RW-011** | Po otwarciu pełnej strony dostępne są sekcje związanych dokumentów, zadań, osób, źródeł i warunków bez potrzeby przechodzenia na odrębny główny ekran historii. | FR-RW-011 |

## DB — Dashboard

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-DB-001** | Po zakończonym logowaniu użytkownik trafia na Dashboard, nie na Kanban lub kreator powitalny. | FR-DB-001 |
| **AC-DB-002** | Mając co najmniej jedno zadanie wymagające uwagi, użytkownik znajduje je w sekcji operacyjnej Dashboardu. | FR-DB-002 |
| **AC-DB-003** | Mając zaplanowane przyszłe wydarzenie, użytkownik widzi je w obszarze nadchodzących wydarzeń, bez oznaczania go jako odbyte. | FR-DB-003 |
| **AC-DB-004** | Gdy zdefiniowana reguła generuje sugestię, jest ona prezentowana jako sugestia, a nie jako wysłana wiadomość lub automatyczne zadanie. | FR-DB-004 |
| **AC-DB-005** | Mając odnotowaną rzeczywistą aktywność i czystą korektę techniczną, obszar aktywności nie przedstawia korekty jako zdarzenia rekrutacyjnego. | FR-DB-005 |
| **AC-DB-006** | Użytkownik ma wydzielone krótkie podsumowanie statystyczne, ale dokładne definicje liczb nie są domniemane przed zatwierdzeniem. | FR-DB-006 |
| **AC-DB-007** | Widok Dashboardu nie zawiera duplikatu pełnego Kanbana ani osobnego spisu ostatnich rekrutacji. | FR-DB-007 |
| **AC-DB-008** | Po pierwszym zalogowaniu użytkownik może od razu korzystać z Dashboardu i funkcji produktu bez ukończenia obligatoryjnego samouczka. | FR-DB-008 |

## QC — Quick Capture

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-QC-001** | Z każdego z siedmiu modułów głównych można wywołać Quick Capture bez wcześniejszego przejścia do Rekrutacji. | FR-QC-001 |
| **AC-QC-002** | Gdy użytkownik wybiera dodawanie ręczne i wpisuje zaakceptowane dane, może zapisać sprawę bez URL-u. | FR-QC-002 |
| **AC-QC-003** | W pojedynczym przebiegu URL użytkownik wprowadza jedną ofertę/link, a system nie inicjuje zbiorczego przetwarzania listy URL-i. | FR-QC-003 |
| **AC-QC-004** | Po odczycie URL dane są przedstawione do sprawdzenia, a zapis nie następuje bez działania akceptującego użytkownika. | FR-QC-004 |
| **AC-QC-005** | Gdy parser URL nie potrafi odczytać oferty, użytkownik może przejść do ręcznego uzupełnienia zamiast tracić możliwość zapisu. | FR-QC-005 |
| **AC-QC-006** | Mając istniejący potencjalnie odpowiadający rekord, podczas dodawania użytkownik otrzymuje sygnał do rozstrzygnięcia; rekordy nie są automatycznie łączone. | FR-QC-006 |
| **AC-QC-007** | Mając zgłoszony duplikat, samo jego wykrycie nie zmienia ani istniejącej, ani nowej sprawy bez świadomej decyzji użytkownika. | FR-QC-007 |
| **AC-QC-008** | Gdy użytkownik wybiera istniejącą sprawę do aktualizacji i zatwierdza operację, aktualizacja odnosi się do wskazanej sprawy, nie do losowo dopasowanej. | FR-QC-008 |
| **AC-QC-009** | Gdy użytkownik uruchamia Quick Capture z Dashboardu i wybiera Zapisz, po pomyślnym zapisie pozostaje na Dashboardzie bez automatycznego otwarcia nowej strony sprawy. | FR-QC-009 |
| **AC-QC-010** | Po pomyślnym Zapisz i dodaj kolejną użytkownik może wprowadzić następną niezależną sprawę bez ponownego szukania globalnej akcji dodawania. | FR-QC-010 |
| **AC-QC-011** | Gdy użytkownik tylko importuje URL i zapisuje ofertę, historia sprawy nie zawiera faktu faktycznej wysyłki aplikacji. | FR-QC-011 |
| **AC-QC-012** | W pierwszym wydaniu Quick Capture nie prezentuje workflow importu wielu URL-i na raz ani obowiązkowego browser extension. | FR-QC-012 |

## IM — CSV/XLSX Import

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-IM-001** | Użytkownik może rozpocząć mapowanie z arkusza CSV oraz XLSX odpowiadającego obsługiwanym ograniczeniom formatu. | FR-IM-001 |
| **AC-IM-002** | Użytkownik może pobrać lub użyć udokumentowanego szablonu pól do przygotowania importu, bez konieczności zgadywania nagłówków. | FR-IM-002 |
| **AC-IM-003** | Mając arkusz z własnymi nagłówkami, użytkownik może wskazać ich odpowiedniki w CRM przed zapisem. | FR-IM-003 |
| **AC-IM-004** | Mając źródłowe nazwy statusów/etapów/wyników, użytkownik ma możliwość wskazania odpowiedników bez cichego dodania niezatwierdzonych wartości. | FR-IM-004 |
| **AC-IM-005** | Gdy użytkownik zakończy mapowanie, widzi podgląd importowanych danych, a w tym momencie żadna sprawa nie jest jeszcze zapisana w wyniku importu. | FR-IM-005 |
| **AC-IM-006** | Mając wiersz niezgodny z określoną walidacją, system oznacza problem i pozwala zidentyfikować wiersz przed decyzją o imporcie. | FR-IM-006 |
| **AC-IM-007** | Mając wiersz potencjalnie odpowiadający istniejącej sprawie, użytkownik widzi sygnał ryzyka duplikatu przed zapisem; samo wykrycie nie scala danych. | FR-IM-007 |
| **AC-IM-008** | Mając błędne i poprawne wiersze, bez akceptacji częściowego importu nie wolno zapisać cichej podgrupy rekordów. | FR-IM-008 |
| **AC-IM-009** | Gdy użytkownik jawnie pomija błędne wiersze i zatwierdza częściowy import, do zapisu kwalifikowane są tylko zaakceptowane rekordy. | FR-IM-009 |
| **AC-IM-010** | Gdy import pomija wiersze, raport zawiera ich identyfikację oraz powód pominięcia, a nie tylko liczbę odrzuceń. | FR-IM-010 |
| **AC-IM-011** | Gdy użytkownik przypadkowo uruchamia ponowny import tego samego wsadu, system wykrywa ryzyko powtórzenia i nie duplikuje cicho zaakceptowanych spraw. | FR-IM-011 |
| **AC-IM-012** | Mając wiersz bez daty wysłania CV, system nie dopisuje bieżącej daty jako historycznej daty aplikowania i nie generuje faktu wysyłki z samego braku danych. | FR-IM-012 |
| **AC-IM-013** | Gdy użytkownik importuje starą zamkniętą lub nierozliczoną historycznie sprawę, samo przyjęcie danych nie generuje zaległej sugestii follow-upu. | FR-IM-013 |
| **AC-IM-014** | Gdy rekord importu wygląda na duplikat, system nie modyfikuje istniejącej sprawy ani nie scala jej bez odrębnej decyzji użytkownika. | FR-IM-014 |

## HE — History & Events

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-HE-001** | Gdy sprawa zawiera kilka zdarzeń i notatek, można je przejrzeć na jednej osi czasu, bez osobnych niezwiązanych historii. | FR-HE-001 |
| **AC-HE-002** | Gdy użytkownik po kilku dniach rejestruje rozmowę, historia wiąże ją z datą rzeczywistej rozmowy, a zapis pozwala odróżnić późniejsze wprowadzenie danych. | FR-HE-002 |
| **AC-HE-003** | Gdy użytkownik poprawia literówkę lub błędny status, system nie pokazuje sztucznego wydarzenia „rozmowa” lub „wysłano aplikację” w historii biznesowej. | FR-HE-003 |
| **AC-HE-004** | Z poziomu kontekstowej sekcji sprawy użytkownik może wprowadzić krótką notatkę bez przechodzenia na pełną stronę formularza. | FR-HE-004 |
| **AC-HE-005** | Gdy użytkownik chce dodać notatkę lub rozbudowane wydarzenie, znajduje odrębne kontekstowe operacje; bardziej złożony formularz nie musi być edytowany inline. | FR-HE-005 |
| **AC-HE-006** | Gdy użytkownik zmienia stan wydarzenia, operacja dotyczy wydarzenia i nie zamyka automatycznie całej sprawy. | FR-HE-006 |
| **AC-HE-007** | Mając wydarzenie z terminem, gdy użytkownik je przekłada, można wskazać nowy termin bez oznaczenia starego terminu jako odbytego. | FR-HE-007 |
| **AC-HE-008** | Mając wydarzenie nierozliczone, gdy użytkownik świadomie potwierdza jego odbycie, dopiero wtedy jest rozpoznane jako odbyte. | FR-HE-008 |
| **AC-HE-009** | Mając wydarzenie zaplanowane, użytkownik może rozliczyć je jako anulowane albo nieodbyte, bez fikcyjnego wpisu „odbyto”. | FR-HE-009 |
| **AC-HE-010** | Gdy użytkownik po fakcie zapisuje rozmowę, system nie wymaga sztucznego tworzenia wcześniejszej rezerwacji w kalendarzu. | FR-HE-010 |
| **AC-HE-011** | Mając nierozliczone wydarzenie z terminem w przeszłości, samo przejście czasu nie zmienia go na odbyte. | FR-HE-011 |
| **AC-HE-012** | Po upływie terminu nierozliczonego wydarzenia użytkownik dostaje propozycję jego rozliczenia zamiast wpisu o automatycznym odbyciu. | FR-HE-012 |
| **AC-HE-013** | Gdy w jednej rozmowie uczestniczą dwie zapisane osoby kontaktowe, wydarzenie może wskazywać obu uczestników bez duplikowania wydarzenia. | FR-HE-013 |

## TN — Tasks & Notifications

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-TN-001** | Użytkownik może zapisać zadanie bez sprawy oraz inne zadanie przypisane do istniejącej sprawy. | FR-TN-001 |
| **AC-TN-002** | Gdy użytkownik zapisuje zadanie bez terminu, pozostaje ono poprawnym zadaniem, a jego tytuł, opis i status można odczytać. | FR-TN-002 |
| **AC-TN-003** | Zadanie powiązane ze sprawą jest dostępne przy tej sprawie i w module Zadania, a zadanie wymagające uwagi może pojawić się na Dashboardzie. | FR-TN-003 |
| **AC-TN-004** | Dla zadania z przypomnieniem użytkownik może otrzymać komunikat wewnątrz aplikacji bez wymuszania kanału e-mail. | FR-TN-004 |
| **AC-TN-005** | Użytkownik ma możliwość wybrania kanału e-mail, przy czym samo utworzenie zadania nie musi oznaczać obowiązkowego wysłania wiadomości e-mail. | FR-TN-005 |
| **AC-TN-006** | Pierwsze MVP nie wymaga konfiguracji ani obsługi powiadomień push. | FR-TN-006 |
| **AC-TN-007** | Po spełnieniu zatwierdzonej reguły można pokazać sugestię follow-upu bez konieczności generowania jej przez model AI. | FR-TN-007 |
| **AC-TN-008** | Gdy pojawia się sugestia, liczba zapisanych zadań nie zwiększa się wyłącznie z tego powodu. | FR-TN-008 |
| **AC-TN-009** | Gdy pojawia się sugestia follow-upu, bez działania użytkownika nie jest wysyłana komunikacja i status sprawy nie przechodzi na Zakończone. | FR-TN-009 |
| **AC-TN-010** | Mając sprawę bez wpisu zwrotnego, system nie przedstawia jako potwierdzonego faktu, że rekruter na pewno nie odpowiedział. | FR-TN-010 |
| **AC-TN-011** | Gdy sprawa ma otwarte zadania lub wydarzenia, zamknięcie nie przebiega bez decyzji anuluj, zachowaj lub odłącz dla tych elementów. | FR-TN-011 |

## DO — Documents

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-DO-001** | Użytkownik może przejść do centralnego widoku dokumentów bez otwierania pojedynczej sprawy. | FR-DO-001 |
| **AC-DO-002** | Mając jeden dokument w bibliotece, użytkownik może powiązać go z dwiema sprawami bez obowiązkowego tworzenia odrębnej kopii logicznej dla każdej sprawy. | FR-DO-002 |
| **AC-DO-003** | Użytkownik może dodać załącznik wyłącznie do wybranej sprawy bez obowiązkowego zapisania go w centralnej bibliotece. | FR-DO-003 |
| **AC-DO-004** | Mając dwie wersje CV, użytkownik potrafi je rozróżnić jako odrębne wersje przy pracy ze sprawami. | FR-DO-004 |
| **AC-DO-005** | Mając CV A i CV B, gdy użytkownik zarejestruje faktyczne wysłanie CV A, historia aplikacji rozróżnia ją od niewysłanej wersji B. | FR-DO-005 |
| **AC-DO-006** | Gdy użytkownik jedynie dodaje CV do sprawy, żaden fakt wysyłki CV nie pojawia się automatycznie. | FR-DO-006 |
| **AC-DO-007** | Mając plik w bibliotece, użytkownik może powiązać go z wybraną sprawą bez ponownego uploadu. | FR-DO-007 |
| **AC-DO-008** | Po wybraniu trybu „tylko do sprawy” dokument jest związany ze wskazaną sprawą, bez oznaczania go automatycznie jako wielokrotnego użytku. | FR-DO-008 |
| **AC-DO-009** | Po wyborze dodania do biblioteki dokument staje się dostępny w centralnej bibliotece zgodnie z zasadami prywatności. | FR-DO-009 |
| **AC-DO-010** | Próba odczytu prywatnego pliku poza uprawnionym kontekstem nie może ujawnić jego zawartości; mechanizm i przypadki security zostaną doprecyzowane przed wdrożeniem. | FR-DO-010 |

## CC — Companies & Contacts

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-CC-001** | Użytkownik może odnaleźć profil organizacji i profil osoby niezależnie od karty pojedynczej sprawy. | FR-CC-001 |
| **AC-CC-002** | Mając agencję, rekrutera i pracodawcę, system nie wymusza przypisania wszystkich trzech ról temu samemu obiektowi. | FR-CC-002 |
| **AC-CC-003** | Gdy agencja kontaktuje się o nieujawnionym kliencie, można zapisać sprawę i agencję bez podstawienia fikcyjnego pracodawcy. | FR-CC-003 |
| **AC-CC-004** | Do jednej sprawy można powiązać dwie różne osoby kontaktowe bez tworzenia dwóch spraw. | FR-CC-004 |
| **AC-CC-005** | Mając jeden kontakt i dwie sprawy, można powiązać tę samą osobę z oboma procesami bez duplikacji profilu. | FR-CC-005 |
| **AC-CC-006** | Użytkownik może zapisać profil kontaktu bez tworzenia pustej sprawy. | FR-CC-006 |
| **AC-CC-007** | Mając kontakt bez sprawy, gdy użytkownik chce zapisać z nim korespondencję, system wymaga powiązania z konkretną sprawą przed utrwaleniem komunikacji. | FR-CC-007 |
| **AC-CC-008** | Po otwarciu profilu organizacji użytkownik może przejrzeć rzeczywiście powiązane sprawy i kontakty. | FR-CC-008 |
| **AC-CC-009** | Mając jedną osobę w dwóch sprawach, historia osoby zawiera fakty, w których ta osoba uczestniczyła, z obu spraw, w kolejności rzeczywistych dat. | FR-CC-009 |
| **AC-CC-010** | Gdy osoba uczestniczy w wydarzeniu danej sprawy, przeglądanie obu profili prowadzi do jednego logicznego zdarzenia, a nie dwóch niezależnych kopii. | FR-CC-010 |
| **AC-CC-011** | Mając dwie aplikacje do jednej firmy na inne role, profil organizacji pokazuje obie sprawy jako odrębne procesy. | FR-CC-011 |

## GS — Global Search

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-GS-001** | Gdy użytkownik wpisuje rozpoznawalną nazwę stanowiska ze sprawy, wyniki uwzględniają odpowiednią sprawę. | FR-GS-001 |
| **AC-GS-002** | Gdy użytkownik wyszukuje nazwę firmy, wynik może prowadzić do jej profilu. | FR-GS-002 |
| **AC-GS-003** | Gdy użytkownik wyszukuje rozpoznawalne dane kontaktu, wynik może otworzyć profil osoby. | FR-GS-003 |
| **AC-GS-004** | Gdy użytkownik wyszukuje URL przypięty do sprawy, może znaleźć odpowiedni kontekst tej sprawy. | FR-GS-004 |
| **AC-GS-005** | Mając unikalny tekst notatki z dawnej rozmowy, gdy użytkownik go wyszukuje, znajduje odpowiedni kontekst. | FR-GS-005 |
| **AC-GS-006** | Mając tekst opisu rozmowy, użytkownik może wyszukać powiązane wydarzenie lub kontekst sprawy. | FR-GS-006 |
| **AC-GS-007** | Gdy zapytanie pasuje do firmy i notatki, wyniki rozróżniają grupy typów zamiast łączyć wszystkie rekordy bez etykiety. | FR-GS-007 |
| **AC-GS-008** | Po wybraniu trafienia w notatkę lub firmę użytkownik może otworzyć właściwy kontekst, także dla zakończonej sprawy. | FR-GS-008 |

## AD — Account & Data Management

**Granica:** `AC-AD-001/002` weryfikują niezmienniki `APPROVED` (bez wyboru mechanizmu). `AC-AD-003`–`009` są wyłącznie warunkowymi kryteriami dla `FR PROPOSED`; nie mogą zostać uznane za wdrożeniowe testy MVP przed zgodą PO i zamknięciem odpowiednich `OPEN`.

| ID | Status FR / Given–When–Then (na poziomie niezmiennika) | FR |
|---|---|---|
| **AC-AD-001** | APPROVED: Mając użytkownika po pomyślnym logowaniu, gdy wchodzi do produktu, otrzymuje swój Dashboard bez obowiązkowego onboardingu; metoda uwierzytelnienia jest `OPEN-013`. | FR-AD-001 |
| **AC-AD-002** | APPROVED: Mając konta A i B oraz prywatne dane A, gdy B próbuje je odczytać przez widok, wyszukiwanie lub pobranie pliku, nie uzyskuje danych A; A zachowuje dostęp do swoich uprawnionych rekordów. Konkretny model dostępu `OPEN-013`. | FR-AD-002 |
| **AC-AD-003** | PROPOSED: Jeśli PO dopuści samorejestrację, gdy nowa osoba przejdzie zatwierdzony proces, może otrzymać własne konto bez odziedziczenia danych innych kont; pola i aktywacja `OPEN-041`. | FR-AD-003 |
| **AC-AD-004** | PROPOSED: Jeśli wylogowanie zostanie zatwierdzone, po jego wykonaniu dotychczasowy dostęp do prywatnego workspace'u wymaga ponownej autoryzacji zgodnie z `OPEN-042`. | FR-AD-004 |
| **AC-AD-005** | PROPOSED: Jeśli zostanie zatwierdzona polityka sesji, dostęp w czasie trwania i po zakończeniu sesji respektuje tę politykę; czasy i mechanizm `OPEN-013/042`. | FR-AD-005 |
| **AC-AD-006** | PROPOSED: Jeśli zatwierdzono odzyskiwanie, uprawniony użytkownik może odzyskać dostęp bez uzyskania dostępu do cudzego konta; procedura i komunikaty `OPEN-043`. | FR-AD-006 |
| **AC-AD-007** | PROPOSED: Jeśli zatwierdzono edycję profilu, właściciel może zmienić dozwolone pola swojego profilu, ale nie cudzego; lista pól `OPEN-044`. | FR-AD-007 |
| **AC-AD-008** | PROPOSED: Jeśli zatwierdzono eksport, tylko uprawniony właściciel może uruchomić i odebrać eksport w ustalonym zakresie; zakres/format `OPEN-032/045`. | FR-AD-008 |
| **AC-AD-009** | PROPOSED: Jeśli zatwierdzono usuwanie konta, żądanie wymaga weryfikacji uprawnienia i respektuje zatwierdzoną politykę danych/powiązań; skutki i retencja `OPEN-005/006/032/046`. | FR-AD-009 |

## NV — Navigation

| ID | Test akceptacji (Given / When / Then, opisowo) | Powiązany FR |
|---|---|---|
| **AC-NV-001** | W strukturze nawigacji użytkownik może przejść do każdego z siedmiu zatwierdzonych obszarów bez zgadywania nieistniejących modułów. | FR-NV-001 |
| **AC-NV-002** | Mając otwarty dowolny z siedmiu modułów, użytkownik może z niego bezpośrednio uruchomić Global Search. | FR-NV-002 |
| **AC-NV-003** | Mając otwarty dowolny z siedmiu modułów, użytkownik może z niego bezpośrednio uruchomić Quick Capture. | FR-NV-003 |

## Warunki akceptacji specyfikacji

1. Każdy `FR-*` musi mieć co najmniej jedno AC; dodatkowe AC stosują sufiksy `-01`, `-02` itd.
2. AC zależne od `OPEN` pozostaje scenariuszem kontrolnym, ale jego szczegółowe dane wejściowe będą sprecyzowane po decyzji PO.
3. Dla implementacji wprowadź testy negatywne z [UC/TC](scenarios.md) i security/regresje; nie deklaruj wykonania testu na podstawie samego dokumentu.



## Dodatkowe niezależne kryteria dla ryzykownych FR

**Status testów:** `PLANNED / NOT EXECUTED`. Szczegóły zależne od `OPEN` nie są tu przesądzane.

| ID | Warunek | FR |
|---|---|---|
| **AC-LC-015-01** | Ręczna korekta nie dodaje fikcyjnego kontaktu, CV ani zaproszenia; audyt korekt OPEN-004/020. | FR-LC-015 |
| **AC-LC-016-01** | Bez wyniku zamknięcia nie powstaje zakończenie ani zmiana na Zakończone; słownik OPEN-001. | FR-LC-016 |
| **AC-LC-017-01** | Ponowne zamknięcie po wznowieniu nie nadpisuje poprzedniego wyniku. | FR-LC-017 |
| **AC-LC-018-01** | Nierozstrzygnięte otwarte zadanie/wydarzenie blokuje ciche zamknięcie; szczegóły opcji OPEN-029. | FR-LC-018 |
| **AC-LC-019-01** | Wznowienie pozostawia poprzednie zakończenia i pozwala na następny cykl. | FR-LC-019 |
| **AC-IM-006-01** | Błędy mapowania są jawne w podglądzie; nieznane wartości OPEN-022. | FR-IM-006 |
| **AC-IM-008-01** | Brak zgody na partial import nie pozwala cicho zapisać wybranych wierszy. | FR-IM-008 |
| **AC-IM-010-01** | Raport wyjaśnia powód pominięcia każdego wiersza; forma po awarii OPEN-010. | FR-IM-010 |
| **AC-IM-011-01** | Ponowiony wsad nie może cicho zdublować danych; identyfikacja i retry OPEN-035/010. | FR-IM-011 |
| **AC-IM-012-01** | Brak daty nie generuje bieżącej fikcyjnej daty wysłania ani zdarzeń. | FR-IM-012 |
| **AC-IM-014-01** | Aktualizacja istniejącej sprawy po konflikcie wymaga jawnej decyzji; współbieżność OPEN-010/024. | FR-IM-014 |
| **AC-DO-002-01** | Ten sam dokument z biblioteki można użyć w dwóch sprawach bez utraty identyfikacji wysłanej wersji. | FR-DO-002 |
| **AC-DO-005-01** | Podłączenie nowszej wersji nie zastępuje historycznie wysłanej wersji CV; retencja OPEN-006/036. | FR-DO-005 |
| **AC-DO-010-01** | Nieuprawniony użytkownik nie może odczytać dokumentu ani prywatnych metadanych; mechanizm OPEN-013. | FR-DO-010 |
| **AC-HE-002-01** | Korekta rzeczywistej daty wpływa na chronologię, nie fałszuje daty wpisu; zasady OPEN-004. | FR-HE-002 |
| **AC-HE-003-01** | Korekta techniczna nie pojawia się jako fikcyjne wydarzenie biznesowe. | FR-HE-003 |
| **AC-HE-007-01** | Przełożenie zachowuje dawny termin tego samego wydarzenia bez statusu Przełożone; enum OPEN-021. | FR-HE-007 |
| **AC-HE-008-01** | Odbycie wymaga świadomego potwierdzenia; sama zmiana terminu nie wystarcza. | FR-HE-008 |
| **AC-HE-011-01** | Upływ czasu nie oznacza nierozliczonego spotkania jako odbytego. | FR-HE-011 |
| **AC-HE-012-01** | Sugestia rozliczenia nie zmienia sama statusu wydarzenia. | FR-HE-012 |
