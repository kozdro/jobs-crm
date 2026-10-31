# Recruitment Workspace 1A/2A — kontrakt UX

**APPROVED przez DEC-059, 2026-10-31.** Implementacja istniejących UX-002–005 i F05 w ograniczonym przyroście read-only. Bez DnD, zmiany kolejności kart i zapisu lifecycle w Workspace.

- Rekrutacje otwierają domyślny Kanban: cztery statusy, Zakończone początkowo zwinięte. Przełączenie Lista/Kanban zachowuje wspólny filtr i sort; stronicowanie osobne dla kolumn i listy. Dalsze wyniki są jawne, brak liczników udających kompletność.
- Pasek ma natywne checkboxy statusów (OR), wybór bezpośrednio powiązanej organizacji i osoby (AND), datę dodania rosnąco/malejąco. Wszystkie/Aktywne/Zakończone zmieniają tylko statusy; Zakończone rozwija kolumnę. Reset usuwa filtry i przywraca najnowsze. Lookupy firm/osób mają dalsze strony, bez ograniczenia do pierwszych 25 profili. Błąd lookupu jest widoczny.
- Karty i wiersze mają rzeczywisty tytuł, status/etap, jawne organizacje z rolami i datę technicznego dodania. Kilka powiązań nie jest redukowanych do domyślnego pracodawcy. Ograniczony fragment relacji jest nazwany i ma drogę do pełnego kontekstu.
- Kliknięcie tytułu otwiera ten sam drawer. Desktop: overlay z prawej bez zmiany szerokości tablicy, niemodalny. Dostępne niezasłonięte karty mogą przełączać sprawę także klawiaturą. Focus nie może trafić do zasłoniętego elementu. Puste tło nie zamyka, X/Escape zamyka i oddaje fokus do ostatniej karty. Mobile: pełnoekranowy dialog z własnym Wstecz i kontrolą fokusu.
- Drawer pokazuje wyłącznie dane odczytane dla dokładnego ID: kontekst, status/etap, źródło, firmy/osoby i podpisany fragment prawdziwej historii. Nie ma notatek do edycji, fikcyjnych najbliższych działań, lifecycle ani korekt. Otwórz pełną stronę prowadzi do istniejącego detalu.
- Kontekst nawigacji (widok, filtry/sort, strony, rozwinięcie Zakończonych, scroll strony/tablicy/kolumn) jest zachowany przy realnym przejściu z Workspace. Drawer po powrocie zamknięty. Wejście bezpośrednie do sprawy prowadzi do zwykłych Rekrutacji; nie fabrykuje poprzedniego stanu. Pamięć kontekstu jest nietrwała i owner-scoped; bez treści spraw/profili w browser storage.
- Ładowanie, błąd/retry, brak spraw, brak dopasowań i niedostępny podgląd są odrębnymi stanami. Nowe ID natychmiast usuwa stary podgląd; anulowanie requestu/generacja chronią przed spóźnioną odpowiedzią. Query zmienia widok, nie dane domenowe.
- Visual Language: istniejące mineralne tło, powierzchnie i semantyczne tokeny, petrol, natywne etykiety, zawijanie długich danych. Brak nowych palet/KPI. Kontrolki minimum 44px dla głównych akcji, widoczny focus. Tablica przewija się w swoim obszarze; nie powoduje poziomego overflow całej strony. Lista pozostaje dostępna dla wąskich ekranów.

Weryfikacja: docelowo 1440/1024/768/375, 320 reflow i 200% tekstu, klawiatura, overlay/focus i restore; rzeczywisty wynik w raporcie QA. Dokument nie stanowi dowodu wykonania testów.

## Techniczny powrót i Auth

Nietrwały owner-scoped kontekst jest przenoszony pojedynczym UUID `workspaceResume` w query, bez treści spraw/profili. Istniejący klient Auth usuwa fragmenty URL przed inicjalizacją sesji; powrót nie wykorzystuje więc fragmentu i nie zmienia tej ochrony. Nonce musi pasować do rzeczywiście zapamiętanego kontekstu tego samego właściciela i poprzedniej destynacji. Zduplikowany/nieprawidłowy parametr, cudzy właściciel lub brak pamięci nie tworzą kontekstu. Po przywróceniu query wraca do poprzedniej postaci; w istniejącym history.state zostaje wyłącznie techniczny nonce dla browser Back. Paginacja historii zachowuje zwalidowany `workspaceReturn` w detalu.
