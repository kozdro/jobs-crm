# ADR-0004 — Private Storage i niezmienne wersje dokumentów

**Status:** ACCEPTED · **Data:** 2026-10-28 · **Zatwierdzający:** właściciel projektu, Technical Discovery 1.12 A / 1.13 A / 1.14 B / 1.15 A. **Implementacja:** NOT STARTED.

## Kontekst

Jobs CRM to prywatny, wielokontowy web CRM. Specyfikacja domeny i decyzje product/UX pozostają nadrzędne; nie zamykamy przez ADR otwartych pól, słowników i polityk. Powiązania: BR-026/030; FR-DO/FR-AD-008; OPEN-006/007/032/036/045.

## Rozważane warianty

BLOB w SQL; lokalny dysk; mutowalne wersje; kaskadowe usuwanie historii; pełny ZIP.

## Decyzja

Supabase private Storage + metadata/version relations w SQL; zmianę treści realizuj jako nowy plik; sent version zapisany oddzielnie; kontrolowane usunięcie treści z zachowaniem wyłącznie uzasadnionego faktu; CSV/XLSX export i oddzielny download dokumentów.

## Konsekwencje i ryzyka

Niespójność Storage/DB przy awarii, prywatne URL; wymagane testy ACL, kompensacji, usuwania i kontroli prywatności; eksport może wymagać dodatkowej drogi prawnej.

## Weryfikacja i odwracalność

Przed produkcją zweryfikuj odpowiednie bramki w [Technical Discovery](../../technical/gates-and-impacts.md), testy w [operations-and-quality.md](../../technical/operations-and-quality.md) i zaakceptowane AC. Przyszła zmiana wymagająca odmiennej architektury wymaga nowego ADR (SUPERSEDES), planu migracji/rollbacku i impact analysis. Nie deklarować testów wykonanych bez ich uruchomienia.

**Źródło szczegółów:** [rejestr decyzji 1.1–1.40](../../technical/discovery-decisions.md).
