# Technical Discovery — rejestr zatwierdzonych wyborów (1.1–1.40)

**Data decyzji:** 2026-10-28. **Źródło:** wybory wariantów A/B/C przekazane przez właściciela projektu w rozmowie Technical Discovery. **Status każdego wiersza:** APPROVED (wybrany wariant), z wyjątkami opisanymi w sekcji zastąpień. Architektura nie gwarantuje wykonalności ani kosztu przed testami.

| ID | Wariant | Ustalenie | ADR / uwagi |
|---|---|---|---|
| 1.1 | B | Stan bieżący + faktyczna historia biznesowa + osobny audyt techniczny, bez Event Sourcingu | ADR-0002 |
| 1.2 | A | Relacyjny model SQL z kluczami obcymi i transakcjami | ADR-0002 |
| 1.3 | A | Wspólny schemat i baza, izolacja logiczna po właścicielu | ADR-0003 |
| 1.4 | A | Managed Authentication | ADR-0003 |
| 1.5 | B | Otwarta samoobsługowa rejestracja od pierwszego publicznego wydania | ADR-0003 |
| 1.6 | B | E-mail/hasło + Google OAuth | ADR-0003 |
| 1.7 | A | Warstwa BFF, sesje chronione cookie HttpOnly/Secure/SameSite | ADR-0003; PoC obowiązkowy |
| 1.8 | B | Sesje na wielu urządzeniach, zakończenie wybranej/pozostałych | ADR-0003; unieważnianie JWT do weryfikacji |
| 1.9 | A | Samoobsługowe odzyskiwanie hasła przez zweryfikowany e-mail | ADR-0003 |
| 1.10 | A | Brak własnego MFA w MVP | ADR-0003 |
| 1.11 | A | Defense in Depth: backend/BFF + polityki RLS | ADR-0003 |
| 1.12 | A | Prywatny Object Storage, metadane i relacje w SQL | ADR-0004 |
| 1.13 | A | Niezmienne wersje plików | ADR-0004 |
| 1.14 | B | Kontrolowane usunięcie zawartości, możliwość zachowania minimalnego faktu wysyłki w historii | ADR-0004; polityka retencji OPEN |
| 1.15 | A | Podstawowy eksport CSV/XLSX; oddzielne pobieranie dokumentów; bez kompletnego ZIP | ADR-0004, ADR-0009 |
| 1.16 | A | Samoobsługowe nieodwracalne usunięcie konta bez okresu cofnięcia | ADR-0009 |
| 1.17 | A | Rotacyjne backupy i rejestr usunięć niezależny od odtwarzanej bazy | ADR-0009 |
| 1.18 | A | 7-dniowe okno retencji kopii standardowych | ADR-0009 |
| 1.19 | B | Cel RPO do 1 h, odzyskiwanie przyrostowe | ADR-0009; cel, nie gwarancja |
| 1.20 | B | Cel RTO do 24 h, dopuszczony ręczny DR | ADR-0009; cel, nie SLA |
| 1.21 | B | Monitoring, logi strukturalne, alerty | ADR-0009 |
| 1.22 | A | Hybrydowy serwerowy ekstraktor JSON-LD/HTML/adaptery | ADR-0006 |
| 1.23 | B | HTTP-first, warunkowe headless Playwright | ADR-0006 |
| 1.24 | B | Operacje szybkie synchroniczne, dłuższe asynchroniczne | ADR-0007 |
| 1.25 | A | Walidacja URL w backendzie, bez osobnej warstwy izolacji sieciowej jako obowiązkowego elementu początkowego | ADR-0006; ryzyko SSRF |
| 1.26 | A | Intencja uniwersalnej ekstrakcji z publicznych URL | **SUPERSEDED w zakresie pobierania przez 1.40 B** |
| 1.27 | B | Normalizacja URL i identyfikacja publikacji, bez automatycznego scalania | ADR-0006 |
| 1.28 | A | CSV/XLSX: mapowanie i podgląd w pamięci, bez trwałego stagingu | ADR-0005 |
| 1.29 | A | Jeden atomowy commit SQL dla wszystkich zaakceptowanych wierszy | ADR-0005 |
| 1.30 | B | Idempotency Key + rejestr operacji + wykrywanie ponownego pliku | ADR-0005 |
| 1.31 | A | Modular Monolith, full-stack i BFF | ADR-0001 |
| 1.32 | A | Next.js + React + TypeScript | ADR-0001 |
| 1.33 | A | Supabase PostgreSQL/Auth/Storage + Drizzle | ADR-0003, ADR-0004 |
| 1.34 | A | Render Web Service i Background Worker + Supabase Queues/pgmq | ADR-0007 |
| 1.35 | B | ESLint, TypeScript, Vitest, integracyjne PostgreSQL/RLS, Playwright, GitHub Actions | ADR-0010 |
| 1.36 | A | Lokalny development + production, staging opcjonalny później | ADR-0010 |
| 1.37 | A | Native Next.js Server Components, Server Actions, Route Handlers + warstwa domenowa | ADR-0001 |
| 1.38 | A | Supabase Data API dla danych użytkowników; Drizzle dla schematów/migracji/ograniczonych operacji wewnętrznych | ADR-0003, ADR-0005 |
| 1.39 | A | PostgreSQL Full-Text Search + indeksy GIN, bez osobnego search engine | ADR-0008 |
| 1.40 | B | **Automatyczne pobieranie tylko z zatwierdzonych/przetestowanych domen.** Inne URL-e: ręczne zapisanie i opis | ADR-0006; **nadrzędne wobec 1.26** |

