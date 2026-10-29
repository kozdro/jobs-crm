# Jobs CRM — UX Blueprint: kontrakty przepływów i stanów

**Status:** DRAFT, 2026-10-28. **Podstawa:** [blueprint](blueprint.md), [screen blueprints](screen-blueprints.md), [otwarte decyzje](../decisions/open-questions.md). 
To opis UX i sprawdzeń prototypu, nie nowy FR/AC ani zatwierdzenie procesów domenowych.

## Konwencja

Każdy przepływ opisuje: wejście → decyzję użytkownika → stan po zapisie → błąd/anulowanie. Nie wymyślaj domyślnych dat, uczestników, etapów, aplikacji ani wyników. Zapis następuje dopiero po potwierdzeniu operacji. Poniższe testy są **do wykonania w prototypie**, nie PASSED.

## F01: Wejście i nawigacja (UC-024/033; UX-001/017)

- Po autoryzowanym wejściu pokaż prywatny Dashboard, bez onboardingowego bloku obowiązkowego.
- Sidebar z siedmioma modułami; zwinięcie zostaje przy przejściu do innego modułu. Topbar: wyszukiwarka + menu Dodaj.
- Pierwsze wejście bez rekordów: rzeczywisty pusty Dashboard i dostęp do Quick Capture; nie fabrykuj przykładów.
- Brak uprawnień: nie renderuj treści, nazw spraw, metadanych dokumentów ani poprzednio oglądanej historii.
- Mechanizm: Supabase Auth/SSR według DEC-051 i [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md); szczegóły polityki OPEN-013/041/042. Historyczny kontrakt prototypu przewidywał symulowane wejście; nie dowodzi działania Auth.

## F02: Quick Capture, zapis bez aplikowania (UC-001/029; UX-006)

1. Topbar „Dodaj” → „Dodaj ręcznie”, w centralnym modalu aktywna zakładka Ręcznie.
2. Krok „Sytuacja” pozwala wskazać zapisanie oferty lub inną sytuację, również nieokreśloną; to nie jest status ani potwierdzona aplikacja.
3. Krok „Dane”: minimum zgodne z przyszłym schematem, „Więcej szczegółów” opcjonalne; nie wymagaj ogłoszenia, nazwy stanowiska ani znanego pracodawcy wbrew BR-001/028.
4. Krok „Działanie”: świadomie wybierz „Zapisz tylko sprawę”; na końcu podsumowanie.
5. Zapis sukces → modal zamknięty, bieżący widok bez przejścia, toast z „Otwórz sprawę” → pełna strona po kliknięciu.
6. „Zapisz i dodaj kolejną” → nowy pusty kreator, bez kopiowania działania/statusu z poprzedniej sprawy.

**Błąd i anulowanie:** brak sukcesu przy awarii; wpisane dane pozostają; „X”/Esc z danymi pyta o odrzucenie; kliknięcie tła nie zamyka.

## F03: Smart Import pojedynczego URL i duplikaty (UC-015/016; UX-006)

1. Dodaj → Z URL; użytkownik podaje jeden URL.
2. System pobiera, jawnie rozróżnia odczytane i ręcznie poprawione informacje; przed zapisem użytkownik je weryfikuje.
3. Błąd odczytu: zachowaj URL i wpisy, pokaż neutralny komunikat oraz ręczny fallback. Nie sugeruj, że system ma dostęp do prywatnej korespondencji.
4. Potencjalny duplikat: pokaż listę podobnych spraw z kontekstem i alternatywami „Utwórz nową”, „Otwórz istniejącą” lub „Aktualizuj istniejącą” wymagającą osobnej świadomej zgody; **żadne domyślne scalanie**.
5. Użytkownik może wrócić do drugiej zakładki bez utraty ręcznych zmian. Ponowne pobranie nie nadpisuje ich bez rozstrzygnięcia.
6. Dopiero potwierdzenie zapisu wyświetla toast; zapis URL sam w sobie nie tworzy zdarzenia aplikacji.

**Bramki:** algorytm wykrycia duplikatu OPEN-024/025; zakres wspieranych źródeł OPEN-011; pola OPEN-002/026.

## F04: Odnotowanie kontaktu lub aplikacji (UC-002/003/004; UX-005/006)

