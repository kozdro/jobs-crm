# Documents Core — stan wykonania i dowodów

**Data:** 2026-11-11. **Baza:** `b28877e49abae95cd68b0ed13c9a840011859e05`. **Decyzja:** DEC-065 (1A/2A/3A/4A), ADR-0015. **Status:** w toku; ten dokument nie stwierdza akceptacji slice'a. Draft PR #29; bez merge, deploymentu i produkcyjnego provisioningu.

Zakres obejmuje FR/AC-DO-001–010 i AC-DO-065-01–06, BR-026/030, UC/TC-003/018/031/034, UX-005/012 i F04/F10. Implementacja zmienia bibliotekę, sprawy, historię application, prywatny Storage, quota, kasację i izolowany runner. Treść plików nie jest indeksowana przez Global Search. Globalne usunięcie konta i pełny produkcyjny backup/DR pozostają poza zakresem.

## Dowody i ograniczenia

| Kontrola | Stan i zakres dowodu |
| --- | --- |
| Izolowany Storage, role i runner | **PASS częściowy** na roboczych checkpointach: rzeczywiste HTTP/bytes, A/B/anon, operacje operatorów, zakaz signed URL/list/copy, izolowane kontenery oraz smoke i scenariusze awarii cleanup. Pełnej macierzy na końcowym SHA jeszcze nie wykazano. |
| Upgrade | **PASS częściowy**: izolowany upgrade 23→54 migracji i świeże migracje w toku pracy; nie jest to dowód finalnego SHA. |
| Integracje i przeglądarka | Na wcześniejszym checkpointcie integracje **242/242 PASS**, Playwright **230 PASS / 7 FAIL**. Poprawiono selektory Documents i nieaktualną nawigację; celowane Documents, Calendar, Search i UI Foundation przeszły. Dwa wcześniejsze FAIL Calendar i pierwotny wynik runnera nie zostały wymazane zielonym retry. Pełny runner po wszystkich poprawkach **NOT RUN**. |
| Kontrole jakości | Na roboczym diffie po `4225b3c`: lint, typecheck, format, boundaries, canary oraz unit **716 Vitest + 111 Node PASS**. Nie przenosi to wyników na późniejsze SHA. Wcześniejsze FAIL typów, formatu i starych oczekiwań testowych poprawiono i zachowano w lokalnych logach QA. |
| Recovery i restore | **PASS częściowy**: lokalna sekwencyjna symulacja dwóch własnych targetów z rzeczywistym Storage, w tym retry po utracie odpowiedzi oraz ślad sent. Nie dowodzi rzeczywistego backupu, live cutover ani produkcyjnego DR. |
| Niezależny review | Pierwszy review backend/frontend/security **FAIL**; kolejne findings obejmowały walidację aktywnych plików, tożsamość wersji i synchronizację UI. Poprawki wymagają ponownej oceny na końcowym SHA. Sesja review dla `535050a` była zakłócona równoległą zmianą cache Vitest i nie zamyka bramki. |
| Hosted CI | **NOT RUN / oczekuje** dla końcowego kandydata. Green CI musi dotyczyć dokładnego końcowego SHA. |

Ponowny review `4225b3c` był **FAIL**: security wskazał PDF SubmitForm, frontend brak synchronizacji historii i otwartego audytu. Na późniejszym roboczym diffie syntetyczny SubmitForm został odrzucony (content **31/31 PASS**), a świeży build i celowany E2E z rzeczywistym Storage potwierdziły aktualizację otwartego audytu po korekcie i kasacji bez przeładowania strony (**1/1 PASS**). Poprawki wymagają jeszcze niezależnej oceny na nowym SHA. Wcześniejszy test autora dla PDF miał FAIL z błędnie zbudowanym fixture; po korekcie przeszedł.

**BLOCKED — pełna kwalifikacja 3A:** obsługa wszystkich starszych DOC, kodowań TXT i aktywnych payloadów nie jest udowodniona. Nie wolno przedstawiać ograniczonego parsera jako zatwierdzonego zawężenia. Rzeczywiste wyniki, nowe findings i identyfikator końcowego kandydata trzeba dopisać po wykonaniu wymaganych kontroli; brakujący test pozostaje NOT RUN, a nie PASS.
