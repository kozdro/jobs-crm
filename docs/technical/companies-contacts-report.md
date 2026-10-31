# Companies & Contacts — raport wykonania

**Data:** 2026-10-31. **Decyzja:** DEC-058, zatwierdzone 1A/2A/3A. **Stan:** lokalna implementacja, QA i niezależne review **PASS**, gotowe do owner review w osobnym PR. Autoryzowano pełne wykonanie i osobny PR, **bez merge/deploymentu**.

## Zakres i podstawa

Prywatny centralny katalog firm i kontaktów: tworzenie, odczyt, minimalna korekta danych, wersje i audyt; jawne opcjonalne relacje M:N do istniejących spraw i między organizacją a osobą. Role pracodawcy/agencji są kontekstowe. Attach/detach i korekta roli działają również na zakończonych sprawach. Deduplikacja owner-only wymaga wyboru istniejącego profilu albo świadomej osobnej tożsamości; retry nie powtarza skutków. Listy, selektory, relacje i audyt mają paginację.

**Powiązanie osoby ze sprawą nie nadaje udziału w zdarzeniach.** Zmiany katalogu nie zmieniają statusu, etapu, cyklu, faktów, rewizji ani zakończeń. Bez auto-merge i zapisywania szkiców PII do browser storage/logów.

Podstawa: FR/AC-CC-001–006/008/011 i AD-002; BR-001/002/016/018/019/027/028/030; DEC-001/003/042–044/051/058; UC/TC-006/008/014/025/034 w podzakresie; UX-013/014; ADR-0002/0012. [Kontrakt i plan](companies-contacts-analysis.md), [UX](../ux/companies-contacts-slice.md), [szczegółowy QA i historia](companies-contacts-qa.md). Nie zmieniono architektury ani zależności; nowy ADR nie był potrzebny.

## Kandydat, autorzy i pliki

Baza: merge PR18 `fa66fc7badde0f224a316cccea8a242e71e3bdb1`. Końcowy kandydat aplikacji/testów: **`3666f4b2e87425010b4e81c34f9b7d6e3a9780c2`**, gałąź `feat/companies-contacts`. Późniejsza aktualizacja dokumentacji i bezpiecznych dowodów nie zmienia aplikacji, migracji ani testów. Hosted CI jest sprawdzane oddzielnie dla dokładnego opublikowanego head PR; lokalne wyniki nie są wynikiem CI.

- `/root`: decyzje, kontrakt, dokumentacja, kontrole, niezależne handoffy i publikacja.
- `companies_backend`: Drizzle/schema/migracje, `src/modules/companies-contacts/`, BFF `/catalog/commands`, własne unit.
- `companies_frontend`: `src/app/companies/`, `src/app/contacts/`, komponenty katalogu, integracja detalu sprawy/nawigacji, bounded proxy matcher i własne unit.
- `companies_qa_run`: integracje/browser/runner/config, fizyczny upgrade, syntetyczne fixtures i dowody.

Rozłączne zakresy zapisu; model/reasoning dziedziczone **NOT EXPOSED**. Brak dalszej delegacji przez autorów. Zmiany źródeł prawdy obejmują DEC/OPEN/model/BR/FR/AC/scenariusze/traceability; zmiany testów istniejącej nawigacji i liczby migracji zachowują precyzyjne asercje.

## Wykonana weryfikacja

Node **24.22.2**, pnpm **12.16.1**; jawny pin rzeczywistego executable, ponieważ pnpm początkowo wybierał Node26 mimo shell Node24. Syntetyczne dane, lokalny PostgreSQL/Auth/JWT/Data API/RLS, production HTTPS Chromium. Persistent DEV i cloud nietknięte.

