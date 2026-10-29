# Jobs CRM — UX Blueprint v1

**Data:** 2026-10-28  
**Stan dokumentu:** DRAFT / projekt UX gotowy do prototypowania wariantowego.  
**Zakres:** osobisty webowy Jobs CRM, desktop-first z projektowanym zachowaniem responsywnym.  
**Źródło:** decyzje właściciela produktu z rozmowy UX Blueprint 1.1–1.32 oraz delegacja rekomendacji dalszych rozwiązań; [rejestr wyborów](blueprint-decisions.md).  
**Autorytet:** ten dokument uszczegóławia interakcje, ale nie zmienia zatwierdzonych DEC/BR/FR/AC ani nie rozstrzyga samodzielnie OPEN.

Dokumenty wykonawcze:
- [Blueprinty ekranów i elementów](screen-blueprints.md)
- [Przepływy, stany i kontrakty interakcji](flow-contracts.md)
- [Rejestr decyzji UX i bramki](blueprint-decisions.md)

Kanoniczne źródła: [decyzje produktowe](../decisions/product-decisions.md), [kwestie otwarte](../decisions/open-questions.md), [model domeny](../domain/glossary-and-model.md), [reguły](../domain/business-rules.md), [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [IA](information-architecture.md) i [dotychczasowe przepływy](interaction-flows.md).

## 1. Cel i zasady

Użytkownik ma szybko **uchwycić prawdziwy fakt**, znaleźć wcześniejszy kontekst, działać na terminach i odtworzyć historię sprawy bez udawania, że samo zapisanie oferty oznacza aplikowanie. Sprawa rekrutacyjna jest centrum produktu, niezależnym od firmy, ogłoszenia i kontaktu.

Zasady UX:
1. **Prawda historyczna:** odróżniaj datę faktycznego zdarzenia od chwili zapisu do CRM. Korekta nie udaje kolejnej aktywności.
2. **Działanie, nie automatyczna interpretacja:** statusy wynikają z potwierdzonych faktów i walidacji; sugestia nie oznacza zadania, wysłanej wiadomości ani zamknięcia.
3. **Kontekst bez utraty miejsca:** szybki drawer, modal i zachowanie stanu listy/Kanbana; pełna strona do pogłębionej pracy.
4. **Krótka ścieżka podstawowa:** krótkie formularze, ujawnianie dodatkowych pól na żądanie, brak przymusowego onboardingu.
5. **Jasny skutek:** użytkownik wie, co zostanie zapisane, zmienione, pominięte lub nie zostało potwierdzone.
6. **Brak fikcyjnych danych:** brak pracodawcy, stanowiska, daty, etapu, wysłanego CV i wyniku kontaktu pozostaje brakiem danych, nie wartością domyślną.
7. **Dostępność i prywatność:** operacje dostępne bez DnD i bez samego koloru; dane prywatne nigdy nie przeciekają w komunikatach ani wynikach.

## 2. App Shell i nawigacja

- **Desktop:** lewy sidebar + górny Topbar (UX 1.1 A). Sidebar jest jedną listą siedmiu modułów w kolejności: Dashboard, Rekrutacje, Zadania, Kalendarz, Dokumenty, Firmy, Kontakty (1.2 A). Początkowo rozwinięty, ręcznie zwijany do ikon z dostępnymi nazwami; stan zachowany podczas nawigacji między modułami (1.3 B).
- **Topbar:** stale widoczne pole „Szukaj w Jobs CRM…” i przycisk „Dodaj” (1.4 A). „Dodaj” otwiera **menu trzech wejść**: Dodaj ręcznie, Dodaj z URL, Importuj CSV/XLSX (1.7 B), a nie bezpośrednio formularz.
- **Global Search:** szybka nakładka z wynikami pogrupowanymi według typu, przejściem do rekordu i akcją „Wszystkie wyniki”; pełna strona dla obszernego zestawu (1.5 C). Wyszukiwanie obejmuje zakres FR-GS-001–008, ale nie zawartość plików ani prywatnej korespondencji.
- **Landing:** Dashboard po zalogowaniu; bez obowiązkowego onboardingu (DEC-018). Kierunek Supabase-native Auth/self-signup/reset i logout local/global/others określają późniejsze DEC-051/[ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md); szczegóły polityk nadal OPEN-013/041–046.
- Nawigacja przeglądarki, przyciski „Wstecz”, przekierowania z wyników oraz powrót z detalu muszą zachowywać realnie istniejący kontekst, nie fabrykować historii przejść.
- Responsywne zachowania: [sekcja 9](#9-responsive-i-accessibility) i [screen blueprints](screen-blueprints.md).

## 3. Quick Capture (UX-006)

**Zasada:** jedno miejsce dodawania ręcznego i Smart Import pojedynczego URL; import plikowy jest odrębnym procesem. Warianty „Ręcznie” oraz „Z URL” są zakładkami we wspólnym centralnym modalu; tryb startowy wynika z wybranej pozycji menu „Dodaj” (1.6 A, 1.8 A, 1.10 A).

**Kreator w modalu (1.12 C):**
1. **Sytuacja:** wybór intencji wejściowej: zapisana oferta, wykonana aplikacja, kontakt, spontaniczna kandydatura albo inna/bez określenia. To wskazówka prezentacyjna, **nie** niezmienny typ sprawy, nie dowód działania i nie status.
2. **Dane sprawy:** krótki formularz z przyciskiem „Więcej szczegółów” (1.11 C). Tryb „Z URL” pobiera dane pojedynczej oferty i pokazuje je do weryfikacji; użytkownik może ręcznie poprawić dane. Konkretne pola i walidacje: OPEN-002/026.
3. **Opcjonalne działanie:** wyraźne „Zarejestruj działanie” lub „Zapisz tylko sprawę” (1.13 C). Działanie wymaga świadomego potwierdzenia faktycznego zdarzenia; wybór intencji w kroku 1 niczego nie potwierdza. **Podsumowanie** na końcu kroku 3, bez czwartego ekranu (1.14 B).

Wszystkie wpisane lub pobrane informacje pracują na jednym zestawie danych i nie znikają po zmianie zakładki. Ponowny Smart Import nie nadpisuje ręcznych edycji bez decyzji użytkownika. Niepowodzenie odczytu pozostawia URL oraz wpisane dane i umożliwia ręczne wprowadzenie.

**Zapis:**
- „Zapisz” po sukcesie zamyka modal i pozostawia bieżący ekran bez nawigacji. Pokazuje toast „Rekrutacja zapisana” z akcją „Otwórz sprawę” (1.15 B), która prowadzi na **pełną stronę sprawy** (1.16 B); kliknięcie tej akcji jest osobną decyzją nawigacyjną.
- „Zapisz i dodaj kolejną” tworzy jedną sprawę, pokazuje potwierdzenie i przygotowuje pusty kreator. Akcja otwarcia poprzedniej sprawy nie może porzucić rozpoczętego kolejnego wpisu bez ochrony niezapisanych danych.
- Przy niezapisanych zmianach „X”, Escape lub świadome wyjście wymagają potwierdzenia odrzucenia; pusty formularz zamyka się od razu. Kliknięcie tła **nie** zamyka modala (1.9 A).
- Potencjalny duplikat: pokaż podobne sprawy i wymagaj świadomego wyboru: nowa sprawa, przejście do istniejącej lub osobno zatwierdzona aktualizacja. Bez automatycznego scalania (DEC-031, OPEN-024).
- Zapis URL nie wytwarza aplikacji, wysłanego CV ani domniemanej historii (BR-021). Status zapisanej sprawy i znaczenie działań zgodnie z BR-003–007.

## 4. Workspace Rekrutacje (UX-002–005)

**Kanban** jest domyślny. Cztery kolumny: Zapisane, Kontakt rozpoczęty, W rekrutacji, Zakończone (zwinięte domyślnie). Etap szczegółowy może pojawić się na karcie, ale nie jest tym samym co status i nie ma być dopowiadany, jeśli brak wartości (DEC-004/007/019). Alternatywny widok listy pokazuje te same rekordy. Filtry, sortowanie i gotowe szybkie widoki są wymagane, lecz ich ostateczne warianty nadal OPEN-028; brak własnych trwałych presetów w MVP (DEC-049).

**Karta:** rozpoznawalne stanowisko/konkretna etykieta sprawy, firma jeśli znana, status wynikający z kolumny, etap tylko gdy określony, sygnał rzeczywiście istniejącego najbliższego działania. Zwięzły opis zamiast fabrykowania nazwy/firmy. Karta jest punktem otwarcia drawera, nie polem automatycznej zmiany statusu.

**Drawer (1.17 B, 1.18 B, 1.19 A, 1.20 C):** operacyjny podgląd (stan, etap, najbliższe działania, ostatnia rzeczywista aktywność) i małe przyciski kontekstowe przy odpowiednich sekcjach. Nakłada się na Kanban, nie zmniejsza jego szerokości. Kliknięcie innej dostępnej karty przełącza rekord w panelu; kliknięcie pustego tła go nie zamyka. „X” i Escape zamykają. Nie wolno porzucić wprowadzonych zmian bez potwierdzenia. Pozostaw widoczne i dostępne wybrane karty także dla klawiatury. W panelu jest „Otwórz pełną stronę”.

**Powrót z pełnej strony (1.21 B):** wraca do realnego poprzedniego widoku (Kanban lub lista), z dotychczasowymi filtrami, sortowaniem, rozwinięciem Zakończonych i pozycją przewijania; drawer zamknięty. Bez poprzedniego kontekstu, np. po wejściu z linku, droga „Rekrutacje” otwiera zwykły widok.

**DnD:** nie jest obejściem logiki. Próba przejścia do „W rekrutacji” wymaga faktycznie kwalifikującego zaproszenia, a do „Zakończone” wyniku i rozwiązania otwartych działań. W razie niekompletnych danych pokaż dedykowany dialog; anulowanie pozostawia kartę w poprzednim miejscu. Dostępna alternatywa klawiaturowa/akcyjna musi uruchamiać identyczne reguły (OPEN-018/028/029).

## 5. Pełna strona sprawy (UX-005)

- **Układ desktop:** dwie kolumny, oś czasu w głównej szerszej kolumnie (orientacyjnie 65–70%), kontekst po prawej (1.22 A). Nagłówek kompaktowy: stanowisko lub etykieta sprawy, firma jeśli znana, odrębny status i etap, menu „Akcje sprawy” (1.23 A).
- **Scroll:** nagłówek zwęża się do wersji sticky podczas przewijania (1.24 C). Cały dokument ma jedno przewijanie; w prawej kolumnie mały „Szybki kontekst” może pozostać przypięty pod nagłówkiem, podczas gdy pełne sekcje przewijają się razem ze stroną (1.25 C). Unikać drugiego niezależnego scrolla.
- **Oś czasu:** jedna historia pogrupowana według rzeczywistych dat i oznaczona typami zdarzeń (1.26 B), standardowo z najnowszymi znanymi datami wyżej. **Bez lokalnej wyszukiwarki i filtrów na osi czasu** (jawny wybór 1.27 A). Krótkie wpisy pełne, długie rozwijane inline (1.28 C).
- **Wpisy historyczne:** subtelne „Dodano do CRM później” wyłącznie gdy kalendarzowa data rejestracji różni się od daty faktycznego zdarzenia; pełne daty w szczegółach (1.32 B). Nieznana data zdarzenia ma osobne neutralne oznaczenie, bez dorabiania daty i bez przypisywania fikcyjnego miejsca w chronologii.
- **Dodawanie:** „+ Notatka” rozwija krótki edytor inline nad historią (1.29 C, 1.30 B); z niezapisanym tekstem obowiązuje ochrona przed odrzuceniem. „Działanie” otwiera listę faktów, np. kontakt, aplikacja, odbyta rozmowa, i następnie odpowiedni formularz. Notatka nie udaje rozmowy ani aplikacji.
- **Daty:** bieżąca notatka otrzymuje datę utworzenia, a gdy świadomie opisuje wcześniejsze zdarzenie, użytkownik może podać jego realną datę (1.31 C). Moment zapisu w CRM pozostaje odrębny i automatyczny; brak rzeczywistej daty nie jest uzupełniany na chybił trafił.
- **Korekty (rekomendacja delegowana 1.33 B):** dyskretne menu przy wpisie; zwykła notatka edytowana inline, istotne zdarzenie w dedykowanym formularzu z podglądem skutku. Nie twórz „drugiej rozmowy” przy korekcie. Po korekcie daty rzeczywistej wpis może zmienić pozycję. Reguły edycji, usuwania i audytu są nadal OPEN-004/020 i nie są zatwierdzone tym opisem.
- **Prawy kontekst:** kolejno sekcje Zadania, Wydarzenia, Dokumenty, Kontakty/osoby, Linki oraz informacje kontekstowe sprawy; małe „Dodaj” przy sekcjach, niezależne stany puste, opcjonalna prezentacja zwinięta dla długich sekcji. W panelu sticky tylko najbliższe **istniejące** działanie i linki skokowe; nigdy fikcyjne sugestie jako zadanie.
- **Menu cyklu życia:** oddzielone od notatek i prostego dodawania; zawiera akcje wynikające z faktycznej sytuacji. Nie jest bezwarunkowym edytorem dowolnego statusu.

## 6. Odrębność faktów i stanów

- **Sprawa** nie równa się firma ani ogłoszenie; wiele spraw tej samej organizacji jest prawidłowe.
- **Kontakt** bez CV może być faktem, ale brak działania nie jest automatycznym kontaktem.
- **W rekrutacji** wymaga kwalifikującego zaproszenia; samo CV lub potwierdzenie aplikacji nie wystarcza (BR-004/005, OPEN-018).
- **Etap** jest atrybutem odrębnym od statusu; konkretne kombinacje i domyślne nazwy nadal OPEN-027/034.
- **Wydarzenie** może być przełożone, odbyte, nieodbyte albo anulowane; samo przekroczenie daty nie rozlicza go. Przełożenie jest operacją, nie nowym przyjętym stałym stanem.
- **Dokument powiązany** nie oznacza dokumentu wysłanego; CV faktycznie wysłane wymaga wskazania konkretnej wersji.
- **Sugestia** nie jest zadaniem i nie oznacza autowysyłki ani samoczynnego zamknięcia.
- **Import** nie jest potwierdzeniem wszystkich historycznych działań opisanych statusami.

## 7. Moduły i przepływy

Konkretny układ Dashboardu, listy, kalendarza, zadań, dokumentów, firm, kontaktów, Global Search, importu i wariantów konta: [screen-blueprints.md](screen-blueprints.md).

E2E z wariantami błędów, dostępnością i zachowaniem przy anulowaniu: [flow-contracts.md](flow-contracts.md). Wszystkie moduły korzystają ze wspólnego App Shell.

## 8. Stany i zasady interakcji

- Każdy istotny ekran obsługuje: initial/empty, loading, populated, filtered-empty jeśli są filtry, error, saving, success i konflikt współbieżny jeżeli zmiana dotyczy zapisywanego rekordu.
- Sukces zapisu komunikuj dopiero po potwierdzeniu; podczas zapisu blokuj podwójne zatwierdzenie, ale nie odbieraj wprowadzonych danych.
- Błędy pól obok pól i w podsumowaniu; nie wymyślaj wartości brakujących. Błąd importu lub Smart Import nie może po cichu tworzyć częściowego rekordu.
- Zapisane dane i niezapisane szkice to różne stany. Brak przyjętej trwałej funkcji automatycznych szkiców.
- Zewnętrzny URL jest odnośnikiem; nie sugeruje dostępu do korespondencji, nie wysyła aplikacji i nie zmienia statusu.
- Potencjalny duplikat i konflikt danych wymagają świadomej decyzji, bez automatycznego scalania.
- Operacje destrukcyjne oraz bezpowrotne skutki nie są projektowane normatywnie przed rozstrzygnięciem odpowiednich OPEN.

## 9. Responsive i accessibility

**Wzorzec do prototypowania, nie zatwierdzone breakpoints ani pełny design system (OPEN-017/033):**
- **Desktop:** sidebar rozwijany/zwijany, Topbar z polem Global Search, czterokolumnowy Kanban z poziomym przewijaniem gdy potrzebne, detal 2-kolumnowy.
- **Tablet/wąskie okno:** sidebar może działać jako wąski panel ikon lub panel wywoływany; zachowaj dostęp do siedmiu modułów. Detal przechodzi do jednej kolumny, priorytet ma historia.
- **Mobile:** nawigacja otwierana przyciskiem, pole wyszukiwania dostępne przez wyraźną kontrolkę, Quick Capture jako pełnoekranowy dialog/kreator. Kanban zachowuje cztery statusy, ale pozwala na poziome przesuwanie i przełączenie na listę; nie tworzymy nowych statusów. Drawer jako pełnoekranowy podgląd/sheet. Sticky nie może zajmować większości ekranu.
- **Klawiatura i technologie asystujące:** logiczny porządek fokusowania, widoczny fokus, etykiety, Esc/zamykanie z potwierdzeniem, powrót fokusu do wywołującej kontrolki, obsługa bez przeciągania, komunikaty błędów dostępne dla screen readera, brak kodowania stanu tylko kolorem.
- **Ruch i czytelność:** ograniczenie animacji przy preferencji reduced motion, odpowiednie kontrasty, powiększenie i zawijanie bez utraty akcji. Weryfikacja z wybranym docelowo standardem dostępności: OPEN-033.

## 10. Granice ukończenia UX Blueprint

**Ustalono na potrzeby prototypu:** strukturę, lokalizację elementów, nawigację, zachowania interakcyjne, priorytety treści, puste stany i wzorce błędów. Wybory użytkownika 1.1–1.32 są bezpośrednie; dalsze rekomendacje zostały wybrane pod delegacją i są wyraźnie oznaczone w rejestrze.

**Nie zatwierdzono przez ten Blueprint (granica historycznego dokumentu; późniejsze TD/ADR-0005 i DEC-051/ADR-0012 określają atomowość oraz kierunek Auth):** pól i walidacji, słownika wyników zamknięcia, dokładnego grafu statusów, retencji, usuwania, modelu sesji, importowego rollbacku, kryteriów duplikatu, algorytmu wyszukiwarki, progów sugestii, nazw domyślnych etapów, finalnego design systemu ani stacku. Zob. [bramki](blueprint-decisions.md#bramki-przed-prototypem-implementacyjnym).

**Historyczny proponowany następny etap (pominięty późniejszą decyzją PO podczas TD):** interaktywny prototyp UX na danych fikcyjnych, najpierw: (1) Rekrutacje Kanban/lista → drawer → pełna strona; (2) Quick Capture z URL i ręcznym fallbackiem; (3) Dashboard → działania; (4) kluczowe wyjątki DnD, duplikatu i zamknięcia. Prototyp nie jest dowodem zatwierdzenia semantyki pozostającej OPEN.

## Doprecyzowanie pierwszego create/read — DEC-052 (2026-10-29)

Późniejsze zlecenie PO §13.2, [DEC-052](../decisions/product-decisions.md), wymaga w tym slice czterech kroków **Sytuacja → Dane → Działanie → Podsumowanie**, z jedyną akcją „Zapisz tylko sprawę”. Historia wcześniejszego wariantu trzech kroków pozostaje powyżej. [Aneks decyzji UX](blueprint-decisions.md) i [dokładny kontrakt slice'a](../technical/recruitment-case-first-slice.md) opisują pola, duplikaty, retry, dirty state i minimalny shell. To PARTIAL COVERAGE UX-006/F02; wykonane wyniki i NOT RUN są w [raporcie](../technical/recruitment-case-first-slice-report.md).
