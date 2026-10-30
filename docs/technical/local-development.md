# Lokalne środowisko developerskie

Zalecany ręczny start: **`pnpm dev:local`**. Local DEV jest trwałym, lokalnym środowiskiem. Konta i sprawy nie są kasowane po restarcie. Decyzja PO z 2026-10-30: Local DEV używa Supabase Local, CI jednorazowych izolowanych instancji, a przyszła produkcja Render + Supabase Cloud. Nie tworzymy Cloud DEV ani stagingu. [Analiza, plan i granice](local-development-plan.md).

## Wymagania i pierwszy start

macOS, Volta, działający Docker Desktop z lokalnym Linux engine przez Unix socket, OpenSSL, Node **24.22.2**, pnpm **12.16.1**. Supabase CLI **2.122.0** jest przypiętą zależnością repozytorium. Bez konta Supabase Cloud i prawdziwego SMTP.

```sh
volta install node@24.22.2
node -v
pnpm -v
pnpm exec node -p 'JSON.stringify({version:process.version,execPath:process.execPath})'
pnpm install --frozen-lockfile
pnpm dev:local
```

**Rzeczywisty Node pnpm:** `node -v` może wskazać 24.22.2, a `pnpm exec node` 26.10.0. W tej sytuacji zatrzymaj instalację i ustaw w bieżącej powłoce katalog właściwego Node przed pozostałymi wpisami PATH:

```sh
export PATH="$(dirname "$(volta which node)"):$PATH"
pnpm exec node -p 'JSON.stringify({version:process.version,execPath:process.execPath})'
pnpm install --frozen-lockfile
pnpm dev:local
```

Kontrola musi pokazać `v24.22.2`. Nie używaj `--force`, nie wyłączaj engineStrict i nie zmieniaj pinów. Sam wpis `volta.node` w package.json nie usunął zaobserwowanego problemu wrappera pnpm, dlatego nie dodajemy drugiego źródła pinów. `.node-version`, engines i packageManager pozostają obowiązujące.

## Codzienna praca

```sh
pnpm dev:local
pnpm dev:local:status
pnpm dev:local:stop
```

Pierwszy start pobiera przypięte obrazy i tworzy jeden projekt. Następne uruchomienia używają tego samego manifestu, kontenerów i wolumenów. Nie uruchamiaj równolegle dwóch startów. Skrypt przygotowuje konfigurację Auth w pamięci procesu; nie nadpisuje `.env.local`. `pnpm dev` pozostaje zwykłym Next.js wymagającym samodzielnej konfiguracji usług.

| Usługa | Adres skonfigurowany dla DEV |
| --- | --- |
| Jobs CRM | https://127.0.0.1:3163 |
| Studio | http://127.0.0.1:56723 |
| Poczta Mailpit | http://127.0.0.1:56724 |
| Supabase Auth / Data API | http://127.0.0.1:56721 |
| PostgreSQL | 127.0.0.1:56722 |

Gotowość potwierdza dopiero komunikat po sprawdzeniu usług i aplikacji. Wszystkie opublikowane porty są związane z `127.0.0.1`. DEV używa osobnych portów od F2 (564xx), F3 (565xx) i RecruitmentCase (566xx), w tym osobnego origin aplikacji. Nie zmieniaj hosta na `localhost`: origin i callback muszą być zgodne.

Next działa przez natywne `next dev --webpack --experimental-https`, bez dodatkowego proxy, z Fast Refresh. Profil wybiera wspierany Webpack: identyczny test Auth i pełnego restartu przeszedł na nim 10/10 etapów; wcześniejsze próby na Turbopack wpadały w pętlę przeładowań po wcześniejszym użyciu Auth. Artefakty DEV są w `.local-dev/next`, oddzielnie od `.next` testów i buildów. Redagowane logi są poza repozytorium, w prywatnym katalogu kanału kontrolnego (0700; plik 0600); start podaje pełną ścieżkę. Dzięki temu zapis diagnostyki nie uruchamia Fast Refresh. `agentRules: false` zapobiega automatycznemu dopisywaniu instrukcji do zarządzanego przez harness `AGENTS.md`. Przy Ctrl+C podczas bootstrapu skrypt czeka na zakończenie bieżącego startu Supabase, po czym rezygnuje ze startu aplikacji; dane pozostają zachowane. Certyfikat i klucz powstają automatycznie poza Git; certyfikat jest ponownie używany i odnawiany po wygaśnięciu. Przeglądarka może wyświetlić ostrzeżenie dla lokalnego certyfikatu samopodpisanego; zaakceptuj go wyłącznie dla tego adresu lub zaufaj lokalnemu certyfikatowi według polityki swojego komputera. Skrypt nie zmienia systemowego magazynu zaufania.

## Konto, poczta i Studio

