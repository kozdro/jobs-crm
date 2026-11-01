**PASS_STATIC wyłącznie delty R3→R4.** Dodane kliknięcie „Zakończone” usuwa wskazany P2: preset rozwija domyślnie zwiniętą kolumnę przed kliknięciem tytułu zamkniętej karty.

- Sekwencja: [test:243](/private/tmp/jobs-crm-journey-review-20261101/tests/e2e/recruitment-product-journey-audit.spec.ts:243).
- Domyślne `closedOpen: false`: [workspace:62](/private/tmp/jobs-crm-journey-review-20261101/src/modules/recruitment/domain/workspace.ts:62).
- Preset ustawia `closedOpen: true`: [Workspace:41](/private/tmp/jobs-crm-journey-review-20261101/src/components/recruitment/recruitment-workspace.tsx:41).

SHA256 testu potwierdzony:
`8b18c1986834100185e55902a571d95a8683b37de61817071bd3a2a1b6bb644c`

Dokładnie jeden subagent: `/root/frontend_reviewer`, **generic subagent + canonical role**, niezależny od autora `journey_qa`. Model/reasoning: inherited/not exposed. Środowisko narzędziowo read-only; bez edycji, testów i dalszej delegacji.

**Ograniczenia:** runtime focused **NOT RUN**. Bez snapshotu R3 nie potwierdzono wyłączności delty; manifestu 897 plików nie walidowano. P3 dotyczący summary pozostaje otwarty. Wynik nie oznacza PASS produktu ani pełnego kontraktu.