## Zastąpienia i interpretacja

**Aktualny kontrakt:** aneks z 2026-10-29 poniżej i [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) zastępują wskazany zakres historycznych interpretacji 4/5 oraz TD 1.7/1.8. Oryginalne 40 wierszy i interpretacje pozostają zapisem decyzji z 2026-10-28; przy bieżącym planowaniu nie stosować wycofanych gwarancji sesyjnych.

1. **1.40 B > 1.26 A.** „Uniwersalny” dotyczy możliwości **zapisania każdego poprawnego linku**, nie prawa do automatycznego pobierania jego treści. Dla niedozwolonej domeny system w ogóle nie inicjuje fetch/renderowania; daje manual fallback (DEC-030/FR-QC-005). Nie przyjmujemy na tej podstawie, że konkretne nazwane portale są już dopuszczone.
2. **1.25 A po 1.40 B:** walidacja aplikacyjna pozostaje wyborem; nie jest gwarancją pełnej ochrony. Wskazana ocena SSRF i testy egress; dodanie izolacji sieciowej wymaga decyzji przy wynikach testów bezpieczeństwa.
3. **1.28 A i 1.30 B współistnieją:** brak stagingu wierszy, lecz trwały minimalny rejestr operacji importu jest obowiązkowy; nie traktujemy rejestru jako przechowywania wierszy i mapowania.
4. **1.29 A i 1.38 A współistnieją tylko przy atomowym endpointzie DB/RPC.** Seria wywołań Data API nie jest jedną transakcją. Kontrakt wykonania wymaga PoC, ponownej walidacji i ochrony RLS.
5. **1.7 A i 1.33 A:** standardowy Supabase SSR nie jest zatwierdzonym dowodem spełnienia sesji wyłącznie w HttpOnly. Wymagany PoC serwerowego BFF, refresh, unieważniania sesji i odbioru po OAuth.
6. **1.18 A i 1.19 B:** 7 dni retencji i RPO <= 1h są celami łącznymi dla DB i plików; domyślna kopia dzienna DB nie realizuje RPO. Supabase PITR może zastąpić, nie uzupełnić, domyślne daily backups. Koszt i mechanizm ochrony obiektów pozostają bramką.
7. **1.15 A:** eksport CSV/XLSX nie jest deklaracją spełnienia wszystkich obowiązków prawnych wobec żądania dostępu lub przenoszenia danych. Ocena prawna i zakres historii są w OPEN-032/045.
8. **1.16 A/1.17 A:** bez okresu na wycofanie wniosku; fizyczne usuwanie może mieć przebieg asynchroniczny. Niezależny dziennik/tombstone usunięć jest założeniem projektowym, a jego trwałość i retencja wymagają osobnego projektu.

