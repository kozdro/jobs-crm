"use client";

import { useCallback, useEffect, useState } from "react";

/** Stores only the opaque operation id. A missing receipt is never proof of rollback. */
export function useReceiptRecovery(
  owner: string,
  scope: string,
  onSettled: () => Promise<void>,
) {
  const key = `jobs-crm.documents.pending.${owner}.${scope}`;
  const [requestId, setRequestId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let value: string | null = null;
    try {
      value = sessionStorage.getItem(key);
    } catch {
      /* Storage can be unavailable. */
    }
    if (value && /^[0-9a-f-]{36}$/i.test(value))
      void Promise.resolve().then(() => setRequestId(value));
  }, [key]);
  const begin = useCallback(
    (id: string) => {
      try {
        sessionStorage.setItem(key, id);
        if (sessionStorage.getItem(key) !== id) return false;
      } catch {
        return false;
      }
      setRequestId(id);
      return true;
    },
    [key],
  );
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* No persistent identifier to remove. */
    }
    setRequestId(null);
  }, [key]);
  const recover = useCallback(async () => {
    if (!requestId || recovering) return;
    setRecovering(true);
    setMessage("");
    try {
      const response = await fetch(
        `/documents/receipt?requestId=${encodeURIComponent(requestId)}`,
        { cache: "no-store", headers: { "x-expected-user-id": owner } },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !["found", "cancelled"].includes(result?.kind))
        throw new Error("unknown");
      clear();
      setMessage(
        result.kind === "found"
          ? "Potwierdzono poprzednią operację. Sprawdź aktualny stan."
          : "Poprzednią operację bezpiecznie anulowano.",
      );
      await onSettled();
    } catch {
      setMessage(
        "Nie udało się potwierdzić wyniku. Nie rozpoczynaj tej samej operacji ponownie; spróbuj sprawdzić wynik później.",
      );
    } finally {
      setRecovering(false);
    }
  }, [requestId, recovering, clear, onSettled, owner]);
  return { requestId, recovering, message, begin, clear, recover };
}