- Na kroku „Działanie” kreatora albo z menu „Działanie” osi czasu użytkownik wybiera konkretny rzeczywisty fakt i datę zdarzenia, jeśli znana.
- Wymagaj wyraźnego potwierdzenia wykonania działania; nie wywnioskuj go z nazwy intencji ani ze Smart Import.
- Zapisywany kontakt outbound może odbywać się bez CV, inbound bez znanego pracodawcy.
- Wysłanie CV nie oznacza automatycznie „W rekrutacji”; fakt wysłania dokumentu, jeśli dotyczy, wskazuje dokładną wersję i nie utożsamia zwykłego powiązania z wysyłką.
- Zmiana błędnych metadanych nie tworzy nowego faktu. Jeśli brak daty realnego zdarzenia — nie zastępuj jej arbitralną datą wpisu.
- Walidacje pól, formatów i szczegółów działania OPEN-002/026/036/037.

## F05: Kanban → drawer → pełna strona → powrót (UC-027; UX-002–005)

1. Otwórz kartę w Kanbanie; drawer overlay nie zmienia szerokości tablicy.
2. Przez kliknięcie drugiej niezasłoniętej karty przełącz rekord bez zamykania drawera; puste tło ignorowane.
3. „X”/Esc zamyka panel, ale aktywny niezapisany edytor pyta o odrzucenie.
4. „Otwórz pełną stronę” → dwukolumnowy detal, historia w głównej kolumnie, lokalny skompresowany sticky nagłówek i panel „Szybki kontekst”.
5. Powrót odtwarza Kanban/listę, filtry, sortowanie, rozwinięcie zakończonych i scroll, ale **nie** otwiera ponownie drawera.
6. Przy wejściu bezpośrednim z linku „Rekrutacje” prowadzi do standardowego widoku; nie udawaj poprzedniego kontekstu.
7. Bez myszy dostępne jawne akcje otwierania kart i zmiany statusu.

## F06: DnD i akcje cyklu życia (UC-005/012/013/021; UX-002/005)

- Przeniesienie do „W rekrutacji” bez potwierdzonego kwalifikującego zaproszenia: pokaż proces rejestracji wymaganych danych; nie przestawiaj karty na stałe przed rozstrzygnięciem.
- Przeniesienie do „Zakończone”: otwórz dedykowany proces z wymaganym wynikiem i decyzją o każdym otwartym zadaniu/wydarzeniu. Ostateczny enum i efekty anuluj/zachowaj/odłącz: OPEN-001/029.
- Wznowienie zachowuje dawne zakończenia, a nowa aplikacja może być osobną sprawą; wariant wyboru OPEN-019.
- DnD i jawna akcja z menu muszą prowadzić przez te same reguły. Anulowanie, brak danych lub konflikt → bez zmiany stanu.
- Korekta administracyjna statusu (OPEN-020) **nie** ma udawać aplikacji lub zaproszenia. Nie zamieniaj dowolnego przeciągnięcia w taki wpis.
- Przeskoczenie etapów jest możliwe w granicach zatwierdzonego modelu; lista/propagacja OPEN-003/027/034.

## F07: Historia, notatki, korekty (UC-022/028; UX-005)

- Grupy faktycznych dat, wpisy oznaczone typem, długa treść rozwijana inline.
- Wcześniejsze zdarzenie zapisane dzisiaj należy do faktycznej daty; adnotacja „Dodano do CRM później” tylko gdy daty kalendarzowo się różnią, obie wartości w szczegółach.
- „+ Notatka” rozwija edytor inline; zapis świadomy, przy wyjściu z danymi ostrzeżenie. „Działanie” prowadzi do odrębnego formularza faktu.
- Zwykła notatka ma datę utworzenia, a opis konkretnego wcześniejszego zdarzenia może otrzymać znaną rzeczywistą datę. Nie zamieniaj notatki w fikcyjne zdarzenie kwalifikacyjne.
- **Propozycja UX przy korektach:** dyskretne menu, poprawka notatki inline, korekta zdarzenia w dedykowanym formularzu, neutralne „Skorygowano” w szczegółach i tam dostępne informacje o poprzednich wartościach **tylko jeśli przyszłe zasady audytu dopuszczą ich zapis**. Żaden nowy wpis „odbyto rozmowę” nie powstaje. Do rozstrzygnięcia przed implementacją: OPEN-004/020, usuwanie, audyt i historia poprzednich wartości.
- Nie dodawaj lokalnego wyszukiwania ani filtrowania osi czasu (wybór PO 1.27 A); Global Search nadal przeszukuje zdefiniowany zakres danych.