| Kontrola | Wynik / dowód |
|---|---|
| `pnpm --config.verifyDepsBeforeRun=error test:unit` | **PASS333 aplikacyjne +87 skryptowych**, zero skips na b25dfb7 (późniejsza delta tylko fixture RSC/dokumentacja); `/tmp/jobs-crm-cc-unit-final2.log` |
| `typecheck`, `lint`, `format:check` | **PASS**; logi `/tmp/jobs-crm-cc-{typecheck,lint}-final.log`, `-format-final3.log`; QA ponowił kontrole po końcowej korekcie fixture RSC |
| `test:boundaries`, `test:canary` | **PASS** na5f8d5aa, natural exit0 i kontrole czułości; `/tmp/jobs-crm-cc-{boundaries,canary}-final.log` |
| Ledger produktu i upgrade | **PASS13/13**, stare dane/UUID zachowane; [wszystkie11 migracji sprzed PR18 byte-identical](evidence/companies-contacts/preexisting-migrations.json) |
| R7 production build | **PASS**, child exit0 |
| R7 integracje | **PASS105/105**, zero fail/skip/cancel |
| R7 HTTPS browser | **PASS92/92**, child exit0, bez pominięć |
| R7 natural exit i cleanup | **PASS natural exit0**, guarded cleanup,44/44 wcześniejszych kontenerów ID/nazwa/image/porty zachowane; zero własnych pozostałości |
| Niezależne review | **PASS statycznie**, wszystkie1P1+4P2 zamknięte; dodatkowe delty ocenione osobno |

Ostatnia delta po b25dfb7 zmienia wyłącznie poprawny request fixture RSC; źródła unit i kod aplikacji są identyczne. Końcowy CI sprawdza publikowany exact head ponownie, także dla kontroli boundaries/canary wykonanych lokalnie przed lokalnym CSS.

Pełny entrypoint za `pnpm test:recruitment` wykonano jako `RECRUITMENT_TARGET_ID=companies-cc-r7 node scripts/recruitment/runner.ts` z przypiętym Node i własnym izolowanym targetem. [QA](companies-contacts-qa.md) podaje exact środowisko, komendę, manifest, wyniki i ograniczenia. [Manifest źródeł](evidence/companies-contacts/qa-source-manifest.json) wiąże154/154 src/db/tests canonical/runtime/commit; adapter lokalnych portów566xx→574xx jest oddzielnie jawny, bez osłabienia validation. Dowody transformacji faktycznie wykonanego testu Playwright i rzeczywistego TTL GoTrue nie zastępują testów, lecz potwierdzają ich tożsamość.

Integracje obejmują owner A pozytywnie, B/anon odmowę list/ID/count/dedup/audit/recovery, oba końce relacji i spoof owner także bez BFF przez Data API/RPC. Testy obejmują canonical command-only writes, stale wersje, retry/payload conflict/ABA, rzeczywiste races, rollback i bezpośredni upsert. Browser obejmuje utratę odpowiedzi po commit, niepewne potwierdzenie duplikatu create/edit, zachowanie zamiaru relacji przy refetch profilu, paginację, XSS jako tekst, focus/klawiaturę,4 szerokości oraz rzeczywisty tekst200% przy375px.

## Niezależne review i naprawy

[Zapis10 niezależnych uruchomień](evidence/companies-contacts/review-runs.json): odrębni rodzice read-only przez `harness/scripts/review.py`, dokładnie jeden generic subagent + canonical role, exit0, changedFiles=[] i identyczne fingerprinty przed/po. Exit launchera nie jest oceną kodu. Pierwotne3 oceny FAIL zachowane, kolejne7 ocen PASS_STATIC nie udają wykonania runtime.

| Finding | Naprawa i dowód zamknięcia |
|---|---|
| Backend P1: BEFORE trigger zmieniał projekcję przed pominiętym konfliktem komendy | **0012** odrzuca zużyty owner/request pod owner-lock przed skutkami. Realny JWT probe: stary kod HTTP201 profile1→2/audit1→1; po guarded upgrade HTTP409 profile1→1/audit1→1. Canonical RPC replay zachowany. Bez zmiany zamrożonej0011. |
| Frontend P2: ponowne potwierdzenie duplikatu po niepewnym zapisie zastępowało klucz | Synchroniczny guard i disabled UI; dokładny zamiar/UUID zachowane do retry/recovery. |
| Frontend P2: refetch profilu odmontowywał niepewną relację | Potwierdzone dane zachowane tylko dla tego samego owner/query; panel i zamiar pozostają stabilne. |
| Security P2: nowe strony poza proxy sesji/cache | Matcher companies/contacts/catalog,3 unit proxy, rzeczywiste testy SSR/cookies/cache/logout. |
| Security P2: opcjonalny raw log różnił się od reprezentacji skanera | Usunięto dodatkowe utrwalanie raw logów. Istniejący scanner i wymagane liczniki zachowane. |

