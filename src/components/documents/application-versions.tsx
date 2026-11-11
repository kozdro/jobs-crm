"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/styles";
import { useReceiptRecovery } from "./use-receipt-recovery";
import { DocumentAudit } from "./document-audit";
import {
  SentVersionPicker,
  type SentVersionOption,
} from "./sent-version-picker";

type Reference = {
  id: string;
  eventId: string;
  versionId: string;
  versionNumber: number;
  status: "active" | "withdrawn" | "deleting" | "deleted";
  revision: number;
};
type Document = {
  name: string;
  isCv: boolean;
  versions: {
    id: string;
    number: number;
    label: string | null;
    status: string;
  }[];
};

export function ApplicationVersions({
  userId,
  caseId,
  eventId,
  eventRevision,
  voided,
}: {
  userId: string;
  caseId: string;
  eventId: string;
  eventRevision: number;
  voided: boolean;
}) {
  const [references, setReferences] = useState<Reference[] | null>(null);
  const [options, setOptions] = useState<SentVersionOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/documents/data?caseId=${encodeURIComponent(caseId)}`,
        { cache: "no-store", headers: { "x-expected-user-id": userId } },
      );
      if (!response.ok) throw new Error("unavailable");
      const body = await response.json();
      if (!Array.isArray(body.documents) || !Array.isArray(body.sent))
        throw new Error("invalid");
      const docs = body.documents as Document[];
      setReferences(
        (body.sent as Reference[]).filter((ref) => ref.eventId === eventId),
      );
      setOptions(
        docs
          .filter((doc) => doc.isCv)
          .flatMap((doc) =>
            doc.versions
              .filter((version) => version.status === "ready")
              .map((version) => ({
                id: version.id,
                documentName: doc.name,
                number: version.number,
                label: version.label,
              })),
          ),
      );
      setError(null);
    } catch {
      setReferences(null);
      setError("Nie udało się pobrać wskazań wersji CV.");
    }
  }, [caseId, eventId, userId]);
  const recovery = useReceiptRecovery(userId, `application.${eventId}`, load);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function save(action: string, fields: Record<string, unknown>) {
    if (pending || recovery.requestId) return;
    setPending(true);
    setError(null);
    setMessage("");
    try {
      const intent = { action, caseId, eventId, eventRevision, ...fields };
      const issued = await fetch("/documents/permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          expectedUserId: userId,
          operation: "sent",
          intent,
        }),
      });
      const grant = await issued.json().catch(() => null);
      if (
        !issued.ok ||
        grant?.kind !== "issued" ||
        typeof grant.requestId !== "string" ||
        typeof grant.permit !== "string" ||
        !grant.permit.startsWith(`${grant.requestId}.`)
      )
        throw new Error("permit-unavailable");
      if (!recovery.begin(grant.requestId)) {
        setError(
          "Nie można bezpiecznie zapisać identyfikatora operacji w tej sesji.",
        );
        return;
      }
      const response = await fetch("/documents/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ...intent,
          expectedUserId: userId,
          requestId: grant.requestId,
          permit: grant.permit,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || !["saved", "replayed"].includes(body.kind)) {
        setError(
          response.status === 409
            ? "Wpis zmienił się. Odśwież stronę i ponownie sprawdź wybór."
            : "Nie potwierdzono zmiany. Sprawdź stan przed ponowieniem.",
        );
        return;
      }
      setSelected([]);
      recovery.clear();
      setConfirmed(false);
      setEditing(null);
      setMessage("Wskazanie zapisano w historii.");
      await load();
    } catch {
      setError("Wynik zapisu jest nieznany. Sprawdź stan przed ponowieniem.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mt-3 rounded-md border border-border p-3 text-sm">
      <h4 className="font-medium">Wysłane wersje CV</h4>
      {recovery.requestId && (
        <div className="mt-2">
          <p>Poprzednia operacja może nadal trwać.</p>
          <button
            type="button"
            className={buttonStyles.secondary}
            disabled={recovery.recovering}
            onClick={() => void recovery.recover()}
          >
            Sprawdź wynik operacji
          </button>
        </div>
      )}
      <p role="status" aria-live="polite">
        {recovery.message}
      </p>
      <p className="mt-1 text-muted-foreground">
        Brak wskazania nie oznacza, że CV nie wysłano.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
      {references === null ? (
        <button
          type="button"
          className={`${buttonStyles.secondary} mt-2`}
          onClick={() => void load()}
        >
          Sprawdź wskazania
        </button>
      ) : (
        <>
          {references.length === 0 && (
            <p className="mt-2 text-muted-foreground">Nie wskazano wersji.</p>
          )}
          <ul>
            {references.map((ref) => {
              const option = options.find((item) => item.id === ref.versionId);
              return (
                <li key={ref.id} className="mt-2 border-t border-border pt-2">
                  <p>
                    {ref.status === "deleted"
                      ? `Wysłana wersja ${ref.versionNumber} — treść usunięta`
                      : ref.status === "deleting"
                        ? `Wysłana wersja ${ref.versionNumber} — trwa usuwanie`
                        : option
                          ? `${option.documentName} — wersja ${ref.versionNumber}`
                          : `Wersja ${ref.versionNumber}`}
                    {ref.status === "withdrawn" ? " — wskazanie wycofane" : ""}
                    {voided ? " — wpis unieważniony" : ""}
                  </p>
                  {!voided && ref.status !== "withdrawn" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        onClick={() => {
                          setEditing(ref.id);
                          setSelected([]);
                          setConfirmed(false);
                        }}
                      >
                        Skoryguj wskazanie
                      </button>
                      <button
                        type="button"
                        disabled={pending || Boolean(recovery.requestId)}
                        className={buttonStyles.secondary}
                        onClick={() => {
                          setEditing(`withdraw:${ref.id}`);
                          setConfirmed(false);
                        }}
                      >
                        Wycofaj wskazanie
                      </button>
                    </div>
                  )}
                  {editing === `withdraw:${ref.id}` && (
                    <div className="mt-2">
                      <p>Wycofanie zachowa audyt wcześniejszego wskazania.</p>
                      <button
                        type="button"
                        disabled={pending || Boolean(recovery.requestId)}
                        className={buttonStyles.secondary}
                        onClick={() =>
                          void save("sent-withdraw", {
                            referenceId: ref.id,
                            revision: ref.revision,
                          })
                        }
                      >
                        Potwierdź wycofanie
                      </button>
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        onClick={() => setEditing(null)}
                      >
                        Anuluj
                      </button>
                    </div>
                  )}
                  {editing === ref.id && (
                    <div className="mt-2">
                      <label>
                        Poprawna wersja
                        <select
                          className="ui-input mt-1"
                          value={selected[0] ?? ""}
                          onChange={(event) =>
                            setSelected(
                              event.target.value ? [event.target.value] : [],
                            )
                          }
                        >
                          <option value="">Wybierz wersję</option>
                          {options.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.documentName} — wersja {item.number}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={
                          pending ||
                          Boolean(recovery.requestId) ||
                          selected.length !== 1
                        }
                        className={buttonStyles.secondary}
                        onClick={() =>
                          void save("sent-correct", {
                            referenceId: ref.id,
                            revision: ref.revision,
                            versionId: selected[0],
                          })
                        }
                      >
                        Zapisz korektę
                      </button>
                      <button
                        type="button"
                        className={buttonStyles.secondary}
                        onClick={() => setEditing(null)}
                      >
                        Anuluj
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {!voided && !editing && (
            <details className="mt-2">
              <summary className="ui-link cursor-pointer py-2">
                Wskaż wysłane wersje CV
              </summary>
              <SentVersionPicker
                options={options.filter(
                  (option) =>
                    !references.some(
                      (ref) =>
                        ref.versionId === option.id && ref.status === "active",
                    ),
                )}
                selected={selected}
                onChange={setSelected}
                disabled={pending || Boolean(recovery.requestId)}
              />
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{" "}
                Potwierdzam, że wskazane wersje rzeczywiście wysłano z tą
                aplikacją.
              </label>
              <button
                type="button"
                disabled={
                  pending ||
                  Boolean(recovery.requestId) ||
                  !confirmed ||
                  selected.length === 0
                }
                className={`${buttonStyles.primary} mt-2`}
                onClick={() => void save("sent-add", { versionIds: selected })}
              >
                Zapisz wskazanie
              </button>
            </details>
          )}
        </>
      )}
      <p role="status" aria-live="polite" className="mt-2">
        {message}
      </p>
      <DocumentAudit eventId={eventId} userId={userId} />
    </div>
  );
}
