# Reguły biznesowe (BR) — kanoniczny katalog

**Stan:** `BASELINED`. Każda reguła to interpretacja zatwierdzonego baseline'u; nierozstrzygnięte szczegóły zawierają odniesienia `OPEN`. Reguły dotyczą zachowania, nie technologii.

| ID | Reguła (`APPROVED`) | Źródło |
|---|---|---|
| BR-001 | Rekrutacyjna sprawa to odrębny obiekt od firmy i ogłoszenia; brak ogłoszenia lub stanowiska nie wyklucza sprawy. | DEC-001/DEC-002 |
| BR-002 | Jedna firma może mieć wiele spraw; nie scala się ich z powodu samej zgodności organizacji. | DEC-003 |
| BR-003 | Dozwolone statusy ogólne to wyłącznie: Zapisane, Kontakt rozpoczęty, W rekrutacji, Zakończone. Bez Wstrzymane. | DEC-004/DEC-005 |
| BR-004 | Rejestracja samej aplikacji lub automatycznego potwierdzenia nie jest podstawą do statusu W rekrutacji. | DEC-006 |
| BR-005 | W rekrutacji wymaga zaproszenia do kwalifikacyjnego etapu; semantyka łączenia akcji jest `OPEN-018`. | DEC-006 |
| BR-006 | Status ogólny i etap to niezależne atrybuty; zmiany etapu zachowują historię. Niedozwolone kombinacje: `OPEN-034`. | DEC-007/DEC-008 |
| BR-007 | Zmiany cyklu życia odbywają się zwykle akcjami biznesowymi; korekta błędnego statusu nie generuje fałszywej aplikacji, zaproszenia ani kontaktu. | DEC-009 |
| BR-008 | Zamknięcie wymaga wskazania wyniku; do czasu zatwierdzenia słownika nie zakładaj wybranych wartości. | DEC-010; OPEN-001 |
| BR-009 | Brak odpowiedzi nie zamyka sprawy automatycznie ani nie uprawnia do wnioskowania o rzeczywistym braku odpowiedzi. | DEC-011/DEC-028 |
| BR-010 | Wznowienie zachowuje wszystkie poprzednie zakończenia i istotne wpisy historii. | DEC-012 |
| BR-011 | Przy zamknięciu użytkownik rozstrzyga każde otwarte zadanie i wydarzenie: anuluj, zachowaj albo odłącz; dokładne efekty `OPEN-029`. | DEC-013 |
| BR-012 | Zakończone sprawy pozostają dostępne do przeglądania/wyszukiwania. | DEC-010/DEC-012 |
| BR-013 | Sprawa może mieć wiele URL-i; nie zakładaj, że publikacja/oferta jest pojedyncza. | DEC-014 |
| BR-014 | Źródło znalezienia jest inne niż kanał użyty do aplikacji; posiadanie URL do korespondencji nie daje systemowi dostępu do treści. | DEC-015 |
| BR-015 | Oś czasu porządkuje zdarzenia wg daty wystąpienia, nie automatycznie wg daty wprowadzenia do CRM. | DEC-022 |
| BR-016 | Korekta danych nie może udawać nowego zdarzenia biznesowego; techniczne zmiany nie zalewają osi czasu. | DEC-022/DEC-009 |
| BR-017 | Wydarzenie planowane nie staje się odbyte przez upływ terminu; użytkownik może dodać odbytą rozmowę bez planowania i rozliczyć zaległe wydarzenie. | DEC-023/DEC-024 |
| BR-018 | Kontakt może istnieć samodzielnie, ale rejestrowanie korespondencji wymaga powiązania jej z konkretną sprawą. | DEC-044 |
| BR-019 | Historia kontaktu pokazuje tylko rzeczywiste zdarzenia powiązane z tą osobą; nie tworzy kopii lub domniemanych zdarzeń z innych spraw. | DEC-043 |
| BR-020 | Sugestia nie jest zadaniem; system nie wysyła komunikacji i nie kończy spraw automatycznie. | DEC-028 |
| BR-021 | Podczas Quick Capture/importu użytkownik weryfikuje dane przed zapisem; pobranie URL nie oznacza aplikowania. | DEC-029/DEC-030 |
| BR-022 | System może zgłosić potencjalny duplikat, ale nie scala automatycznie; zmianę istniejącej sprawy zatwierdza użytkownik. | DEC-031 |
| BR-023 | Import częściowy wymaga wyraźnej zgody, obsługuje pominięcie problematycznych wierszy i raport przyczyn. | DEC-035/DEC-036 |
| BR-024 | Import historyczny nie tworzy fikcyjnych dat/zdarzeń i sam w sobie nie wyzwala zaległych sugestii. | DEC-036/DEC-037 |
| BR-025 | Zabezpieczenie przed przypadkowym powtórnym importem jest obowiązkowe; techniczny mechanizm `OPEN-035`. | DEC-037 |
| BR-026 | Powiązanie dokumentu ze sprawą nie oznacza, że dokument został wysłany; fakt wysłania dotyczy konkretnej wersji. | DEC-040 |
| BR-027 | Jeden uczestnik może pojawiać się w wielu sprawach, a jedno wydarzenie może mieć wielu uczestników. | DEC-025/DEC-043 |
| BR-028 | System nie wymaga znajomości pracodawcy przy kontakcie od agencji. | DEC-042 |
| BR-029 | Po „Zapisz” w Quick Capture użytkownik pozostaje w bieżącym widoku; może wybrać „Zapisz i dodaj kolejną”. | DEC-032 |
| BR-030 | Dokumenty i dane osobowe muszą pozostać prywatne i bezpieczne; techniczne środki i polityka retencji: `OPEN-013/OPEN-032`. | DEC-039/DEC-041 |

