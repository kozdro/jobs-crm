# Jobs CRM — UX Blueprint: ekrany i komponenty

**Status:** DRAFT, 2026-10-28. Opis rozmieszczenia i kontraktów widoków do prototypu, nie finalny UI kit ani lista pól bazy.  
**Nadrzędny dokument:** [UX Blueprint v1](blueprint.md). **Wybory:** [rejestr](blueprint-decisions.md). **Zachowania błędów:** [flow contracts](flow-contracts.md).

W poniższych scenariuszach treść i daty w prototypie mają być fikcyjne. Sformułowania opisane jako *propozycja* są wyborem projektowym w ramach delegacji, nie zmianą reguł domenowych.

## Mapa ekranów

| IA / ekran | Układ i główne operacje | Podstawa |
|---|---|---|
| UX-001 Dashboard | Operacyjny przegląd: uwaga, terminy, sugestie, istotna aktywność, krótkie statystyki | FR-DB-001–008 |
| UX-002/003 Rekrutacje | Kanban domyślnie, alternatywna lista, filtry/sortowanie/szybkie widoki | FR-RW-001–008 |
| UX-004 Drawer | Szybki kontekst i proste akcje; wyjście do pełnej sprawy | FR-RW-009, FR-HE-004/005 |
| UX-005 Pełna sprawa | Nagłówek, centralna oś czasu, prawa kolumna powiązań | FR-RW-010/011, FR-HE-001–005 |
| UX-006 Quick Capture | Modal, zakładki ręcznie/jeden URL, kreator trzech kroków | FR-QC-001–012 |
| UX-007/008/009 Import | Wybór pliku, mapowanie, podgląd, decyzje, wynik | FR-IM-001–014 |
| UX-010 Zadania | Zadania ogólne i w sprawach, stan, termin, przejście do kontekstu | FR-TN-001–003 |
| UX-011 Kalendarz | Planowane/odbyte wydarzenia, uczestnicy, przełożenie i rozliczenie | FR-HE-006–013 |
| UX-012 Dokumenty | Biblioteka, wersje CV, załączniki sprawy, wybór do powiązania | FR-DO-001–010 |
| UX-013 Firmy | Lista i profil organizacji, powiązane sprawy i kontakty | FR-CC-001/002/008/011 |
| UX-014 Kontakty | Lista i profil osoby, wyłącznie rzeczywiście powiązane zdarzenia | FR-CC-003–010 |
| UX-015 Search | Szybka nakładka + pełna strona wyników | FR-GS-001–008 |
| UX-016 Etapy | Konfiguracja globalna i indywidualna — struktura koncepcyjna | FR-LC-009–013, OPEN-003/027 |
| UX-017–019 Konto | Po Supabase loginie Dashboard; podzakres Auth DEC-051 zatwierdzony, pozostałe szczegóły ekranów wariantowe | FR-AD-001/002 APPROVED; FR-AD-003–009 PROPOSED |

## 1. App Shell

### Desktop

- **Sidebar** po lewej: logo/identyfikacja robocza u góry; jedna lista siedmiu modułów; aktywny moduł ma rozpoznawalny stan tekstowy i wizualny. Rozwijanie/zwijanie ręczne; w zwinięciu nazwy dostępne przez etykiety i wskazówki, nie tylko przez rozpoznawanie ikon.
- **Topbar** ponad zawartością: widoczne pole Global Search; „Dodaj” jako menu ręcznie/URL/CSV-XLSX. Nie projektuj pełnej rejestracji/profilu w Topbarze przed decyzjami o koncie. Jeśli potrzebne miejsce na powiadomienia in-app, ich interakcja jest propozycją do dopracowania przy OPEN-009.
- **Obszar roboczy** wypełnia resztę. Globalny Topbar i lokalny sticky nagłówek sprawy nie mogą łącznie zjadać miejsca przeznaczonego na główną treść.
- Przejście między modułami nie powinno resetować rozwinięcia sidebara. Zachowanie stanu po ponownym zalogowaniu nie jest w tym Blueprint rozstrzygnięte.

### Mobile i tablet (wariant projektowy)

