import type { ContentConflict } from "./content-recovery";
import { canonicalCaseLink } from "./content-form-validation";
import { isCalendarDate } from "@/modules/recruitment/domain/case-events";
export type ConflictSnapshot = {
  id: string;
  case_id: string;
  revision: number;
  voided: boolean;
  source?: "legacy" | "additional";
  body?: string;
  date_kind?: "ordinary" | "historical";
  occurred_on?: string | null;
  created_at: string;
  url?: string;
  role?: string;
  position?: number;
};
export function readConflictSnapshot(
  value: unknown,
  conflict: ContentConflict,
  caseId: string,
): ConflictSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.id !== conflict.id ||
    row.case_id !== caseId ||
    typeof row.revision !== "number" ||
    !Number.isSafeInteger(row.revision) ||
    row.revision <= conflict.expectedRevision ||
    typeof row.voided !== "boolean" ||
    typeof row.created_at !== "string" ||
    !Number.isFinite(Date.parse(row.created_at))
  )
    return null;
  if (conflict.operation.endsWith("note")) {
    if (
      typeof row.body !== "string" ||
      !row.body.trim() ||
      !["ordinary", "historical"].includes(String(row.date_kind)) ||
      !(row.occurred_on === null || typeof row.occurred_on === "string")
    )
      return null;
    if (
      (row.date_kind === "ordinary" && row.occurred_on !== null) ||
      (typeof row.occurred_on === "string" && !isCalendarDate(row.occurred_on))
    )
      return null;
  } else {
    if (
      row.source !== conflict.source ||
      typeof row.url !== "string" ||
      canonicalCaseLink(row.url) !== row.url ||
      typeof row.role !== "string" ||
      typeof row.position !== "number" ||
      !Number.isSafeInteger(row.position) ||
      row.position < 0
    )
      return null;
  }
  return row as ConflictSnapshot;
}
/** Compare every mutable field before accepting a displayed snapshot. */
export function sameConflictSnapshot(a: ConflictSnapshot, b: ConflictSnapshot) {
  return (
    a.id === b.id &&
    a.case_id === b.case_id &&
    a.revision === b.revision &&
    a.voided === b.voided &&
    a.source === b.source &&
    a.body === b.body &&
    a.date_kind === b.date_kind &&
    a.occurred_on === b.occurred_on &&
    a.url === b.url &&
    a.role === b.role &&
    a.position === b.position &&
    a.created_at === b.created_at
  );
}