1. Otwórz `/signup`, podaj syntetyczny adres i hasło zgodne z formularzem.
2. Otwórz lokalny Mailpit, odszukaj wiadomość i użyj linku w tej samej przeglądarce, która rozpoczęła signup. PKCE wymaga jej kontekstu.
3. Callback przechodzi przez `/auth/callback`; zaloguj się i utwórz sprawę przez Quick Capture.
4. W Studio: Authentication → Users pokazuje konto; Table Editor → public → recruitment_case pokazuje sprawę. SQL Editor i inspekcja schematu umożliwiają odczyt indeksów i polityk RLS.
5. Reset hasła rozpocznij w aplikacji, odczytaj Mailpit i dokończ w tej samej przeglądarce. Wychodzące wiadomości zostają lokalnie; brak zewnętrznego SMTP.

Przypięty CLI nazywa kontener poczty `inbucket`, ale uruchamia **Mailpit v1.31.3**, nie usługę Inbucket. Nie wysyłaj prawdziwej korespondencji i nie importuj produkcyjnych danych.

Studio służy do inspekcji. Zmiany schematu wykonane w SQL Editorze wywołają odmowę kolejnego startu: jedynym źródłem schematu pozostają zatwierdzone migracje Drizzle `db/recruitment/migrations/`. Ledger `recruitment_migrations` jest oddzielny od F2. Start stosuje wyłącznie brakujące migracje po kontroli historii, checkpointu i schematu; nie uruchamia resetu, seedów ani `foundation_poc`.

## Stop, trwałość i reset

Ctrl+C zatrzymuje aplikację i pozostawia usługi Supabase uruchomione. `pnpm dev:local:stop` zatrzymuje aplikację przez jej lokalny kanał kontrolny oraz własne kontenery DEV; zachowuje wolumeny, konta, hasła i sprawy. Ponowne wykonanie stop jest bezpieczne. Nie używa zbiorczego `supabase stop --all` ani `--no-backup`.

Dane znajdują się w nazwanych wolumenach Docker wskazanych w `.local-dev/manifest.json`. Manifest, konfiguracja, certyfikaty i lokalne receipts są w ignorowanym `.local-dev/`. Nie kasuj tego katalogu ręcznie: utrata manifestu oznacza utratę dowodu własności. Nie używaj Docker prune do zatrzymywania środowiska.

Reset jest osobną, destrukcyjną operacją. Bez potwierdzenia odmawia i podaje docelowy identyfikator oraz zakres. Przeczytaj komunikat, sprawdź status i dopiero świadomie wykonaj:

```sh
pnpm dev:local:reset --confirm <dokładny-projectId-z-manifestu>
```

Usunięte zostaną własne kontenery, wolumeny z wszystkimi lokalnymi kontami/sprawami/pocztą, sieć i aktywna konfiguracja DEV zgodnie z komunikatem skryptu. Manifest, konfiguracja i dowody resetu są archiwizowane w ignorowanym `.local-dev-history/`. Nie ma cofnięcia. Niezgodna tożsamość, konfiguracja lub obcy zasób blokuje operację przed pierwszym usunięciem. Nie wykonuj resetu do naprawienia migracji lub konfliktu portów.

## Istniejące manual-dev i konfiguracja

`.recruitment-local/manual-dev`, jego kontenery i `.env.local` pozostają nietknięte. Nowy DEV jest osobną bazą: stare konto nie pojawi się automatycznie pod nowym adresem. Możesz nadal korzystać ze starego workflow i jego dotychczasowego origin, a nowy przetestować niezależnie na 567xx/3163. Nie uruchamiaj zbiorczego `scripts/recruitment/cleanup.ts` na komputerze z danymi manual-dev: dotychczasowy skrypt jest przeznaczony do targetów testowych.

Przeniesienie danych wymaga oddzielnego, świadomie zatwierdzonego planu: odczytowa weryfikacja tożsamości starego targetu i ledgeru, zabezpieczenie kompletu danych Auth + produktu, sprawdzony restore do odrębnego targetu i porównanie UUID kont/spraw, logowania oraz RLS. Dopiero po potwierdzeniu zgodności przełącza się konfigurację. Nie wykonujemy automatycznej adopcji, kopiowania samych tabel public ani usuwania starego środowiska. Nie wklejaj dumpów do Git lub logów.

## Rozwiązywanie problemów

