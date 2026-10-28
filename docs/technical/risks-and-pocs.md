# Ryzyka techniczne, produktowe i potencjalne PoC

**Stan:** `PROPOSED` — ocena ryzyk i propozycje ograniczenia, nie zobowiązanie do tworzenia infrastruktury. PoC mają służyć tylko trudnym niewiadomym.

| Ryzyko | Co może pójść źle | Kontekst | Potencjalny sposób weryfikacji (`PROPOSED`) |
|---|---|---|---|
| RISK-01 — fałszywa historia | Import lub korekta produkuje rzekome aplikacje, rozmowy i daty. | `BR-007/BR-015/BR-016/BR-024`, `OPEN-004/OPEN-022` | Weryfikacja modelu zdarzeń na syntetycznych sekwencjach przypadków E2E. |
| RISK-02 — niespójne statusy i etapy | DnD i zaproszenia prowadzą do niemożliwych kombinacji. | `OPEN-018/OPEN-020/OPEN-034`, `BR-004–008` | Tabela decyzji dla interakcji status–etap, uzupełniona po PO. |
| RISK-03 — częściowy zapis importu | Awaria w połowie importu duplikuje lub gubi część danych. | `OPEN-010/OPEN-035`, `BR-023/BR-025` | Minimalny PoC: atomowe RPC/SQL bez trwałego stagingu + symulacja przerwania, rollback i retry; zgodnie z 1.28 A, 1.29 A, 1.30 B. |
| RISK-04 — pobieranie URL | SSRF, blokady portali, brak danych, parsowanie niezgodnej treści. | `NFR-009`, `OPEN-011/OPEN-025` | Testy SSRF/redirect/DNS, allowlist tylko zatwierdzonych domen (1.40 B), ewentualny Playwright po osobnym przeglądzie bezpieczeństwa. |
| RISK-05 — wyciek plików | Cudze CV, załączniki lub URL-e w logach i wyszukiwaniu; błędna izolacja kont lub sesji i odzyskiwania dostępu. | `NFR-001/NFR-004/NFR-010`, `OPEN-013/OPEN-032/OPEN-041/OPEN-042/OPEN-043/OPEN-044` | Threat modeling i testy kontroli dostępu, izolacji oraz granic sesji przed release; funkcje konta pozostają `PROPOSED`. |
| RISK-06 — rozjechanie historii kontaktu | Jeden uczestnik widzi zdarzenia bez udziału; powielone wpisy. | `BR-018/BR-019/BR-027`, `OPEN-030` | Test referencyjnych powiązań na dwóch sprawach i kilku uczestnikach. |
| RISK-07 — przeterminowane sugestie | Import starych spraw tworzy ogromną listę follow-upów. | `BR-009/BR-020/BR-024`, `OPEN-008` | Test wykluczenia reaktywnej automatyki w imporcie historycznym. |
| RISK-08 — przedwczesny SaaS | Niepotrzebna wielkość architektury utrudnia MVP. | `DEC-046/DEC-047`, `OPEN-012/OPEN-014` | Porównanie 2–3 wariantów pod kątem operacyjnych kosztów i migracji. |
| RISK-09 — niewyjaśnione usuwanie | Usunięcie CV/sprawy lub konta niszczy historię; eksport lub backup ujawnia dane albo pozostawia niejasne skutki retencji. | `OPEN-005/OPEN-006/OPEN-032/OPEN-036/OPEN-045/OPEN-046` | Model zależności oraz warianty ochrony eksportu, retencji i przywracania dopiero po zatwierdzeniu polityki; operacje konta `PROPOSED`. |

## Ryzyka procesowe SDD/AIDD

- `RISK-10`: agenci biorą `PROPOSED` za `APPROVED`; zapobieganie: [AGENTS.md](../../AGENTS.md), `OPEN` gates i review.
- `RISK-11`: dokumentacja rozjeżdża się z implementacją; zapobieganie: FR/AC w zadaniach i PR, testy traceability.
- `RISK-12`: nadmierna formalizacja staje się przeszkodą; zapobieganie: niewielkie dokumenty, stabilne ID, brak rejestru ADR dla każdej drobnostki.

## PoC wymagające zlecenia

W tym etapie **nie przeprowadzono PoC**. Wybór technologii zatwierdzono, jednak wykonanie PoC pozostaje **NOT EXECUTED**. Przed publicznym wdrożeniem wymagane są testy BFF/HttpOnly, atomowego RPC z RLS, ochrony URL i pełnego odtwarzania DB+Storage. Zob. [bramki](gates-and-impacts.md).
