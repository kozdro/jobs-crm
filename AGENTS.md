# AGENTS.md — kontrakt współpracy z agentami AI

**Zakres:** całe repozytorium. **Etap:** dokumentacja / discovery; **bez zgody PO nie rozpoczynaj implementacji produktu.**

## 0. Zasada nadrzędna

Specyfikacja jest źródłem prawdy, a **właściciel produktu** podejmuje rozstrzygnięcia produktowe. Agent nie zamienia hipotez w fakty, nie zgaduje polityki biznesowej ani nie tworzy funkcji spoza zatwierdzonego zakresu.

## 1. Ścieżka czytania (just enough context)

1. `README.md`, `docs/README.md`, `docs/documentation-standard.md`.
2. `docs/decisions/product-decisions.md` i odpowiednie wiersze `docs/decisions/open-questions.md`.
3. `docs/domain/glossary-and-model.md`, `docs/domain/business-rules.md`, `docs/domain/recruitment-lifecycle.md` — tylko istotne pojęcia i reguły.
4. `docs/requirements/functional-requirements.md` — identyfikatory `FR-*` w zakresie zadania; `docs/quality/acceptance-criteria.md` — odpowiadające `AC-*`.
5. `docs/features/<moduł>.md`, odpowiednie `docs/ux/`, a następnie `docs/quality/scenarios.md` i `docs/quality/traceability.md`.
6. Przy zmianach technicznych: `docs/technical/` i istniejące ADR, o ile powstały.

Nie czytaj bez celu całego repozytorium. Stosuj linki i ID do przeglądu wpływu; gdy wątpliwość przekracza moduł, rozszerz analizę.

## 2. Workflow obowiązkowy

**Requirement → Impact Analysis → Implementation Plan → Implementation → Verification → Review → Documentation Update.**

**Requirement:** wylistuj `FR`, `AC`, `BR`, `DEC`, `UC`, status ich zatwierdzenia i wymagane wejścia.

**Impact Analysis:** określ, jakie moduły, dane, wydarzenia historyczne, przypadki brzegowe, import, wyszukiwanie, bezpieczeństwo i UX mogą zostać dotknięte. Sprawdź `OPEN-*`.

**Implementation Plan:** zwięzłe kroki, testy, ryzyka, brakujące decyzje, obszary poza zakresem. Nie zaczynaj kodowania, jeśli wymagana decyzja jest `OPEN` lub zlecenie nie zezwala na implementację.

**Implementation:** dopiero po dopuszczeniu etapu implementacji; małe, przeglądalne zmiany, bez ukrytych funkcji, niezatwierdzonych zależności lub automatyzacji działań na koncie użytkownika.

**Verification:** weryfikuj `AC`, scenariusze `UC/TC`, regresje i przypadki błędów. Raportuj dokładnie, czego nie uruchomiono.

**Review:** code review obejmuje zgodność domenową, prywatność, kontrolę dostępu, bezpieczeństwo danych, ryzyko regresji historii i duplikatów, obsługę błędów i jakość testów. Wrażliwe zmiany wymagają security review.

**Documentation Update:** aktualizuj dokumenty wraz ze zmianą zachowania; nie przerzucaj tej pracy na nieokreśloną przyszłość.

## 3. Kiedy obowiązkowo zatrzymać się po decyzję PO

- Zmiana znaczenia statusu/etapu, modelu sprawy, reguł zamknięcia i wznawiania.
- Nowe pola obowiązkowe, wartości słowników, limity, retencja, polityka usuwania.
- Automatyczne akcje w imieniu użytkownika, wysyłanie komunikacji, scalenia rekordów.
- Nowe funkcje lub ograniczenia zakresu pierwszego wydania.
- Rozstrzygnięcie `OPEN-*` oznaczone jako **blokujące** dla zadania.
- Istotny wybór architektury/infrastruktury/bezpieczeństwa — po decyzji zapisz ADR.

Agent może przedstawić 2–3 opcje i konsekwencje z oznaczeniem `PROPOSED`. Nie może sam podnieść statusu do `APPROVED`.

## 4. Zakaz fikcyjnych danych i działań

- Korekta statusu nie jest biznesowym wydarzeniem „wysłano aplikację”.
- Zapisanie URL nie oznacza aplikowania, samo CV w bibliotece nie oznacza wysłania.
- Wpis historyczny nie może wymyślać dat i etapów; brak odpowiedzi w CRM nie równa się brakowi realnej odpowiedzi.
- Sam upływ terminu nie oznacza odbycia spotkania.
- Duplikaty wymagają decyzji człowieka; brak automatycznego scalania.

## 5. Minimalne zasady jakości

- Kryteria `AC` powinny być weryfikowane automatycznie, gdy istnieje implementacja, a wcześniej pozostają planami testów.
- Weryfikuj uprawnienia i poufność dokumentów oraz komunikacji, ochronę danych, walidację importu i URL, idempotencję zapisów, integralność osi czasu.
- Testy regresyjne mają wykrywać uboczne zamykanie spraw, wysyłkę wiadomości, tworzenie fikcyjnych zdarzeń i powielanie danych.
- Nie zapisuj sekretów, prawdziwych CV ani prywatnej korespondencji do repozytorium.

## 6. Raport zadania / PR

Raport powinien zawierać: **cel i zakres**, użyte `FR/AC/BR/DEC/UC`, analizę wpływu, zmienione pliki, decyzje PO i ADR (jeżeli dotyczy), przeprowadzone testy wraz z wynikiem, ograniczenia/ryzyka, `OPEN` i odłożony zakres. Nie raportuj „testy przeszły”, jeśli ich nie uruchomiono.

Dla przyszłych zadań agentowych podaj w metadanych: **model, poziom reasoning (jeśli środowisko udostępnia), rolę, zakres plików, identyfikatory wymagań, DoD**. Model i reasoning są dobierane do złożoności zadania, nie stanowią decyzji architektonicznej.

Szablon zadania: [docs/templates/agent-task.md](docs/templates/agent-task.md).
