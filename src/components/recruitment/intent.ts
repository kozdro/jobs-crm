/** Only the operation identifier is persisted; private draft content stays in memory. */
export const intentStorageKey = "jobs-crm.manual-case.pending";
export type PendingIntent = { ownerId: string; requestId: string };
export type CaptureActionKind =
  "save_only" | "application" | "contact_inbound" | "contact_outbound";
export type CaptureAction =
  | { kind: "save_only" }
  | {
      kind: Exclude<CaptureActionKind, "save_only">;
      occurredOn: string | null;
      factConfirmed: true;
    };

/** Only an explicit fact confirmation can produce a fact-bearing command. */
export function makeCaptureAction(
  kind: CaptureActionKind | null,
  occurredOn: string,
  factConfirmed: boolean,
): CaptureAction | null {
  if (!kind) return null;
  if (kind === "save_only") return { kind };
  if (!factConfirmed) return null;
  return {
    kind,
    occurredOn: occurredOn || null,
    factConfirmed: true,
  };
}

export function captureActionLabel(kind: CaptureActionKind) {
  switch (kind) {
    case "save_only":
      return "Zapisz tylko sprawę";
    case "application":
      return "Rzeczywiście aplikowano";
    case "contact_inbound":
      return "Kontakt przychodzący (inbound)";
    case "contact_outbound":
      return "Kontakt wychodzący (outbound)";
  }
}

export function captureStatus(kind: CaptureActionKind) {
  return kind === "save_only" ? "Zapisane" : "Kontakt rozpoczęty";
}

/** A previous save-next choice only survives the same uncertain command or its warning. */
export function resolveSaveNext(
  choice: "save" | "save-next" | "confirm-duplicate",
  frozenRetry: boolean,
  previous: boolean,
) {
  if (choice === "confirm-duplicate" || (choice === "save" && frozenRetry))
    return previous;
  return choice === "save-next";
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePendingIntent(
  value: string | null,
  ownerId: string,
): PendingIntent | null {
  if (!value) return null;
  try {
    const item: unknown = JSON.parse(value);
    if (typeof item !== "object" || item === null || Array.isArray(item))
      return null;
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      record.ownerId !== ownerId ||
      typeof record.requestId !== "string" ||
      !uuid.test(record.requestId)
    )
      return null;
    return { ownerId, requestId: record.requestId };
  } catch {
    return null;
  }
}
