# Visual Design Research — Jobs CRM

Data badania: **2026-10-30**. Autor: `ux-designer`, model/reasoning dziedziczone, dokładne metadane `NOT EXPOSED`. Autoryzacja: zadanie PO UI Foundation & UX Polish, [DEC-053](../decisions/product-decisions.md). To badanie eksperckie i eksploracja, nie badanie usability z użytkownikami.

## Metoda i ograniczenia

Najpierw zbadano oficjalne materiały pokazujące UI rekordów i codziennych operacji, następnie utworzono kierunki. Kryterium doboru: dwa lżejsze CRM (Attio, folk), operacyjny Inbox (Intercom), zarządzanie pracą z dużą liczbą rekordów (Linear), dokumenty i bazy (Notion), uzupełniająco dojrzały CRM (Pipedrive). Nie wyciągano wniosków o aplikacji z marketingowego hero. Żadnego produktu nie testowano na zalogowanym koncie: obserwacje dotyczą publicznych ekranów/demonstracji, nie pomiarów rzeczywistej wydajności, wszystkich responsywnych widoków czy deklaracji WCAG konkurencji. Nie ustalano fontów produktów ze screenshotu; można ocenić charakter typografii, ale nie potwierdzić rodziny.

Własne warianty to rzeczywisty HTML/CSS z identycznym DOM i syntetycznymi danymi. Zmieniane są powierzchnie, rytm, typografia, promienie, akcent i stany. To prototypy wizualne: przyciski i menu nie dowodzą działania aplikacji. Finalna aplikacja jest osobno sprawdzana w [raporcie](../technical/ui-foundation-report.md).

## Źródła i obserwacje

Każdy poniższy wiersz odczytano **2026-10-30**. Zachowane PNG w `evidence/research/` są oficjalnymi screenshotami lub pierwszą klatką oficjalnego GIF; nie są naszymi renderami ani wygenerowanymi obrazami. Nie przypisujemy dacie dostępu daty wykonania screenshotu.

