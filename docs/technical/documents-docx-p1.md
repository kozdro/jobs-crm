# PR #29 — walidacja części DOCX (P1)

**Autoryzacja:** polecenie PO z 2026-11-12: poprawa potwierdzonego obejścia `DDEAUTO` w `header.dat`, bez zmiany DEC-065 i rozszerzania zakresu. Baza: `d635847a772c5019bbaea56653c397f8025771be`. Model orchestratora: gpt-6.1-sol; reasoning nieudostępnione. Autorzy: `/root/docx_fix` (backend), `/root/docx_qa` (QA), `/root` (runner i dokumentacja). Review przez oddzielne sesje read-only wrappera harnessu, po zamrożeniu kandydata.

## Wymagania i wpływ

| Źródło | Status / kontrakt | Zachowanie i weryfikacja |
| --- | --- | --- |
| [DEC-065](../decisions/product-decisions.md), [analiza §4 3A](documents-core-analysis.md) | APPROVED: sześć formatów, rzeczywista walidacja i odmowa aktywnych/niewalidowalnych plików | Regresja `header.dat`, poprawne DOCX, istniejące testy sześciu formatów; AC-DO-065-04, FR-DO-003/009/010 |
| [Product Discovery / provenance](../product/discovery-provenance.md), DEC-039/040/041 | APPROVED w przeniesionym zakresie; provenance opisuje brak pełnej pierwotnej transkrypcji | Walidacja nie zmienia reuse, trzech ścieżek, wersji ani jawnego faktu wysłania |
| [BR-026/030](../domain/business-rules.md), UC/TC-031/034 | BASELINED: dołączenie ≠ wysłanie, prywatność właściciela | Brak zmian historii; integracje istniejących granic Storage/owner A/B/anon |
| [UX Blueprint](../ux/blueprint.md), [F04/F10](../ux/flow-contracts.md) | Zatwierdzone flow dokumentów | Bez zmian UI i flow; zmiana dotyczy dopuszczenia bajtów przez serwerowy walidator |
| [ADR-0015](../decisions/adr/0015-documents-storage-boundary.md), ADR-0004/0012 | ACCEPTED: pending → zaufana walidacja → ready, prywatny immutable Storage | Brak nowych uprawnień, tożsamości, API, signed URL, migracji i zależności; istniejące integracje operatorów |
| [Technical Discovery](discovery-decisions.md), TD1.12/1.13/1.14/1.15; ADR-0009/0012 | APPROVED/ACCEPTED w zakresach Storage, wersji, backup/delete i natywnego Auth; ADR-0012 zastępuje ADR-0003 | Istniejące testy Storage, immutable bytes i operatorów; brak zmian architektury, retencji i historycznej tożsamości |
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

## Kandydat 8127cc4 — wyniki zachowane

SHA `8127cc41d1bbc02b05295c97bb08ddc8e020ace1`: celowane integracje treści **46/46 PASS**, oryginalny `header-dde.docx` **REJECT**, unit **726 Vitest + 111 Node PASS**, lint/format/canary PASS. Rzeczywisty izolowany runner integration-only: production build PASS; **261 PASS / 1 FAIL / 0 SKIP** (262 testy), exit 1. Log i hash runnera: `/tmp/jobs-docx-p1-8127-qa/`; SHA-256 runnera `8f1285e7b3ed3597a1365fce3181f74f84582c6d0b4b078ca5ec927ce41522a3`. Browser lokalnie NOT RUN.

Niezależne backend/security review przez read-only wrapper zakończyły się **FAIL P2**: poprawna standardowa relacja OPC `metadata/thumbnail` do PNG/JPEG była odrzucana; backend wskazał również `stylesWithEffects` w dokumentach Word. Nie stwierdzono nowego P0/P1 ani nazewniczego obejścia XML. Sesje i logi: `/tmp/jobs-docx-p1-{backend,security}-review.log`; oba procesy exit 0, bez zmian ocenianych worktree. Findings wymagają poprawki i ponownej oceny następnego SHA; nie są unieważniane przez zielone testy. Hosted Application CI tego SHA: run `43234399790`, wynik należy raportować oddzielnie od następnego kandydata.

