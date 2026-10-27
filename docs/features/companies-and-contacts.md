# Feature: Companies & Contacts

**Stan:** `BASELINED`. **Aktor:** użytkownik. **FR:** `FR-CC-001`–`FR-CC-011`.

## Cel

Utrzymać lekką centralną pamięć organizacji i osób, dzieloną między sprawami, bez fałszywego wnioskowania o pracodawcy lub udziale kontaktu w cudzej sprawie.

## Scenariusz główny

1. Użytkownik rejestruje firmę/organizację oraz osobę kontaktową; osoby mogą istnieć samodzielnie.
2. Sprawa może obejmować kilka kontaktów; jeden kontakt może uczestniczyć w kilku sprawach. Jedna firma ma wiele niezależnych spraw.
3. W kontakcie od agencji pracodawca może pozostać nieujawniony, a agencja i rekruter są rozróżnialni od docelowego pracodawcy.
4. Profil firmy pokazuje powiązane sprawy i kontakty.
5. Profil osoby pokazuje **tylko zdarzenia, w których ta osoba faktycznie uczestniczyła**; odnośniki do tych samych źródłowych wydarzeń nie są duplikatami danych.
6. Jeśli użytkownik rejestruje komunikację z kontaktem, musi wskazać sprawę, której ta komunikacja dotyczy.

## Alternatywy i błędy

- Kontakt bez sprawy jest dozwolony; dopiero próba zapisania korespondencji wymaga powiązania do sprawy.
- Sprawa bez zidentyfikowanego pracodawcy jest dozwolona.
- Jeden rekruter prowadzi dwa procesy — zdarzenia przypisane do konkretnej sprawy/osoby, nie wszystkie firmy „dziedziczą” całej historii rekrutera.
- Kiedy osoba była tylko obserwatorem kontaktu (bez potwierdzenia jej udziału), nie dodawaj fikcyjnego wydarzenia.

## Reguły i zależności

`DEC-001–003/025/042–044`, `BR-001/BR-002/BR-018/BR-019/BR-027/BR-028`, `FR-CC-*`, `AC-CC-*`; `UX-013/UX-014`; `UC-006–008/019`. Zależności: Lifecycle, History/Events, Global Search.

## OPEN

`OPEN-002/OPEN-005/OPEN-024/OPEN-030/OPEN-032`: pola kontaktów, relacje, deduplikacja, prywatność i edycja uczestnictwa.
