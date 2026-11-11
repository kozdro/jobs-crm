# Global Search, Notes i CaseLinks — kontrakt UX slice'a

**Źródło:** PO 2026-11-10 zatwierdził warianty **1A/2A/3A** z [analizy i planu](../technical/global-search-analysis.md) oraz ich implementację. Ten dokument przekłada zatwierdzony zakres na prezentację i stany interfejsu; nie jest wynikiem testu ani dodatkową decyzją o danych. Analiza może zawierać historyczne oznaczenia PROPOSED sprzed zgody PO. Obowiązują [Blueprint](blueprint.md), UX-005/015 w [ekranach](screen-blueprints.md), F07/F12 w [przepływach](flow-contracts.md), [Visual Language](visual-language.md), DEC-014/015/020–022/038/050/062, FR/AC-GS-001–008, FR/AC-HE-001/004/005, FR/AC-LC-021/023/025, FR/AC-AD-002 i FR/AC-NV-002. Nie zastępuje ADR-0008/0012 ani istniejących guards nawigacji.

**Zakres:** Topbar i wyszukiwanie, pełna strona, dane/linki sprawy, inline notatka w jednej osi historii oraz cel konkretnego wyniku Calendar. Dane są właścicielskie; widoczne grupy i przykłady nie sugerują automatycznego odczytu linków ani faktu aplikowania. Zakończona sprawa nadal działa, a notatka, wyszukanie lub edycja linku nie wznawia jej ani nie zmienia statusu.

## Wejście i nakładka — UX-015/F12, 1A

- W Topbarze desktop widoczne pole/wyzwalacz „Szukaj” z trwałą dostępną nazwą „Szukaj w Jobs CRM”. Na mobile jeden wyraźny wyzwalacz z taką samą nazwą; ikona sama nie jest etykietą. Jest dostępny z każdego istniejącego modułu, także ze strony wyniku. Bez atrapy trasy Dokumentów.
- Otwierany dialog „Wyszukiwanie” zawiera pole z nazwą „Szukaj w Jobs CRM”, przycisk zamknięcia i wyniki. Po otwarciu fokus przechodzi do pola. Escape i jawne zamknięcie wracają fokusem do wyzwalacza; Tab/Shift+Tab pozostają w aktywnym dialogu. Przy przejściu do strony lub wyniku zamknięcie nie może kraść fokusu z nowej strony.
- Grupy w zatwierdzonej kolejności: **Sprawy i stanowiska**, **Firmy**, **Kontakty**, **Linki**, **Notatki**, **Wydarzenia**. Wyświetl najwyżej trzy wyniki na grupę i działanie **„Wszystkie wyniki”**, które przenosi bieżącą frazę w zatwierdzonej owner-scoped pamięci RAM. Rekord ma jeden czytelny link do właściwego kontekstu; element nie podszywa się pod wykonanie operacji. Liczność, jeśli pokazywana, pochodzi wyłącznie z autoryzowanego odczytu.
- Wynik sprawy pokazuje zapisaną nazwę oraz stan, także „Zakończone”; kontakt — faktyczną nazwę i dostępne zapisane dane; firma — nazwę. Link pokazuje rzeczywistą rolę i czytelny fragment adresu w kontekście sprawy. Notatka pokazuje fragment aktualnej treści i nazwę sprawy, wydarzenie — tytuł/opis i faktyczny bieżący kontekst, a dla ogólnego „Wydarzenie ogólne”. Nie wywodź nazwy stanowiska, kontaktu ani firmy z przypadkowej relacji.
- Przycięte fragmenty są zwykłym tekstem; pełną treść wyświetla właściwy kontekst. Złośliwy HTML i znaczniki nie są wykonywane. Długie URL i ciągi zawijają się, nie poszerzają strony. Wynik linku przechodzi do konkretnego wiersza wewnątrz CRM; otwarcie zewnętrznego URL wymaga osobnego, jawnego działania.

## Strona wyników i powrót

