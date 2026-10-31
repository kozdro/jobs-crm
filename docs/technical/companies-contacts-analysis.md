# Companies & Contacts — analiza SDD następnego vertical slice'a

**Data:** 2026-10-31. **Status:** APPROVED 1A/2A/3A — DEC-058; implementacja autoryzowana.
**Autoryzacja:** PO zatwierdził 1A/2A/3A i pełne wykonanie, lokalne migracje, QA, niezależne review, dokumentację i osobny PR; bez merge/deploymentu. Poniższy zapis analizy zachowuje historyczne propozycje; APPROVED są wyłącznie wybrane warianty i ich zakres. Zob. DEC-058.
**Baza:** `main`, `fa66fc7badde0f224a316cccea8a242e71e3bdb1`, czysty przed analizą. GitHub PR [#18](https://github.com/kozdro/jobs-crm/pull/18) potwierdzony przez connector: `merged=true`, merge SHA zgodny z lokalnym HEAD; head PR `b5b286328f6ad4c2eff30f397d7b0c79863b0551`. Treść starego opisu PR „otwarty” jest historyczna; aktualne metadata potwierdzają merge.

## 1. Requirement i zatwierdzona podstawa

| Źródło / ID | Status i konsekwencja |
|---|---|
| [DEC-001/003/042–044](../decisions/product-decisions.md) | APPROVED: sprawa odrębna od firmy, centralna baza, wiele niezależnych spraw firmy, osoby w wielu sprawach, kontakt samodzielny, pracodawca może pozostać nieznany. |
| [BR-001/002/018/019/027/028/030](../domain/business-rules.md) | APPROVED: bez automatycznego scalania spraw, komunikacja wymaga sprawy, historia osoby tylko z rzeczywistego udziału, prywatność. BR-016: zmiany metadanych nie tworzą faktów biznesowych. |
| [FR-CC-001–011](../requirements/functional-requirements.md), [AC-CC-001–011](../quality/acceptance-criteria.md) | Zatwierdzone zachowania docelowe z zależnymi OPEN; planowany podzbiór opisany niżej. Brak pełnego wykonania CC. |
| [Model](../domain/glossary-and-model.md), [feature CC](../features/companies-and-contacts.md) | Rola organizacji dotyczy danej sprawy. Case↔Contact M:N zatwierdzone. Diagram koncepcyjny nie rozstrzyga fizycznych kardynalności Organization↔Contact i organizacji według ról. |
| [UX-013/014](../ux/screen-blueprints.md), [F10](../ux/flow-contracts.md) | Lista i profil, wyłącznie rzeczywiste relacje; brak retroaktywnego przypisywania uczestnictwa. Szczegóły przyszłych formularzy OPEN-002/017. |
| [UC/TC-006/008/014/019/025/034](../quality/scenarios.md), [traceability](../quality/traceability.md) | Istniejące scenariusze; adaptacje przyrostu nie oznaczają zaliczenia całych TC. |
| FR/AC-AD-002, NFR-001, [SEC-02](security-and-privacy.md), ADR-0002/0012 | Izolacja owner-only i obecna architektura pozostają obowiązujące. Bez nowego stacku lub nowego ADR dla samego użycia tych zasad. |
| DEC-052/054–057 i kontrakty RecruitmentCase/3A/3B/korekt/3C | Istniejące UUID spraw, fakty, rewizje, cykle i zakończenia pozostają bez zmiany znaczenia. DEC-052 rozstrzyga dedup spraw, nie firm i kontaktów. |

Źródła procesu: [delivery](../../harness/workflows/delivery.md), skills `analyze-requirement`, `clarify-requirements`, `plan-slice`, `supabase`; [standard](../documentation-standard.md), [plan](implementation-plan.md), [gates](gates-and-impacts.md), [strategia QA](../quality/test-strategy.md). Analiza nie wymaga nowych wywołań SDK ani researchu bibliotek; dokumentację aktualnych API należy pobrać przed zależną implementacją.

## 2. Najmniejszy sensowny przyrost — PROPOSED

**Prywatny katalog + jawne relacje do istniejących RecruitmentCase.** W jednym vertical slice: tworzenie, odczyt i minimalna korekta danych profili, niezależne listy i profile Firmy/Kontakty; wybór istniejącej firmy/osoby oraz jawne dodanie i odłączenie relacji. Profil firmy pokazuje jej jawnie powiązane sprawy i kontakty; profil kontaktu pokazuje zapisane dane i powiązane sprawy/organizacje. Detal sprawy pokazuje role organizacji i osoby, bez wymuszenia pracodawcy. Listy i selektory wymagają kompletnego dostępu przez paginację, bez cichego obcinania wyników; bez budowy Global Search.

Minimalna korekta nazwy/e-maila i błędnego powiązania zapobiega pozostawieniu użytkownika z nieodwracalną pomyłką; nie jest edycją faktów rekrutacyjnych. Granice korekty wymagają poniższej decyzji PO.

**Poza tym przyrostem:** uczestnicy źródłowych zdarzeń, historia kontaktu, korespondencja, CalendarEvent/Task, import/enrichment/URL fetch, merge profili, fuzzy matching, Global Search, hard delete/archiwizacja/restore profili, retencja/eksport/usunięcie konta i publiczne wdrożenie. To kolejność etapów, bez usuwania tych funkcji z zatwierdzonego MVP. Quick Capture zachowuje obecny kontrakt; relacje dodawane na istniejącej sprawie, bez nowego obowiązkowego kroku tworzenia sprawy.

Sam link Case↔Contact nie nadaje osobie udziału w historycznych ani przyszłych faktach. Nie pokazujemy odziedziczonej osi czasu ani komunikatu sugerującego „brak rzeczywistego kontaktu”. AC-CC-007/009/010 pozostają niewykonane.

## 3. Rzeczywiste decyzje PO przed zależną implementacją

Rekomendowany pakiet: **1A / 2A / 3A**, w całości PROPOSED. Nie zamyka całych OPEN.

### 1 — Minimalne dane profilu (OPEN-002)

- **1A — rekomendacja:** organizacja: nazwa 1–160 znaków po trim; kontakt: nazwa wyświetlana 1–160 po trim i jeden opcjonalny e-mail do 254 znaków po trim. Pusta opcjonalna wartość oznacza brak; e-mail jako pojedynczy adres ze sprawdzeniem składni, bez sprawdzania skrzynki/sieci. Brak wymogu rozdzielania imienia i nazwiska, telefonu, stanowiska, NIP, domeny, adresu, notatek i danych wrażliwych. Nazwa/e-mail edytowalne z ochroną przed nadpisaniem równoległej zmiany i prywatnym audytem technicznym.
- **1B:** wyłącznie nazwy z tymi samymi limitami i korektą. Mniej danych osobowych; brak rozróżniania dopasowań po e-mailu. Wariant 3A stosuje wtedy tylko sygnał nazwy.

UUID, właściciel z zaufanej tożsamości, czas techniczny, wersja i klucz zamiaru są mechaniką obecnej architektury; nie zastępują brakującej zgody na pola biznesowe. Limity z DEC-052 nie są automatycznie przenoszone na CC — tutaj są propozycją.

### 2 — Kardynalności i naprawa relacji (OPEN-002/005; granica OPEN-030)

- **2A — rekomendacja:** Case↔Organization M:N z rolą `pracodawca` lub `agencja` na każdym powiązaniu; brak limitu jednego podmiotu na rolę, obie role dla tej samej organizacji tylko po jawnym wskazaniu. Case↔Contact M:N zgodnie z zatwierdzonym modelem. Organization↔Contact M:N jako jawne bieżące powiązanie, bez twierdzenia o zatrudnieniu lub jego okresie. Wszystkie relacje opcjonalne; brak automatycznego wywodzenia afiliacji ze wspólnej sprawy albo e-maila. Jawne dodanie/odłączenie, również przy zakończonej sprawie, z prywatnym audytem technicznym zachowującym kto/co/kiedy; bez hard delete profili i bez zmiany źródłowych faktów. Zmiana roli jest jawną atomową korektą relacji. Ponowne podłączenie po odłączeniu to nowy zamiar, nie odtworzenie starego retry.
- **2B:** te same kardynalności i jawność, ale tylko dodawanie relacji. Mniejsza implementacja, błędnej relacji nie można poprawić w UI; ten koszt wymaga świadomej akceptacji PO.

Nie pytamy ponownie o M:N Case↔Contact ani nie zastępujemy pracodawcy agencją. Brak wiedzy o pracodawcy to brak relacji, bez fikcyjnego profilu „Nieznany”. OPEN-030 dotyczący uczestnictwa w wydarzeniach pozostaje otwarty; zakres obecnych relacji musi być zapisany oddzielnie od niego.

### 3 — Deduplikacja katalogu (OPEN-024)

- **3A — rekomendacja:** kandydaci tylko w katalogu bieżącego właściciela i tego samego typu. Identyczna nazwa po deterministycznej normalizacji (NFC, trim, zwinięcie białych znaków, lowercase) albo identyczny opcjonalny e-mail po trim/lowercase wywołuje ostrzeżenie. Oryginalna wartość pozostaje do prezentacji; bez usuwania polskich znaków, sufiksów prawnych, kropek lub `+tag` w e-mailu. Użytkownik otwiera/wybiera istniejący profil albo świadomie tworzy odrębny. Reguła obowiązuje tworzenie i korektę danych, z wykluczeniem własnego UUID z kandydatów. Nowe dopasowania wykryte przy zapisie wymagają odświeżenia ostrzeżenia i potwierdzenia; bez cichego pomijania wyścigu. Nazwa i e-mail nie stanowią unikalnej tożsamości, brak UNIQUE na tych wartościach.
- **3B:** ostrzeganie wyłącznie po identycznej znormalizowanej nazwie; mniej reguł, pomija osobę zapisaną pod różnymi nazwami mimo tego samego e-maila.

Zakaz automatycznego scalania jest już zatwierdzony. Wybór istniejącego profilu tylko tworzy żądaną relację; nie nadpisuje jego danych ani nie scala RecruitmentCase. Retry techniczny to osobny problem: ten sam owner/klucz/payload odtwarza wynik, zmieniony payload jest konfliktem. Potwierdzenie świadomego osobnego profilu nie znosi idempotencji.

### Co nie blokuje obecnej analizy i lokalnego zakresu syntetycznego

OPEN-013/032 i odpowiednie OPEN-041–046 pozostają bramkami publicznego użycia, realnych danych i operacji wrażliwych; owner-only nie jest ponownie otwierane. OPEN-004/030 nadal blokują przyszłe uczestnictwo/historię osoby. OPEN-005 nie zostaje zamknięte przez odłączenie relacji; polityki usuwania/archiwizacji profili pozostają osobnym zadaniem. Aktualny etap to tylko analiza; wykonanie wymaga osobnego zlecenia PO nawet po wyborze wariantów.

## 4. Impact analysis i warunki integralności

| Obszar | Wpływ / wymagane zabezpieczenie w przyszłej implementacji |
|---|---|
| RecruitmentCase / lifecycle | Addytywne relacje do istniejących UUID. Utworzenie, korekta i odłączenie profilu/relacji nie zmienia statusu, etapu, cyklu, zakończeń, faktów ani ich rewizji; nie tworzy kontaktu inbound/outbound. Bez resetów/backfillu na podstawie tytułów/URL. |
| Organizacje/osoby | Rola organizacji kontekstowa. Brak inferencji zatrudnienia, pracodawcy i udziału osoby; brak klonowania profilu przy kolejnym procesie. |
| Spójność i wyścigi | Ochrona obu końców i właściciela relacji także na poziomie DB; brak osieroconych i podwójnych aktywnych relacji. Atomowy zapis/rollback. Jawne konflikty wersji przy edit/detach/role-change. Stare retry po detach/relink nie wskrzesza wcześniejszej relacji. |
| Historia/audyt | Prywatny techniczny audyt zmian katalogu/relacji odrębny od osi biznesowej. Historia osoby i snapshoty historycznego zatrudnienia poza zakresem; nie narzucamy nowej retencji. |
| Dostęp / prywatność | Obecna SEC-02: RLS/minimalne grants, trusted owner, bez service-role w user path. Kontrola każdego końca relacji, read po ID, list, count, dopasowań i błędów; brak wycieku istnienia cudzych rekordów. Dotyczy BFF, direct Data API i RPC oraz audytu/recovery. |
| PII / sesje | Nazwy/e-mail nie trafiają do logów/telemetrii ani współdzielonego cache. Nie kopiować payloadów z e-mailem do browser storage przez automatyczne rozszerzenie recovery lifecycle. Projekt recovery minimalizuje payload i ponownie autoryzuje odczyt wyniku. Bez nowych obietnic natychmiastowej revocation JWT. |
| UX | Istniejący visual language; puste listy, walidacja, wybór istniejącego profilu, ostrzeżenia, loading/error/uncertain/retry/conflict, focus/klawiatura i zachowanie formularza po błędzie. Dane nie mogą znikać przez limit listy/selektora. |
| Import / Search / automatyzacje | Brak implementacji i rozszerzenia AC tych modułów. Stabilne UUID pozostają podstawą przyszłych jawnych relacji. Brak fetch, wiadomości i automatycznych scaleń. |
| Migracje / środowisko | Nowa addytywna migracja w istniejącym ledgerze dopiero po decyzjach; test upgrade z aktualnego stanu. Izolowany własny target, persistent DEV i cudze zasoby nietknięte. |

## 5. Plan wykonania po decyzjach i autoryzacji

Metadane: orchestrator `/root`; konsultacje `cc_spec` (spec-analyst) i `cc_qa` (qa-engineer). Model/reasoning dziedziczone, dokładne wartości NOT EXPOSED. Bez dalszej delegacji przez konsultantów. Karty przyszłych zadań według [template](../templates/agent-task.md); każdy wykonawca dostaje te same ID i poniższy DoD.

| Krok / właściciel | Rozłączny zakres zapisu i rezultat |
|---|---|
| 1. Orchestrator / spec-analyst | Po odpowiedzi PO: zapis rzeczywistej decyzji przez `record-decision`; aktualizacja tego kontraktu, właściwego podzakresu OPEN, modelu, feature, FR/AC, scenariuszy i traceability. Bez samodzielnego APPROVED. |
| 2. UX + QA | UX: `docs/ux/` wyłącznie w zakresie Firmy/Kontakty/relacji; doprecyzowanie interakcji przed frontendem. QA: końcowa macierz i syntetyczne fixtures; AC i negatywne kontrakty przed kodem tam, gdzie praktyczne. |
| 3. Backend-engineer | `db/recruitment/schema.ts`, nowa migracja/meta, planowany `src/modules/companies-contacts/` i wydzielony BFF katalogu/relacji; własne unit. Atomowe polecenia, owner/FK/RLS, idempotencja, konflikty i audit według zatwierdzonego wariantu, bez alternatywnej architektury. |
| 4. Frontend-engineer | Planowane `src/app/companies/`, `src/app/contacts/`, komponenty katalogu/relacji, nawigacja i integracja detalu `src/app/recruitments/[id]/page.tsx`; własne unit. Jeden autor detalu i współdzielonych komponentów. |
| 5. QA-engineer | Planowane `tests/integration/recruitment/companies-contacts.test.ts`, `tests/e2e/companies-contacts.spec.ts`, fixtures, `scripts/recruitment/runner.ts` i właściwy Playwright config. Backend nie edytuje równolegle plików runnera/QA. |
| 6. Niezależni reviewerzy | Backend + frontend + security na zamrożonym kandydacie; inna sesja niż autor, rodzice read-only przez `harness/scripts/review.py`; findings bez poprawek autora przez reviewera. Re-review po naprawach. |
| 7. Orchestrator | Raport, dokumentacja/traceability i dowody exact SHA/diff; ewentualny PR wyłącznie w zakresie późniejszej autoryzacji. Obecne zlecenie nie autoryzuje commit/push/merge/deploymentu. |

Nazwy nowych ścieżek są propozycją własności, nie utworzonymi modułami. Kolejność zmian współdzielonego pliku wymaga jawnego przekazania jednemu właścicielowi.

## 6. Plan QA i mierzalny DoD

Wszystkie nowe testy poniżej: **PLANNED / NOT RUN**; autorzy nie wykonali testów produktu podczas analizy.

| FR/AC / scenariusz | Dowód wymagany | Autor / review |
|---|---|---|
| CC-001/006, TC-025 podzbiór | Samodzielny kontakt bez pustej sprawy; niezależne listy/profile i direct ID | Unit backend/frontend; integration/browser QA; obaj reviewerzy |
| CC-002/003, TC-008 podzbiór | Agencja + osoba bez pracodawcy; brak podstawiania pracodawcy; role kontekstowe | QA integration/browser; backend/frontend |
| CC-004/005 | Dwie osoby w sprawie, jedna osoba w dwóch sprawach, jedna tożsamość profilu | QA integration/browser; backend |
| CC-008/011, TC-006/014 podzbiór | Jawne kontakty firmy i dwie niezależne sprawy; brak dziedziczenia przez wspólny case | QA integration/browser; backend/frontend |
| OPEN-002/024 według wariantu | Normalizacja/Unicode, brak danych, błędny e-mail/limity, kandydaci owner-only, świadomy osobny profil, reuse bez overwrite | Unit developerów; integration/browser QA; backend/frontend/security |
| Integralność / retry | Same-key replay, changed-payload conflict, utrata odpowiedzi, rollback, równoległe attach, edit/edit i attach/detach, ABA i stare retry, nowe dopasowanie przy confirm | QA integration na realnej DB; backend/security |
| AD-002 / BR-030, TC-034 podzbiór | A pozytywnie; B/anon list/ID/count/dedup/audit/recovery, spoof owner, relacje A→B i B→A. Bezpośredni Data API/RPC z pominięciem BFF; brak ujawnienia istnienia | QA real Auth/JWT/RLS; security/backend |
| Integralność audytu i idempotencji / SEC-02 | Właściciel próbuje bezpośredniego INSERT/UPDATE/DELETE audytu i rejestru zamiarów przez Data API: brak możliwości sfałszowania śladu, podmiany wyniku lub usunięcia zabezpieczenia retry; dozwolone zapisy wyłącznie przez kontrakt komendy | QA integration; backend/security |
| Origin / CSRF nowych mutacji / SEC-01 | Brakujący lub obcy Origin, próba cross-site i błędne uwierzytelnienie na nowych mutacjach BFF; odmowa bez zapisu i bez ujawniania danych | QA integration/browser; security |
| Regresje 3A/3B/korekty/3C | Snapshot danych przed/po katalogu/relacji: status, etap, cykl, wszystkie zakończenia, fakty i rewizje identyczne; closed cases dostępne; upgrade nie zmienia danych | QA pełny runner + upgrade; backend |
| UX / prywatność | 1440/1024/768/375, klawiatura/focus, błędy i uncertain recovery, paginacja, XSS jako tekst, cache A/B i brak PII/tokenów w logach/storage | QA browser; frontend/security |

Planowane pełne lokalne pokrycie **AC-CC-001–006/008/011** pod warunkiem wdrożenia i testów; nie jest bieżącym PASS. **AC-CC-007/009/010, pełne TC-019/025 i cały TC-034 pozostają poza pokryciem.** Brak ekranu komunikacji nie jest dowodem walidacji AC-CC-007. Negatywny test braku dziedziczenia historii chroni BR-019, ale nie zalicza dodatniego AC-CC-009/010.

Istniejące komendy przyszłej weryfikacji: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test:boundaries`, `pnpm test:canary`, `pnpm test:recruitment`. Repo wymaga Node 24.22.2 / pnpm 12.16.1; trzeba sprawdzić faktycznie uruchomiony runtime. `pnpm test:recruitment` ma jawną listę integracji — nowy plik musi zostać do niej dodany. Produkcyjny build/HTTPS browser i rzeczywisty lokalny Auth/Data API/RLS w istniejącym izolowanym runnerze, bez resetu persistent DEV.

DoD wykonania: zatwierdzone tylko właściwe szczegóły OPEN, AC w zakresie z realnym dowodem, testy bez skips i natural exit 0, migracja upgrade oraz izolacja środowiska, niezależne review bez nierozwiązanych blockerów, finalny kandydat dokładnie zidentyfikowany; komendy/środowisko/wyniki i ograniczenia w raporcie. Hosted CI wiązane z exact head SHA, gdy osobno autoryzowany PR powstanie. Fizyczne urządzenia/AT, live OAuth i publiczne użycie nie uzyskują PASS z lokalnego browsera.

## 7. Wynik tej analizy

- **PASS:** potwierdzenie merge PR #18 i zgodności lokalnej bazy, analiza źródeł, konsultacje spec/QA, plan i oddzielenie zatwierdzonego modelu od propozycji.
- **BLOCKED dla zależnej implementacji:** wybór 1/2/3 i osobna autoryzacja wykonania; nie blokuje ukończenia analizy.
- **NOT RUN:** implementacja, migracje, wszystkie nowe testy produktu i ich runtime review. Żadnych zmian aplikacji, DB, infrastruktury ani publikacji.

Niezależna ocena dokumentu jest raportowana oddzielnie od testów i od akceptacji PO.

### Niezależne review analizy

**PASS**, bez P0/P1/P2. Polecenie: `python3 harness/scripts/review.py codex security-reviewer --timeout 600`, zadanie przez stdin. Osobny rodzic read-only, dokładnie jeden generic subagent + canonical role, model/reasoning NOT EXPOSED; autor `/root`, rodzic review `01a192cb-4694-7413-aad5-6ed2c2b9083c`. Exit 0, `changedFiles=[]`, fingerprint przed/po `105e5cb12667c5dd879a2c6151f26576fc79d38f0d25d4b42cc632c7f78a9623`. Oceniony SHA256 analizy `d78d9828d0d9739361703581ad36eb28078ffc882eb8b14c276351e0937e71ac` (przed tym dopiskiem i dwiema uzupełniającymi pozycjami QA). Log i metadata: `/tmp/jobs-crm-cc-sdd-review.jsonl`, `/tmp/jobs-crm-cc-sdd-review-meta.json` — lokalne, nietrwałe dowody.

Dwa P3 dotyczyły dopisania testów CSRF/Origin oraz bezpośrednich prób modyfikacji audytu/rejestru zamiarów przez właściciela. Orchestrator przyjął rekomendacje i dodał je do macierzy; ta addytywna delta dokumentacyjna nie miała osobnego re-review. Bez nierozwiązanych blockerów analizy. Testy produktu i runtime security review nadal NOT RUN.

## Aktualizacja wykonawcza — DEC-058

PO jawnie zatwierdził 1A/2A/3A oraz pełne wykonanie i PR. Historyczne adnotacje PROPOSED/BLOCKED i brak autoryzacji z etapu analizy powyżej opisują wcześniejszy stan; dla wybranych wariantów zostały zastąpione DEC-058. Pozostałe warianty nie są zatwierdzone. Prace na gałęzi `feat/companies-contacts`, baza fa66fc7. Backend owns db/recruitment i src/modules/companies-contacts oraz src/app/catalog/commands; frontend owns nowe strony/komponenty, nawigację i integrację detalu; QA owns tests/integration/recruitment/companies-contacts.test.ts, tests/e2e/companies-contacts.spec.ts oraz runner/config. Orchestrator owns dokumentację. Model/reasoning dziedziczone NOT EXPOSED, role kanoniczne, bez dalszej delegacji.