## F08: Wydarzenie przełożone lub po terminie (UC-010/011; UX-011/005)

1. Wydarzenie planowane może zmienić termin, ale pozostaje tym samym wydarzeniem; wcześniejsze terminy pozostają odtwarzalne.
2. Po terminie bez potwierdzenia oznacz „wymaga rozliczenia”, nie „odbyte”. Pokaż akcje faktycznego rozliczenia odbyte/nieodbyte/anulowane.
3. Rzeczywiście odbyta rozmowa może być dodana wstecz bez fikcyjnego wcześniejszego zaplanowania.
4. Wielu uczestników nie tworzy kopii zdarzenia. Tylko osoby faktycznie powiązane widzą je w swoich historiach.
5. Przełożenie nie tworzy dodatkowego stałego statusu „Przełożone”; zasady enum/uczestników/dat OPEN-021/030/037.

## F09: Zadania, sugestie i powiadomienia (UC-023/030/037; UX-001/010)

- Zadanie bez terminu jest prawidłowe. Pokazuj je w swoim kontekście bez błędnego „zaległe”.
- Dashboard rozdziela wymagające uwagi zadania/wydarzenia od sugestii regułowych; sugestia może prowadzić do formularza utworzenia zadania, ale sama zadaniem nie jest.
- Brak odpowiedzi w CRM nie dowodzi faktycznego milczenia kontaktu.
- Przypomnienie in-app (opcjonalny e-mail) zgodnie z konfiguracją/regułami OPEN-009; nie zakładaj progów. Brak push.
- Prototyp powinien pokazać celowy pusty stan, przypomnienie zgodne z konfiguracją i brak automatycznego wysłania lub zamknięcia.

## F10: Dokumenty, firmy, kontakty (UC-006/008/018/019/025/031; UX-012–014)

- Dokument: wyraźny wybór biblioteka / tylko sprawa / dodanie do biblioteki; powiązanie nie oznacza wysłania.
- Wysłanie CV można skojarzyć z **konkretną wersją**, nie bieżącą zmienną wersją; brak automatycznego nadpisania historii.
- Jedna firma może mieć kilka spraw; kontakt może nie mieć sprawy, ale komunikacja wymaga powiązania.
- Profil kontaktu nie przejmuje historii innych spraw; uczestnicy wydarzenia są określani rzeczywistymi relacjami.
- Operacje usunięcia/archiwizacji/retencji i prywatności nie mogą zostać narysowane jako zaakceptowana polityka: OPEN-005/006/013/030/032/036.

## F11: Import CSV/XLSX (UC-017/026; UX-007–009)

- Źródło → mapowanie kolumn i słowników → preview z wierszami problematycznymi i potencjalnymi duplikatami → decyzje → zatwierdzenie → raport.
- Częściowy import wymaga **osobnego jawnego potwierdzenia**; pominięte wiersze z powodami.
- Nieznane statusy/etapy/wyniki nie są po cichu domapowywane. Nie dopisuj dat i historii, nie twórz zaległych sugestii.
- Przed przypadkowym powtórzeniem wsadu pokaż ostrzeżenie i wymagaj decyzji; mechanizm identyfikacji OPEN-035.
- Po awarii nie wykazuj rekordów jako zapisanych bez pewności. Zatwierdzony kontrakt ADR-0005 wymaga jednej atomowej transakcji zaakceptowanego zbioru i rollbacku przy błędzie; utrata odpowiedzi wymaga ustalenia wyniku przez retry tej samej operacji. Szczegóły komunikatów/undo pozostają OPEN-010/035.
- Rozbieżność między podglądem a danymi istniejącymi w chwili zatwierdzenia → wstrzymanie i wyraźna ponowna decyzja, bez cichego nadpisania.

## F12: Global Search i powrót do kontekstu (UC-020; UX-015)

