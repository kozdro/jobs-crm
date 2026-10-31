# Companies & Contacts — kontrakt interakcji DEC-058

**Zakres zatwierdzony:** 1A/2A/3A [analizy](../technical/companies-contacts-analysis.md), FR/AC-CC-001–006/008/011, BR-001/002/016/018/019/027/028/030, UX-013/014. Bez historii osób i komunikacji.

Listy Firmy/Kontakty mają własne strony, puste stany, paginację i jawny formularz dodania. Profil zawiera zapisane dane, przycisk edycji oraz jawne relacje i prywatny audyt techniczny. Nazwy wyświetlane jako tekst, e-mail opcjonalny; formularze nie zapisują szkiców w browser storage ani URL. Dane pozostają wyłącznie w pamięci aktywnego formularza, pod obecną granicą sesji.

Nazwa firmy lub kontaktu jest jedynym wymaganym polem. Długość 1–160 znaków po trim, kontakt może podać e-mail do 254. Zapis wymaga przycisku. Błędy pól są opisane przy polu i ogłoszone przez alert, focus kierowany do komunikatu. Anulowanie nie mutuje danych. Podczas zapisu formularz jest zablokowany przed drugą wysyłką; niepewny wynik zamraża dokładny zamiar i pozwala sprawdzić lub ponowić go z tym samym kluczem. Nie obiecujemy trwałości szkicu po opuszczeniu strony. Konflikt wersji wymaga pobrania aktualnego profilu i ponownego świadomego zapisu.

Ostrzeżenie „Możliwe duplikaty” pokazuje tylko własne profile z linkami do ich otwarcia. Użytkownik może wykorzystać profil przez jawne powiązanie na jego stronie albo potwierdzić „Zapisz jako odrębny profil”. Nowe dopasowania wymagają nowego ostrzeżenia. Edycja danych usuwa poprzednią zgodę. Brak automatycznego scalenia lub nadpisania wybranego istniejącego profilu.

Relacje występują na profilu firmy/osoby i detalu sprawy. Selektor wybiera jedynie własne istniejące rekordy, z paginacją obejmującą całą bazę. Rola firmy jest jawnie wybierana przy relacji do sprawy: pracodawca albo agencja. Brak pracodawcy pozostaje brakiem relacji. Organizacja–kontakt oznacza zapisane powiązanie, bez deklaracji zatrudnienia. Odłączenie i korekta roli wymagają jawnego potwierdzenia, obejmują również zakończone sprawy i nie zmieniają lifecycle ani historycznego uczestnictwa.

Lista aktywnych relacji udostępnia kontekstowe linki. Audyt zmian jest oddzielony od historii biznesowej i stronicowany. Komunikat przy osobie i relacjach wyjaśnia, że powiązanie nie oznacza udziału w zdarzeniach; brak listy zdarzeń nie jest twierdzeniem o braku rzeczywistych kontaktów.

Istniejący visual language, natywne etykiety, przyciski i selecty, logiczna kolejność klawiatury, focus po otwarciu/odrzuceniu/odpowiedzi i zawijanie treści na 375/768/1024/1440. Paginacja i odczyty mają loading/error/retry; błąd nie jest prezentowany jako pusta lista. Testy runtime: plan QA, nie wynik tego dokumentu.

Recovery: po niepewnym wyniku potwierdzonego osobnego profilu poprzednie ostrzeżenie nie uprawnia do ponownego potwierdzenia z nowym kluczem. Przycisk jest zablokowany; dostępne pozostają sprawdzenie i retry dokładnie tego samego zamiaru. Odświeżenie danych profilu zachowuje ostatnio potwierdzony profil wyłącznie dla tego samego użytkownika i zapytania, aby nie odmontować aktywnego edytora relacji. Błąd odświeżenia jest jawny, dane są oznaczone jako ostatnio potwierdzone; zmiana właściciela lub profilu nie przenosi tego cache między kontekstami.