- **Docker:** uruchom Docker Desktop; `docker context inspect` ma wskazywać lokalny Unix socket. Zdalne DOCKER_HOST jest odrzucane. Jednoczesne DOCKER_HOST i DOCKER_CONTEXT są odrzucane przed kontaktem z daemonem; wybierz tylko jeden lokalny endpoint.
- **Port zajęty:** sprawdź właściciela procesu/targetu, zachowaj jego dane. Skrypt nie zabija przypadkowych procesów ani nie wybiera innego origin automatycznie.
- **Node/pnpm:** porównaj faktyczny `pnpm exec node` z pinami i zastosuj PATH powyżej.
- **Certyfikat:** sprawdź lokalny OpenSSL i uprawnienia `.local-dev`; nie publikuj klucza, nie omijaj HTTPS przez zmianę origin.
- **Brak e-maila:** sprawdź Mailpit i status usług; użyj tego samego kontekstu przeglądarki. Nie konfiguruj prawdziwego SMTP. Linki mają lokalny okres ważności z profilu; po wygaśnięciu rozpocznij operację ponownie.
- **Drift/ledger/partial start:** zachowaj manifest i diagnostykę; porównaj przeglądane migracje i konfigurację. Skrypt nie naprawia historii przez reset. Nie zmieniaj checkpointów ręcznie poza kontrolowaną procedurą „Przerwany proces i naprawa bez resetu”.

Nigdy nie umieszczaj service-role w `NEXT_PUBLIC_*`. Publiczna konfiguracja zawiera tylko flagi, origin, URL Supabase i klucz publishable/anon. Hasła, cookies, sesje, klucze TLS i prywatne dane pozostają lokalne i poza repozytorium.

## Przerwany proces i naprawa bez resetu

Po SIGKILL lub awarii zachowaj wszystkie wolumeny i pliki stanu. Najpierw sprawdź procesy (`ps`) i listener aplikacji (`lsof -nP -iTCP:3163 -sTCP:LISTEN`), upewnij się, że nie trwa bootstrap/migracja i że żaden proces danego checkoutu nie korzysta z kanału kontrolnego. Dopiero po takim potwierdzeniu można usunąć wyłącznie pozostawione blokady `.local-dev/app.lock`, `.local-dev/lifecycle.lock` i nieużywane gniazdo tego checkoutu `$TMPDIR/jobs-crm-dev-<sha256(root)[0:16]>/control.sock`, gdzie root to rzeczywisty katalog repozytorium. Nie zabijaj procesu znalezionego wyłącznie po numerze portu/PID. Przy wątpliwości zachowaj stan i poproś o inspekcję.

Migracja DB i zapis checkpointu pliku nie są jedną atomową transakcją. Awaria pomiędzy nimi powoduje świadomą odmowę następnego startu. **Dane nie znikają i reset nie jest naprawą tej sytuacji.** Bezpieczna procedura jest ręczna: zachowaj kopię manifestu i snapshot/backup dokładnie zweryfikowanego lokalnego targetu; odczytaj ledger i porównaj każdy hash/czas z zatwierdzonymi plikami Drizzle; odtwórz oczekiwany schemat na osobnym jednorazowym targetcie i porównaj definicje, ACL, RLS, funkcje i indeksy; sprawdź, czy stary checkpoint jest dokładnym prefiksem potwierdzonej historii. Replay musi używać identycznego profilu `supabase/local-dev-config.toml`, przypiętego CLI 2.122.0 i tych samych obrazów. Algorytmy źródłowe to `ledgerCheckpoint(rows)` w `scripts/recruitment/validation.ts` i odczytowe `schemaCheckpoint(sql)` w `scripts/local-dev/migrations.ts` (obejmuje też definicje sekwencji, bez ich bieżących pozycji). Wartość schematu do korekty pochodzi ze zweryfikowanego replayu, po potwierdzeniu zgodności z bieżącym targetem. Dopiero po niezależnym review tych dowodów i jawnym potwierdzeniu projectId przez właściciela przygotowuje się minimalną korektę metadanych checkpointu, bez uruchamiania DDL i bez przepisywania kont/spraw. Nie ma komendy automatycznie adoptującej niezgodną historię. Brak dowodu pełnej zgodności oznacza dalszy STOP i zachowanie danych, a nie zgodę na reset.

Lokalny loopback nie jest osobną granicą zaufania pomiędzy użytkownikami komputera: Studio/SQL Editor, Mailpit i lokalny PostgreSQL mają uprawnienia administracyjne dla lokalnych procesów. Używaj syntetycznych danych i zaufanego komputera. Dla równoległego starego manual-dev i nowego DEV używaj osobnych profili przeglądarki: porty nie izolują cookies tego samego hosta, a natywnego Auth/SSR nie przebudowujemy.

Redagowany `next.log` poza repozytorium pozostaje po stop i resecie do następnego startu (nadpisanie) lub sprzątania katalogu tymczasowego przez system. Może zawierać lokalne adresy e-mail i ścieżki; uprawnienia 0700/0600 ograniczają dostęp. Nie traktuj redakcji wzorców jako gwarancji usunięcia każdej możliwej prywatnej wartości.
