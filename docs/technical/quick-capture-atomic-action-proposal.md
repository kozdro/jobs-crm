# Quick Capture — zatwierdzony kontrakt atomowego Działania

**Status kontraktu: APPROVED — DEC-061, P1/P2/P3. Implementacja: NOT IMPLEMENTED / NOT RUN; wymaga osobnego zadania PO.** Data: 2026-11-01. Baza analizy: `637f330f6dc1215ad2479dd699b8814397e5b5de`, aktualny main po PR #21. Autor: `hardening_spec`, spec-analyst, model/reasoning inherited / NOT EXPOSED. Zastosowano analyze-requirement, clarify-requirements i plan-slice; pierwotna propozycja nie tworzyła DEC APPROVED; poniższa aktualizacja zapisuje rzeczywistą akceptację PO bez zmian ADR, schematu lub kodu.

Źródło obecnej pracy: PO polecił **przed rozszerzeniem Działania przygotować w tym zadaniu szczegółowy kontrakt atomowy do akceptacji; niezależny UX realizować dalej**. To autoryzuje ten projekt kontraktu, nie jego wdrożenie. [Analiza zgodności](product-journey-hardening-analysis.md) nadal rozdziela niezależny hardening od rozszerzenia.

## Akceptacja PO — 2026-11-01

Źródło: odpowiedź PO w bieżącej rozmowie: **„Akceptuję kontrakt P1/P2/P3; implementacja pozostaje osobnym zadaniem.”** Zapis kanoniczny: [DEC-061](../decisions/product-decisions.md). Wszystkie trzy pakiety zostały zaakceptowane jako **kontrakt**, bez zgody na wykonanie produktu, SQL/migracje, zmianę danych, merge lub deployment.

Akceptowany artefakt przed niniejszą adnotacją miał SHA-256 **`1f669e92b8a259ad9a63f68e294d6cb60a1ebcc1fb425acdff8bce5c074af991`**. Jego dokładna treść pozostaje w Git `0f93627cd2af6818487568a93499077d6b3688e5` pod tą samą ścieżką (ref i hash zweryfikowane przed zapisem akceptacji). Historyczny etap PROPOSED / READY_FOR_OWNER_DECISION oraz poniższe warianty akceptacji nie są usuwane. Aktualizacja zmienia status i odsyłacze, a nie treść zaakceptowanych zobowiązań P1/P2/P3. §9 zachowuje historyczne sformułowania propozycji; nie jest ponownym pytaniem o zgodę już udzieloną.

**Pozostała bramka: osobne zadanie implementacyjne.** Macierz testów nadal PLANNED / NOT RUN. Nie zatwierdzono nowych polityk retencji/TTL, publicznych bramek lub nowej architektury. Nazwa pliku `proposal` pozostaje stabilnym adresem historycznej propozycji i zaakceptowanego kontraktu.

## 1. Istniejące decyzje i nowe rozstrzygnięcia

Skróty źródeł stosowane w każdym punkcie:

| Kod | Kanoniczne źródło i status | Co już rozstrzyga |
| --- | --- | --- |
| UX | [Blueprint §3/§8](../ux/blueprint.md), [wybory 1.12–1.16](../ux/blueprint-decisions.md), [F02/F04](../ux/flow-contracts.md), APPROVED wybory PO | Sytuacja jest wskazówką, jawne opcjonalne rzeczywiste Działanie albo tylko sprawa, weryfikacja i summary, sukces bez nawigacji, dirty guard |
| CREATE | [DEC-052](../decisions/product-decisions.md), [DATA-01](recruitment-case-first-slice.md), APPROVED podzakres | Cztery kroki; title/description/sourceUrl; save-only Zapisane; owner-scoped duplicates, requestId/retry/conflict, brak merge/update |
| FACT | [DEC-054 / 3A](recruitment-lifecycle-3a.md), APPROVED podzakres | Application/contact inbound/outbound na istniejącej sprawie, optional nonfuture day/unknown, explicit confirmation, atomowy fakt + Kontakt rozpoczęty, oddzielny server time |
| HISTORY | [DEC-056/057](../decisions/product-decisions.md), [integralność korekt](history-corrections-integrity-analysis.md), APPROVED | Oryginały/rewizje/void i close/reopen pozostają; stare retry nie odtwarzają skutków; stan/historia/audyt odrębne |
| TASKS | [DEC-060](tasks-core-analysis.md), APPROVED podzakres | Wcześniejsze problemy full-intent recovery/stale responses są znanym ryzykiem; nowa komenda nie ma osłabiać tych granic |
| TECH | [TD](discovery-decisions.md) 1.1/1.2/1.31–1.33/1.37/1.38; [ADR-0001](../decisions/adr/0001-modular-nextjs.md), [ADR-0002](../decisions/adr/0002-relational-state-history.md), [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), ACCEPTED | Modular monolith, PostgreSQL transakcje, stan/historia/audyt osobno, Data API/JWT/RLS, minimalne RPC INVOKER, Drizzle migracje; bez uprzywilejowanego user path |
| BR | [BR-001/003/004/007/014/015/016/020/021/022/026/028/029/030](../domain/business-rules.md), APPROVED | Brak fikcyjnych faktów/CV/komunikacji/inferencji, prywatność, rozdział URL i aplikacji, jawna deduplikacja i zapis |