Backend zamknął P1 na5f8d5aa i ocenił fixture9f9e18c; frontend zamknął2P2 na5f8d5aa i lokalną poprawkę text200 na d6738f8; security zamknął2P2 na5f8d5aa i ocenił test-only TTL300 na b25dfb7 oraz canonical Flight request na3666f4b. Brak nierozwiązanych findings implementacji. Weryfikacja runtime pozostaje oddzielną bramką.

## Zachowane FAIL i ograniczenia diagnozy

| Próba | Faktyczny wynik i dalsze działanie |
|---|---|
| R1 / R2 | Integracje102/104 FAIL: nowy fixture close podawał null zamiast preview.closureRevision0; R2 omyłkowo skopiował starą wersję. Browser NOT RUN. Zmieniono fixture, nie produkt/asercje. |
| R3 | Integracje104/104 PASS, browser85/87 FAIL: stara allowlista2 aktywnych tras i wyścig testu focus z celowym rAF. Jawna allowlista4 tras i oczekiwanie na zamierzony focus zachowują asercje. |
| R4 | Integracje103/105 FAIL: JSONB fixture był podwójnie kodowany. `jsonb_build_object` z parametrami naprawił wejście; targeted lifecycle18/18 PASS, HTTP CC21/21 PASS. Browser NOT RUN. |
| R5 | Integracje105/105 PASS, browser90/92 FAIL: rzeczywisty overflow383/375 przy tekście200% oraz odmowa refresh przy synthetic JWT60s. |
| R6 | Integracje105/105 PASS, browser91/92 FAIL: actual expiry300/SSR/cookies i text200 PASS; ręczny błędny `_rsc` powodował307 normalizacji Next. Canonical pusty klucz i mocniejsze asercje text/x-component/private/no-store bez follow-redirect naprawiają fixture. |

Overflow dwóch przycisków poprawiono lokalnym zawijaniem/max-width, bez clippingu lub globalnej zmiany CSS; pomiar po poprawce375/375. Dla TTL60s provider potwierdził `refresh_token_already_used` przy wygasłym JWT; SDK ma margines90s. Zgodnie z [dokumentacją Supabase](https://supabase.com/docs/guides/auth/sessions#what-are-recommended-values-for-access-token-jwt-expiration) nowy **syntetyczny** profil QA używa300s. Test rzeczywiście czeka na `max(exp,expires_at)+2s`, nie fałszuje tokena ani zegara. Nie zmieniono kodu Auth, F3, persistent DEV, cloud ani publicznej polityki TTL. Dokładny pełny przebieg dodatkowych rotacji nie był śledzony; zachowano obserwację dostawcy i porównanie fixture, zamiast uznać stary FAIL za PASS. Szczegółowe bezpieczne receipts i granice dowodów są w [QA](companies-contacts-qa.md).

## Granice akceptacji

AC-CC-007/009/010 i pełne TC-019/025/034 są **NOT RUN / poza przyrostem**. Brak komunikacji, historycznego uczestnictwa/historii osoby, importu, merge, Global Search, hard delete/archiwizacji/restore i publicznego udostępnienia. OPEN-002/005/024 rozstrzygnięte tylko dla DEC-058; OPEN-030 i retencja/privacy/Auth/OPS nadal obowiązują dla odłożonych funkcji i release.

Fizyczne urządzenia/AT, pełny audyt WCAG, rzeczywisty browser zoom, live OAuth i testy pełnego publicznego produktu pozostają NOT RUN. Tekst200% to html font-size32px, nie deklaracja wszystkich rodzajów powiększenia. Testy concurrency nie dowodzą wszystkich możliwych przeplotów. Brak merge/deploymentu; DEV będzie aktualizowany wyłącznie istniejącą guarded ścieżką lokalnego startu, nie resetem.
