# Jobs CRM — rejestr wyborów UX Blueprint i bramek

**Stan:** DRAFT, 2026-10-28. **Nie jest to nowy rejestr DEC:** `docs/decisions/product-decisions.md` pozostaje kanoniczny. Wybory UX nie zmieniają `OPEN` automatycznie.

## Wybory wyraźnie podjęte przez właściciela produktu (rozmowa 1.1–1.32)

| UX Blueprint | Wariant | Ustalenie |
|---|---|---|
| 1.1 | A | Sidebar + Topbar |
| 1.2 | A | Jedna lista siedmiu modułów |
| 1.3 | B | Sidebar ręcznie zwijany |
| 1.4 | A | Stale widoczne pole Global Search i Quick Capture w Topbarze |
| 1.5 | C | Hybrid Search: overlay + pełne wyniki |
| 1.6 | A | Centralny modal Quick Capture |
| 1.7 | B | Globalne „Dodaj” otwiera menu ręcznie/URL/CSV-XLSX |
| 1.8 | A | Zakładki Ręcznie / Z URL wewnątrz modala |
| 1.9 | A | Potwierdzenie odrzucenia niezapisanych zmian |
| 1.10 | A | Wspólne dane między zakładkami |
| 1.11 | C | Formularz krótki + „Więcej szczegółów” |
| 1.12 | C | Kreator krok po kroku z wyborem sytuacji |
| 1.13 | C | Opcjonalny krok zarejestrowania rzeczywistego działania |
| 1.14 | B | Podsumowanie w ostatnim kroku |
| 1.15 | B | Toast sukcesu z „Otwórz sprawę” |
| 1.16 | B | „Otwórz sprawę” prowadzi na pełną stronę |
| 1.17 | B | Drawer operacyjny z krótkimi akcjami |
| 1.18 | B | Akcje przy odpowiednich sekcjach |
| 1.19 | A | Overlay drawer, bez zmiany szerokości Kanbana |
| 1.20 | C | Szybkie przełączanie spraw w drawerze |
| 1.21 | B | Powrót do poprzedniego Kanbana/listy z zachowaniem stanu, drawer zamknięty |
| 1.22 | A | Dwie kolumny na pełnej stronie sprawy |
| 1.23 | A | Kompaktowy nagłówek z menu „Akcje sprawy” |
| 1.24 | C | Zmniejszany sticky header |
| 1.25 | C | Wspólny scroll + sticky szybki kontekst |
| 1.26 | B | Historia grupowana według dat rzeczywistych i typów |
| 1.27 | A | Tylko przewijanie historii; **bez lokalnego Search i filtrów** |
| 1.28 | C | Podgląd wpisów z rozwijaniem |
| 1.29 | C | „+ Notatka” inline + menu „Działanie” |
| 1.30 | B | Notatka inline rozwijana po kliknięciu |
| 1.31 | C | Kontekstowe daty notatek i rozróżnienie daty zapisu |
| 1.32 | B | Subtelne „Dodano do CRM później” przy różnicy dat |

**Uwagi spójności:** 1.16 B oznacza pełną stronę **po świadomym kliknięciu** akcji w toaście; samo „Zapisz” nie nawiguję (DEC-032). 1.27 A wyklucza lokalne narzędzia filtrowania osi czasu, ale nie wyklucza globalnego wyszukiwania po notatkach (FR-GS). 1.12 C to UX kreatora, nie nowy typ statusu ani obowiązek wysłania aplikacji.

## Rozwiązania dobrane samodzielnie na podstawie delegacji użytkownika

**Status: RECOMMENDED UNDER DELEGATION (UX ONLY), nie DEC APPROVED i nie zamknięte OPEN.**

| Obszar | Rekomendacja projektowa | Ograniczenie |
|---|---|---|
| 1.33 Korekty wpisów | Dyskretne menu; notatka inline; fakty biznesowe w dedykowanym dialogu z podglądem zmian | OPEN-004/020 |
| 1.34 Ślad korekt | Neutralne „Skorygowano” w szczegółach; poprzednie wartości tylko jeśli zostaną ustalone w zasadach audytu | OPEN-004/020 |
| Dashboard | Priorytet zadania/terminy, poniżej sugestie, aktywność i statystyki | OPEN-008/009/039 |
| Rekrutacje | Kontekstowe karty i lista z jednym źródłem danych; jasny aktywny filtr; alternatywa DnD | OPEN-028 |
| Import | Pełna strona z progresją: źródło, mapowanie, preview, decyzje, wynik | OPEN-010/022/023/035 |
| Zadania | Lekka lista z przejściem do spraw; zadania bez terminu normalnie widoczne | OPEN-040 |
| Kalendarz | Agenda jako pierwszy prototyp, wariantowy widok kalendarzowy | OPEN-021/037 |
| Dokumenty | Lista biblioteki i wersji; przy sprawie trzy jawne sposoby dodania | OPEN-006/007/036 |
| Firmy / kontakty | Lekka lista i profil z rzeczywistymi relacjami | OPEN-005/030 |
| Etapy | Osobne miejsce konfiguracji globalnej i indywidualnej | OPEN-003/027/034 |
| Responsive | Desktop 2 kolumny detalu; tablet/mobile jedna; sidebar drawer na mobile; podgląd sprawy jako pełnoekranowy sheet | OPEN-017/033 |
| Accessibility | Pełna obsługa klawiatury, jawny fokus, kontrast, alternatywa dla DnD, redukcja ruchu | OPEN-017/033 |
| Feedback i errors | Ochrona niezapisanych danych, brak cichego partial save, neutralne puste stany | OPEN-002/010/013/024 |
| Konta | Tylko symulacja wejścia do prywatnego workspace; brak implementacji niezatwierdzonej samoobsługi | OPEN-013/032/041–046 |

