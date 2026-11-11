"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui/styles";
import {
  documentsChangedEvent,
  isDocumentsChangeFor,
  isDocumentsChangePending,
} from "./document-events";

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
  const opened = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const key = documentId ? "documentId" : "eventId";
      const response = await fetch(
        `/documents/audit?${key}=${encodeURIComponent(documentId ?? eventId ?? "")}`,
        { cache: "no-store", headers: { "x-expected-user-id": userId } },
      );
      const body = await response.json();
      if (request !== generation.current) return;
      if (!response.ok || !Array.isArray(body.entries))
        throw new Error("unavailable");
      setEntries(body.entries);
    } catch {
      if (request !== generation.current) return;
      setEntries(null);
      setError(true);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [documentId, eventId, userId]);
  useEffect(() => {
    const invalidate = (event: Event) => {
      if (!isDocumentsChangeFor(event, userId)) return;
      generation.current += 1;
      setEntries(null);
      setError(false);
      setLoading(false);
      if (opened.current && !isDocumentsChangePending(event)) void load();
    };
    window.addEventListener(documentsChangedEvent, invalidate);
    return () => {
      generation.current += 1;
      window.removeEventListener(documentsChangedEvent, invalidate);
    };
  }, [load, userId]);
  return (
    <details
      className="mt-2"
      onToggle={(event) => {
        opened.current = event.currentTarget.open;
        if (opened.current) void load();
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