**NOWE względem wcześniejszych przyrostów — zatwierdzone DEC-061:** połączenie CREATE i FACT w jednym zatwierdzeniu; zakres czterech wariantów Działania; wspólny identyfikator pełnego zamiaru i trwały wynik; związanie zgody na duplikat z treścią i aktualnym zbiorem dopasowań; zachowanie niepewnego wyniku, jego odczyt i zgodność starych klientów. Poniższe „musi” opisuje zaakceptowany kontrakt P1/P2/P3; jego wykonanie pozostaje nieautoryzowane w tym zadaniu.

Nie proponujemy zastąpienia Discovery uproszczonym MVP. Docelowy cel UX pozostaje; zmieniamy wyłącznie dotychczasowy zakres wykonawczy save-only, zgodnie z akceptacją kontraktu w DEC-061; implementacja wymaga osobnego zadania. Nie otwieramy ponownie wyboru stacku/Auth/F4. ADR-0005 dotyczy importu; [F4](foundation-plan.md) nie blokuje CRUD i nie jest gotowym kontraktem tego rozszerzenia. [Źródła: UX, CREATE, FACT, TECH.]

## 2. Zakres biznesowy i DTO — APPROVED kontrakt P1 (DEC-061)

Jeden świadomy zapis tworzy **jedną nową sprawę** i **zero lub jeden rzeczywisty fakt**. Cztery warianty:

| `action.kind` | Dodatkowy fakt | Wynik początkowego zastosowania |
| --- | --- | --- |
| `save_only` | Brak | Zapisane, brak etapu i brak nowej aplikacji/kontaktu |
| `application` | Application, direction null | Kontakt rozpoczęty, brak etapu |
| `contact_inbound` | Contact, direction inbound | Kontakt rozpoczęty, brak etapu |
| `contact_outbound` | Contact, direction outbound | Kontakt rozpoczęty, brak etapu |

P1 rozszerza CREATE jedynie o trzy fakty już istniejące w FACT. Kontakt nie tworzy osoby/firmy/uczestnictwa; application nie oznacza wysłania CV ani zaproszenia; nie wolno osiągnąć W rekrutacji z tego zapisu. Opcja save-only jest dostępna dla **każdej** Sytuacji, także „wykonana aplikacja”. [Istniejące źródła: UX, FACT, BR; nowe połączenie: P1.]

Proponowany kontrakt wejścia (nazwy techniczne do weryfikacji implementacyjnej, semantyka P1/P2 do PO):

```ts
type QuickCaptureAtomicInput = {
  contractVersion: 1;
  requestId: UUID;
  expectedUserId?: UUID; // warunek zgodności sesji, nie źródło ownera
  title: string;
  description?: string | null;
  sourceUrl?: string | null;
  action:
    | { kind: "save_only" }
    | {
        kind: "application" | "contact_inbound" | "contact_outbound";
        occurredOn: CalendarDay | null;
        factConfirmed: true;
      };
  duplicateAcknowledgement?: {
    intentFingerprint: string;
    matchSetFingerprint: string;
    createSeparateCase: true;
  };
};
```

