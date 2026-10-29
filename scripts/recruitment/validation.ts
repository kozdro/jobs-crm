/** Pure preflight checks; a mismatch refuses migration before the first mutation. */
import { createHash } from "node:crypto";
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** CLI 2.122.0 truncates local project IDs at 40 characters; preserve all random entropy. */
export function recruitmentProjectId(id: string, nonce: string) {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(id) || !/^[a-f0-9]{12}$/.test(nonce))
    throw new Error("Invalid Recruitment project identity");
  return `jobs-crm-recruitment-${sha256(id).slice(0, 6)}-${nonce}`;
}
export interface RecruitmentManifest {
  id: string;
  owner: "jobs-crm-recruitment-local";
  projectId: string;
  networkId: string;
  workdir: string;
  configHash: string;
  createdAt: string;
  migrationCheckpoint: string;
  containers?: { id: string; name: string; imageId: string }[];
}
export function assertRecruitmentManifest(
  m: RecruitmentManifest,
  id: string,
  directory: string,
  config: string,
  template: string,
  retiringPrestartTarget = false,
) {
  const currentName = new RegExp(
    `^jobs-crm-recruitment-${sha256(id).slice(0, 6)}-[a-f0-9]{12}$`,
  ).test(m.projectId);
  // Permit retirement of the recorded pre-start naming failure, never a runtime/migration target.
  const consumedName =
    retiringPrestartTarget &&
    m.projectId.length > 40 &&
    new RegExp(`^jobs-crm-recruitment-${id}-[a-f0-9]{12}$`).test(m.projectId);
  if (
    !/^[a-z][a-z0-9-]{0,30}$/.test(id) ||
    m.id !== id ||
    m.owner !== "jobs-crm-recruitment-local" ||
    m.workdir !== directory ||
    (!currentName && !consumedName) ||
    m.networkId !== `network-${m.projectId}` ||
    !/^[a-f0-9]{64}$/.test(m.migrationCheckpoint) ||
    sha256(config) !== m.configHash ||
    config !==
      template.replace("jobs-crm-recruitment-local-template", m.projectId)
  )
    throw new Error("Recruitment target manifest/config drift refused");
}
export interface LedgerRow {
  id: number | string;
  hash: string;
  created_at: number | string;
}
export interface MigrationIdentity {
  hash: string;
  folderMillis: number;
}
export const ledgerCheckpoint = (rows: readonly LedgerRow[]) =>
  sha256(
    JSON.stringify(
      rows.map((row) => ({
        id: Number(row.id),
        hash: row.hash,
        created_at: Number(row.created_at),
      })),
    ),
  );
export function assertMigrationLedger(
  ledger: readonly LedgerRow[],
  history: readonly MigrationIdentity[],
  checkpoint: string,
  complete = false,
) {
  if (
    !history.length ||
    history.some(
      (m, i) =>
        !/^[a-f0-9]{64}$/.test(m.hash) ||
        !Number.isSafeInteger(m.folderMillis) ||
        (i > 0 && m.folderMillis <= history[i - 1].folderMillis),
    )
  )
    throw new Error("Invalid Recruitment migration history refused");
  if (ledgerCheckpoint(ledger) !== checkpoint)
    throw new Error(
      "Recruitment migration ledger checkpoint tampering refused",
    );
  if (
    ledger.length > history.length ||
    (complete && ledger.length !== history.length) ||
    ledger.some(
      (row, i) =>
        row.hash !== history[i].hash ||
        Number(row.created_at) !== history[i].folderMillis,
    )
  )
    throw new Error("Recruitment migration history/ledger mismatch refused");
}
