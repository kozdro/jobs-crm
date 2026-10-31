# Companies & Contacts — raport wykonania

**Data:** 2026-10-31. **Decyzja:** DEC-058, PO zatwierdził 1A/2A/3A i pełną implementację oraz osobny PR; bez merge/deploymentu. **Stan:** kandydat implementacji `8d8323c6b0d24b6beb970431c6ce47574c332e53`; runtime/review w toku.

## Zakres i podstawa

[Kontrakt](companies-contacts-analysis.md), [QA](companies-contacts-qa.md), [UX](../ux/companies-contacts-slice.md). FR/AC-CC-001–006/008/011, AD-002; BR-001/002/016/018/019/027/028/030; DEC-001/003/042–044/051/058; adaptacje TC-006/008/014/025/034, UX-013/014, ADR-0002/0012. Nowe ADR nie jest wymagane: istniejąca architektura i stack bez zmiany.

Centralny prywatny katalog firm i kontaktów z create/read/edit, wersjonowaniem i audytem. Opcjonalne jawne relacje M:N i kontekstowe role organizacji, również dla zakończonych spraw. Deduplikacja owner-only, reuse lub świadomy osobny profil; retry i wyścigi chronione atomowo. Relacje nie stanowią uczestnictwa osoby w zdarzeniach, nie zmieniają lifecycle, nie scalają profili/spraw.

## Autorzy i własność

Baza `fa66fc7badde0f224a316cccea8a242e71e3bdb1`, gałąź `feat/companies-contacts`. `/root`: decyzje/dokumentacja, koordynacja, kontrole i publikacja; `companies_backend`: DB/domena/application/BFF i unit; `companies_frontend`: UX/UI/nawigacja/integracja detalu i unit; `companies_qa_run`: integracje/browser/runner/config/dowody. Model/reasoning dziedziczone NOT EXPOSED. Niezależni reviewerzy w osobnych rodzicach read-only, nie autorzy ocenianych zmian.

## Weryfikacja — stan bieżący

| Kontrola | Wynik |
|---|---|
| Unit | PASS 332 aplikacyjnych + 87 skryptowych; zero skips |
| Typecheck / lint | PASS |
| Format | PASS — finalna kontrola Prettier |
| Boundaries / canary | PASS: natural exit 0; pozytywne kontrole wykrywają naruszenia |
| Real Auth/JWT/Data API/RLS, migracja/upgrade | NOT RUN |
| Production HTTPS browser / regresje | NOT RUN |
| Niezależny backend/frontend/security review implementacji | NOT RUN |
| Hosted CI exact head | NOT RUN — PR jeszcze nie powstał |

Node 24.22.2 / pnpm12.16.1. Shell Node i faktyczny pnpm Node różniły się; używany jawny prefiks `/Users/kozdro/.volta/tools/image/node/24.22.2/bin` i kontrola executable. Dane syntetyczne, izolowany własny lokalny target. Persistent DEV, stare migracje i cudze zasoby nietknięte. QA opisuje manifest oraz wyniki ochrony zasobów i tożsamości źródeł.

## Ograniczenia i OPEN

AC-CC-007/009/010 i pełne TC-019/025/034 nie są wykonaniem tego slice'a. Brak korespondencji, event participants/historii osoby, importu, merge, Global Search, hard delete/archiwizacji/restore i publicznego udostępnienia. OPEN-002/005/024 rozstrzygnięte tylko dla DEC-058; historyczne uczestnictwo OPEN-030, retencja/privacy/publiczne Auth/OPS i pozostałe bramki nadal obowiązują. Urządzenia fizyczne/AT, live OAuth, pełny WCAG audit i publiczne użycie pozostają NOT RUN.

PR, exact SHA, wyniki testów i findings zostaną uzupełnione na podstawie rzeczywistych dowodów.

## Kontrole statyczne i unit — dowody lokalne

Wykonano z prefiksem Node24.22.2 i `pnpm --config.verifyDepsBeforeRun=error`: `test:unit`, `typecheck`, `lint`, `test:boundaries`, `test:canary`. Logi lokalne nietrwałe `/tmp/jobs-crm-cc-unit-r4.log`, `-typecheck-r4.log`, `-lint-r4.log`, `-boundaries.log`, `-canary.log`. Błędy wcześniejszych prób zachowane: r1 test nawigacji oczekiwał starych5 niedostępnych modułów; r2 lokalny test oczekiwał11 zamiast12 migracji; typecheck wymagał typów w nowych testach QA; ESLint refs naprawiony przez frontend bez wyłączenia reguły; format r4 uruchomiono w trakcie końcowego zapisu speca QA i wskazał jego format. Poprawki zachowują jawne asercje dostępnych modułów i przyjętych prefiksów ledgeru.

