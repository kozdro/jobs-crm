# ADR-0011 — Tailwind CSS v4, shadcn/ui z Base UI i Lucide React

**Status:** ACCEPTED · **Data:** 2026-10-29 · **Zatwierdzający:** właściciel projektu, zadanie „Jobs CRM — PR-F1 Application Scaffold & CI”, §1 i §6–9.

## Kontekst i rozważane warianty

Pierwotny PR-F1 odkładał wybór bibliotek UI. PO świadomie rozszerzył go o Tailwind CSS v4, shadcn/ui z Base UI i Lucide React. Alternatywą planu było odłożenie konfiguracji; nie prowadzono nowego wyboru stacku za PO. ADR-0001/0010 i modular monolith pozostają podstawą. Biznesowe FR/AC/BR/UC nie są realizowane. OPEN-015/017/033 nadal dotyczą brandingu, docelowego design systemu i pełnych wymagań UX/QA.

## Decyzja

Tailwind v4 jest systemem stylowania z CSS-first configuration i PostCSS. Komponenty shadcn/ui są kodem repozytorium opartym o Base UI; konfiguracja używa neutralnej bazy oraz Lucide. Standardowe ikony pochodzą z nazwanych importów `lucide-react`; dekoracyjne są ukryte przed technologiami asystującymi, a elementy z samą ikoną wymagają dostępnej nazwy. Własne SVG wymagają uzasadnienia.

Na F1 powstaje tylko techniczna strona oraz niezbędne komponenty, neutralne semantyczne tokeny i podstawowy focus. Wybór technologii nie zatwierdza finalnej identyfikacji wizualnej, dark mode, animacji ani zachowań produktowych.

## Konsekwencje, weryfikacja i odwracalność

Kod komponentów podlega zwykłym testom i niezależnemu review. Piny i lockfile utrwalają zestaw; zmiany wersji wymagają preflight peers/engines/advisories. FQA-08 sprawdza rzeczywiste style, komponent i ikonę na produkcyjnym buildzie. Pozostałe FQA-01–09 obejmują instalację, granice serwera, sekrety i CI. Wyniki i instrukcje: [raport F1](../../technical/foundation-f1.md).

Przyszła zmiana tego stacku wymaga oceny wpływu i nowego ADR po decyzji PO. Techniczny scaffold można zmienić bez migracji danych; F1 nie tworzy bazy ani infrastruktury. Zlecenie autoryzuje commit/push/PR, bez merge i provisioningu.
