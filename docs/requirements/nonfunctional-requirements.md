# Wymagania niefunkcjonalne (NFR) i status wiedzy

**Stan:** `BASELINED`. Liczby i mechanizmy niezdefiniowane w baseline pozostają `OPEN`. Ta lista nie wybiera architektury.

| ID | Status | Wymaganie / pytanie niefunkcjonalne | Bramka |
|---|---|---|---|
| NFR-001 | APPROVED | Prywatność i bezpieczeństwo przesyłanych/przechowywanych dokumentów, spraw, kontaktów i historii użytkownika; brak ujawniania danych pomiędzy nieuprawnionymi kontami. | `OPEN-006/OPEN-013/OPEN-032` — środki i walidacja |
| NFR-002 | APPROVED | Nie zniekształcaj rzeczywistej historii zdarzeń, wysłanych dokumentów i wyników zamknięć. | `BR-007/BR-010/BR-016/BR-024/BR-026` |
| NFR-003 | APPROVED | Brak autonomicznej wysyłki komunikacji, samoczynnego zamykania spraw i automatycznego scalania potencjalnych duplikatów. | `BR-009/BR-020/BR-022` |
| NFR-004 | OPEN | Zatwierdzony podzakres: Supabase-native Auth/SSR, Data API z user JWT i RLS, prywatny Storage (ADR-0012/0004). Bez HttpOnly-only i własnego brokera; access JWT może pozostawać ważny do wygaśnięcia po revocation. Szczegóły sesji, ochrony operacji wrażliwych i weryfikacja bezpieczeństwa nadal OPEN-013/042; NFR-001 bez zmian. | `OPEN-013/OPEN-042` |
| NFR-005 | OPEN | Poziom dostępności, wspierane urządzenia i przeglądarki, obsługa klawiatury i kontrasty. | `OPEN-017/OPEN-033` |
| NFR-006 | OPEN | Cele wydajności, rozmiarów danych, równoległości, wyszukiwania i importu. | `OPEN-007/OPEN-014/OPEN-038` |
| NFR-007 | OPEN | Retencja, kopie bezpieczeństwa, przywracanie, zakres i bezpieczeństwo eksportu oraz skutki usuwania konta/danych. | `OPEN-005/OPEN-006/OPEN-014/OPEN-032/OPEN-045/OPEN-046` |
| NFR-008 | OPEN | Zatwierdzony podzakres ADR-0005: jeden atomowy commit zaakceptowanego zbioru przez natywne PostgreSQL RPC, rollback błędu, brak trwałego stagingu, minimalny user-scoped registry/fingerprint chroniący retry przed cichymi duplikatami. Pozostała semantyka raportu, konfliktów i celowego powtórzenia OPEN-010/035. | `OPEN-010/OPEN-035` |
| NFR-009 | OPEN | Ochrona pobierania URL przed szkodliwymi adresami, nieuprawnionym dostępem do sieci i przeciekami danych. | `OPEN-011/OPEN-025`, Technical Discovery |
| NFR-010 | OPEN | Zasady monitorowania błędów, logowania bez poufnych danych i reakcji na incydenty. | `OPEN-013/OPEN-014/OPEN-032` |
| NFR-011 | OPEN | Lokalizacja, strefy czasowe, formaty dat w importach i kalendarzu. | `OPEN-023/OPEN-037` |

## Sposób akceptacji

Dla `APPROVED` testuj zasadę biznesową poprzez scenariusze i weryfikację security/QA. Dla `OPEN` najpierw określ mierzalne cele, testy lub kontrolę bezpieczeństwa; nie ustawiaj bez zatwierdzenia SLA, wartości czasu odpowiedzi, limitów plików ani wybranych standardów bezpieczeństwa.