- Z dowolnego modułu wpisz frazę: overlay z grupami i szybkim wynikiem.
- „Wszystkie wyniki” → pełna strona. Znalezienie notatki/wydarzenia prowadzi do rzeczywistego kontekstu sprawy; nie tworzy duplikatów.
- Brak trafień → zrozumiały pusty stan. Błąd zapytania → stan błędu, bez ujawniania prywatnych danych.
- URL do wiadomości jest tylko adresem; brak indeksacji jej treści. Brak semantyki i treści dokumentów w MVP.
- Ranking/paginacja/archiwum i autoryzacja: OPEN-038/013.

## F13: Ustawienia etapów i zarządzanie kontem (UX-016–019)

- Etapy: globalna personalizacja i indywidualne dostosowanie z zachowaniem historii; bez przyjętej listy domyślnej ani propagacji do istniejących spraw (OPEN-003/027/034).
- Konto: prywatny Dashboard i prywatność pozostają zatwierdzone. DEC-051/[ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) określają Supabase self-signup, login, reset e-mail oraz logout local/global/others; JWT może pozostać ważny do expiry. Pełne FR-AD-003–009 zachowują PROPOSED dla pozostałych szczegółów, profilu i polityk OPEN-013/032/041–046. Nie dodawać rejestru urządzeń ani obietnicy dowolnego target-by-session-id.

## Macierz stanów interakcji

| Stan | Jak go pokazać | Ochrona przed błędem |
|---|---|---|
| Pusty ekran | Rzeczywisty brak danych; kontekstowe CTA | Bez fikcyjnych rekordów |
| Loading | Skeleton/spinner z opisem zakresu | Bez fałszywego potwierdzenia |
| Brak wyników | Komunikat i możliwość resetu kryteriów (jeśli istnieją) | Bez modyfikacji danych |
| Walidacja | Błąd przy polu + zwięzłe podsumowanie | Nie odrzucaj poprawnych pól |
| Zapis w toku | Widoczny stan, blokada duplikowania zatwierdzenia | Bez podwójnego rekordu |
| Sukces | Toast i jasna akcja do kontekstu | Dopiero po realnym potwierdzeniu |
| Awaria | Błąd i możliwa bezpieczna retry tylko według zatwierdzonej semantyki | Nie zgaduj efektu transakcji |
| Konflikt | Pokaż, który rekord się zmienił i wymagaj decyzji | Bez cichego nadpisania |
| Niezapisane zmiany | Potwierdź odrzucenie przy wyjściu/zmianie kontekstu | Zachowaj dane przy powrocie |
| Brak uprawnień | Neutralny komunikat bez prywatnych szczegółów | Nie ujawniaj istnienia danych |
| Zdarzenie po terminie | „Wymaga rozliczenia” | Nie zmieniaj na odbyte |
| Duplikat | Wskazanie podobnych spraw i jawny wybór | Bez automatycznego merge |
| Nieznana data | Neutralne „Data zdarzenia nieznana” | Bez daty zastępczej |

## Lista kontrolna prototypu (manualna, NIE WYKONANO)

1. Poruszanie po siedmiu modułach myszą i klawiaturą; zachowanie sidebara.
2. Dodanie sprawy bez oferty/stanowiska/CV; brak fikcyjnej aplikacji.
3. Jedna oferta URL; poprawka danych, fallback, wykryty duplikat, świadomy zapis.
4. Dodanie kolejnej sprawy bez kopiowania poprzednich danych.
5. Drawer: przełączanie spraw, niezapisana notatka, zamknięcie, pełna strona i powrót ze scroll/filtrami.
6. Oś czasu: prawdziwa data, wpis wsteczny, rozwinięcie, poprawka bez zdublowanego faktu.
7. DnD wymagający danych, zatrzymanie zamknięcia bez wyniku/decyzji o otwartych zadaniach.
8. Wydarzenie przełożone i po terminie, także wieloosobowe.
9. CV z konkretną wersją wysłaną; odróżnienie powiązania od wysyłki.
10. Import częściowy/duplikat/awaria i bezpieczny raport.
11. Global Search po notatce/URL z przejściem do kontekstu.
12. Mobile: pełnoekranowy Quick Capture, alternatywa dla DnD, brak pułapek fokusu.

**Uwaga:** ta lista nie zmienia statusu TC z `NOT EXECUTED`; pełne kryteria w istniejących AC.
