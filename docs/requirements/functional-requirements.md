# Katalog wymagań funkcjonalnych — FR

**Stan:** `BASELINED` na 2026-10-27. Wymagania są formalizacją jawnie zatwierdzonego zakresu (`APPROVED`). Ich szczegóły, gdy oznaczono `OPEN`, **nie** są zatwierdzone. Wszystkie pozycje należą do zakresu publicznego **MVP**, nie ustalają kolejności implementacji. Kolejność realizacji pozostaje `OPEN` — nie przypisujemy sztucznego rankingu Must/Should.

**Legenda:** `ID` to trwały identyfikator, `DEC/BR` to normatywne źródła, `OPEN` to zależności do rozstrzygnięcia przed implementacją danego przepływu, `AC` to jednoznaczny warunek w [katalogu AC](../quality/acceptance-criteria.md). Status każdego FR poniżej: `APPROVED` **w podanym zakresie**.

Każdy FR ma co najmniej jedno testowalne AC. Macierz powiązań ze scenariuszami i testami E2E: [traceability](../quality/traceability.md).


## LC — Recruitment Lifecycle & Stages

**Specyfikacja:** [Recruitment Lifecycle & Stages](../features/recruitment-lifecycle.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-LC-001** | Użytkownik może utworzyć sprawę bez powiązanego ogłoszenia i bez konkretnego stanowiska. | DEC-001/DEC-002 BR-001 | OPEN-002 | AC-LC-001 |
| **FR-LC-002** | System obsługuje zapis oferty, aplikację na ofertę, spontaniczną kandydaturę, kontakt inicjowany przez rekrutera i kontakt inicjowany przez kandydata bez CV. | DEC-002 BR-001 | OPEN-002 | AC-LC-002 |
| **FR-LC-003** | Organizacja może mieć wiele niezależnych spraw rekrutacyjnych. | DEC-003 BR-002 | OPEN-024 | AC-LC-003 |
| **FR-LC-004** | Sprawa używa tylko czterech zatwierdzonych statusów ogólnych, bez stanu Wstrzymane. | DEC-004/DEC-005 BR-003 | OPEN-020 | AC-LC-004 |
| **FR-LC-005** | Użytkownik może oznaczyć faktycznie wysłaną aplikację bez automatycznego uznania rozpoczęcia kwalifikacji. | DEC-006/DEC-009 BR-004 | OPEN-002 | AC-LC-005 |
| **FR-LC-006** | Użytkownik może zarejestrować rzeczywisty kontakt inbound lub outbound, także bez wysłanego CV. | DEC-002/DEC-009 BR-001/BR-018 | OPEN-002 | AC-LC-006 |
| **FR-LC-007** | System odróżnia kwalifikujące zaproszenie od potwierdzenia aplikacji i umożliwia rozpoczęcie aktywnej rekrutacji na podstawie zaproszenia. | DEC-006 BR-004/BR-005 | OPEN-018 | AC-LC-007 |
| **FR-LC-008** | Status ogólny sprawy jest odrębny od jej szczegółowego etapu. | DEC-007 BR-006 | OPEN-034 | AC-LC-008 |
| **FR-LC-009** | System udostępnia standardowy domyślny zestaw etapów rekrutacji. | DEC-008 BR-006 | OPEN-027 | AC-LC-009 |
| **FR-LC-010** | Użytkownik może dostosować globalny zestaw etapów. | DEC-008 BR-006 | OPEN-003/OPEN-027 | AC-LC-010 |
| **FR-LC-011** | Użytkownik może dostosować zestaw etapów indywidualnej sprawy. | DEC-008 BR-006 | OPEN-003 | AC-LC-011 |
| **FR-LC-012** | Możliwe jest pominięcie etapów rekrutacji. | DEC-008 BR-006 | OPEN-027/OPEN-034 | AC-LC-012 |
| **FR-LC-013** | Historia zmian szczegółowego etapu jest zachowywana. | DEC-008/DEC-022 BR-006/BR-015 | OPEN-004 | AC-LC-013 |
| **FR-LC-014** | System udostępnia jawne akcje biznesowe do zmian cyklu życia sprawy. | DEC-009 BR-007 | OPEN-018/OPEN-020 | AC-LC-014 |
| **FR-LC-015** | Możliwa jest korekta błędnego statusu bez produkowania fikcyjnego faktu biznesowego. | DEC-009/DEC-022 BR-007/BR-016 | OPEN-004/OPEN-020 | AC-LC-015 |
| **FR-LC-016** | Zamknięcie sprawy wymaga wyniku zakończenia. | DEC-010 BR-008 | OPEN-001/OPEN-002 | AC-LC-016 |
| **FR-LC-017** | Zakończenia pozostają częścią historii sprawy. | DEC-010/DEC-012 BR-010 | OPEN-004 | AC-LC-017 |
| **FR-LC-018** | Przy zamknięciu użytkownik rozstrzyga otwarte zadania i wydarzenia przez anulowanie, zachowanie lub odłączenie. | DEC-013 BR-011 | OPEN-029 | AC-LC-018 |
| **FR-LC-019** | Użytkownik może wznowić sprawę bez usuwania jej wcześniejszych zakończeń. | DEC-012 BR-010 | OPEN-019/OPEN-020 | AC-LC-019 |
| **FR-LC-020** | System nie zamyka automatycznie sprawy wyłącznie z powodu braku odpowiedzi. | DEC-011/DEC-028 BR-009 | OPEN-008 | AC-LC-020 |
| **FR-LC-021** | Zakończoną sprawę można przeglądać i wyszukać. | DEC-010/DEC-012 BR-012 | OPEN-005/OPEN-038 | AC-LC-021 |
| **FR-LC-022** | Użytkownik może utworzyć nową niezależną sprawę po wcześniejszej, zakończonej rekrutacji tej firmy. | DEC-012 BR-002/BR-010 | OPEN-019/OPEN-024 | AC-LC-022 |
| **FR-LC-023** | Sprawa może zawierać wiele uporządkowanych odnośników różnego typu, w tym główne i dodatkowe ogłoszenia, formularz, stronę firmy, profil oraz link do korespondencji. | DEC-014 BR-013 | OPEN-025/OPEN-026 | AC-LC-023 |
| **FR-LC-024** | System przechowuje źródło znalezienia oferty oddzielnie od rzeczywistego kanału aplikowania. | DEC-015 BR-014 | OPEN-002/OPEN-026 | AC-LC-024 |
| **FR-LC-025** | URL do korespondencji jest tylko odnośnikiem i sam nie zapewnia systemowi dostępu do treści rozmowy. | DEC-015 BR-014 | OPEN-013/OPEN-025 | AC-LC-025 |

## RW — Recruitment Workspace

**Specyfikacja:** [Recruitment Workspace](../features/recruitment-workspace.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-RW-001** | Domyślnym widokiem modułu Rekrutacje jest Kanban. | DEC-019 | OPEN-017 | AC-RW-001 |
| **FR-RW-002** | Kolumny Kanbana odpowiadają czterem ogólnym statusom sprawy. | DEC-019 BR-003 | OPEN-028 | AC-RW-002 |
| **FR-RW-003** | Kolumna Zakończone jest dostępna, lecz domyślnie zwinięta. | DEC-019 | OPEN-017 | AC-RW-003 |
| **FR-RW-004** | Karty Kanbana prezentują szczegółowe etapy rekrutacji niezależnie od kolumn statusu. | DEC-019 BR-006 | OPEN-034 | AC-RW-004 |
| **FR-RW-005** | Rekrutacje mają alternatywny widok listy tych samych spraw. | DEC-019 | OPEN-017 | AC-RW-005 |
| **FR-RW-006** | Workspace udostępnia standardowe filtry, sortowanie i gotowe szybkie widoki. | DEC-019 | OPEN-028 | AC-RW-006 |
| **FR-RW-007** | Pierwsze MVP nie ma własnych zapisywanych konfiguracji filtrów. | DEC-049 | OPEN-028 | AC-RW-007 |
| **FR-RW-008** | Drag & drop zmiany statusu respektuje akcje biznesowe i wymagane walidacje. | DEC-009/DEC-019 BR-005/BR-007/BR-008/BR-011 | OPEN-018/OPEN-028/OPEN-029 | AC-RW-008 |
| **FR-RW-009** | Szczegóły sprawy dostępne są w lekkim drawerze oraz na pełnej stronie. | DEC-020 | OPEN-017 | AC-RW-009 |
| **FR-RW-010** | Pełna strona sprawy eksponuje jedną centralną oś czasu. | DEC-020 BR-015 | OPEN-017 | AC-RW-010 |
| **FR-RW-011** | Pełna strona sprawy udostępnia kontekst dokumentów, zadań, osób, źródeł i warunków. | DEC-020 | OPEN-002/OPEN-017 | AC-RW-011 |

## DB — Dashboard

**Specyfikacja:** [Dashboard](../features/dashboard.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-DB-001** | Dashboard jest pierwszym ekranem po zalogowaniu. | DEC-016/DEC-018 | OPEN-013 | AC-DB-001 |
| **FR-DB-002** | Dashboard prezentuje zadania wymagające uwagi. | DEC-016/DEC-026 | OPEN-040 | AC-DB-002 |
| **FR-DB-003** | Dashboard pokazuje nadchodzące wydarzenia. | DEC-016/DEC-023 | OPEN-021/OPEN-037 | AC-DB-003 |
| **FR-DB-004** | Dashboard pokazuje proaktywne sugestie systemowe oparte na regułach. | DEC-016/DEC-028 BR-020 | OPEN-008 | AC-DB-004 |
| **FR-DB-005** | Dashboard prezentuje niedawną istotną aktywność. | DEC-016/DEC-022 BR-016 | OPEN-039 | AC-DB-005 |
| **FR-DB-006** | Dashboard pokazuje zwięzłe statystyki procesów. | DEC-016 | OPEN-039 | AC-DB-006 |
| **FR-DB-007** | Dashboard nie zawiera odrębnej listy ostatnich rekrutacji ani pełnego Kanbana. | DEC-016 | — | AC-DB-007 |
| **FR-DB-008** | Korzystanie z produktu nie wymaga obowiązkowego onboardingu. | DEC-018 | — | AC-DB-008 |

## QC — Quick Capture

**Specyfikacja:** [Quick Capture](../features/quick-capture.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-QC-001** | Globalny Quick Capture jest dostępny z dowolnego modułu. | DEC-017/DEC-029 | OPEN-017 | AC-QC-001 |
| **FR-QC-002** | Quick Capture pozwala ręcznie dodać sprawę. | DEC-029 BR-001 | OPEN-002 | AC-QC-002 |
| **FR-QC-003** | Smart Import przyjmuje pojedynczy URL oferty na operację. | DEC-029/DEC-049 | OPEN-011/OPEN-025 | AC-QC-003 |
| **FR-QC-004** | Dane odczytane przez Smart Import wymagają weryfikacji przed zapisem. | DEC-029 BR-021 | OPEN-002/OPEN-011 | AC-QC-004 |
| **FR-QC-005** | Nieudany odczyt URL oferuje ręczny fallback. | DEC-030 | OPEN-011 | AC-QC-005 |
| **FR-QC-006** | Podczas dodawania system sygnalizuje potencjalne duplikaty spraw. | DEC-031 BR-022 | OPEN-024/OPEN-025 | AC-QC-006 |
| **FR-QC-007** | Quick Capture nie scala ani nie nadpisuje istniejących spraw bez zgody użytkownika. | DEC-031 BR-022 | OPEN-024 | AC-QC-007 |
| **FR-QC-008** | Użytkownik może świadomie wybrać aktualizację istniejącej sprawy podczas dodawania. | DEC-031 | OPEN-024/OPEN-002 | AC-QC-008 |
| **FR-QC-009** | Akcja Zapisz pozostawia użytkownika w dotychczasowym widoku. | DEC-032 BR-029 | — | AC-QC-009 |
| **FR-QC-010** | Quick Capture oferuje akcję Zapisz i dodaj kolejną. | DEC-032 BR-029 | — | AC-QC-010 |
| **FR-QC-011** | Sam zapis linku lub wyniku Smart Import nie oznacza wysłania aplikacji. | DEC-015/DEC-029 BR-014/BR-021 | — | AC-QC-011 |
| **FR-QC-012** | Pierwsze MVP nie udostępnia zbiorczego importu URL-i ani rozszerzenia przeglądarki. | DEC-049 | — | AC-QC-012 |

## IM — CSV/XLSX Import

**Specyfikacja:** [CSV/XLSX Import](../features/csv-xlsx-import.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-IM-001** | Import akceptuje własne dane CSV i XLSX. | DEC-033 | OPEN-007/OPEN-023 | AC-IM-001 |
| **FR-IM-002** | Dostępny jest gotowy szablon importu danych. | DEC-033 | OPEN-002/OPEN-023 | AC-IM-002 |
| **FR-IM-003** | Import pozwala mapować kolumny źródłowe na pola domenowe. | DEC-033 | OPEN-002/OPEN-023 | AC-IM-003 |
| **FR-IM-004** | Import umożliwia mapowanie statusów, etapów i wyników zamknięcia. | DEC-033 | OPEN-001/OPEN-022/OPEN-027 | AC-IM-004 |
| **FR-IM-005** | Import pokazuje podgląd danych przed zatwierdzeniem zapisu. | DEC-034 BR-021 | OPEN-010 | AC-IM-005 |
| **FR-IM-006** | Import identyfikuje błędy danych i mapowania przed zatwierdzeniem. | DEC-034 | OPEN-002/OPEN-022/OPEN-023 | AC-IM-006 |
| **FR-IM-007** | Import identyfikuje potencjalne duplikaty. | DEC-034 BR-022 | OPEN-024/OPEN-035 | AC-IM-007 |
| **FR-IM-008** | Częściowy import wymaga wyraźnego zatwierdzenia użytkownika. | DEC-035 BR-023 | OPEN-010 | AC-IM-008 |
| **FR-IM-009** | Użytkownik może pominąć problematyczne wiersze. | DEC-035 BR-023 | OPEN-010/OPEN-022 | AC-IM-009 |
| **FR-IM-010** | Po imporcie dostępny jest raport wierszy pominiętych wraz z przyczynami. | DEC-036 BR-023 | OPEN-010 | AC-IM-010 |
| **FR-IM-011** | System chroni przed przypadkowym dwukrotnym importem tego samego materiału. | DEC-037 BR-025 | OPEN-035 | AC-IM-011 |
| **FR-IM-012** | Import nie fabrykuje brakujących dat ani nieistniejącej historii działań. | DEC-036 BR-024 | OPEN-004/OPEN-022 | AC-IM-012 |
| **FR-IM-013** | Import historycznych spraw nie uruchamia zaległych sugestii. | DEC-037 BR-024 | OPEN-008 | AC-IM-013 |
| **FR-IM-014** | Import rozróżnia utworzenie nowej sprawy i świadomą aktualizację istniejącej w sytuacji duplikatu. | DEC-031/DEC-034 BR-022 | OPEN-024/OPEN-035 | AC-IM-014 |

## HE — History & Events

**Specyfikacja:** [History & Events](../features/history-and-events.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-HE-001** | Pełna strona sprawy prezentuje jedną chronologiczną historię istotnych zdarzeń i notatek. | DEC-020/DEC-022 BR-015 | OPEN-004 | AC-HE-001 |
| **FR-HE-002** | Historia rozróżnia rzeczywistą datę zdarzenia od czasu zapisania go w CRM. | DEC-022 BR-015 | OPEN-002/OPEN-037 | AC-HE-002 |
| **FR-HE-003** | Oś czasu nie jest przeciążana technicznymi aktualizacjami i nie tworzy fikcyjnych zdarzeń z korekt. | DEC-022 BR-016 | OPEN-004/OPEN-020 | AC-HE-003 |
| **FR-HE-004** | Krótką notatkę można dodać inline. | DEC-021 | OPEN-002/OPEN-017 | AC-HE-004 |
| **FR-HE-005** | Operacje dodawania są dostępne przez odrębne małe przyciski i kontekstowe Dodaj nowe, a złożone formularze przez dialogi. | DEC-021 | OPEN-017 | AC-HE-005 |
| **FR-HE-006** | Wydarzenie kalendarza ma własny cykl życia niezależny od statusu sprawy. | DEC-023 BR-017 | OPEN-021 | AC-HE-006 |
| **FR-HE-007** | Użytkownik może przełożyć zaplanowane wydarzenie. | DEC-023 | OPEN-021/OPEN-037 | AC-HE-007 |
| **FR-HE-008** | Użytkownik może oznaczyć wydarzenie jako odbyte. | DEC-023 BR-017 | OPEN-021 | AC-HE-008 |
| **FR-HE-009** | Użytkownik może oznaczyć wydarzenie jako anulowane lub nieodbyte. | DEC-023 BR-017 | OPEN-021 | AC-HE-009 |
| **FR-HE-010** | Użytkownik może dodać odbytą rozmowę bez wcześniejszego planowania wydarzenia. | DEC-023 BR-017 | OPEN-002/OPEN-004 | AC-HE-010 |
| **FR-HE-011** | Sam upływ terminu nie oznacza automatycznie odbycia wydarzenia. | DEC-024 BR-017 | — | AC-HE-011 |
| **FR-HE-012** | System proponuje potwierdzenie wydarzenia, które minęło bez rozliczenia. | DEC-024 BR-017 | OPEN-021 | AC-HE-012 |
| **FR-HE-013** | Jedno wydarzenie może obejmować wielu uczestników. | DEC-025 BR-027 | OPEN-021/OPEN-030 | AC-HE-013 |

## TN — Tasks & Notifications

**Specyfikacja:** [Tasks & Notifications](../features/tasks-and-notifications.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-TN-001** | Użytkownik może tworzyć zadania ogólne i powiązane z konkretną sprawą. | DEC-026 | OPEN-002 | AC-TN-001 |
| **FR-TN-002** | Zadanie posiada tytuł, opcjonalny termin, opis i status. | DEC-026 | OPEN-002/OPEN-040 | AC-TN-002 |
| **FR-TN-003** | Zadania są dostępne na Dashboardzie i w odpowiednich kontekstach. | DEC-026 | OPEN-040 | AC-TN-003 |
| **FR-TN-004** | Dostępne są przypomnienia wewnątrz aplikacji. | DEC-027 | OPEN-009 | AC-TN-004 |
| **FR-TN-005** | Można opcjonalnie korzystać z przypomnień e-mail. | DEC-027 | OPEN-009/OPEN-013 | AC-TN-005 |
| **FR-TN-006** | Powiadomienia push nie są funkcją pierwszego wydania. | DEC-027 | — | AC-TN-006 |
| **FR-TN-007** | System udostępnia proaktywne sugestie regułowe, np. follow-up. | DEC-028 | OPEN-008 | AC-TN-007 |
| **FR-TN-008** | Sugestia nie tworzy automatycznie zadania. | DEC-028 BR-020 | OPEN-008 | AC-TN-008 |
| **FR-TN-009** | System nie wysyła automatycznie wiadomości ani nie zamyka spraw na podstawie sugestii. | DEC-028 BR-009/BR-020 | — | AC-TN-009 |
| **FR-TN-010** | System nie utożsamia braku zarejestrowanej odpowiedzi z faktycznym brakiem odpowiedzi. | DEC-028 BR-009 | OPEN-008 | AC-TN-010 |
| **FR-TN-011** | Przy zamknięciu sprawy trzeba rozstrzygnąć otwarte zadania i wydarzenia. | DEC-013 BR-011 | OPEN-029/OPEN-040 | AC-TN-011 |

## DO — Documents

**Specyfikacja:** [Documents](../features/documents.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-DO-001** | System udostępnia centralną bibliotekę dokumentów. | DEC-039 | OPEN-006/OPEN-007 | AC-DO-001 |
| **FR-DO-002** | Dokumenty w bibliotece mogą być wielokrotnie wykorzystywane. | DEC-039 | OPEN-005/OPEN-006 | AC-DO-002 |
| **FR-DO-003** | System obsługuje załączniki należące tylko do konkretnej sprawy. | DEC-039 | OPEN-006/OPEN-007 | AC-DO-003 |
| **FR-DO-004** | System rozróżnia wersje CV. | DEC-040 | OPEN-036 | AC-DO-004 |
| **FR-DO-005** | Do faktycznie wysłanej aplikacji można przypisać konkretną wersję CV. | DEC-040 BR-026 | OPEN-036 | AC-DO-005 |
| **FR-DO-006** | Samo powiązanie dokumentu ze sprawą nie oznacza jego wysłania. | DEC-040 BR-026 | — | AC-DO-006 |
| **FR-DO-007** | Podczas dodawania do sprawy można wybrać dokument z biblioteki. | DEC-041 | OPEN-006 | AC-DO-007 |
| **FR-DO-008** | Podczas dodawania można umieścić nowy dokument tylko w sprawie. | DEC-041 | OPEN-006/OPEN-007 | AC-DO-008 |
| **FR-DO-009** | Podczas dodawania można umieścić nowy dokument w bibliotece. | DEC-041 | OPEN-006/OPEN-007 | AC-DO-009 |
| **FR-DO-010** | Dokumenty użytkownika muszą być prywatne i bezpieczne. | DEC-039/DEC-041 BR-030 NFR-001 | OPEN-006/OPEN-013/OPEN-032 | AC-DO-010 |

## CC — Companies & Contacts

**Specyfikacja:** [Companies & Contacts](../features/companies-and-contacts.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-CC-001** | System udostępnia lekką centralną bazę organizacji i kontaktów. | DEC-042 | OPEN-002 | AC-CC-001 |
| **FR-CC-002** | Model rozróżnia role pracodawcy, agencji i osoby rekrutującej. | DEC-042 BR-028 | OPEN-002 | AC-CC-002 |
| **FR-CC-003** | Sprawa może nie mieć ujawnionego pracodawcy. | DEC-042 BR-028 | OPEN-002 | AC-CC-003 |
| **FR-CC-004** | Sprawa może mieć wielu kontaktów. | DEC-043 BR-027 | OPEN-002/OPEN-030 | AC-CC-004 |
| **FR-CC-005** | Kontakt może uczestniczyć w wielu sprawach. | DEC-043 BR-027 | OPEN-002/OPEN-030 | AC-CC-005 |
| **FR-CC-006** | Kontakt może istnieć bez powiązanej sprawy. | DEC-044 BR-018 | OPEN-002 | AC-CC-006 |
| **FR-CC-007** | Rejestrowanie komunikacji z kontaktem wymaga wskazania sprawy. | DEC-044 BR-018 | OPEN-002 | AC-CC-007 |
| **FR-CC-008** | Profil firmy prezentuje jej powiązane sprawy i kontakty. | DEC-043 | OPEN-002 | AC-CC-008 |
| **FR-CC-009** | Profil kontaktu prezentuje chronologiczną historię zdarzeń rzeczywiście powiązanych z osobą. | DEC-043 BR-019 | OPEN-004/OPEN-030 | AC-CC-009 |
| **FR-CC-010** | Historia profili osób i spraw nie tworzy odrębnych kopii tego samego zdarzenia. | DEC-043 BR-019/BR-027 | OPEN-004/OPEN-030 | AC-CC-010 |
| **FR-CC-011** | Organizacja może posiadać wiele spraw bez błędnego automatycznego ich łączenia. | DEC-003/DEC-043 BR-002 | OPEN-024 | AC-CC-011 |

## GS — Global Search

**Specyfikacja:** [Global Search](../features/global-search.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-GS-001** | Global Search obejmuje sprawy rekrutacyjne i stanowiska. | DEC-038 | OPEN-038 | AC-GS-001 |
| **FR-GS-002** | Global Search obejmuje organizacje. | DEC-038 | OPEN-038 | AC-GS-002 |
| **FR-GS-003** | Global Search obejmuje kontakty. | DEC-038 | OPEN-038 | AC-GS-003 |
| **FR-GS-004** | Global Search obejmuje URL-e powiązane ze sprawami. | DEC-038 BR-014 | OPEN-025/OPEN-038 | AC-GS-004 |
| **FR-GS-005** | Global Search obejmuje notatki. | DEC-038 | OPEN-038 | AC-GS-005 |
| **FR-GS-006** | Global Search obejmuje opisy wydarzeń. | DEC-038 | OPEN-038 | AC-GS-006 |
| **FR-GS-007** | Wyniki wyszukiwania są grupowane według typu rekordu. | DEC-038 | OPEN-038 | AC-GS-007 |
| **FR-GS-008** | Wynik wyszukiwania pozwala otworzyć odpowiedni rekord lub kontekst. | DEC-038 BR-012 | OPEN-005/OPEN-038 | AC-GS-008 |

## NV — Navigation

**Specyfikacja UX:** [Architektura informacji](../ux/information-architecture.md)

| ID | Wymaganie (`APPROVED`, MVP) | Powiązane `DEC/BR` | Bramka `OPEN` | Test akceptacyjny |
|---|---|---|---|---|
| **FR-NV-001** | Główna nawigacja zawiera siedem modułów: Dashboard, Rekrutacje, Zadania, Kalendarz, Dokumenty, Firmy, Kontakty. | DEC-017 | OPEN-017 | AC-NV-001 |
| **FR-NV-002** | Global Search można wywołać z każdego z siedmiu modułów. | DEC-017 | OPEN-017 | AC-NV-002 |
| **FR-NV-003** | Quick Capture można wywołać z każdego z siedmiu modułów. | DEC-017 | OPEN-017 | AC-NV-003 |

## Uwagi dotyczące testowalności

- Kryteria pokazują najprostszy test graniczny. Bez zatwierdzenia pól, słowników i progów nie implementuj fałszywych, „pełnych” kontraktów danych.
- Wymagania `DEFERRED` znajdują się w [zakresie produktu](../product/vision-and-scope.md) i [DEC](../decisions/product-decisions.md); brak implementacji nie jest brakiem wymagań MVP.
- Powiązania z `BR` nie zastępują sprawdzania niezmienników we wszystkich istotnych akcjach (Quick Capture, import, DnD, wyszukiwanie).