Poprawka findings rozpoznaje dokładną standardową relację miniatury OPC i typy PNG/JPEG, kierując bajty do dekodera. Rozpoznaje również dokładny typ/relację `stylesWithEffects` i wymaga korzenia `w:styles`; cała ta część XML przechodzi tę samą kontrolę aktywnej zawartości. Źródła pierwotne Microsoft: [StylesWithEffectsPart — stałe MIME/relacji](https://raw.githubusercontent.com/dotnet/Open-XML-SDK/main/generated/DocumentFormat.OpenXml/DocumentFormat.OpenXml.Generator/DocumentFormat.OpenXml.Generator.OpenXmlGenerator/Part_StylesWithEffectsPart.g.cs), [ThumbnailPart](https://raw.githubusercontent.com/dotnet/Open-XML-SDK/main/data/parts/ThumbnailPart.json). Nie dodaje to SDK ani zależności do projektu. Kontrole obejmują poprawne PNG/JPEG i styles, fałszywy obraz oraz DDE/aktywny XML pod nietypową nazwą.

Roboczy diff po findings: unit struktury **19/19 PASS**, rozszerzona nowa integracja **20/20 PASS**, tsc PASS. Niezależny pozytywny DOCX wygenerowany przez macOS `textutil` z syntetycznego tekstu **PASS**; SHA-256 artefaktu `bc2b1b2177f6894a26795e3840ca2299993286e7e604b814f966c2d3f6b28cbb`. Nie jest to dokument wygenerowany przez Microsoft Word; taki test pozostaje NOT RUN. Finalne wyniki następnego SHA będą opublikowane w PR bez nadpisywania poprzednich FAIL.

## Kandydat d386cd6 i poprawka pakowania workera

SHA `d386cd667fbf46f3ea8245d0097466f9a1f29967`: celowane integracje treści **51/51 PASS**, niezależny `textutil` DOCX PASS i oryginalny header-DDE REJECT; unit **729 Vitest + 111 Node PASS**, lint/format PASS. Hosted run `43235429670` jest odrębnym wykonaniem od poprzedniego run `43234399790`, który został anulowany po publikacji nowszego kandydata (nie PASS).

Bezpieczna diagnostyka zachowanego izolowanego targetu ustaliła konkretny FAIL: `documents-validator-ipc.test.ts:88`, poprawny pending TXT nie otrzymał 200/finalize. `scripts/documents-validator-qa/runtime.ts` kopiował do obrazu tylko dotychczasowe dwa pliki walidatora, pomijając nowy import `validate-docx-package.ts`. Worker nie mógł go załadować niezależnie od formatu dokumentu. Diagnostyczny rerun mieszanych źródeł dał **266 PASS / 1 FAIL / 0 SKIP**; nie jest dowodem dokładnego SHA i nie zastępuje pierwotnego **261/1 FAIL**. Pierwotny evidence zachowano jako `/tmp/jobs-docx-p1-8127-qa/exact-8127-integration-evidence.json`.

Poprawka ogranicza się do skopiowania helpera do istniejącego kontekstu i Dockerfile, bez zmiany uprawnień, izolacji ani zależności. Dotychczasowe asercje IPC pozostają; QA rozszerza je o DOCX z nietypową nazwą części w rzeczywistym workerze. Po tej zmianie wymagane nowe SHA, rzeczywisty build/IPC/Storage, niezależny review i hosted CI. Bez poprawki pakowania wcześniejsze zielone testy bezpośredniego parsera nie wystarczają do akceptacji.

Backend/security review `d386cd6` zakończyły się **PASS_STATIC** dla klasyfikacji OPC i wcześniejszych P2, bez nowych potwierdzonych findings w ocenionym zakresie; nie dowodzi to poprawnego obrazu workera ani nie usuwa runtime FAIL. Logi `/tmp/jobs-docx-p1-final-{backend,security}-review.log`, procesy exit 0 i bez zmian worktree. Nowy zakres pakowania wymaga jeszcze oceny na następnym SHA.

QA wydzieliło współdzielony syntetyczny builder `documents-docx-fixtures.ts`; istniejący test IPC zachowuje wszystkie asercje TXT i dodatkowo wymaga rzeczywistego finalize poprawnego DOCX z `header.dat` oraz odpowiedzi 422/invalid i braku ready dla DDEAUTO w tej części. Roboczy diff po poprawce pakowania: bezpośrednie integracje treści **51/51 PASS**, tsc PASS. Nowe asercje IPC przed zamrożeniem pozostają **NOT RUN**; wyniki finalnego SHA są raportowane w PR.