- Title i description zachowują dokładnie trim, liczenie punktów kodowych, ograniczenia 1–160/≤2000 i zakaz niemożliwego do zapisu tekstu z CREATE; opcjonalny URL zachowuje kanonikalizację HTTP(S) CREATE. Bez fetch, nowych źródeł/kanałów i zmiany URL normalization. [CREATE, BR; bez nowej polityki.]
- Dla faktu `factConfirmed` musi być rzeczywistym boolean true po odrębnej zgodzie użytkownika. Sytuacja ani nazwa pola nie podmieniają tej zgody. Save-only odrzuca pola dnia/potwierdzenia zamiast po cichu zapisać fakt. Nieznane klucze, status/owner/id/czas/etap klienta są odrzucane; brak „best effort” usuwania błędnych pól i częściowego sukcesu. [UX, FACT, BR; nowy discriminated command P1.]
- `occurredOn` jest rzeczywistym dniem YYYY-MM-DD lub null/nieznane, bez godziny. Niepoprawny lub przyszły dzień odrzuca **cały** zapis. „Dzisiaj” pozostaje według istniejącego lokalnego FACT Europe/Warsaw, bez nowego ustawienia profilu. Brak dnia nie jest uzupełniany created_at/recorded_at. [FACT, BR-015; przeniesienie do P1.]
- Owner, UUID nowej sprawy/faktu, cycle/revision i `created_at`/`recorded_at` nadają zaufane warstwy zgodnie z CREATE/FACT, nie input. Zaufany czas rejestracji nie dowodzi dnia działania. Początkowy cykl i rewizje stosują istniejące niezmienniki, bez nowej biznesowej definicji. [CREATE, FACT, HISTORY, TECH.]
- Sytuacja (pięć intencji Blueprintu) jest wyłącznie stanem UI, **nie polem komendy, fingerprintu biznesowego, DB enumem ani faktem**. Nie kopiuje się z niej `action.kind`, date, confirmation, statusu ani danych pracodawcy. [UX, CREATE, BR.]

## 3. Granica transakcji i wynik — APPROVED kontrakt P1/P2 (DEC-061)

Jedno wywołanie biznesowego RPC w kontekście uwierzytelnionego właściciela, w jednej transakcji PostgreSQL:

1. Waliduje tożsamość i pełny kanoniczny command; ustala ownera z Auth/JWT oraz blokadę wspólną z istniejącą serializacją tworzenia spraw tego ownera. [CREATE, FACT, TECH; integracja P2.]
2. Sprawdza wcześniejszy wynik `(owner, requestId)` **przed próbą nowego utworzenia**. Zgodny pełny zamiar zwraca ten wynik, inny konflikt. [CREATE, HISTORY; rozszerzenie pełnego zamiaru P2.]
3. Sprawdza aktualne owner-only dopasowania i wymagane potwierdzenie oddzielnej nowej sprawy, zanim dokona biznesowej mutacji. [CREATE, BR-022; snapshot binding P2.]
4. Tworzy case; przy fakcie tworzy dokładnie istniejący rodzaj application/contact, aktualizuje stan i istniejące rewizje/wersje/cycle zgodnie z FACT/HISTORY. Nie dodaje osobnej fikcyjnej aplikacji, „początkowego kontaktu” lub status-change jako drugiej aktywności. [FACT, HISTORY, TECH; wspólna transakcja P1.]
5. Utrwala immutable receipt/odniesienia do wyników i pełnego canonical intent w tej samej transakcji. Dane audytowe aktor/czas i ewentualny techniczny command receipt nie są dodatkowym wydarzeniem biznesowym. RLS/grants chronią receipt tak jak sprawę i historię. [HISTORY, TECH; nowy receipt P2.]
6. Commit obejmuje **wszystkie** elementy albo żaden. Błąd faktu, stanu, receipt/audytu, ograniczenia/triggera lub odmowa RLS wycofuje również nową sprawę. Nie wolno zastąpić tego create HTTP → event HTTP z późniejszą kompensacją/hard delete. [TECH transakcje; nowe zobowiązanie P1/P2.]