## Świadomie nierozstrzygnięte

Brak zatwierdzonych wartości: limitów plików/importów, progów sugestii, nazw etapów/wyników, okresu i bezwzględnego timeoutu sesji, kosztu planów dostawców, konkretnych domen allowlist, kryteriów docelowej dostępności i zgodności prawnej eksportu. Te elementy pozostają OPEN / VALIDATION REQUIRED.

Powiązane dokumenty: [architektura](architecture.md), [bramki](gates-and-impacts.md), [katalog ADR](../decisions/adr/README.md).

## Aneks decyzyjny — Supabase-native, 2026-10-29

**APPROVED:** PO w zadaniu „Jobs CRM — Supabase-native Architecture Rebaseline” zatwierdził wariant A. Normatywny następca: **[ADR-0012 — ACCEPTED](../decisions/adr/0012-supabase-native-auth-sessions-rls.md)**; ADR-0003 jest SUPERSEDED, z zachowaniem historycznej treści.

| Historyczny wybór | Aktualny zakres i nadrzędność |
|---|---|
| TD 1.7 | Zastąpiony w części HttpOnly-only i własnego server-only token management/brokera. Obowiązuje oficjalny Supabase browser/server client i SSR, PKCE, cookies/refresh zgodne z SDK. BFF tylko dla uzasadnionej logiki/granicy zaufania. |
| TD 1.8 | Zastąpiony w części zakończenia jednej dowolnej wskazanej innej sesji i silniejszej natychmiastowej revocation. Wiele urządzeń pozostaje; scopes local/global/others. Wydany access JWT może działać do expiry. |
| TD 1.3/1.4/1.5/1.6/1.9/1.10/1.11 | Pozostają obowiązujące: shared schema, Managed Auth, self-signup, e-mail/hasło + Google, e-mail recovery, brak własnego MFA, RLS i autoryzacja operacji. |
| TD 1.33/1.38 | Supabase i Drizzle pozostają; standardowy user CRUD przez Data API/RLS, bez uprzywilejowanego Drizzle w zwykłej ścieżce. |
| TD 1.28–1.30 | Nadal obowiązują preview w pamięci, brak trwałego stagingu, jawne zatwierdzenie wierszy, jeden atomic commit i minimalny rejestr idempotencji/fingerprint. ADR-0005 pozostaje ACCEPTED. |
| Interpretacja 4 powyżej | Weryfikacja atomic RPC/RLS/retry pozostaje wymagana przed importem. Nie musi stanowić osobnego dużego PoC przed ręcznym CRUD; rekomendowany dowód w docelowym slice importu. |
| Interpretacja 5 powyżej | SUPERSEDED w całości jako obowiązek HttpOnly-only/brokera; zastępuje ją standardowa integracja Auth/SSR i jej rzeczywiste testy bezpieczeństwa. |

**APPROVED:** PostgreSQL-native transactions + minimalne Supabase RPC dla atomowych komend, bez własnego frameworka transakcji. Zatwierdzone ograniczenie JWT nie znosi ochrony szczególnie wrażliwych operacji, RLS, private Storage, XSS/CSRF, bezpiecznych redirects, logów i cache. Polityki TTL, aktywacji, recovery, eksportu/usunięcia i dostawcy pozostają we właściwych OPEN.

**Granica zadania:** dokumentacja, niezależny review, commit/push i PR bez merge. Bez implementacji Auth/RPC, nowych eksperymentów, instalacji, migracji, zmian zależności i provisioningu. Historyczne F1/F2 i ich wyniki zachowują tożsamość; F3/RPC są PLANNED / NOT RUN.
