---
name: review-change
description: Przeprowadź niezależny frontend, backend lub security review zmian Jobs CRM i zwróć konkretne findings bez poprawiania ocenianych plików.
---

# Niezależny review

**Wejście:** cel i zakres, diff/kandydat, ID wymagań, plan, wyniki testów i tożsamość roli autora. Reviewer to inny agent/sesja niż autor, z nowym zadaniem oceny i dostępem do źródeł, nie tylko podsumowania autora.

**Źródła:** [delivery](../../workflows/delivery.md), [reguły BR](../../../docs/domain/business-rules.md), [AC](../../../docs/quality/acceptance-criteria.md), odpowiednie moduły, [UX Blueprint](../../../docs/ux/blueprint.md), [architektura](../../../docs/technical/architecture.md), [security](../../../docs/technical/security-and-privacy.md), [OPEN](../../../docs/decisions/open-questions.md) i właściwe ADR.

1. Sprawdź niezależność i rzeczywiste ograniczenia narzędzi według delivery. W Codex rola nie nadpisuje sandboxu rodzica: review wymagające ochrony zapisu uruchom w osobnej sesji read-only z kontrolowanymi narzędziami. W Claude użyj roli z allowlistą narzędzi odczytu. Sam tekst „read-only” nie daje izolacji.
2. Oceń finalny diff oraz otaczające kontrakty. Wykryj implementację PROPOSED/OPEN jako faktu, niejawne zmiany reguł i rozbieżności z AC. Przekaż autorowi brakujące wejścia zamiast zgadywać.
3. `frontend-reviewer`: UX, React/Next.js/TypeScript, granice komponentów, formularze/stany błędów, responsywność, accessibility, wydajność i testy. `backend-reviewer`: inwarianty, kontrakty, transakcje/idempotencja, migracje/SQL, owner/RLS i regresje. `security-reviewer`: granice zaufania, IDOR/BOLA, CSRF/XSS/SSRF, sesje, Storage, import, kolejki, sekrety i prywatność. Dobierz zakres do zmiany, bez uruchamiania wszystkich ról automatycznie.
4. Sprawdź jakość i adekwatność dowodów testowych. Żądaj testu od QA/autora, jeśli jego uruchomienie wymaga zapisu niedostępnego reviewerowi. Nie raportuj go jako wykonanego przez siebie.
5. Raportuj każde finding: istotność (`P0` blocker, `P1` high, `P2` medium, `P3` low), plik i lokalizacja, scenariusz wywołujący problem, konsekwencja, naruszone źródło i rekomendacja. Oddziel potwierdzone defekty od pytań i ograniczeń dowodów.
6. Zwróć ocenę `PASS`, `FAIL` lub `NOT RUN` z zakresem. Brak ustaleń nie dowodzi braku defektów; wymień niezweryfikowane obszary. Autor poprawia kod, reviewer ponownie ocenia zmieniony kandydat i zamyka własne findings na podstawie dowodów.

**Wynik:** raport niezależnego review z identyfikacją kandydata, listą findings, ograniczeniami i wymaganymi poprawkami.

**STOP:** reviewer jest autorem ocenianych zmian, brakuje czytelnego diffu albo nie można zapewnić wymaganych ograniczeń. Nie poprawiaj ocenianego kodu, testów ani dokumentacji; rekomendacje przekaż autorowi. Nie zatwierdzaj zakresu z nierozwiązanymi P0/P1.

**DoD:** istotne obszary zostały ocenione, findings są odtwarzalne, a każda deklaracja ma dowód lub jawne ograniczenie. Ocena nie zastępuje akceptacji PO ani automatycznych testów.
