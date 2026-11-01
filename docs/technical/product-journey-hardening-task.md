# Product Journey UX Hardening — task packet

Data: 2026-11-01. Baza: aktualny `origin/main`, `637f330f6dc1215ad2479dd699b8814397e5b5de` potwierdzony fetch. Gałąź `feat/product-journey-ux-hardening`, osobny worktree `/private/tmp/jobs-crm-ux-hardening-20261101`. Autorzy: `/root`, `hardening_spec`, `hardening_frontend`, `hardening_qa`; model/reasoning dziedziczone, NOT EXPOSED. Brak dalszej delegacji autorów. Reviewerzy: odrębne sesje rodziców read-only przez `harness/scripts/review.py`; dokładny kandydat i dowody zostaną podane przed review.

## Autoryzacja i DoD

PO zlecił implementację Product Journey UX Hardening, testy, review, dokumentację i osobny PR z aktualnego main; zakazał merge, deploymentu, persistent DEV i naruszania cudzych zmian. Zasada PO nadrzędna dla całego procesu: żadnej zmiany ani pominięcia zatwierdzonej decyzji Discovery/UX Blueprint/TD/DEC/ADR bez jawnej zgody. Zlecenie nie upoważnia do samodzielnego ustalenia nowego kontraktu atomowego zapisu.

DoD niezależnego zakresu: rzeczywiste opcjonalne wybory Sytuacji, cztery kroki i save-only bez inferencji; podsumowanie błędów Task z działającymi linkami; nawigacja sekcji detalu bez usuwania informacji; regresje pełnej podróży i błędów, runtime izolowany, jawne wyniki i review zgodności; PR bez merge. Pełne Działanie pozostaje osobnym warunkiem decyzji PO, a nie wycofaną częścią docelowego UX.

## Zgodność przed implementacją

| Źródło kanoniczne i lokalizacja | Status / zakres | Plan i test | Odstępstwo / blokada |
| --- | --- | --- | --- |
| [Discovery provenance](../product/discovery-provenance.md), [DEC-014/015/029–032/049/052–060](../decisions/product-decisions.md), [BR](../domain/business-rules.md) | APPROVED w opisanych granicach, BR-007/016/020/029/030 bez zmian | Zapis samej sprawy bez faktów; relacje i lifecycle istniejącego detalu bez zmian; regresja tej samej sprawy | Bez nowej polityki, fikcyjnych akcji i statusów |
| [UX Blueprint §3, §8, §9](../ux/blueprint.md), [wybory 1.12–1.14](../ux/blueprint-decisions.md), [F02/F04/F05](../ux/flow-contracts.md) | Wybór Sytuacji: oferta, wykonana aplikacja, kontakt, spontaniczna kandydatura, inna/bez określenia; pomocniczy i opcjonalny. Podsumowanie błędów z linkami. Zachowana historia i wspólny scroll | UI-only context, back/forward/reset/discard; native anchors i focus; summary multiple errors | Cztery kroki wynikają z późniejszego jawnego DEC-052; docelowe opcjonalne Działanie nie zostało anulowane |
| [DEC-052 i kontrakt create/read](recruitment-case-first-slice.md), [DEC-054 i 3A](recruitment-lifecycle-3a.md) | Obecny QC: tylko save-only; fakty 3A na istniejącej sprawie | Żadnych zmian payloadu/RPC, stanu i idempotencji | BLOCKED rozszerzenie QC create+fact+status do zatwierdzenia kontraktu atomowego przez PO |
| [Technical Discovery 1.1/1.2/1.31/1.32/1.35/1.37/1.38](discovery-decisions.md), [ADR-0001/0002/0010/0012](../decisions/adr/README.md) | APPROVED/ACCEPTED, późniejsze zastąpienia zachowane | React/Next existing conventions, rzeczywisty Auth/RLS/HTTPS browser, brak zmian transakcji/schema/Auth | Brak nowej architektury; TD nie autoryzuje nowej semantyki biznesowej |
| [AGENTS](../../AGENTS.md), [delivery](../../harness/workflows/delivery.md) | Obowiązuje wszystkich autorów i reviewerów | Minimalny guard: macierz task packetu, plan/review skills i zawsze dołączona kontrola źródeł w wrapperze; test promptu obu runtime'ów | Kontrola procesu nie dowodzi automatycznie zgodności semantycznej |