## Bramki przed prototypem implementacyjnym

Samo **prototypowanie wariantowe na danych fikcyjnych** jest możliwe teraz. Nie należy jednak prezentować niżej wymienionych elementów jako doprecyzowanych wymagań wykonawczych.

| Grupa | Otwarte pytania | Co blokują |
|---|---|---|
| Zakończenie i cykl życia | OPEN-001/018/019/020/029/034 | Wyniki, kwalifikujące zaproszenia, wznowienie/nowa sprawa, ręczne korekty, skutki zamknięcia |
| Formularze, historia, duplikaty | OPEN-002/004/021/024/025/026/027/030/036/037 | Pola/walidacje, audit i usuwanie, daty, dopasowanie duplikatów, relacje osób, nazwy etapów |
| Workspace i wyszukiwanie | OPEN-028/038/039/040 | Filtry/sortowanie/rankingi, definicje statystyk, statusy zadań |
| Smart Import i migracja | OPEN-007/010/011/022/023/035 | Zakres portali, typy plików, mapowania, atomiczność, ponawianie wsadów |
| Sugestie i komunikacja | OPEN-008/009 | Progi i preferencje przypomnień |
| Prywatność, pliki, konta | OPEN-005/006/013/032/041–046 | Izolacja danych, usuwanie, polityka retencji, sesje, samoobsługa konta |
| UI, urządzenia i branding | OPEN-015/017/033 | Finalny design system, szczegółowe urządzenia/breakpoints i poziom dostępności |
| Stack i infrastruktura | OPEN-012/014 | Decyzje techniczne i ADR |

## Kryterium ukończenia UX Blueprint

- [x] Uzgodniona struktura App Shell, Quick Capture, Search, Kanban, drawer i pełna strona.
- [x] Warianty ekranów pozostałych zatwierdzonych modułów opisane w osobnym dokumencie.
- [x] Podstawowe i błędne przepływy UX oraz stany interakcji opisane.
- [x] Jawne zachowanie decyzji właściciela vs rekomendacji delegowanych.
- [x] Otwarte reguły biznesowe i security nie są sztucznie zatwierdzone.
- [ ] Weryfikacja UX na interaktywnym prototypie — **NOT EXECUTED**.
- [ ] Finalne reguły pól, stanów, usuwania, dostępności i techniczne ADR — poza tym etapem.

**Aktualizacja 2026-10-28:** właściciel projektu świadomie pominął interaktywny prototyp. Technical Discovery 1.1–1.40 ukończono; [architektura](../technical/README.md) i [ADR](../decisions/adr/README.md) są punktem wejścia do planu SDD/AIDD. Testy interakcji należy wykonać podczas implementacji. Niezamknięte domenowe OPEN nie zostały zatwierdzone przez sam wybór technologii.

## Aneks po Technical Discovery — 2026-10-29

Historia wyborów UX powyżej pozostaje bez zmian. Późniejsze [DEC-051](../decisions/product-decisions.md) i [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) określają Supabase-native Auth/SSR, self-signup, reset e-mail i natywne scopes logout, bez rejestru urządzeń i natychmiastowej revocation JWT. ADR-0005 ustala atomowy zapis zaakceptowanego wsadu importu oraz ochronę retry; pozostałe szczegóły OPEN-010/035 nadal otwarte. Symulowane makiety i planowane TC nie stanowią wykonania tych mechanizmów ani zgody na nowe pola/polityki.

## Doprecyzowanie pierwszego create/read — DEC-052 (2026-10-29)

Powyższe wybory UX zachowują historię. Późniejsze jawne zlecenie PO „First Business Vertical Slice” §13.2, [DEC-052](../decisions/product-decisions.md), określa dla tego slice'a sekwencję **Sytuacja → Dane → Działanie → Podsumowanie**, z osobnym końcowym krokiem. Jest to wskazane źródło odstępstwa od wcześniejszego opisu trzech kroków/podsumowania w kroku 3; nie nowa arbitralna decyzja projektanta. Jedyną akcją jest „Zapisz tylko sprawę”. Dane: nazwa 1–160, opcjonalny HTTP(S), opis do 2000 pod „Więcej szczegółów”; sytuacja nie tworzy słownika DB ani faktu kontaktu/aplikacji.

F02 w tym PR realizuje tylko manual capture: ostrzeżenie o tej samej nazwie/URL u właściciela, otwarcie istniejącej albo świadoma nowa sprawa bez update/merge. Pozostałe tryby nie są atrapami. Zapis nie nawiguje, toast ma „Otwórz sprawę”; save-next daje puste pola i nowy key. Dirty X/Escape/anulowanie wymaga potwierdzenia, tło nie zamyka; błąd zachowuje dane/key i nie daje sukcesu. Mobile jest pełnoekranowy, klawiatura/focus i komunikaty podlegają rzeczywistym testom.

Minimalny shell pokazuje wyłącznie realne ekrany; Dashboard pozostaje wejściem zgodnie z DEC-018, bez fikcyjnych statystyk/modułów. Lista i minimalny detal nie zastępują docelowego Kanbana/drawera/osi czasu. **PARTIAL COVERAGE** UX-006/F02 i właściwych FR/AC; testy na etapie formalizacji **NOT RUN**, późniejsze wyniki w [raporcie slice'a](../technical/recruitment-case-first-slice-report.md). [Dokładny kontrakt](../technical/recruitment-case-first-slice.md).
