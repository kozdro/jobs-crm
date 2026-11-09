# ADR-0014 — Niezależny kontekst zgody e-mail

**Status:** ACCEPTED w granicach jawnie delegowanego wyboru implementacji przez PO, 2026-11-09. Nie jest to dowód skuteczności ani gotowości PR #26. Źródło: polecenie PO „samodzielnie wybierz najmniejszą bezpieczną implementację” i wymaganie niezależnego utrwalenia kontekstu; [task packet](../../technical/optional-email-reminders-delivery.md#pr-26--security-hardening-2026-11-09).

## Kontekst i warianty

DEC-027/063, FR/AC-TN-005, BR-030, UX F09 i ADR-0012 wymagają zgody na konkretny zweryfikowany adres. Trigger Auth może pominąć zmianę A→B→A, a bieżąca kontrola katalogów nie wykrywa cofniętego dryftu. Rozważono: sam katalog (niewystarczający), adres z timestampem weryfikacji (niewystarczający przy ABA), niezależny prywatny snapshot rewizji Auth z konserwatywnym unieważnianiem.

## Decyzja

W istniejącej prywatnej granicy PostgreSQL utrwalać snapshot dokładnego adresu, momentu weryfikacji i rewizji tuple Auth, z inkarnacją fizycznej relacji oraz pełnym horyzontem transakcji. Nieprzezroczysta wersja pokazywana klientowi wiąże preview z enable. Jawne enable kopiuje dowód do zamiaru. Dispatch pod istniejącą blokadą Auth porównuje cały dowód przed zwróceniem zatwierdzonego odbiorcy. Brak, niezgodność lub niejednoznaczność blokuje wysyłkę. Historyczne zamiary bez dowodu nie są uzupełniane automatycznie. Trigger i bieżąca kontrola katalogu stanowią dodatkową ochronę; nie zastępują snapshotu.

`xmin` sam jest 32-bitowy, a w jednej transakcji kolejne aktualizacje mogą mieć ten sam identyfikator. Wymagane są dodatkowo `ctid`, inkarnacja relacji i odrzucenie przed możliwym ponownym użyciem zapisanego xmin. Cofnięcie pełnego horyzontu, brak dowodu oraz rewrite relacji unieważniają kontekst. Blokady Auth → owner → intent pozostają utrzymane przez handoff i finish. Nie zmieniamy uprawnień, retry/unknown, idempotencji, neutralnej treści, retencji prób ani okna 6 godzin.

## Konsekwencje i ograniczenia

Każda zmiana tuple Auth, także niezwiązana z adresem, może wymagać ponownego świadomego włączenia kanału; jest to zachowawcze blokowanie przy braku dowodu ciągłości. Snapshot jest prywatny, bez grantów dla klienta i bez nowych danych w payloadzie kolejki lub logach. To operacyjny dowód konkretnego zamiaru, nie ogólna polityka audytu zgody lub retencji. Po restore dispatch musi pozostać wstrzymany, a wcześniejsze konteksty unieważnione przed wznowieniem; snapshot odtwarzany razem z bazą nie dowodzi historii poza backupem. Wdrożenie i restore pozostają poza bieżącą autoryzacją i bramkami OPEN-013/014.

Dokumentacja PostgreSQL: [kolumny systemowe](https://www.postgresql.org/docs/current/ddl-system-columns.html), [XID i wraparound](https://www.postgresql.org/docs/current/routine-vacuuming.html), [pełny identyfikator transakcji](https://www.postgresql.org/docs/current/functions-info.html), [blokady wierszy](https://www.postgresql.org/docs/current/explicit-locking.html). Aktualne informacje pobrano przez Context7; testy implementacji są osobnym dowodem.

## Weryfikacja i odwracalność

Wymagane testy preview/enable/dispatch, A→B i A→B→A także w jednej transakcji, verification loss, bieżący i cofnięty dryft, horyzont XID/rewrite, współbieżność oraz pełne regresje. Symulacje i realny DDL mają oddzielne wyniki. Ograniczenia uprawnień nie są obchodzone. Wyniki: [raport hardeningu](../../technical/optional-email-security-hardening-report.md). Rollback usuwający dowód ponownie otwiera lukę; bezpieczne wycofanie wymaga zatrzymania kanału, a nie powrotu do starego dispatch.
