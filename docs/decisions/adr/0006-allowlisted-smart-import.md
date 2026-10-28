# ADR-0006 — Smart Import: allowlist domen, HTTP-first i bezpieczny fallback

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.22 A / 1.23 B / 1.25 A / 1.26 A (superseded) / 1.27 B / 1.40 B. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: BR-021/022; FR-QC-003–011; NFR-009; OPEN-011/024/025.

## Rozważane warianty

Uniwersalne fetch dowolnych publicznych domen; tylko API; osobna izolowana usługa; wyłącznie własne formularze.

## Decyzja

Automatyczna ekstrakcja wyłącznie dla zatwierdzonych i przetestowanych domen; reszta: manual capture URL; JSON-LD/HTML/adaptery, warunkowy Playwright; URL normalizuj i sugeruj duplikaty bez merge.

## Konsekwencje i ryzyka

Wariant 1.40 B zastępuje 1.26 A dla automatycznego fetch. Sama allowlist nie wyklucza SSRF; testy redirect/DNS rebinding/subresources, limity, regulaminy portali; w razie niezaliczenia wymagana zmiana architektury.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
