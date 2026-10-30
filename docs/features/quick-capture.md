# Feature: Quick Capture

**Stan:** `BASELINED` (decyzje UX `APPROVED`). **Aktor:** użytkownik z dowolnego modułu. **FR:** `FR-QC-001`–`FR-QC-012`.

## Cel

Szybko rejestrować prawdziwy kontekst nowej sprawy bez utraty miejsca pracy, bez automatycznego wysyłania aplikacji, łączenia spraw i bez wymuszania pełnej informacji już na początku.

## Wejście

Globalna akcja dodawania otwiera opcje: **ręcznie**, **jeden URL przez Smart Import**, **CSV/XLSX** (osobny wieloetapowy przepływ). Quick Capture nie odczytuje automatycznie prywatnej korespondencji.

## Przebieg — ręczne lub pojedynczy URL

1. Wybierz sposób dodania; dla URL podaj **jeden** link.
2. Smart Import próbuje pozyskać informacje o ofercie **wyłącznie z domen uprzednio zatwierdzonych i przetestowanych** (TD 1.40 B). Dla pozostałych domen od razu przechodzi do ręcznego uzupełnienia, nie pobierając zawartości URL. System **prezentuje je do weryfikacji**, nie zapisuje bez tej decyzji.
3. Jeśli odczyt się nie uda, dostępne pozostaje ręczne wprowadzenie. Nie znikają dane wpisane przez użytkownika — sposób obsługi błędów technicznych jeszcze `OPEN-011`.
4. System ujawnia potencjalne duplikaty; użytkownik decyduje o nowej sprawie lub, w odpowiednim przebiegu, świadomej aktualizacji istniejącej.
5. `Zapisz`: potwierdzenie utworzenia/aktualizacji bez przejścia do nowego ekranu; można osobno otworzyć sprawę. `Zapisz i dodaj kolejną`: przygotowuje następny niezależny wpis.

## Alternatywy i wyjątki

- Nieudany odczyt URL → fallback ręczny, bez fikcyjnego wyniku „aplikowano”.
- Potencjalny duplikat → **zero automatycznego scalania**.
- URL opublikowany na dwóch portalach może dotyczyć jednej sprawy i być dodatkowym linkiem, a nie obowiązkowo nową sprawą.
- Bez ogłoszenia, stanowiska lub CV w pierwszym kontakcie → prawidłowe warianty sprawy.
- Nie ma zbiorczego importu wielu URL-i ani extension w MVP.

## Reguły i pokrycie

`DEC-014/DEC-015/DEC-029–032/049`, `BR-001/BR-013/BR-014/BR-021/BR-022/BR-029`, `FR-QC-*`, `AC-QC-*`; UX `UX-006`; `UC-001/UC-004/UC-015/UC-016`.

## Zależności / OPEN

Lifecycle, Company/Contact, Case Links, Import, History. `OPEN-002/OPEN-011/OPEN-024/OPEN-025/OPEN-026`, a także bezpieczeństwo pobieranych URL (`NFR-009`). Pełny formularz pozostaje OPEN; późniejszy DEC-052 poniżej zatwierdza minimalną listę pól wyłącznie dla pierwszego create/read.

## Uzgodniona techniczna granica źródeł (2026-10-28)

[ADR-0006](../decisions/adr/0006-allowlisted-smart-import.md) zastępuje wcześniejszą intencję automatycznego pobierania ze wszystkich publicznych URL. Konkretnych domen jeszcze nie zatwierdzono (`OPEN-011`). Użytkownik nadal może dodać adres z dowolnej strony bez automatycznej ekstrakcji.


## Manual Quick Capture — zatwierdzony pierwszy slice (DEC-052)

Źródło: PO, zadanie z 2026-10-29; [dokładny kontrakt](../technical/recruitment-case-first-slice.md). W tym zakresie wejście „Dodaj”/„Dodaj ręcznie” istnieje w realnym minimalnym shellu, bez atrap pozostałych modułów. Sytuacja → Dane → Działanie → Podsumowanie; żadna zmiana kroku nie zapisuje danych. Dane: nazwa 1–160 znaków po trim, opcjonalny pojedynczy HTTP(S), opis do 2000 w „Więcej szczegółów”. Nie wymagaj pracodawcy, stanowiska, kontaktu ani CV. Działanie: wyłącznie „Zapisz tylko sprawę”; stan `Zapisane`, bez historii aplikacji/kontaktu.

Przed zatwierdzeniem pokaż właścicielowi dopasowania po identycznej znormalizowanej nazwie lub URL. Może otworzyć istniejącą sprawę albo świadomie utworzyć niezależną nową; istniejący rekord pozostaje nietknięty. Błąd sprawdzenia lub wyścig nie daje fałszywej deklaracji braku duplikatów. Retry tej samej operacji ma ten sam klucz i payload; świadomy kolejny wpis ma nowy klucz. Timeout oznacza wynik niepotwierdzony, nie domniemany rollback.

Zwykły sukces zamyka kreator, zachowuje bieżący ekran i pokazuje toast z „Otwórz sprawę”. „Zapisz i dodaj kolejną” daje pusty kreator. Błąd zachowuje dane i klucz; nie pokazuje sukcesu. X/Escape i anulowanie z danymi wymagają potwierdzenia odrzucenia, tło nie zamyka. Klawiatura, focus i pełnoekranowy mobile podlegają QA.

**PARTIAL COVERAGE:** FR/AC-QC-001 (brak siedmiu modułów), LC-004 (bez lifecycle), RW-005/009 (lista i pełna minimalna strona, bez Kanbana/drawera), AD-002 (tylko te prywatne dane) i UC/TC-001/029/034. FR-QC-008, Smart Import, import plików oraz pozostałe lifecycle/relacje są poza PR; to nie zmniejsza publicznego MVP. Wyniki testów są odrębne od zatwierdzenia: [raport slice'a](../technical/recruitment-case-first-slice-report.md).
