# Feature: Dashboard

**Stan:** `BASELINED` (główna zawartość `APPROVED`). **Aktor:** użytkownik po logowaniu. **FR:** `FR-DB-001`–`FR-DB-008`.

## Cel

Ekran codziennej pracy odpowiadający na pytania: co wymaga uwagi, co nadchodzi i co niedawno wydarzyło się w moich sprawach — bez zamieniania Dashboardu w drugą listę rekrutacji.

## Główny scenariusz

1. Po zalogowaniu użytkownik przechodzi od razu na Dashboard; bez obowiązkowego onboardingu.
2. Widzi zadania wymagające uwagi, nadchodzące wydarzenia, sugestie systemowe, zwięzły strumień ostatniej aktywności i krótkie statystyki.
3. Przechodzi do właściwego kontekstu z poziomu informacji; szczegółowe zachowanie kart/linków należy do następnego UX Discovery (`OPEN-017`).

## Alternatywy i błędy

- Brak spraw/zadań/wydarzeń: ekran nie zmusza do tworzenia danych i nie fabrykuje aktywności.
- Sugestia follow-upu nie jest zadaniem i nie wysyła wiadomości.
- Zaległe wydarzenie bez potwierdzenia nie figuruje jako odbyte.
- Techniczna korekta statusu nie udaje nowej rozmowy w „ostatniej aktywności”.

## Powiązania

`DEC-016/DEC-018/DEC-028`, `BR-009/BR-015–017/020`, `FR-DB-*`, `AC-DB-*`; UX `UX-001`; scenariusze `UC-011/UC-020`. Zależne od Tasks, Events, History i reguł sugestii.

## OPEN

`OPEN-008/OPEN-009/OPEN-039` — progi sugestii, zasady wyświetlania, definicje statystyk i filtr czasu; nie zakładaj ich w implementacji.
