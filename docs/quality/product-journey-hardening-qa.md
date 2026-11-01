# Product Journey UX Hardening — QA

2026-11-01. QA: `hardening_qa`, model/reasoning inherited / NOT EXPOSED. Baza `637f330f6dc1215ad2479dd699b8814397e5b5de`, osobny worktree `/private/tmp/jobs-crm-ux-hardening-20261101`. Etap planowania/testów; runtime na razie **NOT RUN** do zamrożenia frontendu i zgodności kontraktu przez orchestratora.

## Zgodność i plan

Źródła: Discovery przez DEC-014/015/029–032/049 i provenance, UX Blueprint §8/F02/F04/UX-006, DEC-052/053/054–060, FR/AC-QC/LC/HE/CC/RW/TN, BR-007/011/016/020/030, UC/TC-001/012(Task)/024/030, ADR-0010 (testy) i ADR-0012 (rzeczywisty Auth). Technical Discovery nie stanowi samodzielnej autoryzacji nowych akcji. Analiza kanoniczna i decyzje o zależnych granicach są obowiązkiem spec/orchestratora przed implementacją; QA nie rozszerza kontraktu przez asercję.

| Kontrola | Test / źródło | Stan |
| --- | --- | --- |
| Pełna podróż na tej samej sprawie: save → application/contact → invite/stage → company/contact → tasks → close3choices → reopen → correction | Dwie ciągłe regresje 1440/375, przeniesione z poprzedniego audytu bez diagnostic testu akceptującego brak summary; DEC-052/054–060, BR-011 | NOT RUN |
| Summary wielu błędów Task, linki do pól, focus i brak częściowego rekordu; create/edit | Blueprint §8, DEC-060, AC-TN-001/002/003; test pozytywny wymagający summary, nie obserwacja braku | NOT RUN; selektory uzgodnione z frontem |
| Mobilny detal: skróty sekcji i klawiatura bez mutacji/pominięcia informacji | Blueprint UX-005/F05, mobile viewport375; osobno hardware/AT | NOT RUN; sześć natywnych skrótów z focus/hash |
| Quick Capture: rzeczywisty pomocniczy wybór Sytuacji, cztery kroki, back/forward, reset po save-next i discard; świadomy save-only bez historii/status inference | UX-006/F02, DEC-052, BR-007/016/020 | NOT RUN; pięć wyborów Blueprint §3 + optional none |
| Właściciel A, obcy B, anon, relacje, retry/idempotencja, korekty/void/orphan i konkurencja | Pełne istniejące integration/browser, pozytywny dostęp + odmowa bez wycieku | NOT RUN |

## Środowisko i dowody

QA jako jedyny uruchamia runner/build. Po frozen frontend: nowa izolowana kopia produktu, istniejące lokalne dependencies skopiowane (bez install i bez symlinku poza root Turbopack), jawny Node24.22.2, świeży własny target Supabase local loopback. Porty sprawdzone przed zasobami, adaptery wyłącznie w runtime zapisane hashami; persistent DEV i obce zasoby bez zmian. Docker inventory baseline/after i cleanup wyłącznie własnej manifestowanej tożsamości. Pełna suite bez pomijania testów rzeczywistego expiry. Każdy FAIL i późniejszy focused rerun osobno.

DoD: źródła/SHA/manifest, komenda/środowisko/exit/counts, PASS/FAIL/NOT RUN/BLOCKED, bezpieczne artifacts i niezależny review przez wrapper orchestratora. Nowy test należy do QA, kod produktu do autora frontendu. Bez dalszej delegacji i bez cofania cudzych zmian.

Implementacja testów przed runtime: 5 przypadków w `recruitment-product-journey-hardening.spec.ts`: dwie pełne podróże z pomocniczą sytuacją „Wykonana aplikacja” bez generowania faktu, dwa testy summary create/edit na 1440/375 i jeden test QC (pięć wyborów zgodnych z Blueprint §3, optional none, cztery kroki, klawiatura, back retain, save-next reset, discard samej sytuacji i zero zapisu przed zatwierdzeniem). Wszystkie6fragmentów detalu aktywowane klawiszem Enter ze sprawdzeniem focus/hash i braku mutacji. Pełne create+fact pozostaje BLOCKED_DECISION do decyzji PO wskazanej w analizie; nie ma testu akceptującego nieatomowy zapis.
