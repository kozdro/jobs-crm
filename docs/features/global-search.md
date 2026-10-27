# Feature: Global Search

**Stan:** `BASELINED` (zakres wyszukiwania `APPROVED`, ranking `OPEN`). **Aktor:** użytkownik z dowolnego modułu. **FR:** `FR-GS-001`–`FR-GS-008`.

## Cel

Odnaleźć starszy kontekst rekrutacyjny bez znajomości nazwy sprawy; dotrzeć do rekordu i jego rzeczywistych powiązań.

## Scenariusz

1. Z dowolnego modułu użytkownik otwiera Global Search.
2. Szuka po sprawie/stanowisku, organizacji, osobie, powiązanym URL-u, notatce lub opisie wydarzenia.
3. Wyniki są grupowane według typu i pozwalają przejść do odpowiedniego rekordu/kontekstu.
4. Zakończona sprawa pozostaje odnajdywalna; trafienie w notatkę z dawnej rozmowy otwiera jej sprawę/kontekst.

## Błędy i wyłączenia

- Zero trafień nie oznacza zmiany danych; zapewnij jednoznaczny pusty wynik.
- URL korespondencji jest tylko adresem i nie upoważnia do indeksowania jej treści.
- W pierwszym wydaniu **nie** wyszukujemy semantycznie ani w zawartości dokumentów.
- Dopasowanie, sortowanie trafień, uprawnienia do wyników i stan archiwum wymagają `OPEN-038/OPEN-013/OPEN-005`.

## Powiązania

`DEC-038/DEC-050`, `BR-012/BR-014/BR-015/BR-019/BR-030`, `FR-GS-*`, `AC-GS-*`; `UX-015`; `UC-020`. Wymaga spójnych relacji do Case, Company/Contact, Notes, Events i Links.