| Produkt / źródło | Rzeczywiście obejrzany materiał | Obserwacja i zastosowanie w Jobs CRM |
| --- | --- | --- |
| [Attio — nawigacja](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace) | [Sidebar i tabela firm](evidence/research/attio.png), [oryginalny PNG](https://a.storyblok.com/f/234930/626x921/27b93190df/attio-sidebar.png) | Jasna nawigacja oddzielona cienką pionową linią; zaznaczenie modułu spokojną plamą, ikony obiektów i niebieskie URL mają inne role. Wiersze i stabilne kolumny zastępują karty. Jobs CRM przejmuje stały rytm i wyraźny wybór modułu, ale nie wielopoziomowe menu ani mnogość kolorów obiektów. |
| [folk — profil kontaktu](https://help.folk.app/en/articles/5007276-contact-profile) | [Pierwsza klatka demonstracji profilu](evidence/research/folk.png); źródłowy GIF `Contact profile - side peak` osadzony w artykule | Nazwa rekordu dominuje nad działaniami; atrybuty po lewej, kontekst po prawej; proste separatory, mało koloru i kompaktowe przyciski obrysowe. Jobs CRM wykorzystuje rozdzielenie opisu i metadanych oraz hierarchię nazwa → kontekst. Emoji, awatary i historia interakcji nie są przenoszone. |
| [Linear — custom views](https://linear.app/docs/custom-views) | [Issue and Project Views](evidence/research/linear.png), [oryginalny PNG](https://webassets.linear.app/images/ornj730p/production/6588c3dbdde8688ffd192a47210980e8e1a3c4fc-2494x1021.png) | Ten konkretny ekran jest ciemny: oceniamy rytm, nie proponujemy dark mode. Powtarzalne grupy, cienkie podziały, jedna mocna akcja i zwarte metadane zwiększają skanowalność. Otoczenie obrazka ma gradient, robocze UI go nie potrzebuje. Dla Jobs CRM: reguły hierarchii i gęstości bez małego tekstu i naśladowania stylu. |
| [Intercom — Inbox](https://www.intercom.com/help/en/articles/6258745-the-inbox-explained) | [Pierwsza klatka demonstracji Inbox](evidence/research/intercom.png); `CleanShot 2026-04-24 at 07_20_37` osadzony w artykule | Stała nawigacja, lista, główna treść i kontekst są przestrzennie rozdzielone. Kolor ostrzeżenia jest lokalny i połączony z tekstem; akcje drugorzędne są dyskretne. Jobs CRM przejmuje semantyczne komunikaty i podział treści; czterech paneli nie potrzebuje. Małe ikony z tego zrzutu nie stanowią wzorca wielkości celów dotykowych. |
| [Notion — views, filters and sorts](https://www.notion.com/help/views-filters-and-sorts) | [Widok tabeli z menu layoutu](evidence/research/notion.png), [oryginalny PNG](https://images.ctfassets.net/spoqsaf9291f/nfJxbTGWexijW7BSAEPZL/a39afeb87300553e7fb97fc7006d320d/layouts.png) | Tekst, podziały i powtarzalne wiersze niosą większość informacji. Niebieski wyróżnia utworzenie i wybraną opcję menu; lista i menu mają odrębne hierarchie. Jobs CRM wykorzystuje zwięzłe menu i wyraźną akcję primary; duży dokumentowy tytuł nie jest właściwy dla każdego ekranu. |
| [Pipedrive — deals](https://support.pipedrive.com/en/article/deals-what-they-are-and-how-to-add-them) | Odczytano tekst oficjalnej dokumentacji; pobranie screenshotów z CDN zwróciło 403 — **obrazy NOT OBSERVED** | Materiał potwierdza różne punkty tworzenia rekordu i istnienie listy/detalu. Brak podstaw do oceniania tutaj palety, proporcji lub typografii Pipedrive. Nie wpływa na punktację wizualną. |
| [GOV.UK — colour](https://design-system.service.gov.uk/styles/colour/) | Oficjalna dokumentacja kolorów funkcjonalnych | Kolory mają nazwane role; fokus, błąd, tekst i brand wymagają odrębnych kontraktów. Przejmujemy zasadę semantycznych tokenów, nie paletę ani stylistykę urzędową. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Normatywne wymagania AA i formuła kontrastu | Tekst zwykły ≥4.5:1, duży ≥3:1; istotne granice kontrolek i fokus ≥3:1; reflow 320 CSS px, klawiatura, fokus bez zasłonięcia, rozmiary celów zgodnie z 2.5.8, komunikaty nie tylko kolorem. Pełna zgodność nie wynika z samego pomiaru palety. |

## Audyt baseline Jobs CRM

Kod przed zmianą (`aa496fc`): jednokolumnowy `Workspace`, nawigacja tekstowymi linkami ponad treścią, brak trwałego modułowego sidebara. Neutralna paleta jest czytelna i nie wymaga „naprawy koloru”, ale nie definiuje primary, komunikatów ani hierarchii nawigacji. Duży blok operacji sesji konkuruje z Dashboardem. Powtarzanie całych opisów w listach i jednolita waga metadanych ograniczają skanowanie. Formularze mają właściwy kontrakt DEC-052; ich logika nie wymaga przeprojektowania.

Największą poprawę daje shell, proporcje, typografia i powtarzalność stanów. Kolor jest ich wsparciem, nie substytutem. Nie potrzeba hero z metrykami, wielkich zaokrąglonych kafelków ani ilustracji pustego stanu.

## Wyprowadzone kierunki

Kierunki powstały po analizie powyższych materiałów. Nazwy są roboczymi nazwami projektu interfejsu, nie nowym brandingiem produktu.

| Kandydat | Filozofia i cały system | Koszt/ryzyko |
| --- | --- | --- |
| A — operacyjny | Chłodne neutralne powierzchnie, niebieski primary, wyraźniejsze rozdzielenie nav/treść, sans na wszystkich poziomach, 28 px rytm strony, 8 px radius, zwarte wiersze. Inspirowany wyraźną hierarchią narzędzi rekordowych. | Bardzo szybkie skanowanie, ale charakter bliższy wielu typowym systemom B2B. Akcent może przypominać zwykły link; wymaga konsekwentnego hierarchy. |
| B — spokojna przestrzeń pracy | Delikatnie mineralne neutralne tła, biały obszar danych, głęboki petrol jako akcja i focus, tonowane zaznaczenie nav, sans, 32 px rytm, 6 px radius, wiersze z zachowaniem miejsca dla długich polskich treści. | Nieco mniej wierszy w viewport niż A. Zielony akcent trzeba oddzielić od wyniku biznesowego: status zawsze ma tekst, a zapisanie sprawy nie oznacza pomyślnej rekrutacji. |
| C — dokumentowy | Prawie monochromatyczny, biały canvas, subtelnie ciepły sidebar, atramentowy primary, serif tylko w tytułach, 36 px rytm, 2 px radius, sekcje dzielone liniami zamiast obudowy kart. | Wyrazisty i spokojny, lecz tytuły zajmują więcej miejsca, a sama różnica kroju słabiej skaluje się do operacyjnych widoków. Ryzyko odbioru jako edytor dokumentów. |

Każdy wariant używa tych samych: App Shell, Dashboard, listy trzech spraw, szczegółów tej samej sprawy, rozwiniętego kroku danych Quick Capture oraz komponentów/menu/komunikatów. Stan sprawy to wyłącznie **Zapisane**. Prototyp nie poszerza kontraktu: rozwinięte pola opcjonalne nie usuwają produkcyjnego „Więcej szczegółów”. Dashboard bez statystyk i sztucznej aktywności. Ten sam układ funkcjonalny, kolejność danych i teksty pozwalają porównać system, nie atrakcyjność treści.

Źródło reprodukcji: [candidates.html](../../experiments/ui-foundation/candidates.html). Parametry: `?theme=a|b|c&screen=dashboard|list|detail|capture|components`. To izolowana eksploracja poza routami aplikacji; produkcja ma jeden jasny system.

## Macierz oceny

Skala ekspercka 1–5: 1 = poważne niedopasowanie, 3 = poprawne z kompromisami, 5 = bardzo dobre w zadanym zakresie. Waga w procentach: czytelność 15, hierarchia 15, ergonomia 15, dostępność 15, gęstość 10, spójność 10, profesjonalizm 5, skalowalność 5, odróżnialność 5, anti-AI-slop 5. Priorytetem są codzienne odczyt/utworzenie sprawy, nie demonstracyjny efekt. Obiektywne bramki (kontrast, overflow) mają pierwszeństwo przed sumą punktów.

### Wyniki pomiarów i renderów

QA uruchomiło `scripts/ui-candidates.mjs`: **90 renderów** (3 kierunki × 5 ekranów × szerokości 1440/1024/768/375/320/720 CSS px). [measurements.json](evidence/candidates/measurements.json) zawiera hash źródła, rzeczywisty `innerWidth`/`scrollWidth`, szerokość kontenera, kontrasty tekstu obliczone z DOM z alpha-compositing oraz fokus. Zero wykrytych poziomych overflow, zero niezgodnych próbek kontrastu tekstu i zero brakujących obrysów focus-visible w badanym zakresie. 320/720 są testem równoważnej szerokości reflow, **nie testem rzeczywistego browser zoom**.

Designer obejrzał wszystkie **30 screenshotów** (3 × 5 × desktop/mobile), np. [A lista](evidence/candidates/a-list-1440.png), [B lista](evidence/candidates/b-list-1440.png), [C lista](evidence/candidates/c-list-1440.png), [B mobile](evidence/candidates/b-list-375.png), [B Quick Capture](evidence/candidates/b-capture-375.png). Wszystkie kierunki mają wystarczający kontrast; zatem paleta nie daje sama w sobie obiektywnego zwycięzcy. Pomiary B: tekst/biel 14.33:1, metadata/biel 6.17:1, metadata/sidebar 5.41:1, biel/primary 7.16:1, primary/selected 5.80:1, input/biel 3.66:1. Szczegóły wszystkich wariantów są w JSON.

W oglądzie ujawniono wspólne ograniczenie prototypów: data listy została pominięta na mobile. **W produkcji data musi pozostać widoczna**, w osobnym wierszu. W długich listach podkreślone kolorowe tytuły i pełne URL dodają szumu. Produkcja: neutralny semibold tytuł z hover/focus, opis do dwóch linii, etykieta URL z hostname i ikoną przy zachowaniu dokładnego href; pełny URL w detalu. Te korekty ergonomii dotyczą tej samej filozofii B i nie zmieniają danych ani dostępności rekordu. Prototypy zachowano jako porównywalny materiał wejściowy.

### Ocena ekspercka — nie pomiar naukowy

| Kryterium | Waga | A | B | C |
| --- | ---: | ---: | ---: | ---: |
| Czytelność | 15 | 5 | 5 | 4 |
| Hierarchia | 15 | 5 | 5 | 4 |
| Ergonomia | 15 | 4 | 5 | 4 |
| Dostępność w badanym zakresie | 15 | 5 | 5 | 5 |
| Gęstość informacji | 10 | 5 | 4 | 4 |
| Spójność | 10 | 5 | 5 | 4 |
| Profesjonalizm | 5 | 5 | 5 | 4 |
| Skalowalność | 5 | 5 | 5 | 4 |
| Odróżnialność | 5 | 3 | 4 | 5 |
| Anti-AI-slop | 5 | 4 | 5 | 5 |
| **Ważona średnia / 5** | **100** | **4.70** | **4.85** | **4.25** |

Punktacja to jawna ocena projektanta dla konkretnego zadania. Nie oznacza opinii użytkowników, zmierzonego komfortu wielogodzinnej pracy ani przewagi statystycznej. Wszystkie kierunki unikają gradientów, dekoracji i kart z fikcyjnymi KPI. A otrzymuje mniej za odróżnialność ze względu na powszechny schemat niebieskiego B2B; C za operacyjną spójność ze względu na mieszaną typografię dokumentową; B za gęstość ze względu na luźniejszy rytm niż A. Preferencja spokojnego mineralnego tła B jest częściowo subiektywna; obiektywnymi warunkami są kontrast i reflow.

### Werdykt designera

**Wybrano B — spokojną przestrzeń pracy.** To bliska konkurencja A/B, nie bezdyskusyjny wynik liczbowy. B zachowuje porządek narzędzia rekordowego, a mniej chłodne powierzchnie i dyskretny petrol nadają osobistemu CRM własny ton bez ozdobników. Prawie cały ekran pozostaje neutralny. Sans działa jednakowo dla krótkich nazw, długich polskich tytułów i formularzy; 6 px promień nie narzuca karcianego wyglądu każdemu fragmentowi treści.

A jest najlepszą alternatywą, gdy priorytetem będzie maksymalna gęstość i bardzo techniczna praca tabelaryczna. Nie uzasadnia to drugiego motywu produkcyjnego. C ma najmocniejszy charakter typograficzny, ale odczyt długiego nagłówka i przejście między dokumentem a kontrolkami są mniej jednorodne. Akceptowany kompromis B: nieco więcej pionowego miejsca niż A; w produkcji redukujemy koszt przez zwarty wiersz, krótką etykietę URL i skrót opisu. Bez zmiany biznesowego statusu czy walidacji. Finalne tokeny i kontrakty: [visual-language.md](visual-language.md).

## Wzorce i antywzorce dla Jobs CRM

Wykorzystać: stałe miejsce nawigacji, łagodne zaznaczenie modułu i `aria-current`; stabilną kolumnę metadanych; jedną dominującą akcję w kontekście; opis osobno od technicznej daty zapisu; dyskretne menu konta; neutralne, konkretne puste stany; stałe etykiety pól; błędy z tekstem i zachowaniem danych; małe promienie i separatory.

Unikać: logo/emoji dla każdej pustej sprawy, etykietowania prywatnego Dashboardu fikcyjnymi KPI, kart na każdy atrybut, dekoracyjnych gradientów i cieni, statusu przekazanego wyłącznie kolorem, małego szarego tekstu dla ważnej daty, ukrywania akcji wyłącznie po hover, nowych funkcji narysowanych jako aktywne. Nie przenosimy filtrów, wyszukiwarki, historii, Kanbana ani wzbogacania danych z badanych produktów.
