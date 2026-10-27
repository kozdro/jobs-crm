# Wymagania niefunkcjonalne (NFR) i status wiedzy

**Stan:** `BASELINED`. Liczby i mechanizmy niezdefiniowane w baseline pozostają `OPEN`. Ta lista nie wybiera architektury.

| ID | Status | Wymaganie / pytanie niefunkcjonalne | Bramka |
|---|---|---|---|
| NFR-001 | APPROVED | Prywatność i bezpieczeństwo przesyłanych/przechowywanych plików oraz danych kontekstowych użytkownika. | `OPEN-006/OPEN-013/OPEN-032` — środki i walidacja |
| NFR-002 | APPROVED | Nie zniekształcaj rzeczywistej historii zdarzeń, wysłanych dokumentów i wyników zamknięć. | `BR-007/BR-010/BR-016/BR-024/BR-026` |
| NFR-003 | APPROVED | Brak autonomicznej wysyłki komunikacji, samoczynnego zamykania spraw i automatycznego scalania potencjalnych duplikatów. | `BR-009/BR-020/BR-022` |
| NFR-004 | OPEN | Sposób uwierzytelniania, autoryzacji, izolacji użytkowników i zabezpieczania plików. | `OPEN-013` |
| NFR-005 | OPEN | Poziom dostępności, wspierane urządzenia i przeglądarki, obsługa klawiatury i kontrasty. | `OPEN-017/OPEN-033` |
| NFR-006 | OPEN | Cele wydajności, rozmiarów danych, równoległości, wyszukiwania i importu. | `OPEN-007/OPEN-014/OPEN-038` |
| NFR-007 | OPEN | Retencja, kopie bezpieczeństwa, przywracanie, eksport i usuwanie danych. | `OPEN-005/OPEN-006/OPEN-014/OPEN-032` |
| NFR-008 | OPEN | Odporność importu na awarię, idempotencja wsadów, spójność zapisu częściowego. | `OPEN-010/OPEN-035` |
| NFR-009 | OPEN | Ochrona pobierania URL przed szkodliwymi adresami, nieuprawnionym dostępem do sieci i przeciekami danych. | `OPEN-011/OPEN-025`, Technical Discovery |
| NFR-010 | OPEN | Zasady monitorowania błędów, logowania bez poufnych danych i reakcji na incydenty. | `OPEN-013/OPEN-014/OPEN-032` |
| NFR-011 | OPEN | Lokalizacja, strefy czasowe, formaty dat w importach i kalendarzu. | `OPEN-023/OPEN-037` |

## Sposób akceptacji

Dla `APPROVED` testuj zasadę biznesową poprzez scenariusze i weryfikację security/QA. Dla `OPEN` najpierw określ mierzalne cele, testy lub kontrolę bezpieczeństwa; nie ustawiaj bez zatwierdzenia SLA, wartości czasu odpowiedzi, limitów plików ani wybranych standardów bezpieczeństwa.
