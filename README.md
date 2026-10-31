# Jobs CRM

> **Status projektu:** F1/F2/F3 i pierwszy RecruitmentCase/Manual Quick Capture zmergowane; bez publicznego wdrożenia. [Wyniki i ograniczenia F3](docs/technical/foundation-f3.md).
> **Stan na:** 2026-10-30. **Język dokumentacji:** polski.
> Recruitment Lifecycle 3A (DEC-054): [kontrakt](docs/technical/recruitment-lifecycle-3a.md) i [wyniki weryfikacji](docs/technical/recruitment-lifecycle-3a-report.md); bez publicznego wdrożenia.
> Recruitment Lifecycle 3B (DEC-055): [zatwierdzony zakres i izolacja](docs/technical/recruitment-lifecycle-3b-analysis.md); zaproszenia i indywidualne etapy, bez publicznego udostępnienia.
> Pierwszy autoryzowany slice create/read jest opisany w [kontrakcie i raporcie](docs/technical/recruitment-case-first-slice.md); pozostałe funkcje biznesowe i infrastruktura produkcyjna pozostają kolejnymi etapami.

Ręczny development: **`pnpm dev:local`** — trwała baza, Auth, Studio i lokalna poczta. [Wymagania, faktyczny Node pnpm, start/stop/reset i adresy](docs/technical/local-development.md).

Uruchamianie aplikacji i testów: [Foundation F1](docs/technical/foundation-f1.md).
Lokalna baza i testy izolacji: [Foundation F2](docs/technical/foundation-f2.md).
Biznesowy create/read z rzeczywistym lokalnym Auth/RLS: `pnpm test:recruitment` (własny izolowany target, bez cloud).

Jobs CRM to projekt osobistego CRM wspierającego poszukiwanie pracy. Zastępuje rozproszoną pamięć o aplikacjach, firmach, kontaktach, rozmowach, zadaniach, terminach i dokumentach jednym uporządkowanym workspace'em. Pierwszy rynek to Polska; początkowi użytkownicy to osoby aktywnie poszukujące pracy w IT/digital.

## Jak czytać repozytorium

1. [Mapa dokumentacji](docs/README.md) — gdzie jest dany temat i jego autorytatywne źródło.
2. [Wizja i zakres](docs/product/vision-and-scope.md) — co budujemy i czego **nie** budujemy.
3. [Słownik i model domeny](docs/domain/glossary-and-model.md), [reguły biznesowe](docs/domain/business-rules.md) — znaczenie pojęć i niezmienniki.
4. [Katalog wymagań](docs/requirements/functional-requirements.md) i [kryteria akceptacji](docs/quality/acceptance-criteria.md) — testowalny kontrakt.
5. [Specyfikacje modułów](docs/features/) i [UX](docs/ux/) — przebiegi użycia.
6. [Decyzje](docs/decisions/product-decisions.md) i [kwestie otwarte](docs/decisions/open-questions.md) — granice zatwierdzenia.

Agentom i współtwórcom: **najpierw przeczytaj [AGENTS.md](AGENTS.md)**.

## Zasada źródła prawdy

Kolejność pierwszeństwa i zasady rozwiązywania konfliktów opisuje [standard dokumentacji](docs/documentation-standard.md). Krótkie podsumowanie: rejestr decyzji rozstrzyga *co zatwierdzono*; reguły domenowe rozstrzygają *co jest prawdą biznesową*; katalog FR/AC rozstrzyga *co ma robić produkt i jak to sprawdzić*; specyfikacje modułów rozstrzygają *jak przebiegają scenariusze*. Rozbieżność jest defektem specyfikacji — nie pozwoleniem na arbitralną implementację.

## Aktualny stan

- `APPROVED`: przeniesione decyzje zaakceptowane przez właściciela produktu w discovery.
- `OPEN`: elementy nierozstrzygnięte; część blokuje szczegóły implementacji.
- `PROPOSED`: sugestie do zatwierdzenia, **nie** obowiązujące zachowanie.
- `DEFERRED`: świadomie poza pierwszym wydaniem lub na późniejszym etapie.

Technical Discovery 1.1–1.40 zakończono (historia zachowana; [rebaseline Auth/SSR 2026-10-29 — ADR-0012](docs/decisions/adr/0012-supabase-native-auth-sessions-rls.md)), a etap prototypu pominięto decyzją właściciela. [Architektura i decyzje techniczne](docs/technical/README.md), [ADR](docs/decisions/adr/README.md), [plan implementacji](docs/technical/implementation-plan.md). **Nie stanowi to zezwolenia na implementowanie niewyjaśnionych wymagań**. Szczegóły: [bramki decyzyjne](docs/decisions/open-questions.md) i [raport audytu](docs/quality/documentation-audit.md).