Orchestrator i spec-analyst sprawdzili źródła przed handoff kodowania. Wstępny werdykt `hardening_spec`: rzeczywisty wybór Sytuacji już zatwierdzony; task summary i pomocnicza native nav nie zmieniają decyzji; pełne Działanie wymaga wejść PO. Frontend otrzymał zgodę na wyłącznie ten niezależny zakres. [Pełna analiza i kwestie PO](product-journey-hardening-analysis.md).

## Własność, plan i testy

| Rola / autor | Pliki i odpowiedzialność | Walidacja / handoff |
| --- | --- | --- |
| spec-analyst / hardening_spec | product-journey-hardening-analysis.md | FR/AC/BR/DEC/UC/OPEN, źródła i granice, bez implementacji |
| frontend-engineer / hardening_frontend | TaskForm, QuickCapture, nowe małe komponenty Sytuacji/nawigacji, detal i potrzebne testy własne | Bez backend/schema/Auth/deps; QA sprawdza real UI; frontend reviewer niezależny |
| qa-engineer / hardening_qa | recruitment-product-journey-hardening.spec.ts, product-journey-hardening-qa.md i własne bezpieczne dowody | Fresh isolated stack, pełne integracje/browser, A/B/anon, błędy i cross-module, preserve/cleanup |
| orchestrator / root | ten packet, raport, workflow/template/plan i review skills, review.py i test ochrony promptu | Harness checks/tests; reviewer backend procesu i frontend produktu przez wrapper |

Kolejność: analiza źródeł → compliance planu → niezależna implementacja front/proces + testy QA → lint/type/unit i rzeczywisty isolated production runner → zamrożenie → niezależne review źródeł, kodu i dowodów → poprawki/ponowna weryfikacja dotkniętej delty → dokumentacja i PR. Nie zlecać review z zapisywalnego rodzica. Guard promptu nie rozszerza uprawnień narzędzi, nie dotyka sandboxu/MCP/Auth; backend review procesu obejmuje tę granicę, security review potrzebne przy jej faktycznej zmianie.

Wpływ: draft i dirty/reset QC, dostępność i focus Task, lokalna nawigacja detalu; istniejąca historia i dane pozostają widoczne. Nie zmieniamy importu, wyszukiwania, reguł duplikatów, relacji, retencji, lifecycle ani zapisów na koncie. Ryzyka: focus/hash navigation, duplikacja ID przy kilku formularzach, reset pomocniczego wyboru, niezamierzona inferencja z sytuacji; pokryć QA. Po zmianie źródeł plan i review muszą ponowić porównanie.

## Doprecyzowanie PO w trakcie wykonania

PO wybrał przygotowanie w tym zadaniu szczegółowego kontraktu atomowego do akceptacji, przy kontynuacji niezależnego UX. [Propozycja](quick-capture-atomic-action-proposal.md) ma status PROPOSED, autor spec-analyst; nie jest częścią implementacji ani zatwierdzeniem nowych DEC/ADR. Nie zmienia źródeł i nie unieważnia kontroli niezależnego UI przed kodem.

## Korekta integracji kotwic po niezależnym review R1

Frontend reviewer wykazał konflikt z blanket hash scrub w browser adapterze. Istniejący [kontrakt F3: legalne #sekcja](foundation-f3.md) jawnie wymaga przeglądu przed użyciem kotwic. Plan rozszerzono przed kodem wyłącznie o ścisłą prezentacyjną allowlistę sześciu fragmentów na dokładnej trasie UUID detalu. Wszystkie pozostałe fragmenty nadal usuwane przed SDK, `detectSessionInUrl:false`, PKCE/server callback i uprawnienia bez zmian. To integracja zatwierdzonej lokalnej nawigacji z istniejącą ochroną, nie nowy mechanizm Auth ani zmiana ADR-0012. Nowy pure shared helper + unit matryca token/encoded/unknown/wrong route, browser test wejścia/reload i auth rejection. Frontend ma jawny dodatkowy zakres browser adapter/shared helper/auth-browser tests; QA rozszerza kontekst anchors/draft/back/filtered return. Wymagany dodatkowy niezależny security review przez read-only wrapper przed zamknięciem.
