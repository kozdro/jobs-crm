# Persystencja i dane — kontrakt logiczny

**APPROVED:** SQL / PostgreSQL, shared schema, owner isolation, stan + historia biznesowa + audyt, Drizzle dla definicji/migracji, użytkowe zapytania przez Supabase Data API/RLS. **PROPOSED:** poniższe nazwy tabel/indeksów — nie są migracją. Aktualny kontrakt Auth/dostępu: [ADR-0012](../decisions/adr/0012-supabase-native-auth-sessions-rls.md), bez własnego magazynu sesji/brokera.

## Szkic logiczny

| Agregat | Przykładowe byty | Kluczowe wymagania |
|---|---|---|
| Tożsamość | account_profile, account_preferences | user_id z Auth; nie przechowywać własnych haseł |
| Rekrutacja | recruitment_case, closure_record, case_stage, case_link | sprawa różna od ogłoszenia, 4 statusy, wiele zakończeń, wiele linków |
| Relacje | organization, contact, case_organization, case_contact, event_participant | relacje m:n, znany kontakt nie oznacza znanego pracodawcy |
| Zdarzenia | business_history_entry, audit_change, calendar_event, event_schedule_change | data rzeczywista vs data dodania, korekty nie są historią aplikacji |
| Planowanie | task, suggestion, notification_preference | brak automatycznej wysyłki/auto-close, historyczny import bez zaległych sugestii |
| Pliki | document, document_version, case_document_link, sent_document_reference | niezmienne wersje, jawny fakt wysłania, znikająca zawartość nie tworzy fikcyjnego wysłania |
| Import | import_operation | trwały idempotency_key, hash pliku, status/wynik, owner; **bez wierszy stagingowych** |

Każdy prywatny agregat posiada lub dziedziczy niepodrabialną relację do właściciela. Dla powiązań m:n waliduj **obu właścicieli** w DB i domenie; samo FK do rekordu nieautoryzowanego nie uprawnia do relacji. Nie przechowuj danych innych kont w wspólnym cache bez klucza owner.

## Transakcje i niezmienniki

- Atomiczność aktualnego stanu, faktów historii i rekordu zakończenia dla jednej komendy — **PROPOSED** układ tabel i funkcji; semantyka OPEN-001/004/018/020/029/034.
- Dla importu użytkownika jedna atomowa transakcja SQL przy zatwierdzeniu wybranych wierszy. Przez Data API realizuje ją niewielka funkcja PostgreSQL wywołana jednym `supabase.rpc()`: preferowane `SECURITY INVOKER`, minimalne EXECUTE grants i RLS. Pojedynczy request PostgREST działa w transakcji; błąd DB powoduje rollback. Seria osobnych requestów nie jest wspólną transakcją. `SECURITY DEFINER` wymaga uzasadnienia i odrębnego security review. Wynik `committed` i minimalny user-scoped rejestr idempotencji/fingerprint zapisują się razem z efektem; rejestr musi być chroniony przed podmianą/usunięciem przez klienta. Bez uniwersalnego silnika transakcji lub frameworka idempotencji. Dowód wymagany przed importem, nie przed niezależnym ręcznym CRUD.
- Nie fabrykuj wpisów historii na podstawie korekty statusu, samego URL ani samego dokumentu.
- Zmiana treści dokumentu = nowa wersja; usunięcie pliku może pozostawić minimalną historyczną informację o wysyłce zgodnie z zatwierdzoną polityką i obowiązkami prywatności.

## RLS i odczyty

- Każda tabela w eksponowanym schemacie z danymi prywatnymi: RLS z testami SELECT, INSERT, UPDATE (USING **i** WITH CHECK), DELETE, relacji i RPC.
- Polityki oparte na zaufanym `auth.uid()`, nie na edytowalnym przez użytkownika metadata. Domyślne deny. Widoki przyjmują security-invoker lub nie są eksponowane.
- Użytkowe query nie powinny korzystać z uprzywilejowanego service-role. W workerach dostęp serwisowy ograniczony do jawnych komend i sprawdzanego owner_id/job_id.
- Indeksy: FK, owner/status/date, unikalność idempotency key per user, FTS tsvector/GIN tam gdzie konieczne; konkretna polska konfiguracja słownika i ranking nadal OPEN-038.

## Migracje

Drizzle: przeglądane migracje w Git, forward-compatible i testowane w lokalnym DB na danych syntetycznych. Nigdy bez zatwierdzonych pól (OPEN-002), brak automatycznego generowania schematu z koncepcyjnych diagramów. Zmiany RLS i funkcji DB są wersjonowane razem z migracjami i objęte testami autoryzacji.