- Navigation trigger otwiera pełną listę siedmiu modułów; nie chowaj ważnych modułów pod nieopisanymi ikonami.
- Quick Capture i złożone formularze prezentuj w pełnoekranowym, dostępnym dialogu; wewnętrzny krok kreatora jest wyraźnie opisany.
- Global Search pozostaje dostępny jednym widocznym wyzwalaczem. Wariant desktopowego „zawsze widocznego pola” może zmienić prezentację bez utraty globalnej dostępności.
- Punkty zmiany układu dobiera się po testach prototypu, nie są tu normatywnymi liczbami pikseli (OPEN-017/033).

## 2. Dashboard — UX-001

**Cel:** odpowiedzieć „co teraz wymaga uwagi?” bez kopiowania listy Rekrutacji.

Rekomendowany porządek treści:
1. **Nagłówek i kontekst dnia** z krótką możliwością przejścia do zadań lub kalendarza. Nie wyświetla niepotwierdzonych stanów.
2. **Wymaga uwagi** — zadania z rzeczywiście znanymi terminami i wymagające reakcji po terminie wydarzenia; nie myl tego z „wydarzenie na pewno odbyło się”.
3. **Nadchodzące wydarzenia** — termin i powiązana sprawa/osoby tylko gdy rzeczywiście istnieją.
4. **Sugestie** — oddzielna kategoria, oznaczona jako podpowiedzi, nie zadania. CTA prowadzi do kontekstu lub świadomego utworzenia zadania; brak automatycznej wysyłki.
5. **Ostatnia istotna aktywność** — skrót rzeczywistych działań biznesowych i notatek, nie lista ostatnio otwartych spraw i nie audit log korekt.
6. **Zwięzłe statystyki** — bez zamrażania nazw, okresów czy algorytmów przed OPEN-039.

**Układ:** dwa priorytetowe bloki na górze (uwaga + terminy), poniżej sugestie/aktywność, statystyki jako niskopriorytetowe uzupełnienie. Responsywnie jedna kolumna. Każdy element jest klikalnym przejściem do realnego rekordu/kontekstu.

**Pusty stan:** prosty tekst „Nie masz jeszcze zadań ani wydarzeń” plus akcja Quick Capture lub przejście do modułu; bez sztucznych przykładów w danych rzeczywistych. Dla nowego konta brak obowiązkowego onboardingu.

## 3. Rekrutacje — UX-002 / UX-003

### Wspólny pasek sterowania

- Nagłówek „Rekrutacje”, przełącznik **Kanban / Lista** i zwięzły obszar filtrów, sortowania i gotowych szybkich widoków. Dokładne definicje szybkich widoków i filtrów nadal OPEN-028; makiety nie mogą narzucać ich jako zatwierdzonych.
- Zmiana reprezentacji nie tworzy nowego zestawu spraw. Filtr i sortowanie mają być czytelne i możliwe do wyczyszczenia.
- Własne zapisywane zestawy filtrów nie należą do MVP.

### Kanban

- Cztery statusy ogólne jako kolumny, z „Zakończone” początkowo zwiniętą. Nie wprowadzaj piątego statusu.
- Karta: bezpieczna etykieta sprawy nawet bez stanowiska; firma tylko gdy istnieje; etap szczegółowy tylko gdy istnieje; opcjonalne powiązane najbliższe zdarzenie/zadanie tylko jeśli jest znane. Liczby i terminy są informacjami, nie wymyślonym stanem „brak odpowiedzi”.
- Kliknięcie otwiera operacyjny drawer. Wyraźna akcja „Otwórz pełną stronę” dostępna po wejściu w kontekst.
- Przeniesienie karty przez DnD nie zapisuje statusu, dopóki nie powiedzie się walidacja. Sprawa pozostaje na poprzedniej pozycji po anulowaniu/odmowie.
- Alternatywa bez DnD: dostępna z klawiatury jawna akcja zmiany cyklu życia z taką samą walidacją.

### Lista

