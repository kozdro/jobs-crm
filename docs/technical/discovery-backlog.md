# Backlog Technical Discovery — bez wyboru stacku

**Stan:** `BASELINED` jako katalog pytań. Warianty technologiczne są **`OPEN`/`PROPOSED`**, a nie zatwierdzone. Nie ma aplikacyjnego boilerplate'u, migracji DB ani infrastruktury.

## Wymagane analizy przed architekturą

| ID robocze | Cel analizy | Przesłanki | Wynik wymagany do decyzji |
|---|---|---|---|
| TD-01 | Model persystencji i relacji | Sprawa vs organizacja/ogłoszenie, historia, wielokrotne zakończenia, relacje kontaktów i CV | Conceptual-to-logical mapping + ryzyka, bez założenia typu bazy; `OPEN-002/OPEN-004/OPEN-005`. |
| TD-02 | Uprawnienia, prywatność, izolacja | Osobiste dokumenty/CV, prywatna korespondencja, rejestracja i dostęp, sesje, odzyskiwanie konta, profil (funkcje konta `PROPOSED`), przyszłe SaaS | Threat model, granice izolacji danych, warianty kont i autoryzacji bez wyboru mechanizmu/dostawcy; `OPEN-013/OPEN-032/OPEN-041/OPEN-042/OPEN-043/OPEN-044`. |
| TD-03 | Operacje URL / Smart Import | Pobieranie ofert z różnych domen, błędy i prywatne adresy | Warianty ekstrakcji, ograniczenia portali, ochrona sieciowa; `OPEN-011/OPEN-025`. |
| TD-04 | CSV/XLSX, staging i transakcje | Mapping, preview, partial import, awarie, idempotencja, undo | Opcje transakcyjne, raport i rollback/retry; `OPEN-010/OPEN-022/OPEN-023/OPEN-035`. |
| TD-05 | Dokumenty i wersjonowanie | Wersje CV, wysłana vs powiązana, prywatność i retencja dokumentów, możliwy eksport/usunięcie danych konta (`PROPOSED`) | Model plików, polityka wersji, kontrola dostępu, konsekwencje eksportu i usuwania dla powiązań historycznych; `OPEN-006/OPEN-007/OPEN-032/OPEN-036/OPEN-045/OPEN-046`. |
| TD-06 | Wyszukiwanie | Notatki, URL-e, opisy wydarzeń i zamknięte sprawy | Warianty indeksowania, mechanizm uprawnień, wydajność; `OPEN-038`. |
| TD-07 | Zadania, sugestie, harmonogram | Wewnętrzne/e-mail, brak autozamknięcia, suppression przy imporcie | Warianty triggerów i kontroli powiadomień; `OPEN-008/OPEN-009/OPEN-040`. |
| TD-08 | Responsywność i accessibility | 7 modułów, Kanban, drawer, mapowanie importu | Wymagania dostępności i target urządzeń; `OPEN-017/OPEN-033`. |
| TD-09 | Operacje i odzyskiwanie | Retencja, backup, przywracanie, monitoring, izolacja kont oraz potencjalny eksport/usunięcie konta i danych (`PROPOSED`) | Ryzyka i warianty ochrony eksportów, skutków usuwania danych w backupach, odtwarzania i kosztów, bez przyjęcia polityki retencji; `OPEN-005/OPEN-006/OPEN-014/OPEN-032/OPEN-045/OPEN-046`. |
| TD-10 | Strategia testów i przeglądu | Testowalność AC, privacy/security, mały projekt SDD/AIDD | Minimalny pipeline testów po wyborze stacku (bez wdrażania teraz). |

## Jak oceniać warianty

Kryteria do użycia w przyszłym discovery: prostota i koszt utrzymania dla jednego użytkownika, integralność danych i historii, bezpieczeństwo, możliwość rozwoju do wielu użytkowników bez przedwczesnego SaaS overengineeringu, migracyjność, wsparcie testów, ergonomia pracy agentów AI, jakość dokumentacji, elastyczność importu.

**Nie** zakładaj, że publiczne MVP wymaga od razu kolejek, wektorowej bazy danych, rozbudowanych event busów lub orkiestracji agentów. Potrzebę takich elementów trzeba najpierw wykazać.

## Bramka decyzji

Po opracowaniu wariantów i ich ryzyk właściciel projektu zatwierdza wybór. Istotne decyzje zapisuj w [ADR](../decisions/adr/README.md) i połącz z `NFR/OPEN/FR`; sam backlog nie upoważnia do wyboru stacku.