Strona ma `h1` **„Wyniki wyszukiwania”**, pole „Szukaj w Jobs CRM”, etykietowany filtr **„Typ wyników”** (wszystkie grupy lub jedna wybrana), wyniki w tych samych grupach i ranking co nakładka. Domyślny zbiór obejmuje także zakończone sprawy. W każdej grupie strona ma do 20 rekordów oraz dostępne przyciski **„Poprzednia strona [nazwa grupy]”** i **„Następna strona [nazwa grupy]”**, jeśli poprzednia/następna strona istnieje. Każda dalsza strona jest osiągalna. Aktualna strona i grupa są opisane tekstowo; zmiana frazy/filtra wraca do początkowej strony.

Po przejściu z wyniku do rekordu i powrocie w ramach działającej aplikacji przywróć frazę, typ oraz aktualny kontekst wyników z pamięci owner-scoped; przed ponownym wyświetleniem odśwież dane, aby nie pokazać unieważnionego lub przeniesionego wyniku jako aktualnego. Pełne odświeżenie lub zamknięcie karty usuwa frazę i pokazuje początkowy stan pola. Wylogowanie lub zmiana konta usuwa frazę, wyniki, stronicowanie i oczekujące odpowiedzi starego właściciela. Tekst zapytania nigdy nie trafia do URL, historii przeglądarki, storage, cookies ani telemetrii. Docelowe ID i typ w URL nie zwalniają z ponownej autoryzacji odczytu.

## Stany odczytu Search

| Stan UI | Wyzwalacz / warunek | Widok i możliwe przejście |
| --- | --- | --- |
| Puste | Otwarcie/reload bez frazy; same białe znaki | Instrukcja „Wpisz, czego szukasz”; brak zapytania i brak pozornego „0 wyników”. |
| Walidacja | Po trim powyżej 200 punktów kodowych Unicode lub tekst nieprzechowywalny | Powiąż błąd z polem; zachowaj wpisany tekst, bez cichego obcięcia i zapytania. Jeden znak jest dozwolony. |
| Ładowanie | Aktualna poprawna fraza/strona/filtr | „Szukam…” jako status; starszych wyników nie przedstawiaj jako nowych. |
| Wyniki | Odpowiedź odpowiada aktualnej frazie, stronie, filtrowi i ownerowi | Grupy oraz dostępne dalsze strony; przy zmianie zapytania poprzednia odpowiedź nie może nadpisać nowszej. |
| Brak | Aktualny poprawny odczyt zwraca zero | „Brak wyników. Spróbuj innej frazy.” To nie jest błąd ani zmiana danych. |
| Błąd | Aktualny odczyt nie powiódł się | „Nie udało się pobrać wyników.” + „Spróbuj ponownie”; nie pokazuj zero ani starych danych jako aktualnych. |
| Sesja utracona/konto inne | Autoryzacja odrzucona lub właściciel zmieniony | Wyczyść prywatny stan i potraktuj odpowiedzi starego requestu jako nieważne; użyj istniejącego procesu sesji. |

Przekazuj zmiany przez zwięzły `role=status` lub równoważny dostępny status, błędy przez `role=alert`; nie ogłaszaj każdej litery i nie odczytuj na głos całej listy przy każdym odświeżeniu. Debounce to technika, nie dodatkowy limit lub gwarancja SLA.

## Notatki — UX-005/F07, 2A

W kontekście **jednej osi historii** przycisk **„+ Notatka”** otwiera edytor inline, a fokus przechodzi do pola. Nie dodajemy lokalnego wyszukiwania/filtru osi. Jedna kolumna:

1. **„Treść notatki”** — textarea, wymagana treść 1–10 000 punktów kodowych po trim, widoczny licznik i błąd powiązany z polem; zachowaj wpis przy błędzie. Brak obowiązkowego tytułu. Dłuższy zapis jest dostępny w całości po „Rozwiń”; akcja ma stan rozwinięcia.
2. **„Data notatki”** — czytelny wybór: zwykła notatka **„Data utworzenia”**, opis wcześniejszego zdarzenia **„Znana data zdarzenia”** z polem dnia lub **„Data zdarzenia nieznana”**. Dzień znany nie może być przyszły; brak znanej daty nie staje się dniem dzisiejszym. Data utworzenia notatki i rzeczywisty dzień wydarzenia nie są zamienne. Zwykła notatka korzysta z faktycznego serwerowego czasu utworzenia.
3. **„Zapisz notatkę”** i **„Anuluj”**. Zapis jest świadomy, nie automatyczny; wejście do innego modułu lub Search respektuje istniejący dirty guard. Nie utrwalać prywatnej treści szkicu lub zamrożonego payloadu w browser storage/URL.

Wpis ma typ „Notatka”, pełną aktualną treść, właściwą grupę daty i dostępne szczegóły. Nieznana data zdarzenia jest oznaczona i pozostaje w sekcji nieznanych dat; przy dawnym znanym dniu data wpisu i data dodania pozostają rozróżnione. Tekst „Dodano do CRM później” występuje tylko gdy właściwe daty kalendarzowe się różnią. Zawijaj dowolnie długie wyrazy; nigdy nie twórz faktu odbytej rozmowy.

Dla ważnego wpisu dostępne **„Popraw notatkę”**, **„Unieważnij notatkę”** i **„Historia zmian”**. Poprawa ujawnia aktualną treść/dzień, a po świadomym zapisie wynik ma oznaczenie „Skorygowano”; „Historia zmian” pokazuje oryginał i przed/po zmianie wyłącznie właścicielowi. Unieważnienie wymaga świadomego potwierdzenia ze zrozumiałym skutkiem; wpis pozostaje oznaczony „Unieważniona notatka” na osi i w audycie, nie jest domyślnym trafieniem Search i nie ma akcji przywrócenia. Fokus po anulowaniu wraca do wyzwalacza, po sukcesie trafia na wynik/komunikat, który nie zniknie poza viewportem.

## Linki sprawy — 3A

Sekcja **„Linki”** na detalu sprawy zawiera uporządkowaną listę aktywnych linków i **„Dodaj link”**. Każdy wiersz pokazuje pełny adres dostępny do odczytu, rolę oraz oddzielne świadome **„Otwórz link”** i dostępne akcje. Zapisany dawniej adres ma rolę **„Nieokreślona”**, nie „Główne ogłoszenie”, i nie dostaje wymyślonej daty biznesowej. Dla długiego URL zawijaj pełną treść i zachowaj dostępność klawiaturą.

Formularz ma trwałe etykiety **„Adres URL”** i **„Rola linku”**, akcje **„Zapisz link”** / **„Anuluj”**. Role dokładnie: Główne ogłoszenie, Dodatkowe ogłoszenie, Formularz aplikacji, Strona firmy, Profil, Korespondencja, Inne, Nieokreślona. HTTP(S) jest walidowany zgodnie z istniejącym kontraktem; nie ukrywaj lub nie zmieniaj query/fragmentu. Istniejący identyczny aktywny adres tej samej sprawy powoduje zrozumiały komunikat z odnośnikiem do konkretnego istniejącego wiersza, bez kopii. Ten sam adres w innej sprawie nie jest auto-merge.

Każdy aktywny wiersz oferuje **„Popraw link”**, **„Przenieś wyżej”**, **„Przenieś niżej”**, **„Unieważnij link”** i **„Historia zmian”**, z kontekstową dostępną nazwą identyfikującą dany link. Dostępne pozycje nie wymagają drag-and-drop; po zapisanej zmianie fokus wraca do tego samego wiersza, a kolejność jest oznajmiona tekstowo. Korekta adresu, roli i kolejności jest jawna i audytowana. Unieważnienie wymaga potwierdzenia, usuwa aktywne trafienie Search i zachowuje ślad w historii zmian; nie przywraca starego legacy adresu. Odrębne świadome otwarcie zewnętrznego adresu stosuje istniejącą politykę bezpiecznych linków; sama rola Korespondencja nie pobiera wiadomości i nie oznacza kontaktu.

