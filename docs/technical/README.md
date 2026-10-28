# Technical Discovery — architektura Jobs CRM

**Stan dokumentacji:** BASELINED (2026-10-28). **Etap:** zakończone Technical Discovery, przygotowanie do implementacji SDD/AIDD. **Status implementacji:** NOT STARTED. Żadne testy aplikacji ani PoC nie zostały wykonane.

## Źródło decyzji i hierarchia

Właściciel produktu zatwierdził w rozmowie wybory **Technical Discovery 1.1–1.40**. Zbiorczy rejestr: [discovery-decisions.md](discovery-decisions.md). Przyjęte istotne decyzje są utrwalone jako ADR o statusie **ACCEPTED** w [../decisions/adr/](../decisions/adr/README.md). Konkretne mechanizmy oznaczone **PROPOSED / VALIDATION REQUIRED** pozostają hipotezami wykonawczymi, a nie gotową implementacją. Pytania domenowe i operacyjne pozostają w [OPEN](../decisions/open-questions.md).

**Istotna korekta:** decyzja 1.40 B zastępuje zamiar automatycznej ekstrakcji z dowolnego URL z 1.26 A. Smart Import automatycznie pobiera tylko z **jawnej, przetestowanej listy domen**; pozostałe adresy można zachować i opisać ręcznie. Znajomość domeny nie zwalnia z ochrony SSRF. Nie podajemy niezweryfikowanej listy portali jako obsługiwanych.

## Dokumenty architektury

| Dokument | Odpowiedzialność |
|---|---|
| [discovery-decisions.md](discovery-decisions.md) | 40 wyborów PO, rozstrzygnięcia zastępujące, statusy |
| [architecture.md](architecture.md) | Widok C4-lite, granice, integracje, komponenty i przepływy |
| [data-and-persistence.md](data-and-persistence.md) | Relacyjny model logiczny, stan, historia, indeksy, RLS, migracje |
| [security-and-privacy.md](security-and-privacy.md) | Auth/BFF, prywatność, threat model, kontrola dostępu, usuwanie |
| [imports-and-jobs.md](imports-and-jobs.md) | Smart Import, CSV/XLSX, atomowość, idempotencja, worker |
| [operations-and-quality.md](operations-and-quality.md) | Hosting, kopie zapasowe, RPO/RTO, obserwowalność, testy, CI/CD |
| [implementation-plan.md](implementation-plan.md) | Sekwencja developmentu, pionowe slice'y, bramki i DoD |
| [gates-and-impacts.md](gates-and-impacts.md) | Pozostałe OPEN, konflikty, PoC i wpływ na istniejące FR/AC |

## Zasady dla agentów

1. Czytaj [AGENTS.md](../../AGENTS.md) i [standard](../documentation-standard.md); źródło wymagań: **DEC/BR/FR/AC/OPEN**, nie sam schemat w tym folderze.
2. **Nie generuj migracji bazy ani aplikacji** tylko na podstawie diagramu koncepcyjnego; pola, enumy i walidacje wciąż wymagają decyzji OPEN-002 i powiązanych.
3. Nie traktuj adnotacji **PROPOSED** jako autoryzacji do implementacji. PoC mogą być małymi zadaniami technicznymi z jednoznacznym zakresem i bez danych osobowych.
4. Implementację dopuszcza osobne zlecenie PO po spełnieniu bramek z [implementation-plan.md](implementation-plan.md).
5. Bez prototypu interaktywnego (świadomie pominięty etap); przeprowadzaj testy UX w trakcie implementacji z [UX Blueprint](../ux/blueprint.md). Stan wcześniejszych TC pozostaje NOT EXECUTED.

## Niezmienne granice MVP

Cztery statusy; sprawa różna od oferty i organizacji; korekta nie udaje aplikacji; dokument powiązany nie oznacza wysłania; żadnego automatycznego kończenia, kontaktowania ani scalania; żadnego AI Career Agenta, wyszukiwania semantycznego ani masowego importu URL.

**Brak merge do main:** ten PR udokumentowuje wybory i nie uruchamia usług ani nie tworzy sekretów, projektów Supabase czy kodu produkcyjnego.