## Granice reguł

Reguły nie ustanawiają list domyślnych etapów, wyników zamknięcia, pól formularza, schematu bazy, limitów, progów follow-up, algorytmu podobieństwa ani protokołu cofania. [OPEN](../decisions/open-questions.md) ma pierwszeństwo przed każdą próbą ich domyślenia.


## Doprecyzowanie lokalnego 3B — DEC-055

BR-005: w autoryzowanym 3B rejestracja zaproszenia i wejście do W rekrutacji są jednym atomowym krokiem; kwalifikację potwierdza użytkownik. BR-006: etap pozostaje odrębny; zmiana etapu w aktywnej rekrutacji zachowuje status i historię, może pomijać pośrednie etapy. Dozwolone kombinacje i walidacje tego podzakresu ustala [DEC-055](../decisions/product-decisions.md); pozostałe OPEN-034 zachowane. BR-015/016: daty i historyczne nazwy nie są nadpisywane ani dopowiadane. Nie dodajemy nowej reguły kwalifikującej aplikację, automatyczne potwierdzenie czy upływ czasu.

## Integralność korekt 3A/3B — DEC-056

BR-007/015/016 i BR-005/006 rozszerza zatwierdzony [kontrakt korekt](../technical/history-corrections-integrity-analysis.md), warianty 1A/2A. Korekta zachowuje oryginał i audyt, nie tworzy aktywności biznesowej. Dzień porządkuje oś, a bieżący etap wynika z pierwotnej kolejności ważnych komend etapowych. Każde ważne przejście wymaga wcześniejszego ważnego zaproszenia. Operacja osierocająca zależność jest odrzucona bez kaskady. Atomowe uzgodnienie statusu/etapu wymaga jawnego podglądu i potwierdzenia, bez dowolnego PATCH. Unieważnienie jest terminalne; nie oznacza anulowania realnego procesu lub spotkania. Snapshot previous_stage pozostaje zapisem pierwotnego kontekstu.

## Closure & Reopening 3C — DEC-057

BR-008/010/012: [3C](../technical/recruitment-lifecycle-3c.md) zatwierdza osiem wyników, jawne zakończenie i wznowienie, kolejne odrębne ClosureRecord oraz audytowane korekty wyniku/dnia. Nie aplikowano dotyczy wyłącznie zamykanego cyklu (przynależność komendy, nie dzień faktu). Wznowienie nie nadpisuje wyników, nie dopisuje fikcyjnej aplikacji/zaproszenia i przywraca tylko stan uzasadniony ważnymi faktami. Zakończone bez bieżącego etapu; snapshot kontekstu zachowany. BR-011 nadal obowiązuje: ograniczenie bez otwartych Task/CalendarEvent dotyczy wyłącznie 3C, przyszłe moduły muszą integrować decyzje o każdym elemencie. BR-007/015/016: korekty zakończeń zachowują oryginały i audyt, bez nowych aktywności; korekty starych faktów nie otwierają zamkniętej sprawy.
