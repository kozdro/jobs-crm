# PR #29 — walidacja części DOCX (P1)

**Autoryzacja:** polecenie PO z 2026-11-12: poprawa potwierdzonego obejścia `DDEAUTO` w `header.dat`, bez zmiany DEC-065 i rozszerzania zakresu. Baza: `d635847a772c5019bbaea56653c397f8025771be`. Model orchestratora: gpt-6.1-sol; reasoning nieudostępnione. Autorzy: `/root/docx_fix` (backend), `/root/docx_qa` (QA), `/root` (runner i dokumentacja). Review przez oddzielne sesje read-only wrappera harnessu, po zamrożeniu kandydata.

## Wymagania i wpływ

| Źródło | Status / kontrakt | Zachowanie i weryfikacja |
| --- | --- | --- |
| [DEC-065](../decisions/product-decisions.md), [analiza §4 3A](documents-core-analysis.md) | APPROVED: sześć formatów, rzeczywista walidacja i odmowa aktywnych/niewalidowalnych plików | Regresja `header.dat`, poprawne DOCX, istniejące testy sześciu formatów; AC-DO-065-04, FR-DO-003/009/010 |
| [BR-026/030](../domain/business-rules.md), UC/TC-031/034 | BASELINED: dołączenie ≠ wysłanie, prywatność właściciela | Brak zmian historii; integracje istniejących granic Storage/owner A/B/anon |
| [UX Blueprint](../ux/blueprint.md), [F04/F10](../ux/flow-contracts.md) | Zatwierdzone flow dokumentów | Bez zmian UI i flow; zmiana dotyczy dopuszczenia bajtów przez serwerowy walidator |
| [ADR-0015](../decisions/adr/0015-documents-storage-boundary.md), ADR-0004/0012 | ACCEPTED: pending → zaufana walidacja → ready, prywatny immutable Storage | Brak nowych uprawnień, tożsamości, API, signed URL, migracji i zależności; istniejące integracje operatorów |
| [OPEN](../decisions/open-questions.md) | DEC-065 częściowo rozstrzyga dokumenty; pozostałe release gates otwarte | Brak nowej decyzji blokującej tę naprawę; pełna kwalifikacja 3A pozostaje oddzielnym, niezamkniętym warunkiem |

Wpływ: rozpoznawanie części pakietu i odmowa niespójnego DOCX przed finalize. Import, Search, historia, dane konta i schemat nie zmieniają się. Ryzyko regresji: legalne części o nietypowych nazwach oraz niespójne manifesty/relacje; wymagane przypadki pozytywne i negatywne. Poza zakresem: nowe badania wszystkich historycznych formatów, diagnostyka Calendar bez konkretnej przesłanki, merge, deployment, provisioning produkcyjny i persistent DEV.

## Plan i własność

1. QA odtwarza potwierdzony przypadek na bazie i przygotowuje nowy plik integracyjny `documents-docx-parts.test.ts`; developer odpowiada za własne unit testy.
2. Backend poprawia `validate-content.ts` i wydzielony helper OPC: klasyfikacja przez typ zawartości i relacje, kontrola XML niezależnie od rozszerzenia, odmowa niejednoznacznych/nierozpoznanych struktur; zachowanie ZIP/CRC/limitów i wcześniejszych kontroli aktywnej zawartości.
3. Orchestrator rejestruje test w istniejącym runnerze. QA uruchamia adekwatne integracje i kontrole sześciu formatów oraz granic Storage w izolowanym środowisku, na przypiętym Node 24.22.2/pnpm 12.16.1.
4. Zamrożenie SHA, niezależny backend/security review przez `harness/scripts/review.py`, poprawki i ponowna ocena w razie findings. Publikacja do istniejącego draft PR i hosted CI dla dokładnego finalnego SHA.
5. Raport PR zachowuje historyczne PASS/FAIL/NOT RUN; brakująca kwalifikacja nie staje się PASS dzięki tej poprawce. DoD naprawy: regresja odrzucona, poprawne dokumenty przyjęte, wymagane testy/review i hosted CI ze wskazanym SHA oraz jawne pozostałe ograniczenia.