Review backend/frontend/security uruchomiono na oddzielnym detached worktree `/tmp/jobs-crm-cc-review`, dokładnie commit8d8323c; trzy rodzice read-only przez kanoniczny wrapper. Autorzy nie zmieniają ocenianego kandydata; nowe wyniki QA/dokumenty w głównym checkout nie zmieniają snapshotu review.

Pierwszy pełny runtime: build PASS, integracje102/104 FAIL (jedna błędna asercja wejścia fixture i jej suite parent). Nowy test zamkniętej sprawy wysyłał `null` zamiast `preview.closureRevision=0` do starego API3C; poprawiono wyłącznie fixture, bez zmiany produktu/migracji. Browser pierwszej próby NOT RUN — runner poprawnie przerwał po integracji. QA zachowuje nieudane próby i dowody oddzielnie od końcowego wyniku.

## Pierwsza runda niezależnego review — 8d8323c

Wszystkie trzy rodzice read-only zakończyły natural exit0, changedFiles=[], fingerprint864311dcd27cb58604fab8f19e7049cf188d53a920d8cdc8e8bf369fde6e8fca przed/po identyczny. Status oceny FAIL, niezależny od pomyślnego wykonania launchera. Logi lokalne `/tmp/jobs-crm-cc-{backend,frontend,security}-reviewer.jsonl` i odpowiadające `-meta.json`.

| Rola | Finding | Stan naprawy |
|---|---|---|
| Backend P1 | BEFORE INSERT projekcja przed ON CONFLICT ignore może pozostawić zmianę bez komendy/audytu | Potwierdzony realnym JWT/PostgREST: profiles1→2, audit1→1. Addytywna0012 blokuje zużytyowner/request przed skutkami; QA regresja w toku |
| Frontend P2 | Potwierdzenie duplikatu po niepewnym wyniku może zastąpić oryginalny klucz | Naprawa i regresja w toku |
| Frontend P2 | Refetch profilu odmontowuje panel i gubi aktywny zamiar relacji | Naprawa i regresja w toku |
| Security P2 | Nowe rodziny stron pomijają matcher sesji/cache | Proxy rozszerzone o companies/contacts/catalog;3unit proxy PASS, runtime pending |
| Security P2 | Dodatkowy surowy log nie jest tą samą reprezentacją co zweryfikowana przez scanner | Dodatkowe utrwalanie logów usunięte; istniejące output.verify/liczniki pozostają |

0011 pozostaje byte-identical61836b881f1acbaab4370f85abd9a9087ca01713c9df7103188c34fedc67689c. Poprawka ma osobną0012 i test upgrade; brak resetu lub zmiany ledgeru istniejącego targetu. Reprodukcja P1: `/tmp/jobs-crm-cc-qa-evidence/ignore-duplicates-repro.json`; bez tokenów/PII. Końcowe zamknięcie wymaga pozytywnych regresji i re-review nowego kandydata.

Poprawiony kandydat rozszerza ledger o13. migrację0012 (osobna addytywna naprawa P1). Kontrole r5: PASS332 aplikacyjne +87 skryptowe, typecheck i lint; format wymagał wyłącznie wygenerowanych0012snapshot/journal, które sformatowano bez zmiany SQL. Testy proxy obejmują matcher, przekazanie cookies i ochronę no-store. Frontend dodaje synchroniczną blokadę zastąpienia niepewnego zamiaru i zachowanie potwierdzonych danych tylko dla dokładnie tego samego owner/query podczas refetch.

R3 wcześniejszego kandydata: integracje104/104 PASS, browser85/87 FAIL (stary exactnav allowlist oraz wyścig testu focus z zamierzonym requestAnimationFrame). Naprawiono jawne4linki i await zamierzonego focusu przed dalszym Tab; bez osłabienia asercji. Zestaw ten nie obejmował nowych regresji z review i nie stanowi końcowej akceptacji.