- Wiersz zawiera identyfikację sprawy, firmę jeśli znana, status, etap jeśli jest, informację o rzeczywiście znanym kolejnym działaniu. Kolumny i sortowanie szczegółowe: OPEN-028.
- Kliknięcie wiersza może otworzyć ten sam drawer co Kanban; dostępna droga do pełnej strony.
- Obie reprezentacje mają wspólne stany: loading, brak spraw, brak wyników filtrów, błąd, zmiana rekordu równolegle.

## 4. Drawer — UX-004

**Wariant wybrany:** overlay z prawej nad workspace'em, bez zmiany szerokości Kanbana (1.19 A). To *niemodalny podgląd* w sensie zachowania desktopowego: dostępne niezasłonięte karty mogą przełączyć sprawę w tym samym drawerze (1.20 C).

**Zawartość od góry:**
1. Tytuł/etykieta, firma (jeśli jest), zamknięcie i droga do pełnej strony.
2. Status i niezależny etap, bez zapełniania braków.
3. „Najbliższe działania” (zadania/wydarzenia) z małymi kontekstowymi akcjami.
4. „Ostatnia aktywność” z podglądem prawdziwych zdarzeń i „+ Notatka”.
5. Stała, jednoznaczna akcja „Otwórz pełną stronę” w dostępnej części panelu.

**Interakcje:** kliknięcie pustego tła nie zamyka; „X”/Escape zamyka; wybór widocznej kolejnej karty zmienia podgląd bez zamykania; niezapisany tekst uruchamia potwierdzenie przy każdej zmianie celu. Nie zamykaj modala Quick Capture przez nakładanie drawera. Na mobile panel staje się pełnoekranowym widokiem z własnym „Wstecz”.

## 5. Pełna strona sprawy — UX-005

### Nagłówek

- Link „Wróć do Rekrutacji”, z zachowaniem realnej poprzedniej reprezentacji, filtrów, sortowania i przewijania.
- Nazwa sprawy/stanowisko, powiązana firma albo neutralna etykieta braku danych, status i etap jako **oddzielne** informacje.
- Menu „Akcje sprawy” (np. faktyczne aplikowanie/kontakt, zaproszenie, zmiana etapu, zakończenie/wznowienie jeśli dozwolone). Dokładne dozwolone przejścia: OPEN-018/019/020/034. Samo otwarcie menu niczego nie zapisuje.
- Po przewinięciu kompaktowa wersja sticky z identyfikacją sprawy i dostępnymi akcjami.

### Główna kolumna — chronologia

- Grupy dat faktycznych, w każdej wpisy z ikoną i typem. Najnowsze znane daty na górze, starsze niżej.
- Pokaż typ i sedno wpisu, datę faktyczną oraz podgląd treści; rozwijanie dłuższych wpisów inline.
- Dla dopisanych później neutralna adnotacja; dokładna data rejestracji po rozwinięciu.
- Przy nieznanej dacie faktycznej wpis w osobnym obszarze „Data zdarzenia nieznana”, nie w fałszywym dniu kalendarzowym. Sposób postępowania i walidacji: OPEN-002/004/037.
- **Nie dodawaj lokalnych filtrów ani pola wyszukiwania** (wybór użytkownika 1.27 A). W całej aplikacji istnieje Global Search.
- Pasek dodawania: „+ Notatka” (rozwijany inline) + menu „Działanie” (formularze rzeczywistych faktów).
- Menu wpisu: Edytuj/skoryguj — bez tworzenia fikcyjnego zdarzenia. Dopóki OPEN-004/020 nie jest rozstrzygnięte, „Usuń” i ślad zmian są w makiecie nienormatywne.

### Prawa kolumna — kontekst

