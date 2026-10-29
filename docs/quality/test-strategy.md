# Strategia jakości i weryfikacji (QA)

**Stan:** `BASELINED` — strategia i plan testowania produktu. Wykonane techniczne wyniki F1/F2 pozostają w [raporcie F1](../technical/foundation-f1.md) i [raporcie F2](../technical/foundation-f2.md); nie oznaczają akceptacji wszystkich AC produktu. Aktualizacja dokumentacyjna Supabase-native 2026-10-29 nie uruchamia nowych testów Auth/RPC. Stos technologiczny QA określa ADR-0010; szczegółowe statusy: [macierz Foundation v2](../technical/foundation-qa.md).

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
| E2E | Ścieżki rzeczywistego użytkownika | `UC-001`–`UC-037`: sprawa bez aplikacji, CTO, agencja, wznowienie, częściowy Excel, rekruter w kilku sprawach. |
| Security / Privacy | Dane osobowe, pliki i zewnętrzne URL-e | Brak dostępu do cudzych dokumentów, nieuprawniony podgląd, bezpieczny import, SSRF/URL fetch, wyciek poprzez logi, walidacja uploadu. |
| Manual / UX | Spójność zachowania | DnD z walidacją, drawer vs pełna strona, scenariusze klawiatury, komunikaty po awarii, użyteczność mapowania importu. |
| Regresja | Zachowanie po zmianach | DnD/korekta nie wywołują akcji, brak autopass wydarzeń, brak autozamknięć, stare closure po wznowieniu, idempotencja importu. |

## Supabase-native — zmiana strategii 2026-10-29

Podstawa: [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), `NFR-001/004/008`, `BR-030`, `FR/AC-AD-002–006`, `FR-IM-005–014`, `AC-IM-008/011/014`. Nowy F3 i import-specific F4 są **PLANNED / NOT RUN**. Dawne kryteria brokera, HttpOnly-only i selected-session revoke są jawnie wycofane w [AUTH/FQA v2](../technical/foundation-pocs.md), nigdy zaliczone jako PASS; historyczne ID/dowody pozostają rozpoznawalne.

- F3 testuje docelowe browser/server SDK: login, self-service signup, standardowy refresh/concurrency, local/global/others, Google/PKCE i reset, błędne/wygasłe sesje oraz zaufaną tożsamość serwerową. Brak credentials oznacza NOT RUN live Google, bez zastąpienia mockiem.
- Model tokenów dostępnych browser SDK wymaga konkretnych XSS, token-redaction i cache-leakage testów. CSRF odpowiada faktycznym cookies/Actions/Handlers i różni się od Data API z JWT Authorization; nie zakładamy własnego nonce brokera. `getSession()` po stronie serwera nie dowodzi tożsamości, `getClaims()` nie dowodzi bieżącej revocation.
- RLS A/B i prywatny Storage zachowują własne pozytywne/negatywne przypadki właściciela, cudzego konta i anon, przez listę/ID/relacje/plik/metadata. RLS musi działać również z pominięciem UI/BFF; service-role i user-editable metadata nie autoryzują user path.
- Access JWT może pozostawać ważny do expiry po native logout/revocation refresh. Test oddziela sesję klienta, refresh rejection i replay JWT. To zaakceptowane ograniczenie; operacje wrażliwe wymagają osobnego kontraktu aktualnego stanu/reauth według właściwych OPEN, bez fikcyjnej natychmiastowej revocation wszędzie.
- Import wykorzysta jedno minimalne INVOKER RPC i natywną transakcję PostgreSQL. Testy: atomic multi-record write, rollback, RLS/grants, retry po utracie odpowiedzi, brak duplikacji, konflikt payloadu przy tym samym kluczu i podstawowa współbieżność. F4 czeka na docelowy import, F5 na background; F6 weryfikuje bieżącą integrację/release bez przepisywania Auth.

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

Testy bez implementacji lub bez wykonania mają stan `NOT RUN`; `TC-035/036` dotyczą warunkowych funkcji `PROPOSED`. Nie deklaruj wyników bez uruchomienia.
