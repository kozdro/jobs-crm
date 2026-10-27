# Feature: CSV/XLSX Import

**Stan:** `BASELINED` (ogólny proces `APPROVED`; transakcje i szczegółowe mapowania `OPEN`). **Aktor:** użytkownik importujący historię aplikowania. **FR:** `FR-IM-001`–`FR-IM-014`.

## Cel i zakres

Przenieść rzeczywiste dane z własnych arkuszy CSV lub Excel/XLSX albo ułatwić migrację przez gotowy szablon. Import nie służy do produkowania fałszywych osi czasu ani domyślnych zdarzeń aplikacji.

## Proces `APPROVED`

| Faza | Wymagane zachowanie | Warunek przejścia |
|---|---|---|
| 1. Wejście | Przyjęcie CSV/XLSX lub użycie gotowego szablonu. | Format i limity: `OPEN-007/OPEN-023`. |
| 2. Mapowanie pól | Przyporządkowanie kolumn do pojęć CRM. | Bez zgadywania brakujących informacji. |
| 3. Mapowanie słowników | Dopasowanie wartości statusu, etapu, wyniku zakończenia. | Nieznane/niespójne wartości: `OPEN-001/OPEN-022`. |
| 4. Preview i walidacja | Podgląd przyszłego wyniku oraz wyróżnienie błędów i potencjalnych duplikatów. | Nie następuje zapis przed zatwierdzeniem. |
| 5. Decyzje użytkownika | Weryfikacja rekordów, wybór pomijanych; częściowy import tylko po jawnej zgodzie. | `BR-022/BR-023`. |
| 6. Zapis i raport | Zapis zaakceptowanych wierszy + raport pominiętych z powodami. | Transakcyjność, awaria i undo: `OPEN-010/OPEN-035`. |

## Sytuacje błędne i przypadki brzegowe

- Wiersz z nieznanym statusem/etapem/wynikiem — oznacz do świadomego rozstrzygnięcia; nie twórz nowego słownika po cichu.
- Brak daty wcześniejszej aplikacji — pozostaw brak lub odrzuć wg przyszłej walidacji; **nie podstawiaj dzisiejszej daty jako daty aplikacji**.
- Sprawa historycznie zakończona — nie generuj automatycznie zaległych sugestii follow-upów.
- Ta sama firma z różnymi sprawami — nie scalaj automatycznie.
- Wiersz z potencjalnym duplikatem — pokaż konflikt do decyzji, nie nadpisuj automatycznie.
- Potwierdzenie partial import — użytkownik wie, które wiersze zostaną pominięte i dlaczego.
- Powtórny import tego samego wsadu — ochrona przed przypadkową duplikacją, przy czym dokładna identyfikacja/import retry jest `OPEN-035`.
- Awaria w połowie zapisu — wymagana decyzja o efekcie i raportowaniu; **nie obiecuj rollbacku**, dopóki nie rozstrzygnięto `OPEN-010`.

## Rozróżnienie importu danych od faktów biznesowych

Status lub data z arkusza mogą odzwierciedlać stan historyczny, ale import nie potwierdza każdej brakującej akcji biznesowej. Rozróżnij weryfikowalny wpis źródłowy od przypuszczalnego przejścia; sposób oznaczania pochodzenia historii należy doprecyzować w `OPEN-004/OPEN-022`.

## Reguły, UX, scenariusze

`DEC-033–037`, `BR-021–025`, `FR-IM-*`, `AC-IM-*`; `UX-007–009`, `UC-017`. Integracje: Lifecycle, Contacts/Company, Linki, Documents/History, Suggestions, Search.

## Decyzje blokujące

`OPEN-001/OPEN-002/OPEN-010/OPEN-022/OPEN-023/OPEN-024/OPEN-035`, limity `OPEN-007`, formaty dat `OPEN-037`. Wstępny opis nie jest specyfikacją atomicznego zapisu ani obsługi transakcji.