- **Panel sticky „Szybki kontekst”:** najbliższe naprawdę zarejestrowane działanie lub neutralny pusty stan; linki do sekcji. Bez równoległego scrollbara.
- **Zadania:** najbliższe/otwarte przypisane do sprawy, przycisk „+ Zadanie”; zakres słownika stanów: OPEN-040.
- **Wydarzenia:** następne i nierozliczone, „+ Wydarzenie”; po terminie *prośba o rozliczenie*, nie automatyczne „odbyte”.
- **Dokumenty:** powiązane wersje/załączniki, „+ Dokument”; jawna różnica między „powiązano” a „wysłano”.
- **Kontakty:** rzeczywiście powiązane osoby, „+ Kontakt”; wielu uczestników wydarzenia i wiele osób przy sprawie.
- **Linki:** wiele uporządkowanych URL-i różnych typów, „+ Link”. Link do wiadomości nie udziela dostępu do treści.
- **Dodatkowe dane sprawy:** sekcja kontekstowa na informacje, źródło znalezienia i kanał rzeczywistego aplikowania jako dwa odrębne pojęcia; dokładne pola OPEN-002/026.

Sekcje mogą być zwijane lokalnie dla czytelności, ale nie duplikują historii i nie dodają niezależnych głównych zakładek.

## 6. Quick Capture — UX-006

- Topbar „Dodaj” wyświetla menu: ręcznie, z jednego URL, import pliku.
- Wejścia ręcznie/URL otwierają ten sam centralny modal z zakładkami; startowa zakładka odpowiada wybranemu wejściu.
- **Krok 1 Sytuacja:** sytuacja początkowa jest opcjonalnym wyborem pomocniczym, nigdy automatycznym potwierdzeniem faktu. Musi istnieć możliwość dodania sprawy bez stanowiska, ogłoszenia i znanego pracodawcy.
- **Krok 2 Dane:** krótki formularz; dodatkowe pola pod „Więcej szczegółów”; przy URL: pobierz, zweryfikuj, popraw. Wspólny stan obu zakładek; przy niepowodzeniu odczytu ręczny fallback bez utraty wpisów.
- **Krok 3 Działanie:** opcjonalnie udokumentuj rzeczywiście wykonaną aplikację/kontakt (z datą faktyczną) albo wybierz zapisanie tylko sprawy. Na końcu podsumowanie z bezpośrednią drogą do poprawy danych.
- **Przed zapisem:** sprawdzenie potencjalnych duplikatów z decyzją użytkownika, bez automatycznego nadpisywania. Żadna pobrana treść nie jest wiarygodna z definicji.
- **Po zapisie:** toast z „Otwórz sprawę” prowadzącym do pełnego detalu; „Zapisz i dodaj kolejną” pozostawia kreator gotowy do kolejnego wpisu.

## 7. Import CSV/XLSX — UX-007–009

**Oddzielny, pełnoekranowy przepływ:** mapa kroków/progres i jasna możliwość wyjścia z ochroną danych wprowadzonych przy mapowaniu. Rekomendowana prezentacja:
1. **Źródło:** własny CSV/XLSX lub gotowy szablon; rozmiary, typy, arkusze i kodowania jeszcze OPEN-007/023.
2. **Mapowanie:** kolumny → właściwości CRM oraz osobno statusy/etapy/wyniki; wartości nieznane oznacz jako wymagające rozstrzygnięcia.
3. **Podgląd i walidacja:** liczba wszystkich wierszy, kwalifikujących się, błędnych i potencjalnych duplikatów; możliwość otwarcia przyczyny przy konkretnym wierszu, bez zgadywania historii.
4. **Decyzje i potwierdzenie:** nowa sprawa vs świadoma aktualizacja, pominięcie wiersza, osobne jawne potwierdzenie partial import jeśli dotyczy.
5. **Wynik:** rozróżnienie rekordów potwierdzonych jako zapisane, pominiętych z powodami i tych o **niepotwierdzonym** wyniku po awarii. Raport dostępny użytkownikowi.

ADR-0005 wymaga atomowego zapisu całego zaakceptowanego zbioru i rollbacku błędu; retry tej samej operacji ustala wynik bez duplikacji. Nie obiecuj biznesowego undo ani nie zgaduj wyniku utraconej odpowiedzi; szczegóły nadal OPEN-010/035. Powtórny wsad jest sygnalizowany przed decyzją; nie następuje bezrefleksyjne zdublowanie. Historyczny import nie generuje zaległych sugestii (BR-024).

## 8. Zadania — UX-010