## Wspólne stany operacji i nawigacja do trafienia

| Stan zapisu | Interakcja i guard | Prezentacja / skutek |
| --- | --- | --- |
| Czysty → edycja | Użytkownik wpisuje dane | Etykiety i pomoc są stałe; cancel przy zmianach wymaga potwierdzenia odrzucenia. |
| Edycja → walidacja | Jawny zapis; pola spełniają zatwierdzony kontrakt | Błąd przy polu, fokus na pierwszy błąd; brak mutacji i brak utraty treści. |
| Wysyłanie | Zatwierdzony zamrożony zamiar | Przycisk informuje o oczekiwaniu i jest czasowo niedostępny; nie dopuszczaj drugiego niezależnego submitu. |
| Zapis potwierdzony | Odpowiedź identycznego zamiaru potwierdza efekt | Odczytaj aktualną projekcję, pokaż zwięzły sukces; korekta nie emituje nowego faktu lifecycle. |
| Błąd pewny | Serwer odrzuca próbę | Zachowaj treść w bieżącym edytorze, wyjaśnij błąd i pozwól poprawić lub anulować. |
| Wynik niepewny | Utrata odpowiedzi po wysłaniu | Nie pokazuj „zapisano” ani „nie zapisano”; sprawdź persisted intent/result, proponuj retry tylko identycznego zamrożonego zamiaru, bez duplikatu. Nawigacja nie może porzucić tego stanu bez wyraźnego rozstrzygnięcia. |
| Konflikt rewizji | Bieżące dane lub zbiór dopasowań zmieniły się | Zachowaj potrzebne dane użytkownika w pamięci bieżącego edytora, pokaż potrzebę odświeżenia i nowego świadomego potwierdzenia; nie nadpisuj cicho. |

Wynik **notatki** otwiera dokładny wpis, także gdy należy do innej strony osi. Wynik **linku** otwiera dokładny wiersz. Wynik **wydarzenia** otwiera dokładny CalendarEvent nawet poza widocznym oknem kalendarza; po zmianie relacji używa aktualnej sprawy albo kontekstu wydarzenia ogólnego, nigdy dawnej relacji z audytu. Nie wystarczy przejście do nagłówka „Historia”/„Kalendarz”. Po autoryzowanym odczycie cel jest widoczny, ma programowo osiągalny fokus i nie jest zasłonięty sticky headerem. Niedostępny, cudzy albo nieistniejący cel daje neutralny komunikat bez ujawniania cudzych danych; błąd odczytu pozostaje błędem, nie pustym rekordem. Kliknięcie wyniku respektuje istniejący dirty guard bieżącego edytora.

## Wykonanie i QA

Użyj istniejących tokenów, rytmu i komponentów Visual Language. Desktop ma widoczne pole, a mobile dostępny wyzwalacz i przewijany dialog bez utraty przycisków przy klawiaturze lub zoomie; docelowe miejsca interakcji mają istniejące minimalne wymiary dotykowe. Etykiety, focus ring, kontrast i błąd nie polegają wyłącznie na kolorze. Weryfikacja planowana: 1440/1024/768/375, długie teksty i adresy, zoom/reflow, Tab/Shift+Tab/Escape, focus po powrocie, dirty warning, request race, timeout i retry, logout/zmiana konta, A/B/anon oraz pełna ścieżka TC-020 na syntetycznych danych. Pełne siedem modułów i testy fizycznych urządzeń/AT mają odrębny status, gdy nie są wykonane.

**Status dokumentu:** handoff projektowy przygotowany, `runtime / browser QA / accessibility test / independent frontend review: NOT RUN`. Ocena implementacji należy do QA i niezależnego review na finalnym kandydacie.
