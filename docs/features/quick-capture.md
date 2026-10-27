# Feature: Quick Capture

**Stan:** `BASELINED` (decyzje UX `APPROVED`). **Aktor:** użytkownik z dowolnego modułu. **FR:** `FR-QC-001`–`FR-QC-012`.

## Cel

Szybko rejestrować prawdziwy kontekst nowej sprawy bez utraty miejsca pracy, bez automatycznego wysyłania aplikacji, łączenia spraw i bez wymuszania pełnej informacji już na początku.

## Wejście

Globalna akcja dodawania otwiera opcje: **ręcznie**, **jeden URL przez Smart Import**, **CSV/XLSX** (osobny wieloetapowy przepływ). Quick Capture nie odczytuje automatycznie prywatnej korespondencji.

## Przebieg — ręczne lub pojedynczy URL

1. Wybierz sposób dodania; dla URL podaj **jeden** link.
2. Smart Import próbuje pozyskać informacje o ofercie. System **prezentuje je do weryfikacji**, nie zapisuje bez tej decyzji.
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

Lifecycle, Company/Contact, Case Links, Import, History. `OPEN-002/OPEN-011/OPEN-024/OPEN-025/OPEN-026`, a także bezpieczeństwo pobieranych URL (`NFR-009`). Dokładny formularz jest przedmiotem UX Discovery, nie został zaakceptowany jako lista pól.
