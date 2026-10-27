# Wizja, problem i zakres produktu

**Stan:** `BASELINED`. **Ważność faktów:** elementy oznaczone `APPROVED`; pozostałe wyraźnie opisane. **Powiązania:** `DEC-001`, `DEC-046`–`DEC-048`.

## Problem

Aktywnie poszukująca pracy osoba korzysta równolegle z portali pracy (m.in. Just Join IT, No Fluff Jobs, theprotocol, LinkedIn), poczty, stron firmowych i bezpośrednich kontaktów. Nie ma jednej wiarygodnej pamięci tego, czy, kiedy, na co i jak aplikowała; z kim rozmawiała; jakie dokumenty wysłała; na czym skończył się proces i co jeszcze należy zrobić.

**Core problem:** rozproszona historia poszukiwania pracy powoduje utratę kontekstu, powtórne aplikacje, pomijanie follow-upów i trudność w odtwarzaniu przebiegu rekrutacji.

## Wizja (`APPROVED`)

Jobs CRM jest osobistym, webowym workspace'em do rejestrowania i śledzenia **spraw rekrutacyjnych** od zapisania oferty lub pierwszego kontaktu do zakończenia/wznowienia, wraz z historią, kontaktami, zadaniami, wydarzeniami, terminami, dokumentami i użytecznymi podpowiedziami opartymi na regułach. Historia powinna być wyszukiwalna, a działania użytkownika nie mogą być przypisywane mu fikcyjnie.

## Użytkownicy i rynek (`APPROVED`)

- Pierwotnie produkt dla właściciela projektu; potem ewentualnie znajomi i publiczne wydanie.
- Pierwszy segment: osoby **aktywnie** poszukujące pracy w IT/digital; pierwszy rynek: **Polska**.
- Kierunek ekspansji: Europa, kolejne branże; dalej osoby pracujące, pasywnie szukające, juniorzy.
- Formalne badania z respondentami nie są częścią obecnego planu. Model płatności nie został przyjęty.

## Granica pierwszego wydania (`APPROVED`)

Publiczne MVP to **pełniejszy produkt**, nie wyłącznie Kanban demo. Prace można wdrażać etapami wewnętrznymi. Główne możliwości:

1. Zarządzanie cyklem sprawy, statusami/etapami i historią działań.
2. Workspace Rekrutacje (Kanban + lista), Dashboard operacyjny.
3. Zadania, kalendarz/wydarzenia, przypomnienia wewnątrz aplikacji i opcjonalny e-mail, sugestie regułowe.
4. Firmy, kontakty, biblioteka dokumentów i powiązania wersji CV.
5. Global Search po określonym zbiorze treści.
6. Quick Capture: ręczne dodanie, pojedynczy URL ze Smart Import oraz import CSV/XLSX.

Zatwierdzone zachowanie modułów: [katalog FR](../requirements/functional-requirements.md), [specyfikacje](../features/README.md).

## Konto i własne dane — granica decyzji

**APPROVED (wynik, nie mechanizm):** użytkownik trafia po zalogowaniu na Dashboard (`DEC-018`), a jego dokumenty oraz dane osobowe pozostają prywatne (`BR-030/NFR-001`). Jest to niezmiennik również wtedy, gdy aplikacja obsługuje więcej niż jedno konto.

**PROPOSED, niezatwierdzone jako komplet MVP:** rejestracja samoobsługowa, wylogowanie/zarządzanie sesją, odzyskiwanie dostępu, edycja profilu, eksport oraz usunięcie konta. Wymagają rozstrzygnięcia `OPEN-013/OPEN-032/OPEN-041`–`OPEN-046`. Por. [Account & Data Management](../features/account-and-data-management.md) i `FR-AD-*`.

## Świadomie poza pierwszym MVP (`DEFERRED`)

- Przyszły **AI Career Agent**: wyszukiwanie ofert, analiza dopasowania, personalizacja CV i wiadomości, przygotowywanie aplikacji, wsparcie follow-upów, integracje i wybrane działania **za zgodą użytkownika**. Agent i jego infrastruktura nie należą do MVP.
- Wyszukiwanie semantyczne i indeksacja treści plików.
- Rozszerzenie przeglądarki, zbiorcze przetwarzanie wielu URL-i.
- Spersonalizowane zapisywane konfiguracje filtrów.
- Powiadomienia push w pierwszej wersji.
- Rozbudowana monetyzacja/paywall i infrastruktura typowa dla zaawansowanego SaaS.

## Zasady graniczne

- Nie utożsamiaj ogłoszenia ze sprawą, wysłanej aplikacji z zaimportowanym URL ani kontaktu z faktem wysłania CV.
- Nie podejmuj decyzji technologicznych, dopóki ich warianty nie przejdą osobnego discovery.
- Bezpieczeństwo prywatnych dokumentów i danych kontaktowych jest wymaganiem; **mechanizm** nie został wybrany.
- Nie zamykaj spraw ani nie wysyłaj wiadomości automatycznie na podstawie ciszy w CRM.

## Otwarte warunki dalszego projektowania

Modele pól i walidacji (`OPEN-002`), wyniki zakończenia (`OPEN-001`), przypomnienia (`OPEN-008/OPEN-009`), import transakcyjny (`OPEN-010`) i retencja/usuwanie (`OPEN-005/OPEN-006`) wymagają dalszego opracowania. Zob. [pełny rejestr](../decisions/open-questions.md).
