**PASS_STATIC dla delty `0f93627 → 0dc53edbf23f30d4c05a97cc0a761fc81d5f9243`. Brak nowych findings; wcześniejszy P2 zamknięty statycznie.**

Exact diff: wyłącznie [test nawigacji](/private/tmp/jobs-crm-hardening-review-r3-20261101/tests/e2e/recruitment-product-journey-navigation.spec.ts:65), 29 dodanych i 5 usuniętych linii.

- Reload/direct goto sprawdzają zachowanie legalnej kotwicy oraz prawidłowy fallback `/recruitments` po utracie nietrwałego kontekstu.
- Ponowne wejście filtered Workspace → drawer → detal odtwarza kontekst przez rzeczywiste SPA.
- Zachowano asercje dirty draft, focus, kotwic, Back/Forward, braku zapisu zadań i dokładnego powrotu z filtrami/sortowaniem. Poprawka regexu zachowuje kontrolę ID sprawy.
- Selektory semantyczne odpowiadają istniejącemu UI.

**Canonical compliance: PASS_STATIC w tej delcie.** Sprawdzono macierze task packet/analysis oraz provenance, DEC-059 **APPROVED**, Blueprint, F05 **DRAFT**, kontrakt Workspace, FR-RW-009/AC-RW-009-02, TD i ADR-0012 **ACCEPTED**, zastępujący ADR-0003. Brak odstępstw i zmian storage. Brak pierwotnej pełnej transkrypcji Discovery pozostaje jawnym ograniczeniem provenance.

Dokładnie jeden natywny subagent zakończył ocenę: **generic subagent + canonical role frontend-reviewer**, również PASS_STATIC. Model/reasoning inherited **NOT EXPOSED**.

**NOT RUN:** runtime R3 i focused 16 na finalnym SHA. Nie uruchamiano testów ani nie modyfikowano plików. Wyników wcześniejszych kandydatów nie przenoszę na finalny SHA; pełnego review R2 nie powtarzano.

**BLOCKED_DECISION:** docelowe QC create+fact pozostaje nieukończone; propozycje P1/P2/P3 wymagają decyzji PO. Review nie stanowi tej zgody.