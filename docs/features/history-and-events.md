# Feature: History & Events

**Stan:** `BASELINED` (główna semantyka `APPROVED`). **Aktor:** użytkownik. **FR:** `FR-HE-001`–`FR-HE-013`.

## Cel

Utrzymać jedną, prawdziwą chronologię sprawy oraz cykl życia zaplanowanych i odbytych wydarzeń bez zamieniania historii w techniczny audit log lub kalendarza w automatyczną „listę odbytych”.

## Wpis i oś czasu

1. Istotne akcje biznesowe, notatki i zdarzenia prezentuje jedna historia na stronie sprawy.
2. Porządek określa **rzeczywista data zdarzenia**; odróżnij ją od daty dodania do systemu.
3. Krótka notatka może być wprowadzona inline; dla złożonej czynności przewidziany jest dialog. Oddzielne małe przyciski pozwalają uruchomić konkretne działania w odpowiedniej sekcji.
4. Zmiana błędnego pola/statusu nie tworzy nowego faktu aplikowania ani sztucznej rozmowy; poziom audytu korekt jest `OPEN-004/OPEN-020`.

## Wydarzenie kalendarza

1. Użytkownik dodaje spotkanie/rozmowę z możliwością kilku uczestników.
2. Może przełożyć termin, oznaczyć jako odbyte, nieodbyte lub anulowane.
3. Może zarejestrować rozmowę już odbytą, nie tworząc fikcyjnego wcześniejszego planu.
4. Po terminie wydarzenie pozostaje **nierozliczone**, dopóki nie zostanie potwierdzone; system proponuje użytkownikowi rozliczenie.
5. Historia kontaktu obejmuje zdarzenie tylko, gdy kontakt rzeczywiście był jego uczestnikiem (`BR-019/BR-027`).

## Alternatywy / bezpieczeństwo semantyczne

- „Przełożone” nie jest „odbyte”; porządek pierwotnych terminów i sposobu prezentacji wymaga `OPEN-021`.
- Termin w przeszłości bez potwierdzenia → propozycja rozliczenia, nie zmiana automatyczna.
- Korekta daty rzeczywistego zdarzenia może zmienić kolejność na osi czasu; zasady edycji `OPEN-004`.
- Kilka wydarzeń i osób nie może tworzyć zduplikowanych faktów historii.

## Podstawa i zależności

`DEC-021–025`, `BR-015–019/027`, `FR-HE-*`, `AC-HE-*`, `UX-005/UX-011`, `UC-010/UC-011/UC-019/UC-020`. Lifecycle, Calendar, Contacts, Dashboard, Tasks.

## OPEN

`OPEN-004/OPEN-020/OPEN-021/OPEN-030/OPEN-037` — edycja historii, rozliczenie uczestników, daty i strefy; nie ustanawiaj domyślnego automatu zdarzeń poza zatwierdzonymi możliwościami.