Sukces zwraca receipt z `requestId`, `contractVersion`, zgodnością pełnego zamiaru, caseId, eventId lub null, historycznym wynikiem status/stage i serwerowym czasem zapisu. Oryginalny payload i wynik pozostają niezmienne; późniejsze korekty/void/close nie przepisują receipt. Odczyt bieżącej sprawy jest osobny, jawnie aktualny — replay po zamknięciu nie może pokazać historycznego Kontakt rozpoczęty jako obecnego stanu. [HISTORY, TECH; format receipt P2.]

Nie obiecujemy „exactly once execution”: gwarantujemy pojedynczy utrwalony efekt pełnego zamiaru/replay w określonym owner namespace i brak ponownego zastosowania jego skutków. [CREATE, HISTORY, ADR-0012; P2.]

## 4. Duplikaty, zgoda i współbieżność — APPROVED kontrakt P2 (DEC-061)

- Bez zmiany algorytmu CREATE: deterministyczny identyczny znormalizowany title **lub** identyczny canonical URL wyłącznie u właściciela, bez globalnej unikalności/merge. Dopasowania obcego właściciela nie wywołują ostrzeżenia i nie ujawniają count/ID/metadanych. [CREATE, BR-022/030.]
- Wynik `duplicates` nie tworzy sprawy/faktu/receipt sukcesu. Zawiera własne dopasowania według istniejącego ograniczenia prezentacji CREATE (20 + informacja o dalszych) oraz referencje pełnego zamiaru i aktualnego zestawu dopasowań. Fingerprint zbioru uwzględnia wszystkie dopasowania, nie tylko pierwszą stronę. [CREATE; nowe związanie P2.]
- UI pozwala otworzyć istniejącą sprawę, anulować albo potwierdzić utworzenie **odrębnej nowej**. Otwarcie istniejącej nie zapisuje na niej planowanego faktu i nie staje się ukrytą aktualizacją. Dirty guard nadal chroni szkic. [CREATE, UX, BR-022; zastosowanie do P1/P2.]
- `createSeparateCase: true` jest wymagane po ostrzeżeniu; acknowledgment wiąże ownera i całą canonical treść command z aktualnym zbiorem dopasowań. Zmiana title/URL/description/**kind/day/confirmation** unieważnia zgodę. Nowe lub usunięte dopasowanie między warning a commit powoduje nowy warning/konflikt i ponowne świadome potwierdzenie, bez częściowej mutacji. [UX świadoma zgoda; snapshot semantics NOWE P2.]
- Serwer/DB waliduje referencje względem aktualnych danych i pełnej treści; nie ufa fingerprintowi dostarczonemu przez klienta jako dowodowi ownera lub uprawnień. Algorytm serializacji i generowania referencji musi być wspólny i testowany, a szczegół technicznego formatu nie ustanawia nowej polityki biznesowej. [TECH, BR-030; P2.]
- Wspólna owner lock serializuje zwykłe create i compound create, a unique `(owner, requestId)` jest końcowym guardem. Nowa ścieżka nie może ignorować trwającego starego create. Istniejący dozwolony bezpośredni INSERT nie daje globalnej gwarancji braku duplikatu biznesowego — dokumentować tę granicę, jak CREATE, bez cichego rozszerzenia grantów lub obietnicy globalnej unikalności. [CREATE, TECH; integracja P2.]
- Dwa różne requestId mogą oznaczać dwie świadomie oddzielne sprawy po ostrzeżeniu. Nie deduplikować ich przez sam podobny title, wybraną Sytuację lub zgodny fakt. Ten sam UUID u dwóch ownerów pozostaje niezależny. [CREATE, BR-001/002/022; P2.]

## 5. Kanoniczny zamiar, retry i recovery — APPROVED kontrakt P2 (DEC-061)

Canonical intent obejmuje `contractVersion`, kanoniczne title/description/sourceUrl oraz cały wariant action, jego dzień i explicit confirmation. Fingerprint jest deterministyczny i niezależny od kolejności kluczy JSON. Owner jest osobną zaufaną częścią namespace. `requestId` identyfikuje intent, a nie jest składnikiem porównywanej treści. `expectedUserId` jest warunkiem tożsamości; acknowledgment duplikatu nie jest treścią biznesową, bo jego ponowne potwierdzenie musi umożliwić zapis tego samego niezmienionego zamiaru. Sytuacja UI nie zmienia wyniku ani intent. [CREATE, FACT, HISTORY, TASKS; rozszerzenie P2.]

- Przed dispatch UI zamraża pełny zamiar i requestId. Same walidacje client-side nie rezerwują klucza DB i nie dowodzą wyniku. Pierwsze wysłanie/powtórzenie tego samego canonical intent używa tego samego klucza; po wysłaniu nie wolno podmienić payloadu pod jego kluczem lub automatycznie nadać nowego na błąd. [CREATE, HISTORY; pełny intent P2.]
- W DB utrwalony ten sam key + ten sam canonical intent zwraca `replayed`; inny intent daje konflikt bez mutacji. Replay nie tworzy następnego eventu, nie zmienia current status, nie odwraca korekt/void i nie przywraca dawnych relacji/stanu. [HISTORY, CREATE; P2.]
- Recovery read przyjmuje requestId i odtwarza immutable receipt **tylko właściciela**, z pełnym intent do sprawdzenia zgodności. Nie ujawnia B, czy requestId istnieje u A. Brak wpisu oznacza „brak potwierdzonego wyniku w tym odczycie”, a nie gwarantowany rollback/in-flight cancellation. Retry jest bezpieczny tylko z tym samym zamrożonym intent. [CREATE recovery, HISTORY, TECH; full receipt/read P2.]
- Utrata odpowiedzi/time-out/transport5xx daje stan „wynik niepotwierdzony”, nie sukces i nie domniemany rollback. GET sam nie inicjuje zapisu; retry pełnej komendy to osobna świadoma akcja. Odczyt/powtórzenie nie opiera się na lokalnym UUID bez właściwego intent/ownera. [CREATE, HISTORY; P2.]
- Odpowiedź GET/retry wolno zastosować tylko jeśli **w chwili obsługi odpowiedzi** owner, requestId i cała zamrożona treść nadal odpowiadają aktualnej oczekującej operacji. Opóźniona odpowiedź poprzedniej treści/konta nie ustawia sukcesu, nie czyści nowego draftu i nie uruchamia następnej mutacji. [TASKS znany problem, HISTORY; P2.]
- Malformed/niekompletna/nieobsługiwana obecna koperta recovery jest blokowana i kwarantannowana jako niepoprawna; bez fallbacku do samego requestId, save-only lub domniemanego faktu. Brak koperty w starym save-only może użyć **wyłącznie** dotychczasowej bezpiecznej ścieżki legacy, nigdy zostać uznany za zgodę na compound action. [CREATE kompatybilność, TASKS; P2.]
- Brak nowego arbitralnego storage payloadów/tokenów. Minimalny dodatkowy stan recovery musi respektować istniejące ograniczenie CREATE: właścicielowo ograniczony klucz; po odświeżeniu receipt może przywrócić zamrożony zamiar po bezpiecznym odczycie właściciela. Bez receipt i pełnej treści klient nie może zgadywać retry. Jeśli potrzebny jest zapis pełnej koperty po stronie klienta, wymaga osobnego uzasadnienia prywatności i akceptacji przed implementacją. [CREATE, BR-030, ADR-0012; dokładny mechanizm P2.]
- Nie ustalamy TTL/retencji/pruning registry, polityki usuwania lub eksportu. Nie usuwać receipt ani nie pozwalać klientowi rezerwować/przepisywać go bez biznesowej komendy. Jeżeli przyszła realizacja wymaga czasowego wygaśnięcia wyniku/idempotencji, wraca do PO zamiast wymyślać próg; OPEN-005/032 pozostają. [TECH, HISTORY, BR-030; brak nowej polityki.]

## 6. UX, anulowanie i błędy — APPROVED kontrakt P3 (DEC-061)

Cztery kroki **Sytuacja → Dane → Działanie → Podsumowanie** z CREATE pozostają. P3 wprowadza w Działaniu jawny wybór save-only albo application/contact inbound/outbound; nie ma domyślnego faktu, auto-check confirmation ani domyślnego dnia na podstawie Sytuacji. [UX, CREATE, FACT; nowy wybór action w QC P1/P3.]

- Back/forward zachowują szkic bez zapisu. Zmiana Sytuacji nie wybiera ani nie resetuje po cichu Działania. Zmiana rodzaju faktu wymaga ponownego potwierdzenia tego faktu; poprzednia zgoda nie przenosi się na inny rodzaj/dzień. Przed końcowym dispatch każda zmiana summary danych ma nową aktualną zgodę, a wcześniejsza zgoda na duplikat jest nieważna. [UX świadomy fakt; szczegóły P3.]
- Summary jawnie oddziela intencję Sytuacji, dane sprawy, rodzaj rzeczywiście rejestrowanego faktu, kierunek/dzień lub nieznane oraz przewidywany status. Save-only mówi brak rejestrowanego działania, nawet gdy Sytuacja nazywa wykonaną aplikację. Linki „Popraw” wracają do właściwego kroku; nie zapisują. [UX, BR-021; P3.]
- Cancel/X/Escape z brudnym szkicem potwierdzają odrzucenie; tło nie zamyka. W trakcie requestu nie można uznać zamknięcia modala za anulowanie DB; stosować istniejącą blokadę zamknięcia CREATE. [CREATE, UX.]
- Niepotwierdzony wynik pozwala wyłącznie bezpiecznie odczytać/retry ten sam intent albo jawnie „Porzuć lokalny zamiar”, z wyjaśnieniem że nie cofa to ewentualnego commitu i należy sprawdzić własne sprawy. Nie wykonywać compensating delete. Zmiana zamiaru/nowy klucz dopiero po takiej świadomej decyzji lub potwierdzonym rozstrzygnięciu; ryzyko drugiej świadomej sprawy nie jest ukrywane. [CREATE, HISTORY; przeniesienie P3.]
- Potwierdzony sukces pokazuje dokładnie wynik receipt i toast, pozostawia moduł/URL; „Otwórz sprawę” jest osobną decyzją. „Zapisz i dodaj kolejną” dopiero po sukcesie czyści sytuację, dane, rodzaj, dzień, confirmation, dup ack i używa nowego key. Nie kopiuje faktu na następną sprawę. [CREATE, UX, BR-029; rozszerzenie P3.]
- Błędy walidacji są inline i w summary, bez gubienia draftu. Unauthorized ukrywa prywatne dane i kieruje do istniejącego login/recovery zgodnie z account binding. Błąd DB/odczytu nie udaje braku duplikatów lub pustego sukcesu. Konflikt wymaga jawnego odświeżenia/ponownego podglądu, bez cichego rebase. [Blueprint §8, CREATE, TECH; P3.]

Kategorie odpowiedzi: `created`/`replayed` (sukces), `duplicates` (brak zapisu), validation error, unauthorized, intent conflict, stale duplicate acknowledgment, unavailable/unknown result. Mapowanie HTTP zachowuje istniejące konwencje 400/401/403/409/503 tam gdzie odpowiadają; techniczna niedostępność nie dowodzi braku skutku. Nie wprowadza się automatycznych progów retry/backoff jako polityki produktu. [CREATE, FACT, TECH; nowe warianty P2/P3.]

## 7. Bezpieczeństwo, persystencja i kompatybilność — APPROVED kontrakt P2 (DEC-061)

- Jedna minimalna funkcja transakcyjna przez Data API/RPC z JWT użytkownika, preferowana SECURITY INVOKER, pusty search_path i jawne schematy/granty. BFF waliduje zaufaną tożsamość, Origin i account binding; DB/RLS jest niezależną granicą, również dla bezpośredniego RPC. Bez service-role/Drizzle w zwykłej ścieżce użytkownika. [TECH, ADR-0012.]
- Case/event/receipt/audit mają zgodnego ownera i relacje. Zwykły klient nie może przepisać ownera, historii wyniku, fingerprintu/rejestru lub czasu; minimalne EXECUTE, brak dowolnego INSERT/UPDATE/DELETE registry. Cudzy i nieistniejący request/case nie różnią się prywatnymi metadanymi. Logi i browser artifacts nie zawierają tokenów ani surowych prywatnych payloadów. [CREATE, HISTORY, TECH, BR-030.]
- Projekt migracji dopiero po akceptacji P1/P2: addytywna Drizzle migration w `recruitment_migrations`, bez edycji zastosowanych migracji, resetu/reimportu, backfillu faktów i reinterpretacji starych tytułów/URL/Sytuacji. Istniejące ID/fakty/audyty/keys zostają. Nie wybieramy tu fizycznego schematu nowej tabeli/kolumn jako już zatwierdzonego. [CREATE, HISTORY, TECH; nowa persystencja P2.]
- Dotychczasowy save-only endpoint/RPC i payload zachowują zachowanie oraz możliwość dokończenia recovery starych klientów. Brak action w **starym kontrakcie** nadal oznacza wyłącznie save-only. Nowy `contractVersion` wymaga ścisłego DTO i nigdy nie obniża wadliwego compound input do legacy. [CREATE; compatibility P2.]
- Namespace owner/requestId nie może pozwolić powtórnie zużyć dawnego create jako nowego create+fact. Wcześniej wykonany save-only jest rozpoznawany jako taki: zgodny legacy replay zwraca oryginalny case, compound action z tym key konfliktuje. Nie dopisuje się faktu do istniejącej sprawy w ramach „upgrade/retry”. Compatibility lookup może czytać istniejący request_id bez dopisywania fikcyjnego biznesowego backfillu. [CREATE, HISTORY; cross-contract collision P2.]
- Replay po korektach, zakończeniu/wznowieniu lub zmianach ról zwraca immutable historical result, ale nie przywraca dawnego stanu. Aktualne odczyty Workspace/Dashboard/Tasks/relacji wynikają z ich obecnych źródeł. [HISTORY, TASKS, TECH.]

## 8. Weryfikacja warunkowa — testy PLANNED / NOT RUN

Źródła AC: [FR](../requirements/functional-requirements.md), [AC](../quality/acceptance-criteria.md), [UC/TC](../quality/scenarios.md), [traceability](../quality/traceability.md). Zakres bazowy: FR/AC-QC-002/006/007/009/010/011, LC-001/004/005/006/014, HE-001/002/003, AD-002; UC/TC-001/002/003/004/029/034 częściowo. Nowe kryteria compound command należy zapisać z osobnymi stabilnymi ID **dopiero po decyzji**, bez zmiany znaczenia starych kryteriów i bez nadania PASS całym UC.

| Grupa | Wymagany dowód po akceptacji |
| --- | --- |
| P1 dodatnie | Każdy z4 wariantów, brak URL/pracodawcy/CV, Unicode i existing limits, dzień dawny/dzisiejszy/unknown; dokładnie1 case +0/1 event, właściwy status/null stage i zaufany czas |
| Bez inferencji | Każda5 Sytuacji + save-only => zero facts/Zapisane; Sytuacja nie wybiera akcji; brak wysyłki CV/mail, zaproszenia i participants. `factConfirmed:false`/missing odrzucone, brak UI auto-check |
| Atomic rollback | Kontrolowany błąd po case insert, po event insert, przy status/receipt/audit: wszystkie efekty i registry success0; brak orphan event/case. Faktyczne PostgreSQL/RLS, nie mock-only |
| Duplikaty | Warning bez mutacji, świadoma odrębna sprawa, brak zapisu do dopasowanej; race preview/commit; zmiana action/day/description unieważnia ack; pełny matchset poza pierwszymi20; awaria nie daje „brak duplikatów” |
| Idempotencja | Ten sam key/canonical intent równolegle i po lost response => ten sam case/event/receipt; zmiana dowolnej biznesowej części =>409 zero mutacji; inna kolejność JSON keys równoważna; drugi świadomy key wymaga właściwych dup rozstrzygnięć |
| Recovery | GET po lost response, not-found przy in-flight, timeout po commit, delayed response po zmianie intent/konta, niepoprawna koperta nie trafia do legacy, brak full intent nie retry; read-only recovery nie tworzy danych |
| Stare klienty | Stary save-only/retry/recovery bez action działa; ten sam dawny key+compound konflikt; nowy malformed input nie degraduje do legacy; stary receipt po history corrections/close/reopen bez reanimacji |
| A/B/anon | A create/read/list/detail/history/receipt i direct RPC; B/anon odmowa każdego zapisu/odczytu/recovery, brak leak count/ID/metadata; spoof owner/status/time/caseId/receipt/expectedUserId; minimalne grants i CSRF/cache |
| UX i browser | Cztery kroki, keyboard/back/dirty/discard, errors inline+summary, duplicate consent, success same module, save-next blank/newkey; 1440/1024/768/375, focus/overflow/overlay; hardware/AT oddzielnie NOT RUN jeśli niedostępne |
| Journey regresja | Dalej invitation/stage→company/contact→tasks→close3choices→reopen→corrections; bieżące odczyty list/detail/Workspace/Dashboard/audits zgodne, original keys nadal zużyte |
| Migracje | Upgrade rzeczywistych istniejących syntetycznych danych bez utraty/fictional backfill, identyczne stare IDs/keys/historia; fresh isolated targets, cleanup tylko własnych zasobów, persistent DEV bez ingerencji |

Przyszły workflow: record-decision po faktycznej akceptacji → aktualizacja kontraktów/FR/AC/traceability i plan-slice → backend/frontend + własne unit → QA real isolated Auth/Data API/PostgreSQL/RLS/browser → freeze exact candidate → niezależne backend/frontend/security review przez read-only wrapper z macierzą Discovery/Blueprint/TD/DEC/ADR → poprawki i ponowne testy/review → raport/PR bez merge/deploy. To plan, nie zezwolenie na implementację. [AGENTS, delivery, TECH.]

## 9. Historyczny zapis pakietów przedstawionych PO — zaakceptowane DEC-061

Można zaakceptować trzy pakiety łącznie albo wskazać konkretny, pozostawiając pozostałe **PROPOSED**. P1 bez P2/P3 nie pozwala wdrożyć fragmentarycznego create+fact.

| Pakiet | Treść do jawnej akceptacji | Wpływ |
| --- | --- | --- |
| **P1 — zakres i jeden atomowy efekt** | Zatwierdzić4 akcje `save_only/application/contact_inbound/contact_outbound`, dane faktu/potwierdzenie/dzień jak FACT, brak inferencji, zero/albo1 fact i wynikowy Zapisane/Kontakt rozpoczęty, wspólny commit całej komendy | Rozszerza wykonawczą granicę DEC-052/054 wyłącznie w QC, bez anulowania celu Discovery; nie dodaje nowych typów faktów/etapów |
| **P2 — cały zamiar, duplikaty i recovery** | Zatwierdzić owner/requestId pełnego canonical intent; immutable receipt i full-intent read/retry; warning przed mutacją, odrębna nowa sprawa z ack bound full intent/current matchset; conflict/rollback, stare keys/legacy save-only i brak reanimacji; addytywna persystencja bez fikcyjnego backfillu | Wymaga projektu DTO/RPC/migracji/grants i niezależnych testów/backend/security review; nie ustala retencji/TTL ani nowej architektury |
| **P3 — świadomy UX i akceptacja** | Zatwierdzić4 kroki, realny wybór działania niezależny od Sytuacji, summary rzeczywistych skutków, re-confirm po zmianie faktu, dirty/cancel/unknown outcome/save-next i macierz testów §8 | Pozwala dopełnić opcjonalne Działanie z Blueprintu, nie usuwa save-only i nie obiecuje pełnego MVP/AT/device coverage |

Proponowana odpowiedź umożliwiająca dalszy etap: **„Akceptuję kontrakt P1/P2/P3”**; osobno PO określa autoryzację jego implementacji. Akceptacja dokumentu nie oznacza merge/deploymentu, rozstrzygnięcia całych OPEN-002/024/026/037, polityk publicznego Auth/privacy lub ograniczeń retencji. Bez odpowiedzi pełne Działanie pozostaje BLOCKED_DECISION, a niezależny hardening jest kontynuowany.

Poza tym kontraktem: zaproszenia, etap, dowolny PATCH statusu, close/reopen w kreatorze, aktualizacja istniejącej sprawy, wielokrotne fakty w jednym capture, firmy/osoby/uczestnicy/CV/kanały, Calendar/Reminders, Smart Import/fetch, dokumenty/import plików, automatyczna komunikacja i nowa polityka retencji. Ich brak tutaj nie wykreśla ich z docelowego produktu. [UX, CREATE, FACT, BR, TECH.]
