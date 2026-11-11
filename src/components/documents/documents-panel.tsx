"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonStyles, inputStyles } from "@/components/ui/styles";
import { DocumentUploadForm, type DocumentUploadDraft } from "./upload-form";
import { useReceiptRecovery } from "./use-receipt-recovery";
import { DocumentAudit } from "./document-audit";
import { fingerprintFile } from "./upload-fingerprint";
import { notifyDocumentsChanged } from "./document-events";
import { createRequestGeneration } from "./refresh-state";

type Version = {
  id: string;
  number: number;
  label: string | null;
  filename: string | null;
  status: "pending" | "ready" | "deleting" | "deleted" | "error";
  revision: number;
};
type Document = {
  id: string;
  name: string;
  isCv: boolean;
  scope: "library" | "case";
  revision: number;
  versions: Version[];
};
type Link = { id: string; caseId: string; versionId: string; revision: number };
type Preview = {
  token: string;
  affectedCases: { id: string; title: string }[];
  affectedApplications: {
    id: string;
    caseId: string;
    caseTitle: string;
    occurredOn: string | null;
  }[];
};
type Data = { documents: Document[]; links: Link[] };
type UploadMode = "library" | "case" | "library-and-case" | "version";

export function DocumentsPanel({
  userId,
  caseId,
}: {
  userId: string;
  caseId?: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<UploadMode | null>(null);
  const [versionDocument, setVersionDocument] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [editName, setEditName] = useState("");
  const [editCv, setEditCv] = useState(false);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [switchLink, setSwitchLink] = useState<string | null>(null);
  const [switchVersion, setSwitchVersion] = useState("");
  const [lastCaseDocument, setLastCaseDocument] = useState<string | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const uploadHeading = useRef<HTMLHeadingElement>(null);
  const requests = useRef(createRequestGeneration());
  const mutatingRef = useRef(false);

  const load = useCallback(async () => {
    if (mutatingRef.current) return;
    const request = requests.current.next();
    setLoading(true);
    try {
      const query = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
      const response = await fetch(`/documents/data${query}`, {
        cache: "no-store",
        headers: { "x-expected-user-id": userId },
      });
      if (!response.ok) throw new Error("unavailable");
      const body = await response.json();
      if (!requests.current.isCurrent(request)) return;
      if (!Array.isArray(body.documents) || !Array.isArray(body.links))
        throw new Error("invalid");
      setData(body);
      setError(null);
    } catch {
      if (!requests.current.isCurrent(request)) return;
      setData(null);
      setError("Nie udało się pobrać dokumentów. Spróbuj ponownie.");
    } finally {
      if (requests.current.isCurrent(request)) setLoading(false);
    }
  }, [caseId, userId]);
  const recovery = useReceiptRecovery(
    userId,
    caseId ?? "library",
    useCallback(async () => {
      notifyDocumentsChanged(userId);
      await load();
    }, [load, userId]),
  );
  useEffect(() => {
    void Promise.resolve().then(load);
    const current = requests.current;
    return () => current.invalidate();
  }, [load]);
  useEffect(() => {
    if (
      !data?.documents.some((doc) =>
        doc.versions.some(
          (version) =>
            version.status === "pending" || version.status === "deleting",
        ),
      )
    )
      return;
    const timer = window.setInterval(() => {
      notifyDocumentsChanged(userId);
      void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [data, load, userId]);
  useEffect(() => {
    if (preview) requestAnimationFrame(() => previewHeading.current?.focus());
  }, [preview]);
  useEffect(() => {
    if (mode) requestAnimationFrame(() => uploadHeading.current?.focus());
  }, [mode, versionDocument]);
  async function command(action: string, fields: Record<string, unknown>) {
    if (busy || recovery.requestId) return null;
    let requestId = crypto.randomUUID();
    let permit: string | undefined;
    const mutating = action !== "preview-delete";
    setBusy(true);
    setError(null);
    setStatus("");
    try {
      if (mutating) {
        mutatingRef.current = true;
        const issued = await fetch("/documents/permit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            expectedUserId: userId,
            operation: action === "delete-confirm" ? "delete" : "document",
            intent:
              action === "delete-confirm"
                ? { previewToken: fields.previewToken }
                : { action, ...fields },
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
        requestId = grant.requestId;
        permit = grant.permit;
      }
      if (mutating && !recovery.begin(requestId)) {
        setError(
          "Nie można bezpiecznie zapisać identyfikatora operacji w tej sesji.",
        );
        return null;
      }
      if (mutating) {
        requests.current.invalidate();
        if (action === "delete-confirm") setData(null);
        notifyDocumentsChanged(userId, true);
      }
      const response = await fetch("/documents/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          action,
          expectedUserId: userId,
          requestId,
          ...(permit ? { permit } : {}),
          ...fields,
        }),
      });
      const result = await response.json().catch(() => null);
      if (
        !response.ok ||
        !result ||
        !["saved", "replayed"].includes(result.kind)
      ) {
        setError(
          response.status === 409
            ? "Dane zmieniły się. Odśwież i ponownie sprawdź działanie."
            : "Nie potwierdzono operacji. Sprawdź stan przed ponowieniem.",
        );
        return null;
      }
      if (mutating) recovery.clear();
      return result;
    } catch {
      setError("Wynik operacji jest nieznany. Sprawdź stan przed ponowieniem.");
      return null;
    } finally {
      if (mutating) {
        mutatingRef.current = false;
        requests.current.invalidate();
        notifyDocumentsChanged(userId);
        void load();
      }
      setBusy(false);
    }
  }
  async function upload(draft: DocumentUploadDraft) {
    if (!mode || busy || recovery.requestId) return;
    setBusy(true);
    setError(null);
    setStatus("");
    let submitted = false;
    try {
      const fingerprint = await fingerprintFile(draft.file);
      const intent = {
        scope: mode,
        ...(caseId ? { caseId } : {}),
        ...(versionDocument ? { documentId: versionDocument } : {}),
        ...(mode === "version" ? {} : { name: draft.name, isCv: draft.isCv }),
        label: draft.label || null,
        ...fingerprint,
      };
      const issued = await fetch("/documents/permit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          expectedUserId: userId,
          operation: "upload",
          intent,
        }),
      });
      const permit = await issued.json().catch(() => null);
      if (
        !issued.ok ||
        typeof permit?.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          permit.requestId,
        ) ||
        typeof permit.permit !== "string" ||
        !permit.permit.startsWith(`${permit.requestId}.`)
      )
        throw new Error("permit-unavailable");
      if (!recovery.begin(permit.requestId)) {
        setError(
          "Nie można bezpiecznie zapisać identyfikatora operacji w tej sesji.",
        );
        return;
      }
      const body = new FormData();
      body.set("file", draft.file);
      body.set(
        "intent",
        JSON.stringify({
          ...intent,
          expectedUserId: userId,
          requestId: permit.requestId,
          permit: permit.permit,
        }),
      );
      submitted = true;
      mutatingRef.current = true;
      requests.current.invalidate();
      notifyDocumentsChanged(userId, true);
      const response = await fetch("/documents/upload", {
        method: "POST",
        body,
        cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (
        !response.ok ||
        !result ||
        !["saved", "replayed"].includes(result.kind)
      ) {
        setError(
          result?.kind === "quota"
            ? "Brak miejsca w limicie konta. Istniejące pliki pozostały bez zmian."
            : "Nie potwierdzono dodania pliku. Sprawdź jego stan przed ponowieniem.",
        );
        return;
      }
      setMode(null);
      recovery.clear();
      setVersionDocument(null);
      setStatus("Przesyłanie przyjęto. Sprawdź stan weryfikacji pliku.");
      await load();
    } catch {
      setError(
        submitted
          ? "Wynik przesyłania jest nieznany. Sprawdź stan przed ponowieniem."
          : "Nie udało się przygotować przesyłania. Plik nie został wysłany.",
      );
    } finally {
      if (submitted) {
        mutatingRef.current = false;
        notifyDocumentsChanged(userId);
        void load();
      }
      setBusy(false);
    }
  }
  async function beginDelete(fields: Record<string, string>) {
    setPreview(null);
    setConfirmed(false);
    const result = await command("preview-delete", fields);
    if (
      result?.preview?.token &&
      Array.isArray(result.preview.affectedCases) &&
      Array.isArray(result.preview.affectedApplications)
    )
      setPreview(result.preview);
    else if (result) setError("Nie udało się odczytać skutków usunięcia.");
  }
  async function finishDelete() {
    if (!preview || !confirmed) return;
    const result = await command("delete-confirm", {
      previewToken: preview.token,
    });
    if (result) {
      setPreview(null);
      setConfirmed(false);
      setStatus("Rozpoczęto usuwanie. Fizyczna kasacja wymaga potwierdzenia.");
      await load();
    }
  }
  const linked = new Set(data?.links.map((link) => link.versionId) ?? []);
  return (
    <section
      className="ui-panel mt-5 min-w-0 p-5 sm:p-6"
      aria-labelledby={caseId ? "case-documents-heading" : "documents-heading"}
    >
      <h2
        id={caseId ? "case-documents-heading" : "documents-heading"}
        className="text-lg font-semibold"
      >
        {caseId ? "Dokumenty sprawy" : "Biblioteka dokumentów"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Powiązanie dokumentu ze sprawą nie oznacza, że został wysłany.
      </p>
      <div role="status" aria-live="polite" className="mt-2 text-sm">
        {status}
      </div>
      {recovery.requestId && (
        <div className="mt-3 rounded-md border border-warning bg-warning-surface p-3 text-sm">
          <p>
            Poprzednia operacja może nadal trwać. Sprawdź wynik przed kolejnym
            zapisem.
          </p>
          <button
            type="button"
            disabled={recovery.recovering}
            className={`${buttonStyles.secondary} mt-2`}
            onClick={() => void recovery.recover()}
          >
            Sprawdź wynik operacji
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-sm">
        {recovery.message}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && <p className="mt-3 text-sm">Pobieranie dokumentów…</p>}
      {!loading && !data && (
        <button
          type="button"
          onClick={() => void load()}
          className={`${buttonStyles.secondary} mt-3`}
        >
          Spróbuj ponownie
        </button>
      )}
      {data && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonStyles.secondary}
              disabled={loading}
              onClick={() => void load()}
            >
              Odśwież stan
            </button>
            {!caseId && (
              <button
                type="button"
                className={buttonStyles.primary}
                onClick={() => {
                  setMode("library");
                  setVersionDocument(null);
                }}
              >
                Dodaj dokument
              </button>
            )}
            {caseId && (
              <>
                <button
                  type="button"
                  className={buttonStyles.secondary}
                  onClick={() => {
                    setMode("case");
                    setVersionDocument(null);
                  }}
                >
                  Dodaj plik tylko do sprawy
                </button>
                <button
                  type="button"
                  className={buttonStyles.secondary}
                  onClick={() => {
                    setMode("library-and-case");
                    setVersionDocument(null);
                  }}
                >
                  Dodaj do biblioteki i sprawy
                </button>
              </>
            )}
          </div>
          {mode && (
            <div className="mt-4 rounded-md border border-border p-4">
              <h3
                ref={uploadHeading}
                tabIndex={-1}
                className="mb-3 font-medium outline-none focus:ring-2 focus:ring-ring"
              >
                {mode === "version" ? "Dodaj nową wersję" : "Dodaj dokument"}
              </h3>
              <DocumentUploadForm
                key={`${mode}:${versionDocument}`}
                onSubmit={upload}
                pending={busy || Boolean(recovery.requestId)}
                versionOnly={mode === "version"}
              />
              <button
                type="button"
                disabled={busy || Boolean(recovery.requestId)}
                className={`${buttonStyles.secondary} mt-3`}
                onClick={() => {
                  setMode(null);
                  setVersionDocument(null);
                }}
              >
                Anuluj
              </button>
            </div>
          )}
          {data.documents.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Brak dokumentów.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {data.documents.map((doc) => (
              <li key={doc.id} className="rounded-md border border-border p-4">
                <h3 className="font-medium [overflow-wrap:anywhere]">
                  {doc.name}
                  {doc.isCv ? " · CV" : ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {doc.scope === "library" ? "Biblioteka" : "Tylko sprawa"}
                </p>
                {doc.versions.some((version) => version.status === "ready") && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonStyles.secondary}
                      onClick={() => {
                        setEditing(doc);
                        setEditName(doc.name);
                        setEditCv(doc.isCv);
                      }}
                    >
                      Popraw dane
                    </button>
                    <button
                      type="button"
                      className={buttonStyles.secondary}
                      onClick={() => {
                        setMode("version");
                        setVersionDocument(doc.id);
                      }}
                    >
                      Dodaj wersję
                    </button>
                    <button
                      type="button"
                      className={buttonStyles.secondary}
                      onClick={() => void beginDelete({ documentId: doc.id })}
                    >
                      Usuń dokument
                    </button>
                  </div>
                )}
                {editing?.id === doc.id && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void (async () => {
                        const result = await command("rename", {
                          documentId: doc.id,
                          revision: doc.revision,
                          name: editName.trim(),
                          isCv: editCv,
                        });
                        if (result) {
                          setEditing(null);
                          setStatus("Dane dokumentu poprawiono.");
                          await load();
                        }
                      })();
                    }}
                  >
                    <label className="block text-sm">
                      Nazwa
                      <input
                        className={`${inputStyles} mt-1`}
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editCv}
                        onChange={(event) => setEditCv(event.target.checked)}
                      />{" "}
                      To jest CV
                    </label>
                    <button
                      disabled={busy || Boolean(recovery.requestId)}
                      className={buttonStyles.primary}
                    >
                      Zapisz poprawkę
                    </button>
                    <button
                      type="button"
                      className={buttonStyles.secondary}
                      onClick={() => setEditing(null)}
                    >
                      Anuluj
                    </button>
                  </form>
                )}
                <ul className="mt-3 space-y-3">
                  {doc.versions.map((version) => (
                    <li
                      key={version.id}
                      className="border-t border-border pt-3 text-sm"
                    >
                      <p>
                        Wersja {version.number}
                        {version.label ? ` · ${version.label}` : ""}
                        {version.filename ? ` · ${version.filename}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {version.status === "ready"
                          ? "Dostępna"
                          : version.status === "deleting"
                            ? "Usuwanie"
                            : version.status === "deleted"
                              ? "Treść usunięta"
                              : version.status === "error"
                                ? "Błąd — operacja oczekuje"
                                : "Przetwarzanie"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {version.status === "ready" && (
                          <>
                            <a
                              href={`/documents/download/${encodeURIComponent(version.id)}`}
                              className={buttonStyles.secondary}
                            >
                              Pobierz
                            </a>
                            <button
                              type="button"
                              className={buttonStyles.secondary}
                              onClick={() => {
                                setEditingVersion(version.id);
                                setEditLabel(version.label ?? "");
                              }}
                            >
                              Popraw etykietę
                            </button>
                            {caseId &&
                              doc.scope === "library" &&
                              !linked.has(version.id) && (
                                <button
                                  type="button"
                                  disabled={busy || Boolean(recovery.requestId)}
                                  className={buttonStyles.secondary}
                                  onClick={() =>
                                    void (async () => {
                                      if (
                                        await command("attach", {
                                          caseId,
                                          versionId: version.id,
                                        })
                                      ) {
                                        setStatus(
                                          "Wersję powiązano ze sprawą. Nie oznacza to wysłania.",
                                        );
                                        await load();
                                      }
                                    })()
                                  }
                                >
                                  Dołącz do sprawy
                                </button>
                              )}
                            {caseId &&
                              data.links
                                .filter((link) => link.versionId === version.id)
                                .map((link) => (
                                  <div
                                    key={link.id}
                                    className="flex flex-wrap gap-2"
                                  >
                                    <button
                                      key={link.id}
                                      type="button"
                                      disabled={
                                        busy || Boolean(recovery.requestId)
                                      }
                                      className={buttonStyles.secondary}
                                      onClick={() =>
                                        void (async () => {
                                          if (
                                            doc.scope === "case" &&
                                            data.links.filter((candidate) =>
                                              doc.versions.some(
                                                (item) =>
                                                  item.id ===
                                                  candidate.versionId,
                                              ),
                                            ).length === 1
                                          ) {
                                            setLastCaseDocument(doc.id);
                                            return;
                                          }
                                          if (
                                            await command("detach", {
                                              caseId,
                                              linkId: link.id,
                                              revision: link.revision,
                                            })
                                          ) {
                                            setStatus("Odłączono od sprawy.");
                                            await load();
                                          }
                                        })()
                                      }
                                    >
                                      Odłącz od sprawy
                                    </button>
                                    <button
                                      type="button"
                                      className={buttonStyles.secondary}
                                      onClick={() => {
                                        setSwitchLink(link.id);
                                        setSwitchVersion("");
                                      }}
                                    >
                                      Zmień wersję
                                    </button>
                                    {switchLink === link.id && (
                                      <div className="space-y-2">
                                        <label className="block">
                                          Nowa wersja
                                          <select
                                            className="ui-input"
                                            value={switchVersion}
                                            onChange={(event) =>
                                              setSwitchVersion(
                                                event.target.value,
                                              )
                                            }
                                          >
                                            <option value="">
                                              Wybierz wersję
                                            </option>
                                            {doc.versions
                                              .filter(
                                                (candidate) =>
                                                  candidate.id !== version.id &&
                                                  candidate.status === "ready",
                                              )
                                              .map((candidate) => (
                                                <option
                                                  key={candidate.id}
                                                  value={candidate.id}
                                                >
                                                  Wersja {candidate.number}
                                                  {candidate.label
                                                    ? ` · ${candidate.label}`
                                                    : ""}
                                                </option>
                                              ))}
                                          </select>
                                        </label>
                                        <button
                                          type="button"
                                          disabled={
                                            busy ||
                                            Boolean(recovery.requestId) ||
                                            !switchVersion
                                          }
                                          className={buttonStyles.secondary}
                                          onClick={() =>
                                            void (async () => {
                                              if (
                                                await command(
                                                  "change-version",
                                                  {
                                                    caseId,
                                                    linkId: link.id,
                                                    revision: link.revision,
                                                    versionId: switchVersion,
                                                  },
                                                )
                                              ) {
                                                setSwitchLink(null);
                                                setStatus(
                                                  "Wersję powiązania zmieniono; historia wysłania pozostaje bez zmian.",
                                                );
                                                await load();
                                              }
                                            })()
                                          }
                                        >
                                          Potwierdź zmianę
                                        </button>
                                        <button
                                          type="button"
                                          className={buttonStyles.secondary}
                                          onClick={() => setSwitchLink(null)}
                                        >
                                          Anuluj
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                            <button
                              type="button"
                              disabled={busy || Boolean(recovery.requestId)}
                              className={buttonStyles.secondary}
                              onClick={() =>
                                void beginDelete({ versionId: version.id })
                              }
                            >
                              Usuń treść wersji
                            </button>
                          </>
                        )}
                      </div>
                      {editingVersion === version.id && (
                        <form
                          className="mt-3 space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void (async () => {
                              if (
                                await command("label", {
                                  versionId: version.id,
                                  revision: version.revision,
                                  label: editLabel.trim() || null,
                                })
                              ) {
                                setEditingVersion(null);
                                setStatus("Etykietę poprawiono.");
                                await load();
                              }
                            })();
                          }}
                        >
                          <label className="block">
                            Etykieta wersji
                            <input
                              className={`${inputStyles} mt-1`}
                              value={editLabel}
                              onChange={(event) =>
                                setEditLabel(event.target.value)
                              }
                            />
                          </label>
                          <button
                            disabled={busy || Boolean(recovery.requestId)}
                            className={buttonStyles.primary}
                          >
                            Zapisz poprawkę
                          </button>
                          <button
                            type="button"
                            className={buttonStyles.secondary}
                            onClick={() => setEditingVersion(null)}
                          >
                            Anuluj
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <DocumentAudit documentId={doc.id} userId={userId} />
              </li>
            ))}
          </ul>
        </>
      )}
      {lastCaseDocument && (
        <div
          role="group"
          aria-label="Ostatnie powiązanie dokumentu tylko dla sprawy"
          className="mt-4 space-y-3 rounded-md border border-warning bg-warning-surface p-4"
        >
          <p className="text-sm">
            To ostatnie powiązanie dokumentu przechowywanego tylko w tej
            sprawie. Wybierz usunięcie treści albo anuluj.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => {
                const id = lastCaseDocument;
                setLastCaseDocument(null);
                void beginDelete({ documentId: id });
              }}
            >
              Zobacz skutki usunięcia treści
            </button>
            <button
              type="button"
              className={buttonStyles.secondary}
              onClick={() => setLastCaseDocument(null)}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
      {preview && (
        <div
          role="group"
          aria-labelledby="document-delete-heading"
          className="mt-4 space-y-3 rounded-md border border-warning bg-warning-surface p-4"
        >
          <h3
            id="document-delete-heading"
            ref={previewHeading}
            tabIndex={-1}
            className="font-semibold outline-none focus:ring-2 focus:ring-ring"
          >
            Potwierdź usunięcie treści
          </h3>
          <p className="text-sm">
            Usunięcie jest nieodwracalne. Nowe pobrania zostaną zablokowane;
            historia aplikowania pozostanie.
          </p>
          <p className="text-sm">
            Powiązane sprawy: {preview.affectedCases.length}; fakty aplikowania:{" "}
            {preview.affectedApplications.length}.
          </p>
          <ul className="text-sm">
            {preview.affectedCases.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
          {preview.affectedApplications.length > 0 && (
            <>
              <p className="text-sm font-medium">
                Powiązane fakty aplikowania:
              </p>
              <ul className="space-y-1 text-sm">
                {preview.affectedApplications.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="ui-link"
                      href={`/recruitments/${encodeURIComponent(item.caseId)}#history-entry-${encodeURIComponent(item.id)}`}
                    >
                      {item.caseTitle} — {item.occurredOn ?? "data nieznana"}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            Potwierdzam usunięcie treści w przedstawionym zakresie.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!confirmed || busy || Boolean(recovery.requestId)}
              onClick={() => void finishDelete()}
              className={buttonStyles.primary}
            >
              Usuń treść
            </button>
            <button
              type="button"
              disabled={busy || Boolean(recovery.requestId)}
              onClick={() => {
                setPreview(null);
                setConfirmed(false);
              }}
              className={buttonStyles.secondary}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
