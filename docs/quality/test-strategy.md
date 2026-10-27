# Strategia jakości i weryfikacji (QA)

**Stan:** `BASELINED` — plan weryfikacji specyfikacji, **nie** wykonane testy oprogramowania. **Granica:** bez aplikacji i bez stacku nie wskazujemy frameworków testowych.

## Podstawa testowania

- [Reguły BR](../domain/business-rules.md) są inwariantami — każdy interfejs wejściowy (UI, import, ewentualne API) musi je respektować.
- [FR](../requirements/functional-requirements.md) opisują zatwierdzone zachowania, [AC](acceptance-criteria.md) opisują minimalne testy akceptacyjne.
- [UC/TC](scenarios.md) pokrywają procesy użytkownika (łącznie z danymi historycznymi i testami negatywnymi).
- [Traceability](traceability.md) pozwala ustalić pokrycie planami testów oraz luki.

## Poziomy weryfikacji — w planie

| Poziom | Przedmiot | Przykłady i krytyczne asercje |
|---|---|---|
| Domena / unit | Niezmienniki biznesowe | Cztery statusy, kwalifikujące zaproszenie, wynik zamknięcia, korekta ≠ wydarzenie, powiązanie CV ≠ wysyłka. |
| Integracyjny | Granice modułów | Quick Capture → Lifecycle, Event → Contact History, Import → Dedupe/History, Close → Tasks/Calendar, Search → zamknięte sprawy. |
| E2E | Ścieżki rzeczywistego użytkownika | `UC-001`–`UC-032`: sprawa bez aplikacji, CTO, agencja, wznowienie, częściowy Excel, rekruter w kilku sprawach. |
| Security / Privacy | Dane osobowe, pliki i zewnętrzne URL-e | Brak dostępu do cudzych dokumentów, nieuprawniony podgląd, bezpieczny import, SSRF/URL fetch, wyciek poprzez logi, walidacja uploadu. |
| Manual / UX | Spójność zachowania | DnD z walidacją, drawer vs pełna strona, scenariusze klawiatury, komunikaty po awarii, użyteczność mapowania importu. |
| Regresja | Zachowanie po zmianach | DnD/korekta nie wywołują akcji, brak autopass wydarzeń, brak autozamknięć, stare closure po wznowieniu, idempotencja importu. |

## Dane testowe i przypadki szczególne

Twórz **syntetyczne**, niespersonalizowane dane testowe, np. firma A/B, osoba P1/P2, URL testowy, dokumenty bez danych wrażliwych. Nie commituj prawdziwego CV, korespondencji, tokenów ani PII.

W szczególności przetestuj:

- Dwie sprawy jednej organizacji, jeden kontakt w obu oraz kilka osób na jednym wydarzeniu.
- Brak ogłoszenia, brak pozycji, nieznany pracodawca (agencja).
- Potwierdzenie aplikacji bez zaproszenia; brak odpowiedzi przez długi czas.
- Historia rozmowy wprowadzona późno, zmiana daty i zachowanie chronologii.
- Zdarzenie nierozliczone po terminie; anulowanie/przełożenie zamiast potwierdzenia odbycia.
- Zamknięcie bez wyniku i z otwartym zadaniem/wydarzeniem.
- Ta sama oferta pod wieloma URL-ami; ręczna aktualizacja istniejącej sprawy bez auto-merge.
- XLSX z błędami, nieznanym statusem, datą pustą, duplikatem oraz awarią w trakcie; brak cichego partial import.
- Wersje CV różniące się faktem wysłania; archiwalna sprawa nadal wyszukiwalna.

## Exit criteria (rekomendowane, **PROPOSED** jako zasada QA, nie decyzja produktowa)

1. Wszystkie `P0 OPEN` dotyczące zakresu zadania są rozstrzygnięte przez PO.
2. Przypadki AC w zakresie mają testy i wyniki, a scenariusze UC/TC nie naruszają BR.
3. Security/privacy review dla danych osobowych, plików, linków i importu zakończony bez znanych blockerów.
4. Dokumentacja i traceability aktualne; środowisko testowe i wyniki są jawnie udokumentowane.

Bez implementacji status każdego `TC` to `PLANNED / NOT EXECUTED`; wyników nie wolno dopowiadać.
