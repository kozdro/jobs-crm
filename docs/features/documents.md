# Feature: Documents

**Stan:** `BASELINED` (logika użytkowa `APPROVED`, retencja `OPEN`). **Aktor:** użytkownik. **FR:** `FR-DO-001`–`FR-DO-010`.

## Cel

Udostępniać bibliotekę dokumentów wielokrotnego użytku i prywatne załączniki spraw, w tym wiele wersji CV, z rozróżnieniem „powiązano ze sprawą” oraz „rzeczywiście wysłano”.

## Przebieg

1. Użytkownik otwiera centralną bibliotekę, może korzystać z dokumentów wielokrotnego użytku lub dodać załącznik do konkretnej sprawy.
2. Przy dodawaniu do sprawy wybiera istniejący dokument z biblioteki albo nowy plik tylko dla sprawy, albo zapisuje plik również w bibliotece.
3. Wersje CV pozostają rozróżnialne. Dla aplikacji, do której wysłano CV, można wskazać **konkretną** wersję faktycznie wysłaną.
4. Samo powiązanie dokumentu ze sprawą **nigdy nie stanowi potwierdzenia wysłania**.

## Przypadki brzegowe

- Zmiana używanej wersji CV nie może automatycznie przepisać historii wcześniej wysłanej wersji.
- Dodanie CV do biblioteki bez powiązanej aplikacji nie tworzy zdarzenia rekrutacyjnego.
- Usuwanie pliku powiązanego z historyczną aplikacją ma nierozstrzygnięte konsekwencje: `OPEN-006/OPEN-036`.
- Mechanizmy prywatności, polityki retencji i rozmiary plików: `OPEN-006/OPEN-007/OPEN-013/OPEN-032`.

## Powiązania

`DEC-039–041`, `BR-026/BR-030`, `NFR-001`, `FR-DO-*`, `AC-DO-*`, `UX-012/UX-005`, `UC-018`. Zależności: Lifecycle, Quick Capture, Company/Contact, security/storage Technical Discovery.

## Granica operacji historycznych

Operacje na wersji CV powiązanej z faktycznie wysłaną aplikacją nie mogą po cichu zmienić historycznej tożsamości wersji (`AC-DO-005-02`). Dokładna polityka usuwania, archiwizacji i retencji wciąż wymaga `OPEN-006/036`; nie narzuca się tutaj blokady usuwania ani soft delete.

## Documents Core — zatwierdzony kontrakt DEC-065

[DEC-065](../decisions/product-decisions.md#documents-core--2026-11-11) zatwierdza dokładnie opcje 1A/2A/3A/4A [analizy](../technical/documents-core-analysis.md#4-jeden-zbiorczy-pakiet-decyzji-po). Wcześniejsze wskazania, że ten podzakres usuwania i wersji jest nierozstrzygnięty, opisują stan sprzed decyzji; pozostałe części OPEN pozostają otwarte.

Biblioteka pozwala użyć tej samej wersji w wielu sprawach. Case-only pozostaje w swojej sprawie. Dokument ma nazwę 1–160 punktów kodowych po trim, jawne oznaczenie CV (domyślnie nie); wersja stabilny numer i opcjonalną etykietę do 160 punktów kodowych. Nowe bajty to nowa wersja. Zmiana nazwy, oznaczenia lub etykiety wymaga kontroli współbieżności i audytu.

Wyłącznie jawne potwierdzenie przypisuje zero lub wiele różnych konkretnych wersji CV do konkretnego faktu application; również później, przy nieznanej dacie i sprawie zakończonej. Brak CV nie dowodzi niewysłania. Korekta i wycofanie są audytowane, void unieważnia znaczenie referencji bez usuwania bytes. Zapis nowego application z referencjami jest atomowy. Quick Capture zachowuje istniejący kontrakt; uzupełnienie CV następuje przy istniejącym fakcie.

Odłączenie nie usuwa historii ani współdzielonych bajtów; ostatnie case-only wymaga wyboru kasacji albo anulowania. Delete wymaga aktualnego preview i potwierdzenia skutków; od chwili zatwierdzenia nowe odczyty i relacje są blokowane, fizyczny wynik potwierdzany przez Storage API, awarie pozostają widoczne i są ponawiane. Ślad wysłanej wersji po kasacji zawiera tylko dozwolone opaque ID, numer, referencję, stan i niezbędne czasy; bez nazw, etykiet, hash, rozmiaru, MIME ani ich odzyskania z audytu lub receipt. Niewysłana wersja nie pozostawia bezterminowego tombstone; ledger ukończonej kasacji trwa 7 dni, dłużej tylko dla trwającego restore obejmującego starszą kopię. Porzucone uploady wygasają po 24 h i pozostają w quota do fizycznej kasacji.

Dopuszczone formaty PDF/DOC/DOCX/TXT/JPEG/PNG, do 20 MiB na plik i 1 GiB na konto, również pending. Walidacja struktury i rzeczywistych bytes odrzuca pusty, niespójny, niewalidowalnie szyfrowany, aktywny lub niebezpieczny kontener; bez cichej konwersji i obietnicy antywirusa. Pobranie jest autoryzowane i wyłącznie attachment, bez signed download URL. Bieżąca weryfikacja Auth jest wymagana przy inicjacji delete, niedostępność Auth blokuje inicjację. Granica walidatora i cleanup oraz kompensacje: [ADR-0015](../decisions/adr/0015-documents-storage-boundary.md).
