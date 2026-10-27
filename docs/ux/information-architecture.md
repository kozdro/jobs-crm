# Architektura informacji i mapa ekranów

**Stan:** `BASELINED` na poziomie struktury i zachowań. To **nie** jest wireframe, specyfikacja CSS ani routing techniczny. **Podstawa:** `DEC-016–021`, `DEC-029/DEC-032/DEC-038`.

## Mapa workspace'u

| ID | Obszar / ekran | Zatwierdzona odpowiedzialność |
|---|---|---|
| UX-001 | Dashboard (landing po loginie) | Operacyjne zadania, terminy, sugestie, ostatnia aktywność, statystyki. |
| UX-002 | Rekrutacje — Kanban | Domyślny przegląd spraw w 4 kolumnach statusów. |
| UX-003 | Rekrutacje — lista | Alternatywny przegląd tych samych spraw z filtrami/sortowaniem. |
| UX-004 | Drawer sprawy | Szybki podgląd, lekkie działania i droga do pełnej strony. |
| UX-005 | Pełna strona sprawy | Historia w centrum; kontekst: dokumenty, zadania, osoby, linki, warunki. |
| UX-006 | Quick Capture | Globalne utworzenie ręczne lub z pojedynczego URL; „Zapisz” bez nawigacji. |
| UX-007 | Import pliku — mapowanie | Wczytanie CSV/XLSX, dopasowanie kolumn i słowników. |
| UX-008 | Import — podgląd i decyzje | Weryfikacja danych, błędów, duplikatów i zakresu importu. |
| UX-009 | Import — wynik | Co zapisano/pominięto i dlaczego; ponowny import chroniony. |
| UX-010 | Zadania | Lista zadań ogólnych i powiązanych ze sprawami, ich stan i terminy. |
| UX-011 | Kalendarz | Wydarzenia, aktualizacje terminów i rozliczanie odbycia. |
| UX-012 | Dokumenty | Biblioteka, wersje i powiązania z konkretnymi sprawami. |
| UX-013 | Firmy | Lista/profil firmy, jej sprawy i kontakty. |
| UX-014 | Kontakty | Lista/profil osoby oraz historia jej rzeczywistych powiązań. |
| UX-015 | Global Search | Dostępne z każdego modułu; wyniki grupowane wg typu. |
| UX-016 | Ustawienia etapów | Personalizacja globalnych etapów; szczegółowy UI `OPEN-003/OPEN-027`. |
| UX-017 | Wejście po zalogowaniu | APPROVED tylko rezultat: otwarcie prywatnego Dashboardu; ekran i metoda logowania `OPEN-013`. |
| UX-018 | Profil, sesja i operacje na własnych danych | PROPOSED: zarządzanie profilem, wylogowanie, eksport i usunięcie; struktura poza siedmioma głównymi modułami `OPEN-042/044/045/046`. |
| UX-019 | Rejestracja i odzyskiwanie dostępu | PROPOSED: dostępność i kroki `OPEN-041/043`, bez przesądzania sposobu weryfikacji tożsamości. |

Nazwy tras URL nie są zatwierdzone. Architektura nie zakłada konkretnego systemu nawigacji na mobile.

**Uwaga o kontach:** `UX-017`–`UX-019` nie dodają ósmego modułu głównego ani nie zatwierdzają nowego menu ustawień. Tylko rezultat wejścia po logowaniu jest `APPROVED`; reszta to `PROPOSED/OPEN` ([specyfikacja konta](../features/account-and-data-management.md)).

## Stała nawigacja (`APPROVED`)

Główne moduły: **Dashboard · Rekrutacje · Zadania · Kalendarz · Dokumenty · Firmy · Kontakty**. Niezależnie od modułu użytkownik ma dostęp do **Global Search** i **Quick Capture**. Po zalogowaniu widzi Dashboard; obowiązkowy onboarding nie występuje.

## Najważniejsze wybory zachowania (`APPROVED`)

- Kanban domyślny, lista alternatywna, statusy jako kolumny; szczegółowe etapy pokazane na kartach. „Zakończone” domyślnie zwinięte i możliwe do otwarcia.
- Drag & drop przechodzi przez logikę biznesową i walidacje; nie omija wyniku zamknięcia ani nie tworzy fikcyjnego zaproszenia.
- Drawer służy szybkim zadaniom, pełna strona kompleksowemu prowadzeniu sprawy. Historia na pełnej stronie nie jest zamknięta w osobnej głównej zakładce.
- Oddzielne małe ikony działań oraz lokalne „Dodaj nowe”; krótkie notatki inline, rozbudowane formularze w dialogu.
- Brak listy ostatnich rekrutacji i wielkiego Kanbana w Dashboardzie; „ostatnia aktywność” nie jest taką listą.
- `Zapisz` w Quick Capture pozostawia użytkownika w bieżącym widoku; `Zapisz i dodaj kolejną` umożliwia serię osobnych zapisów.

## Na razie niezdefiniowane (`OPEN`)

Docelowe layouty, dokładne formularze/pola, responsywność, stany ładowania, komunikaty dostępności i walidacyjne, szczegółowe filtry, organizacja ustawień, zachowanie poszczególnych dialogów i design system: `OPEN-002/OPEN-017/OPEN-028/OPEN-033`. Kolejny etap UX może te kwestie rozstrzygać bez zmiany zatwierdzonych przepływów.
