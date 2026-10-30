# Jobs CRM — Visual Language

**2026-10-30.** Jeden jasny system interfejsu w zakresie [DEC-053](../decisions/product-decisions.md), wybrany przez delegowanego designera po [researchu i porównaniu renderów](visual-design-research.md). Nie jest finalnym brandingiem marketingowym. Nazwa Jobs CRM pozostaje; bez nowego logo, dark mode ani nowej architektury. OPEN-015/017/033 pozostają częściowo otwarte poza tym zakresem.

## Koncepcja

**Spokojna przestrzeń pracy (kandydat B).** Mineralny canvas, delikatnie przyciemniona nawigacja, białe obszary robocze, ciemny tekst i oszczędny petrol. Jakość wynika z rytmu, hierarchii i przewidywalnych stanów. Badane Attio/folk pokazały wartość separacji danych i kontekstu; Linear stabilny rytm rekordów, Intercom lokalne komunikaty, Notion czytelną hierarchię menu. Nie kopiujemy ich palet lub układów 1:1.

Kolor wybieramy po badaniu. Nie ma kilku produkcyjnych themes; warianty żyją wyłącznie w `experiments/ui-foundation` i dowodach QA.

## Paleta i semantyczne tokeny

Wartości OKLCH odpowiadają hex poniżej (zaokrąglenie 5 miejsc, odcień 2). Implementacja korzysta z ról CSS/`@theme inline`, nie z ręcznych kolorów w każdym komponencie.

| Rola CSS | HEX sRGB | OKLCH | Użycie |
| --- | --- | --- | --- |
| `background` | `#f7f8f6` | `0.97781 0.00284 128.49` | canvas |
| `foreground` | `#242c28` | `0.28394 0.01333 163.85` | podstawowy tekst |
| `card` / `primary-foreground` | `#ffffff` | `1 0 0` | powierzchnia / tekst na primary |
| `sidebar` / `secondary` | `#eef1ed` | `0.95475 0.00618 137.77` | nawigacja, secondary |
| `muted-foreground` | `#59645d` | `0.49151 0.01747 157.80` | opisy, metadata, helper |
| `border` | `#dce2dc` | `0.90650 0.01031 145.49` | dekoracyjne reguły i podziały |
| `input` | `#7b8980` | `0.61594 0.02111 157.55` | granica kontrolki |
| `primary` / `ring` | `#24624f` | `0.45013 0.07127 169.77` | akcja, link, fokus |
| `primary-hover` | `#194c3d` | `0.37755 0.06035 170.42` | hover/active primary |
| `accent` | `#dcebe3` | `0.92661 0.01918 162.91` | zaznaczona nawigacja, hover |
| `destructive` | `#a3332b` | `0.48671 0.14898 28.01` | błąd |
| `destructive-surface` | `#fff1f0` | `0.96886 0.01522 22.39` | tło błędu |
| `warning` | `#805c14` | `0.50020 0.09573 79.45` | duplikat / ostrzeżenie |
| `warning-surface` | `#fff7e4` | `0.97731 0.02636 87.85` | tło ostrzeżenia |
| `success` | `#246244` | `0.44702 0.08117 159.29` | potwierdzony sukces operacji |
| `success-surface` | `#eaf4ed` | `0.95770 0.01406 155.59` | tło sukcesu |

Aliasy: `card-foreground`, `secondary-foreground` = foreground; `accent-foreground` = primary. Dopuszczalne nazwy implementacyjne: `selected` = accent, `danger` = destructive, `danger-surface` = destructive-surface; są aliasami tej samej roli, nie dodatkowymi kolorami. Stan **Zapisane** ma zawsze tekst, nie sugeruje sukcesu rekrutacji. Można użyć stonowanego badge accent, bez ikony ukończonego procesu. Kolor sukcesu oznacza tylko potwierdzony zapis/operację. Reguła `border` nie identyfikuje sama pola formularza — służy do tego `input`.

Kontrasty bazowe: foreground/white **14.33**, muted/white **6.17**, muted/background **5.79**, muted/sidebar **5.41**, white/primary **7.16**, primary/accent **5.80**, input/white **3.66**, input/background **3.44**, destructive/destructive-surface **6.23**, warning/warning-surface **5.69**, success/success-surface **6.42**. Finalne computed style i stany są w raporcie QA; tabela nie zastępuje testu wszystkich miejsc użycia.

## Typografia, przestrzeń i powierzchnie

Bez nowej zależności fontowej i bez pobierania fontu: Arial, Helvetica, system sans fallback. Ten wybór daje stabilny, neutralny tekst z polskimi znakami, bez udawania własnego kroju. Body 15 px / 1.5; kontrolki/nav 14 px; metadata/helper 13 px / 1.5; nagłówek strony 28 px / 1.2 desktop i 24 px mobile, semibold; sekcja 18 px / 1.4; tytuł rekordu 15–16 px semibold. Długie nazwy zawijają się; ważny tytuł i pełny opis w detalu nie są obcinane.

Skala odstępów: 4, 8, 12, 16, 20, 24, 32, 40 px. Padding strony 32 px desktop, 16 px mobile; grupy formularza 20–24 px; kontrolki 8–12 px pionowo. Radius 6 px standard, 4 px badge, maksymalnie 8 px większe powierzchnie/dialogi. Cień tylko menu/popover/dialog dla warstwy, nie dla każdego rekordu. Podział 1 px, bez gradientów i poświat.

