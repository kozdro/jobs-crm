# ADR-0013 — Transport przypomnień e-mail

**Status:** ACCEPTED · **Data:** 2026-11-09 · **Zatwierdzający:** PO w bieżącej rozmowie. Wybór adaptera nie jest dowodem dostawy ani autoryzacją provisioningu, kosztów lub deploymentu.

## Kontekst i warianty

DEC-027/063, FR/AC-TN-005 oraz OPEN-009/013/014/040 wymagają opcjonalnego przypomnienia dla właściciela, minimalizacji danych i bezpiecznej obsługi niepewnej odpowiedzi. Rozważono Resend REST i Postmark REST; po przedstawieniu wariantów PO wybrał Resend REST. Kolejka i worker pozostają w granicach ACCEPTED ADR-0007.

## Decyzja

Serwerowy adapter Resend REST dla tego slice'a; żadne klucze w przeglądarce. Wysyła wyłącznie dane niezbędne do adresowania oraz neutralną treść i link do aplikacji. Rozróżnia potwierdzone przyjęcie, znaną bezpieczną odmowę i wynik nieustalony; bez ślepego retry. Resend dokumentuje klucze idempotencji z okresem 24 godzin, lecz ich istnienie nie oznacza gwarancji doręczenia ani znosi zatwierdzonej polityki unknown. [API i idempotencja](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Konsekwencje, weryfikacja i odwracalność

Dostawca otrzymuje adres właściciela i neutralną wiadomość. Domenę, adres nadawcy, sekrety, umowę, koszty, ochronę i warunki operacyjne trzeba rozstrzygnąć przed realnym użyciem; pozostają OPEN-013/014. Testy z fake HTTP i lokalną kolejką nie dowodzą rzeczywistej dostawy. Przed publicznym użyciem wymagane są m.in. kontrolowany sandbox, monitoring i osobne dopuszczenie. Interfejs transportu pozwala na przyszłą migrację po ocenie idempotencji, odzyskiwania i skutków prywatności; nie przenosi wiadomości ani danych automatycznie.
