# Optional Email Reminders — worker i transport

Status: implementacja lokalna; provisioning, konfiguracja realnych sekretów, wdrożenie i rzeczywista dostawa wymagają osobnej autoryzacji i dowodów. ADR-0007 i ADR-0013 pozostają właściwymi decyzjami. `accepted` oznacza przyjęcie przez API, nie dostarczenie do skrzynki.

## Konfiguracja procesu

Oddzielny proces uruchamia `pnpm worker:email` na przypiętym Node i pnpm. Własne, chronione zmienne środowiska procesu:

- `EMAIL_WORKER_DATABASE_URL`: URL PostgreSQL z credentialem dedykowanego loginu z członkostwem w `jobs_email_worker`. Bez parametrów query i fragmentu URL. Kod wymusza TLS `verify-full`, uruchamia każdą sesję z `role=jobs_email_worker` i sprawdza bieżącą rolę przed pętlą; deployment musi osobno zweryfikować rzeczywiste członkostwo i ograniczenia loginu. URL i hasła nie trafiają do logów ani klienta.
- `RESEND_API_KEY`: serwerowy klucz API Resend o minimalnych wymaganych uprawnieniach, udostępniony wyłącznie workerowi.
- `EMAIL_FROM`: adres nadawcy z domeny skonfigurowanej i zweryfikowanej przez operatora; kod odrzuca nowe linie.
- `APP_ORIGIN`: HTTPS origin aplikacji, bez danych użytkownika, ścieżki poza `/`, query lub fragmentu. Trafia do neutralnej treści przypomnienia.

Nie wyłączaj weryfikacji TLS. Konfiguracja odrzuca `NODE_TLS_REJECT_UNAUTHORIZED=0`. Uruchomienie po SIGTERM/SIGINT oczekuje zakończenia bieżącej próby; limit transportu wynosi 10 sekund, a zamykanie połączenia DB ma limit 20 sekund. Nie interpretuj samego uruchomienia jako dowodu poprawnych uprawnień ani dostawy.

## Kontrakt transportu

Adapter wysyła `POST https://api.resend.com/emails` bez przekierowań: tylko nadawca, jeden adres właściciela, neutralny temat i neutralny tekst z originem aplikacji. Token Bearer i dane wiadomości nie są logowane. Każda fizyczna próba ma losowy `Idempotency-Key`; Resend wskazuje 24-godzinną ważność tego klucza. Nie służy to do automatycznego ponowienia wyniku nieustalonego ani nie daje gwarancji exactly-once.

Poprawna odpowiedź `200` z niepustym `id` oznacza `accepted`. Jawne, rozpoznane odpowiedzi błędu walidacji lub autoryzacji są `permanent_failure`; jawny `429` z `rate_limit_exceeded` jest `safe_failure` i może być ponowiony zgodnie z kolejką. Niepoprawny format, nieznane błędy, 5xx, timeout, przerwany odczyt i błąd sieci to `unknown`. Odmowy nie są drukowane, a opóźnione odpowiedzi nie zmieniają utrwalonego wyniku `unknown`. Dokumentacja: [wysyłka i Idempotency-Key](https://resend.com/docs/api-reference/emails/send-email), [kody błędów i rate limit](https://resend.com/docs/api-reference/errors).

Przed użyciem na realnych danych wymagane są: osobna autoryzacja zasobów i kosztu, konfiguracja domeny i sekretów, dowód TLS/roli i least privilege na docelowej infrastrukturze, test sandbox rzeczywistego dostawcy, monitoring, procedura wyników `unknown` oraz pozostałe właściwe bramki OPEN-013/014. Lokalny fake HTTP nie potwierdza dostarczenia wiadomości.
