"use client";
import { useEffect } from "react";

/** Protect unsent input on reload, link navigation and browser history traversal. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const message =
      "Masz niezapisane ustawienia. Czy chcesz opuścić formularz?";
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const followLink = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (target && !window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const traverse = (event: Event) => {
      const navigationEvent = event as Event & { navigationType?: string };
      if (
        navigationEvent.navigationType === "traverse" &&
        event.cancelable &&
        !window.confirm(message)
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
      navigation?.removeEventListener("navigate", traverse);
    };
  }, [dirty]);
}
