# Bezpieczeństwo, prywatność i threat model

**Zatwierdzono:** publiczną samorejestrację, e-mail/hasło + Google OAuth, Managed Auth, bez MFA w MVP, sesje wielourządzeniowe z kontrolą, HttpOnly cookie+BFF, izolację DB/RLS, private Storage, eksport CSV/XLSX i samoobsługowe usunięcie konta. **VALIDATION REQUIRED:** wykonanie tych założeń w wybranym stacku.

## Model zagrożeń

| Zagrożenie | Granica | Kontrola / test |
|---|---|---|
| IDOR/BOLA | Browser → BFF → Data API | session verification, owner authorization, RLS, test A vs B dla każdego zasobu i relacji |
| Escalation / bypass RLS | service-role/Drizzle/RPC | brak service-role w user path, deny by default, security-invoker RPC; review grantów i widoków |
| Token/session leakage | OAuth, cookies, SSR | HttpOnly/Secure/SameSite, CSRF i XSS controls, rotacja i revocation, brak tokenów w logach |
| Cross-account file | Supabase Storage/signed URLs | prywatne buckety, storage.objects RLS, krótkie URL, kontrola przed wydaniem URL |
| SSRF | domena, redirect, DNS, browser resources | allowlist, URL/DNS/IP checks na każdym hopie, limity i testy rebinding, brak obsługi domen niezatwierdzonych |
| Untrusted files | CSV/XLSX, upload | rozmiary i MIME/content verification, parser limits, ochrona przed XLSX zip bombs i formułami przy eksporcie |
| Duplicate import | retry HTTP / worker | user-scoped idempotency key + payload fingerprint + atomowy wynik |
| Deleted-data resurrection | backup restore | chroniony zewnętrzny deletion ledger, blokada ekspozycji aż do odtworzenia usunięć |
| PII disclosure | telemetry/CI/exports | redaction, brak treści CV i notatek w logach, tajne tokeny tylko po stronie serwera |

## Sesja z Supabase — bramka architektoniczna

Wybrany kontrakt 1.7 A wymaga, aby wrażliwe tokeny nie były czytelne przez JS. Domyślne wzorce `@supabase/ssr` opierają się na cookies i mogą potrzebować współpracy klienta w odświeżaniu tokenów — **nie zakładać**, że automatycznie spełniają model HttpOnly-only. Zaproponować serwerowy token broker/BFF lub równoważny wzorzec i **przetestować**: login e-mail/Google callback, odświeżenie, równoległe żądania, CSRF, cross-site cookies, przeglądarkę bez JS, logout, wylogowanie konkretnego urządzenia, revocation po resetowaniu hasła i usunięciu konta. JWT może pozostać ważny po usunięciu użytkownika; wrażliwe operacje weryfikują aktualność sesji. **Nie wdrażać kont publicznych przed pozytywnym wynikiem.**

## RLS i dostęp

Użytkownik może korzystać tylko z własnych spraw, załączników, firm, kontaktów, wyników wyszukiwania i historii. Uwierzytelnienie i autoryzacja są różnymi kontrolami. RLS chroni rekordy; BFF autoryzuje operację biznesową. Uprawnienia workerów nie mogą służyć do odczytów na żądanie dowolnego user_id.

## Usuwanie i eksport

- Eksport CSV/XLSX danych tabelarycznych, dokumenty oddzielnie; ochrona przed CSV formula injection, autoryzacja i brak sekretów. Dodatkowe obowiązki dostępu do danych w świetle prawa nie są przesądzone przez wybrany format.
- Archiwizacja ≠ nieodwracalne usunięcie pliku. Po usunięciu wersji można zachować wyłącznie uzasadnione metadane o fakcie wysłania, jeśli nie koliduje to z polityką usunięcia danych.
- Usunięcie konta: re-auth + potwierdzenie + natychmiastowe zablokowanie dostępu, nieodwracalne zlecenie usunięcia z aktywnych systemów i plików, przetwarzanie retry/idempotent; bez okresu na cofnięcie. Prawne wyjątki, szczegółowe czasy i minimalizacja dziennika usunięć: OPEN-032/046.

## Polityki do zamknięcia

OPEN-002/005/006/007/013/032/041–046; listy profilu OPEN-044, limity i lifetime sesji OPEN-042, RLS matrix. Ostateczne release gates w [gates-and-impacts.md](gates-and-impacts.md).

**Źródła implementacyjne do aktualnej weryfikacji:** https://supabase.com/docs/guides/auth/server-side/creating-a-client ; https://supabase.com/docs/guides/database/secure-data ; https://supabase.com/docs/guides/storage/security/access-control .
