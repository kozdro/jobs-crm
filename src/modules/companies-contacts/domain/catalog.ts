import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

export type ProfileType = "organization" | "contact";
export type RelationType =
  "case-organization" | "case-contact" | "organization-contact";
export type CatalogProfile = {
  id: string;
  type: ProfileType;
  name: string;
  email: string | null;
  revision: number;
  created_at: string;
};
export type CatalogRelation = {
  id: string;
  type: RelationType;
  left_id: string;
  right_id: string;
  leftLabel: string;
  rightLabel: string;
  leftType: "case" | ProfileType;
  rightType: ProfileType;
  role: "employer" | "agency" | null;
  active: boolean;
  revision: number;
};
export type CatalogCommand = {
  requestId: string;
  operation:
    "create-profile" | "edit-profile" | "attach" | "detach" | "change-role";
  profileType?: ProfileType;
  profileId?: string;
  name?: string;
  email?: string | null;
  expectedRevision?: number;
  relationType?: RelationType;
  leftId?: string;
  rightId?: string;
  role?: "employer" | "agency" | null;
  relationId?: string;
  acknowledgedMatches?: string[];
};
export type CatalogResult =
  | {
      kind: "saved" | "replayed";
      profile?: CatalogProfile;
      relation?: CatalogRelation;
    }
  | { kind: "duplicates"; matches: CatalogProfile[]; matchToken: string[] };
export type CatalogAudit = {
  id: string;
  request_id: string;
  operation: string;
  target_id: string;
  recorded_at: string;
  before_values: unknown;
  after_values: unknown;
};
export const catalogPageSize = 25;
export function normalizedCatalogName(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
}
export function normalizedCatalogEmail(value: string) {
  return value.trim().toLowerCase();
}
export function parseCatalogCommand(value: unknown): CatalogCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const allowed = [
    "requestId",
    "operation",
    "profileType",
    "profileId",
    "name",
    "email",
    "expectedRevision",
    "relationType",
    "leftId",
    "rightId",
    "role",
    "relationId",
    "acknowledgedMatches",
  ];
  if (
    Object.keys(r).some((k) => !allowed.includes(k)) ||
    typeof r.requestId !== "string" ||
    !uuidPattern.test(r.requestId)
  )
    return null;
  const op = r.operation;
  if (
    ![
      "create-profile",
      "edit-profile",
      "attach",
      "detach",
      "change-role",
    ].includes(op as string)
  )
    return null;
  const keys =
    op === "create-profile" || op === "edit-profile"
      ? [
          "requestId",
          "operation",
          "profileType",
          "profileId",
          "name",
          "email",
          "expectedRevision",
          "acknowledgedMatches",
        ]
      : op === "attach"
        ? [
            "requestId",
            "operation",
            "relationType",
            "leftId",
            "rightId",
            "role",
          ]
        : op === "detach"
          ? ["requestId", "operation", "relationId", "expectedRevision"]
          : [
              "requestId",
              "operation",
              "relationId",
              "expectedRevision",
              "role",
            ];
  if (Object.keys(r).some((k) => !keys.includes(k))) return null;
  const out: Record<string, unknown> = { ...r };
  if (op === "create-profile" || op === "edit-profile") {
    if (r.profileType !== "organization" && r.profileType !== "contact")
      return null;
    if (typeof r.name !== "string") return null;
    const name = r.name.trim();
    if (Array.from(name).length < 1 || Array.from(name).length > 160)
      return null;
    out.name = name;
    const email =
      r.email === undefined || r.email === null || r.email === ""
        ? null
        : typeof r.email === "string"
          ? r.email.trim() || null
          : undefined;
    if (
      email === undefined ||
      (email !== null &&
        (r.profileType !== "contact" ||
          Array.from(email).length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)))
    )
      return null;
    out.email = email;
    if (
      r.acknowledgedMatches !== undefined &&
      (!Array.isArray(r.acknowledgedMatches) ||
        r.acknowledgedMatches.some(
          (x) => typeof x !== "string" || !/^[0-9a-f-]{36}:[0-9]+$/i.test(x),
        ))
    )
      return null;
    if (
      op === "create-profile" &&
      (r.profileId !== undefined || r.expectedRevision !== undefined)
    )
      return null;
    if (
      op === "edit-profile" &&
      (typeof r.profileId !== "string" || !uuidPattern.test(r.profileId))
    )
      return null;
  }
  if (op === "attach") {
    if (
      !["case-organization", "case-contact", "organization-contact"].includes(
        r.relationType as string,
      ) ||
      [r.leftId, r.rightId].some(
        (id) => typeof id !== "string" || !uuidPattern.test(id),
      )
    )
      return null;
    if (
      r.relationType === "case-organization"
        ? !["employer", "agency"].includes(r.role as string)
        : r.role !== undefined && r.role !== null
    )
      return null;
  }
  if (op === "detach" || op === "change-role") {
    if (typeof r.relationId !== "string" || !uuidPattern.test(r.relationId))
      return null;
  }
  if (
    op === "change-role" &&
    !["employer", "agency"].includes(r.role as string)
  )
    return null;
  if (op === "edit-profile" || op === "detach" || op === "change-role")
    if (
      !Number.isSafeInteger(r.expectedRevision) ||
      (r.expectedRevision as number) < 0
    )
      return null;
  return out as CatalogCommand;
}