## Podstawa strukturalna

[ECMA-376, część 2 OPC](https://ecma-international.org/publications-and-standards/standards/ecma-376/) definiuje części, typy zawartości i relacje pakietu. [Microsoft — Building Office Open XML Files](https://learn.microsoft.com/en-us/archive/msdn-magazine/2007/february/office-space-building-office-open-xml-files) opisuje odkrywanie części przez typ relacji i manifest typów zawartości. Nazwa ZIP nie stanowi wystarczającego dowodu rodzaju części. Wynik walidacji nie jest certyfikatem braku malware.

## Lokalne ustalenia QA z 2026-11-12 — historyczny SHA d635847

Źródło lokalne: `/tmp/jobs-documents-3a-qa-20261112/evidence.txt`, `qualify.mjs`, `repro-header.py` i `repro-header.mjs` (syntetyczne dane). Ustalenia te poprzedzają naprawę i nie są dowodem nowego SHA.

- **PASS:** `node --test tests/integration/recruitment/documents-content.test.ts` — 31/31; wybrane unit testy struktury, kodowań i obrazów — 18/18, Node 24.22.2.
- **PASS w zakresie próbek:** niezależny syntetyczny DOC wygenerowany przez `textutil`, UTF-8, bez BOM UTF-16LE/BE i UTF-32LE/BE, WINDOWS-1250 i ISO-8859-2 zostały przyjęte. Dwie ostatnie próbki miały identyczne bajty, więc nie dowodzą rozróżniania kodowań.
- **FAIL / P1:** syntetyczny DOCX z `DDEAUTO` w XML `header.dat` został zaakceptowany. Ten defekt jest przedmiotem niniejszej naprawy.
- **NOT RUN:** rzeczywiste zaszyfrowane dokumenty Office. Zmienione flagi DOC i zaszyfrowany ZIP DOCX nie zastępują tego dowodu.

Historyczny lokalny browser `245 PASS / 1 FAIL` (Calendar) i późniejszy celowany retry pozostają zgodnie z raportem PR; ta naprawa nie wyjaśnia pierwotnej przyczyny. Pełna kwalifikacja 3A pozostaje **BLOCKED**. Szczegółowa wcześniejsza historia: [raport Documents Core](documents-core-delivery.md).

Rozszerzona bazowa regresja (15 przypadków, w tym inna nazwa części głównej i typ z `Default`) na `d635847` z test-only diff: **3 PASS / 12 FAIL / 0 SKIP**, `/tmp/jobs-docx-parts-baseline-expanded.log`. Wcześniejsze 13 przypadków: **3 PASS / 10 FAIL**, `/tmp/jobs-docx-parts-baseline.log`.

Granica fail-closed obejmuje nieznane typy części/relacji, brakujące lub konfliktujące deklaracje, brakujące cele i nieosiągalne części. Osadzone rastry PNG/JPEG są dekodowane istniejącym walidatorem; inne nieweryfikowalne typy binarne są odrzucane. To jawne ograniczenie kwalifikacji wariantów DOCX, nie zmiana listy sześciu formatów ani stwierdzenie pełnej zgodności wszystkich dokumentów Office.

Weryfikacja autora przed zamrożeniem: unit struktury **16/16 PASS**, nowa regresja integracyjna **15/15 PASS**, `pnpm exec tsc --noEmit` **PASS**. Wcześniejszy roboczy błąd `ReferenceError` przy utwardzaniu metadanych dał **11 PASS / 4 FAIL**; poprawiony przed zamrożeniem. Wyniki te dotyczą roboczego diffu; finalne QA/review i hosted CI będą raportowane w PR dla dokładnego SHA.
