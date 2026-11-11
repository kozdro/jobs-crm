"use client";

import { useState } from "react";
import { buttonStyles } from "@/components/ui/styles";

type Entry = {
  id: string;
  kind: string;
  recordedAt: string;
  revision: number | null;
  versionNumber: number | null;
  versionId: string | null;
  availability: string | null;
};
const labels: Record<string, string> = {
  rename: "Poprawiono dane dokumentu",
  label: "Poprawiono etykietę wersji",
  "sent-add": "Wskazano wysłaną wersję",
  "sent-correct": "Skorygowano wskazanie wysłanej wersji",
  "sent-withdraw": "Wycofano wskazanie wysłanej wersji",
};

export function DocumentAudit({
  documentId,
  eventId,
  userId,
}: {
  documentId?: string;
  eventId?: string;
  userId: string;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  async function load() {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const key = documentId ? "documentId" : "eventId";
      const response = await fetch(
        `/documents/audit?${key}=${encodeURIComponent(documentId ?? eventId ?? "")}`,
        { cache: "no-store", headers: { "x-expected-user-id": userId } },
      );
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.entries))
        throw new Error("unavailable");
      setEntries(body.entries);
    } catch {
      setEntries(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="mt-2"
      onToggle={(event) => {
        if (event.currentTarget.open && !loading) void load();
      }}
    >
      <summary className="ui-link min-h-11 cursor-pointer py-2 text-sm">
        Historia korekt dokumentu
      </summary>
      {loading && (
        <p role="status" className="text-sm">
          Pobieranie historii…
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm">
          <p>Nie udało się pobrać historii korekt.</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            onClick={() => void load()}
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
      {entries && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak korekt.</p>
      )}
      {entries && entries.length > 0 && (
        <ul className="space-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id}>
              <p>
                {labels[entry.kind] ?? "Zapisano zmianę dokumentu"}
                {entry.versionNumber !== null
                  ? ` — wersja ${entry.versionNumber}`
                  : ""}
                {entry.versionId
                  ? ` — identyfikator wersji: ${entry.versionId}`
                  : ""}
                {entry.availability === "deleted" ? " — treść usunięta" : ""}
              </p>
              <time dateTime={entry.recordedAt}>{entry.recordedAt}</time>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
