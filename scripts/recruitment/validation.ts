/** Pure preflight checks; a mismatch refuses migration before the first mutation. */
import { createHash } from "node:crypto";
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const recruitmentPortProfiles = {
  legacy: { api: 56621, db: 56622, shadow: 56620, studio: 56623, smtp: 56624 },
  isolated: {
    api: 57021,
    db: 57022,
    shadow: 57020,
    studio: 57023,
    smtp: 57024,
  },
  storage: { api: 57121, db: 57122, shadow: 57120, studio: 57123, smtp: 57124 },
} as const;
export type RecruitmentPortProfile = keyof typeof recruitmentPortProfiles;

/** Render only the five known local listener ports; all other config is preserved byte-for-byte. */
export function recruitmentConfigForProfile(
  template: string,
  projectId: string,
  profile: RecruitmentPortProfile,
) {
  const ports = recruitmentPortProfiles[profile];
  let config = template.replace(
    "jobs-crm-recruitment-local-template",
    projectId,
  );
  const hasPortProfile = ["api", "db", "studio", "local_smtp"].every(
    (section) => config.includes(`[${section}]\n`),
  );
  if (!hasPortProfile) {
    if (profile === "legacy") return config;
    throw new Error("Recruitment config section missing");
  }
  const sections = [
    ["api", "port", ports.api],
    ["db", "port", ports.db],
    ["db", "shadow_port", ports.shadow],
    ["studio", "port", ports.studio],
    ["local_smtp", "port", ports.smtp],
  ] as const;
  for (const [section, key, port] of sections) {
    const heading = `[${section}]`;
    const start = config.indexOf(`${heading}\n`);
    if (start < 0) throw new Error("Recruitment config section missing");
    const bodyStart = start + heading.length + 1;
    const nextSection = config.indexOf("\n[", bodyStart);
    const bodyEnd = nextSection < 0 ? config.length : nextSection + 1;
    const body = config.slice(bodyStart, bodyEnd);
    const pattern = new RegExp(`(^${key} = )\\d+$`, "m");
    if (!pattern.test(body))
      throw new Error("Recruitment config port setting missing");
    config =
      config.slice(0, bodyStart) +
      body.replace(pattern, `$1${port}`) +
      config.slice(bodyEnd);
  }
  return config;
}
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
  /** Missing means the original fixed 566xx profile; new targets bind explicitly to isolated. */
  portProfile?: RecruitmentPortProfile;
  /** Storage is enabled only for targets created with the separate Storage template. */
  storage?: true;
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
    !["legacy", "isolated", "storage"].includes(m.portProfile ?? "legacy") ||
    (m.storage === true && m.portProfile !== "storage") ||
    (m.storage !== true && m.portProfile === "storage") ||
    (m.storage !== undefined && m.storage !== true) ||
    config !==
      recruitmentConfigForProfile(
        template,
        m.projectId,
        m.portProfile ?? "legacy",
      )
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