- **Widok bazowy:** lista zadań ze zrozumiałym tytułem, opcjonalnym terminem, statusem zgodnym z przyszłym słownikiem i połączeniem do sprawy, jeśli istnieje.
- **Punkt wejścia:** główny moduł, Dashboard i kontekst sprawy. „+ Zadanie” otwiera ten sam logiczny formularz, z wstępnie wskazaną sprawą, jeśli wywołano go z jej kontekstu; nie dopowiada innych danych.
- **Widoki pomocnicze:** grupowanie według istotności/terminów jest propozycją UX, a jego nazwy i reguły wymagają OPEN-040.
- **Bez terminu:** prawidłowy rekord, nie „zaległy”. Przypomnienia in-app i opcjonalny e-mail bez przyjmowania domyślnych progów i opt-in (OPEN-009).
- **Sugestia:** odrębny element od zadania; świadoma akcja może zainicjować utworzenie zadania, ale system niczego nie wysyła sam.

## 9. Kalendarz — UX-011

- **Rekomendacja widoku:** agenda z możliwością przejścia do kalendarza (np. tydzień/miesiąc jako wariant do prototypu), nie sztywny wybór zatwierdzonych formatów czasu.
- Karta wydarzenia pokazuje datę planowaną, sprawę i osoby jeśli powiązane; brak danych nie wytwarza uczestnika.
- Akcje przy wydarzeniu: przełóż termin, rozlicz jako odbyte/nieodbyte/anulowane zgodnie z zatwierdzonymi możliwościami. Przełożenie zachowuje poprzedni termin w historii tego samego wydarzenia, nie dodaje nowego statusu „Przełożone”.
- Po terminie nierozliczone wydarzenie pozostaje nierozliczone, z jasną prośbą o potwierdzenie; nie jest domyślnie odbyte.
- Formularz wspiera wielu uczestników; dodanie rozmowy już odbytej jest możliwe bez wcześniejszego planowania.
- Strefy czasowe, całodzienne, dokładna walidacja i edycja uczestników: OPEN-021/030/037.

## 10. Dokumenty — UX-012

- **Biblioteka:** wykaz dokumentów wielokrotnego użytku i wersji, z jasnymi metadanymi. Bez automatycznego odczytu zawartości plików na potrzeby wyszukiwania.
- **W sprawie:** trzy odrębne akcje: dołącz z biblioteki, dodaj plik tylko do sprawy, dodaj nowy do biblioteki i powiąż. Nie nazywaj zwykłego powiązania „wysłano”.
- **CV:** widok wersji pozwala wskazać dokładną wersję wysłaną przy potwierdzonej aplikacji; historyczne wskazanie nie zmienia się po dodaniu nowszej wersji.
- **Plik usuwany:** nie buduj potwierdzeń ani automatycznych skutków retencji/usuwania jako ukończonego procesu, dopóki OPEN-006/036/032 nie są rozstrzygnięte.
- Pusty stan biblioteki może zaproponować dodanie pliku; brak dokumentu nie blokuje sprawy bez reguły wymagającej pliku.

## 11. Firmy — UX-013

- **Lista:** lekka tabela/karty organizacji z przejściem do profilu; brak potwierdzonego powiązania z pracodawcą nie jest automatycznie uzupełniany.
- **Profil:** tożsamość organizacji, rzeczywiście powiązane sprawy (może być wiele niezależnych), kontakty powiązane z organizacją, linki kontekstowe jeśli zapisane.
- Rozróżniaj pracodawcę, agencję i osoby rekrutujące. Agencja może występować bez ujawnienia pracodawcy. Nie scalaj organizacji tylko dlatego, że nazwy są podobne.
- Przy dodawaniu sprawy z profilu organizacji można podpowiedzieć powiązanie, ale musi zostać jawnie widoczne.

## 12. Kontakty — UX-014

