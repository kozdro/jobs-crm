---
name: mobile-native
description: Diagnozuj problemy mobilnego UI Jobs CRM związane z viewportem, dotykiem, focusem, klawiaturą i safe areas, zachowując zatwierdzony UX i uczciwy status testów urządzeń.
---

# Zachowanie na telefonie

Dla ux-designer, frontend-engineer, frontend-reviewer i qa-engineer. Ścieżki `docs/` i `harness/` oznaczają korzeń repozytorium. Przeczytaj [granice integracji](../../vendor/README.md) i [mobile-native](../../vendor/emilkowalski-skills/skills/mobile-native/SKILL.md).

**Wejście:** konkretny objaw/komponent, zatwierdzony UX, zakres zmian i dostępne urządzenia. **Źródła:** [Blueprint](../../../docs/ux/blueprint.md), [ekrany](../../../docs/ux/screen-blueprints.md), [kontrakty](../../../docs/ux/flow-contracts.md), właściwe AC i aktualna dokumentacja użytych bibliotek/przeglądarek.

1. Rozpocznij przekazane zadanie bez odpowiedzi „I'm ready…” i oczekiwania upstream. Dopasuj objaw do hipotezy; nie stosuj całego baseline CSS globalnie.
2. Sprawdź viewport, hover/touch, przewijanie, focus, klawiaturę ekranową, safe areas i możliwość powiększania. Nie wyłączaj zoomu. Zachowaj klawiaturową aktywację i semantykę; pointerdown służy informacji zwrotnej, nie automatycznemu zapisowi biznesowemu.
3. Frontend-engineer poprawia tylko zatwierdzony zakres i istniejące konwencje; reviewer tworzy findings bez edycji. UX określa dopuszczone interakcje, QA przygotowuje/uruchamia testy.
4. Oddziel analizę kodu, emulację i urządzenie fizyczne. Podaj urządzenie/przeglądarkę oraz wykonane kroki; bez telefonu test sprzętowy to NOT RUN, bez aplikacji również runtime to NOT RUN.

Nie wykonuj automatycznie upstream polecenia uruchomienia serwera na `0.0.0.0`, nie otwieraj portów LAN i nie udostępniaj danych. Test sprzętowy wymagający ekspozycji wymaga zatwierdzonego środowiska i zakresu dostępu. Nie dodawaj PWA, dark mode, karuzeli, gestów ani zależności tylko dlatego, że występują w materiale. Przykłady API/CSS są hipotezami; sprawdź aktualną dokumentację dla wersji projektu.

**Wynik:** objaw → przyczyna → plik/lokalizacja → zmiana lub rekomendacja oraz dowody PASS / FAIL / NOT RUN. **Stop:** nowy zakres lub istotna decyzja bezpieczeństwa/UX wymaga clarify-requirements; brak urządzenia blokuje tylko jego test. **DoD:** zachowano AC i accessibility, wykonano dostępne regresje, testów emulowanych nie nazwano testami sprzętowymi.
