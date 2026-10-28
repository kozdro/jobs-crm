# Audyt spójności i gotowości dokumentacji — bootstrap (snapshot historyczny)

**Data:** 2026-10-27. **Stan:** `BASELINED` (audyt dokumentów, nie audyt implementacji). **Materiał wejściowy:** zatwierdzony baseline właściciela projektu przekazany w zadaniu. Pełna transkrypcja poprzedniego czatu nie była załączona jako osobny zasób.

> **Snapshot historyczny bootstrapu.** Liczby i oceny w tym raporcie dotyczą stanu dokumentacji z 27 października 2026 r., **nie** aktualnych metryk po Documentation Hardening (PR #1). Zachowano je bez aktualizacji dla odtwarzalności pierwotnego audytu. Aktualne powiązania znajdują się w [traceability](traceability.md), a bieżące kryteria w [katalogu AC](acceptance-criteria.md).

## Zakres pokrycia

| Obszar | Wynik audytu |
|---|---|
| Wizja/segment/MVP/ograniczenia | Zapisane w Product i decyzjach. |
| Model domenowy, statusy, etapy, historia, kontakty, dokumenty | Słownik koncepcyjny + 30 reguł BR; szczegóły OPEN oznaczone jawnie. |
| Główna nawigacja i UX behavior | 16 identyfikatorów UX, przepływy, bez projektu wizualnego. |
| 10 głównych modułów | 10 specyfikacji funkcjonalnych, 1 indeks. |
| Wymagania funkcjonalne | 126 unikalnych FR, każdy ma 1 odpowiadające AC i powiązania DEC/BR/OPEN. |
| Testy akceptacyjne i E2E | 126 AC i 32 pary UC/TC, **wszystkie planowane, żaden test aplikacyjny nie był wykonany**. |
| Traceability | Wszystkie 126 FR powiązane z AC i planowanym UC/TC. |
| Decyzje | 50 decyzji w rejestrze: zatwierdzone działania i świadomie odłożony zakres. |
| Kwestie otwarte | 40 OPEN, w tym 14 P0, 21 P1, 5 P2. |
| NFR/Technical Discovery | 11 NFR o jawnych statusach, 10 tematów Technical Discovery; brak wybranego stacku i zaakceptowanych ADR. |
| Agent workflow | Root `AGENTS.md`, szablon zadania, bramki approval, testy i review. |

## Odkryte niejednoznaczności (bez fałszywego stwierdzenia konfliktu)

1. **Zaproszenie i stan aktywny:** zaproszenie do etapu kwalifikacyjnego jest warunkiem `W rekrutacji`, ale zależność akcji „Zarejestruj zaproszenie” i „Rozpocznij rekrutację” pozostaje do decyzji (`OPEN-018`).
2. **Status i etap są rozdzielone:** zatwierdzenie niezależności nie definiuje kompletu prawidłowych kombinacji ani polityki propagacji globalnych zmian (`OPEN-003/OPEN-027/OPEN-034`).
3. **Korekta a historia:** można poprawić błędną klasyfikację bez fikcyjnego zdarzenia, lecz polityka edycji i audytu historii nie została ustalona (`OPEN-004/OPEN-020`).
4. **Zamknięcie i wznowienie:** wynik zamknięcia jest obowiązkowy, ale jego słownik nie jest zatwierdzony; skutki zachowania/odłączania otwartych działań i wybór „nowa sprawa vs wznowienie” wymagają doprecyzowania (`OPEN-001/OPEN-019/OPEN-029`).
5. **Import historyczny:** zaakceptowano mapowanie, częściowy zapis i blokowanie fikcyjnych zdarzeń, ale nie transakcyjność, undo, retry ani konflikty importowanych statusów (`OPEN-010/OPEN-022/OPEN-035`).
6. **Kontakt samodzielny vs historia rozmów:** to nie sprzeczność — kontakt może istnieć bez sprawy, natomiast rzeczywistą komunikację z nim rejestruje się w sprawie (`BR-018/BR-019`).
7. **Wersja CV powiązana vs wysłana:** to odrębne pojęcia; retencja i skutki usuwania już wysłanej wersji są nadal otwarte (`OPEN-006/OPEN-036`).

**Wniosek:** brak sprzecznych decyzji `APPROVED`, które uniemożliwiałyby dokumentacyjny bootstrap. Są otwarte konsekwencje implementacyjne; nie należy ich rozwiązywać domyślną architekturą ani wymyślonym UI.

## Gotowość do kolejnych etapów

| Etap | Ocena |
|---|---|
| Repozytorium dokumentacyjne do pracy agentowej | **Gotowe** po odczytaniu `AGENTS.md` i opanowaniu statusów `OPEN`. |
| Dalszy UX Discovery / wariantowe prototypowanie | **Możliwe**, ale wyników zamknięcia, szczegółów DnD i pól nie wolno przedstawiać jako zatwierdzonych. |
| Technical Discovery | **Możliwe**; brak wybranego stacku jest zamierzony. |
| Implementacja całego MVP | **Jeszcze niegotowa**: istnieją `P0 OPEN`, niezatwierdzone kontrakty danych i architektura. |
| Wydanie publiczne | **Nieocenione** bez działającego kodu, review i testów. |

## Rekomendowana sekwencja działań

1. Uzgodnić w kolejnych rozmowach semantykę cyklu sprawy (`OPEN-001/OPEN-018/OPEN-020/OPEN-029`) oraz minimalne schematy (`OPEN-002`).
2. Dokończyć UX Discovery statusów i Quick Capture/DnD/importu na zatwierdzonych zasadach, pokazując warianty dla nieustalonych ekranów (`OPEN-017/OPEN-024/OPEN-028`).
3. Przeprowadzić Technical Discovery prywatności, historii danych, importu i przechowywania plików (`OPEN-004/OPEN-006/OPEN-010/OPEN-013/OPEN-032/OPEN-035`), następnie dopiero wybór stacku/ADR.
4. Po decyzjach doprecyzować FR/AC/UC i traceability, a dopiero potem przygotować zadania implementacyjne z szablonu agenta.

Nie proponujemy ponownie formalnych badań z respondentami ani modelu subskrypcji — oba tematy mają odrębny, świadomie określony status.
