# Jobs CRM

> **Status projektu:** dokumentacyjny bootstrap / Product + Functional + UX Discovery.
> **Stan na:** 2026-10-27. **Język dokumentacji:** polski.
> **Nie jest to repozytorium implementacji ani prototypu UI.**

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

Ta dokumentacja umożliwia dalszy UX Discovery i Technical Discovery, **ale nie stanowi zezwolenia na implementowanie niewyjaśnionych wymagań**. Szczegóły: [bramki decyzyjne](docs/decisions/open-questions.md) i [raport audytu](docs/quality/documentation-audit.md).

## Lokalny start Git

Po rozpakowaniu pakietu z `.git/` repo jest zainicjalizowane na gałęzi `main`, **bez remote i bez commitów**. Zweryfikuj `git status`, ustaw własną tożsamość Git i wykonaj pierwszy commit. Zdalne prywatne repo GitHub można utworzyć w osobnym, świadomie zatwierdzonym kroku. Nie ma tutaj konfiguracji CI, deploymentu ani kodu aplikacji.
