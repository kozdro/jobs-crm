# Smart Import, CSV/XLSX, kolejki i idempotencja

**APPROVED:** TD 1.22–1.30, 1.34, 1.40. **Aktualizacja 2026-10-29:** [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md) zatwierdza PostgreSQL-native transactions + minimalne Supabase RPC. ADR-0005 pozostaje ACCEPTED. **PROPOSED:** szczegóły protokołu, rejestru i retry; nie zamykają OPEN-010/011/022/023/035.

## URL / Smart Import

1. Akceptuj pojedynczy URL; składnię i schemat HTTP(S) waliduj przed jakimkolwiek żądaniem.
2. **Odrzuć automatyczne fetch** dla domeny spoza zatwierdzonej listy (domyślnie lista pusta, dopóki testy i zasady dostępu nie potwierdzą konkretnej domeny). Nadal pozwól użytkownikowi zachować URL i ręcznie wypełnić formularz.
3. Dla zatwierdzonej domeny sprawdzaj hostname i port, DNS/IP (IPv4/IPv6), redirect, schemat po każdym hopie oraz potencjalne żądania subresources. Odmów loopback, link-local, RFC1918, metadata services i wewnętrznych usług; użyj limitów czasu/rozmiaru/liczby redirectów. Allowlist nie zastępuje kontroli SSRF.
4. HTTP → dane JSON-LD/meta/HTML → adapter domeny → opcjonalny Playwright (tylko dopuszczona domena i zweryfikowana polityka zasobów) → wynik jako niezweryfikowana propozycja.
5. Normalizuj URL ostrożnie; usuwaj znane parametry trackingowe, nie niszcz ID publikacji; wynik dedupe jest **sugestią**, nie automatycznym merge.
6. Każdy wynik wymaga jawnej akceptacji i jest osobny od faktu „aplikowano”. Awaria/fetch blocked/CAPTCHA/login → manual fallback, bez obejścia blokad.

## Job lifecycle — PROPOSED

`queued → running → succeeded | failed | cancelled`, dodatkowo `retryable` jako właściwość błędu, nie zatwierdzony status biznesowy. BFF publikuje `job_id` + owner/context; worker czyta pgmq (Basic/durable), weryfikuje tożsamość zadania, przetwarza z ograniczeniami, oznacza wynik i usuwa/archiwizuje wiadomość. Stosuj lease/visibility timeout, dedupe, retry/backoff, poison-message handling, graceful shutdown i idempotentną obsługę efektów. Nie zakładaj exactly-once **execution** przy awariach i przetworzeniach ubocznych. Kolejka nie jest źródłem prawdy o aplikowaniu.

## CSV/XLSX: bez stagingu wierszy

1. Parser strumieniowo lub w pamięci dla **zatwierdzonych limitów**, wyłącznie na serwerze; bez zachowywania trwałych kopii wierszy. Wielkości i formaty OPEN-007/023.
2. Mapowanie i preview; użytkownik jawnie zaznacza zaakceptowane wiersze, pomija błędne i rozwiązuje potencjalne duplikaty. Nie wnioskuj historycznych dat i statusów.
3. Jeśli zatwierdzenie następuje w osobnym żądaniu, BFF musi mieć możliwość **ponownej weryfikacji dokładnie zaakceptowanego payloadu**, np. podpisany krótkożyjący snapshot lub ponowne dostarczenie pliku; brak trwałego stagingu jest świadomym ograniczeniem. Nie przyjmuj niezaufanego klientowego „wyniku walidacji”.
4. Przed commit rewaliduj stan bieżących spraw i uprawnienia, przetwarzaj atomowo **wszystkie zaakceptowane** wiersze w **jednej transakcji PostgreSQL**. W Data API oznacza to niewielką funkcję PostgreSQL i jedno `supabase.rpc()`, preferowane `SECURITY INVOKER`, minimalne EXECUTE grants oraz RLS tabel. Jeden request PostgREST jest transakcją; błąd DB powoduje rollback. N niezależnych insertów HTTP nie realizuje wspólnej transakcji. Funkcja i grants wymagają niezależnego review/testów.
5. W tej samej transakcji zapisz `import_operation(user_id, idempotency_key, fingerprint, outcome, counters)` z unikalnością per-user. Retry tej samej akcji zwraca zapisany wynik zamiast ponownego tworzenia rekordów; ten sam owner/key z innym payloadem oznacza jawny konflikt. Klient nie może podmienić/usunąć rejestru, by obchodzić ochronę; konkretne grants/RLS/API rejestru wymagają projektu i testów slice’a. Ten sam hash pliku przy innej akceptacji/mapowaniu = ostrzeżenie i świadoma decyzja, nie bezwarunkowy zakaz.
6. Po commicie zwróć raport zaakceptowanych/odrzuconych wierszy; przy rollback nic nie zostało zaimportowane. Nie uruchamiaj zaległych sugestii z historycznych importów.

**Granica transakcji:** operacje Storage i poczta nie są objęte pojedynczym SQL commit; jeśli kiedykolwiek dodamy takie efekty, stosuj wzorzec outbox/kompensacje (PROPOSED). Limity przetwarzania muszą być realistyczne dla jednej transakcji.

## Minimalny plan RPC i kolejność

Rekomendacja **PROPOSED**: implementacja i dowód native RPC w docelowym CSV/XLSX slice po zatwierdzeniu kontraktu domenowego, zamiast dużego samodzielnego PR-F4 blokującego ręczny RecruitmentCase/Quick Capture. Mały izolowany test techniczny tylko jeśli ujawni się konkretna nierozwiązana luka; zakres i zgoda osobnego zadania. Zwykły import nie wymaga worker/queue, trwałego stagingu, transaction coordinatora, workflow engine ani exactly-once execution. F5 dopiero przed pierwszą funkcją background. Szczegóły: [Foundation Plan](foundation-plan.md).

Minimalne przyszłe testy: jeden atomic multi-record write, rollback przy błędzie, RLS i ograniczone EXECUTE, retry po utracie odpowiedzi, brak duplikatów, konflikt key/zmieniony payload i podstawowa współbieżność. **PLANNED / NOT RUN**; F2 syntetyczny RPC nie zastępuje docelowego dowodu importu.

## Testy krytyczne

SSRF (redirect, DNS rebinding, IP literal, IPv6, subresources); błędy portalu; niezaufany HTML; powtórne kliknięcie submit; utrata odpowiedzi po commicie; kolizja idempotency key z innym payloadem; rollback na 150/190 rekordzie; wyścig zmian od preview do commit; izolacja ownerów; CSV/XLSX z nieznanym statusem; brak fałszywych zdarzeń historycznych.

**Powiązania:** FR-QC-003–011, FR-IM-001–014, BR-021–025, NFR-008/009, OPEN-007/010/011/022/023/024/025/035.