Panel oznacza grupę zadania, nie każdą wartość. Rekrutacje to wspólna powierzchnia z poziomymi podziałami. Wiersz: neutralny semibold tytuł → opis do dwóch linii → źródło jako hostname z ikoną zewnętrznego linku; dokładny href zachowany. Status i techniczna data w stabilnej kolumnie desktop, osobny widoczny wiersz mobile. Detal ma pełne dane, zawijany URL i opis, nie skróty.

## Komponenty i kontrakty

| Komponent / wejścia | Stany i interakcje | Responsywność / test |
| --- | --- | --- |
| AppShell / Workspace: `userId`, `title`, `children` | prywatność nadal kontrolowana istniejącym Auth; nawigacja nie zmienia sesji | sidebar 232 px od 768 px, ręczny collapse 64 px; topbar 72/64 px; content max1280 |
| Sidebar: aktualna ścieżka, collapsed | Dashboard/Rekrutacje aktywne; Zadania/Kalendarz/Dokumenty/Firmy/Kontakty jako tekst niedostępny, bez aktywnego href. Aktualna pozycja `aria-current=page`, nazwy przy ikonach i tooltip po collapse | zachowanie collapse podczas przejścia między istniejącymi modułami; mobile drawer z nazwą, Escape, pułapka i powrót fokusu |
| Topbar / AccountMenu | istniejący Dodaj/Quick Capture, menu konta + dostęp do `/account`; bez fikcyjnej wyszukiwarki. Menu udostępnia local logout i przejście do konta; `/account` zachowuje local/global/others bez zmiany znaczenia | dostępny trigger, Escape/strzałki/focus zgodnie z Base UI; przy logout dotychczasowy cleanup prywatnej treści |
| PageHeader | jedno h1, opcjonalny opis, kontekstowa nawigacja | wrap bez h-scroll i bez sztucznej wielkiej karty |
| Button | primary = potwierdzana główna czynność; secondary = powrót/anulowanie; ghost = nawigacja; hover/active przez tokeny, focus 2 px ring + offset2–3px; disabled natywne, wyłączone przy rzeczywistym pending | cel min44px dla głównych mobilnych akcji; etykiety zachowują istniejącą semantykę |
| Badge | wyłącznie istniejący status Zapisane, jawny tekst | badge nie jest przyciskiem; kolor nie jest jedyną informacją |
| EmptyState | konkretny brak istniejących danych + uczciwe CTA | bez fikcyjnych KPI/terminów/historii i bez ilustracyjnego hero |
| Form feedback / Toast | error tekstowy powiązany z polem; warning z tytułem duplikatu; sukces tylko po odpowiedzi backendu | kontrast + tekst, status/alert według ważności; toast nie zasłania kluczowych działań |

Konto i Auth korzystają z tych samych powierzchni i przycisków. Desktop może użyć spokojnego panelu wprowadzającego obok formularza, mobile pojedynczej kolumny. Bez marketingowych obietnic, nowego logo i dekoracyjnych assetów.

## Formularze — DEC-052 bez zmian

Quick Capture ma **Sytuacja → Dane → Działanie → Podsumowanie**. Stan bieżący kroku jest nazwany, widoczny bez samego koloru. Nie zmieniamy liczby kroków, pól, reguł walidacji, wykrywania duplikatów, idempotencji, retry/recovery ani dirty guard. Zachowujemy „Więcej szczegółów”, opcjonalność, istniejące wartości i pojedynczą dozwoloną akcję „Zapisz tylko sprawę”. Podsumowanie rozdziela etykietę i wartość; brak danych nie jest zastępowany domyślnym faktem.

Stałe etykiety nad polami; helper obok pola, błąd przypięty przez `aria-describedby`; widoczna granica input 3:1, fokus ring. Radio pozostaje natywnym radio z pełnym label. Wpisane dane pozostają po błędzie. Desktop modal skupia uwagę, mobile zajmuje pełen viewport i ma przewijanie wewnętrzne; nic nie zasłania ostatniej akcji. Focus wejścia/powrotu i potwierdzenie odrzucenia zostają zachowane.

## Accessibility i zasady dalszego stosowania

Cel: właściwe kryteria [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) — 1.3.1, 1.4.1/3/4/10/11/12, 2.1.1/2, 2.4.3/7/11, 2.5.8, 3.3.1/2, 4.1.2/3. Podstawowy tekst ≥4.5:1, istotne granice i fokus ≥3:1, brak znaczenia wyłącznie kolorem. Zachować skip link/main, logiczne nagłówki, nazwy ikon, dostępne dialogi, focus po zamknięciu i przy błędzie. Nie wyłączać browser zoom. Reduced motion nie wymaga animacji; domyślnie brak dekoracyjnego ruchu.

Przy nowym module najpierw istniejący FR/AC/DEC, następnie układ oparty na tym shellu i komponentach. Używać semantycznego tokenu odpowiedniego do roli; nową barwę dodawać dopiero gdy istniejące role nie wystarczają. Długie dane i 320px reflow testować przed zamknięciem pracy. Nie dodawać kafelków, statystyk ani nawigacji do funkcji, które nie istnieją. Nie zmieniać kolorów per moduł dla dekoracji.

Ograniczenia: brak badań z użytkownikami, potwierdzenia komfortu wielogodzinnego i testów fizycznego urządzenia/AT w samym wyborze systemu. Realne screenshoty, testy interakcji, accessibility i finalna ocena designera po implementacji: [raport techniczny](../technical/ui-foundation-report.md).