- **Lista i profil** osoby z danymi faktycznie zapisanymi, powiązanymi sprawami i historią jedynie tych wydarzeń, w których osoba naprawdę uczestniczyła.
- Kontakt może być zapisany bez żadnej sprawy; przy rejestrowaniu korespondencji użytkownik musi wskazać sprawę.
- Wielu uczestników jednego wydarzenia nie oznacza wielu kopii wydarzenia. Powiązania i wiarygodność historii uczestników: OPEN-030.
- Na profilu może istnieć akcja „Powiąż ze sprawą”; skutki aktualizacji relacji wymagają zdefiniowanych zasad, nie automatycznej retroaktywnej historii.

## 13. Global Search — UX-015

- **Nakładka:** wywoływana z Topbara, wejście tekstowe, pogrupowane szybkie wyniki: sprawy/stanowiska, firmy, kontakty, URL, notatki i opisy wydarzeń. Przy dopasowaniu do notatki lub wydarzenia jasny link do sprawy i kontekstu wpisu.
- **Pełna strona:** te same grupy w większym obszarze, informacja o wynikach, stany brak trafień i problem z odczytem. Filtry, ranking, kolejność, paginacja i archiwum: OPEN-038.
- Bez semantycznego indeksowania i bez wyszukiwania treści plików. Link do korespondencji daje dopasowanie URL, nie dostęp do wiadomości.
- Wynik nie może ujawniać prywatnych metadanych innemu użytkownikowi; dokładna autoryzacja OPEN-013.

## 14. Ustawienia etapów — UX-016 (koncepcja)

- **W ramach istniejącej IA, bez dodawania ósmego głównego modułu:** widok edycji globalnej listy etapów oraz dostosowania etapów pojedynczej sprawy jako odrębne punkty wejścia.
- Pokaż kolejność, możliwość pomijania i konsekwencje dla historii; nie przyjmuj jeszcze domyślnej listy etapów.
- Propagacja zmian globalnych do istniejących spraw i konflikty indywidualnych modyfikacji: OPEN-003/027/034. W prototypie tylko oznaczone warianty, nie pozorna automatyczna migracja.

## 15. Konto i własne dane — UX-017–019

- **Zatwierdzone:** po legalnym wejściu do prywatnej przestrzeni Dashboard; rekordy i dokumenty prywatne.
- **Późniejszy zatwierdzony podzakres (2026-10-29):** DEC-051/[ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) określają Supabase self-signup, login, reset e-mail i logout local/global/others; access JWT może działać do expiry. Pełne FR-AD-003–009 pozostają PROPOSED dla pozostałych szczegółów i polityk. Bez własnego rejestru urządzeń i dowolnego selected-other-session logout.
- Makiety pozostałych szczegółów tych funkcji są wariantami do doprecyzowania, a nie dowodem działania „gotowego MVP”. Nie wprowadzaj działania, które można pomylić ze sprawnym eksportem lub trwałym usunięciem danych przed OPEN-013/032/041–046.

## 16. Wspólny słownik powierzchni

| Powierzchnia | Przeznaczenie | Zakazane uproszczenie |
|---|---|---|
| Toast | Krótkie, potwierdzone sukcesy i neutralne komunikaty, z możliwą akcją | Toast nie zastępuje potwierdzenia ryzykownej operacji |
| Modal | Quick Capture, wymagające skupienia formularze i decyzje | Nie odrzucaj niezapisanych danych po kliknięciu poza nim |
| Drawer | Szybki kontekst sprawy bez zmiany szerokości Kanbana | Nie zastępuj pełnej historii zakładkami |
| Formularz inline | Krótka notatka lub lekka kontekstowa czynność | Nie twórz akcji biznesowej z samej notatki |
| Dialog walidacyjny | Wymagane dane i skutki akcji cyklu życia, duplikaty, destrukcyjne kroki | Nie pomijaj go przy DnD |
| Pusty stan | Wyjaśnienie braku rzeczywistych danych i możliwa uczciwa akcja | Bez przykładowej aktywności udającej realne zdarzenia |
| Skeleton / status ładowania | Rozpoznawalne oczekiwanie na dane | Nie pokaż „zapisano” bez potwierdzenia |

**Dalsza kontrola:** [flow-contracts.md](flow-contracts.md) definiuje skutki, błędy i scenariusze sprawdzenia.
