/** Pure local DEV identity checks. No discovery heuristic authorizes mutation. */
import { sha256 } from "../recruitment/validation.ts";
import { planRecruitmentCleanup } from "../recruitment/cleanup-plan.ts";
import type { CleanupInventory } from "../recruitment/cleanup-plan.ts";
export const ports = {
  api: 56721,
  db: 56722,
  studio: 56723,
  mail: 56724,
  app: 3163,
} as const;
export const publishedPorts = {
  "5432/tcp": "56722",
  "8000/tcp": "56721",
  "3000/tcp": "56723",
  "8025/tcp": "56724",
} as const;
export const networkLabel = "jobs-crm.local-dev";
export interface DevManifest {
  owner: "jobs-crm-local-dev";
  projectId: string;
  networkId: string;
  workdir: string;
  configHash: string;
  migrationCheckpoint: string;
  schemaCheckpoint?: string;
  containers?: { id: string; name: string; imageId: string }[];
  volumes?: string[];
  networkIdentity?: string;
  volumeIdentities?: { name: string; createdAt: string }[];
  createdAt: string;
}
export function assertDevManifest(
  m: DevManifest,
  dir: string,
  config: string,
  template: string,
) {
  if (
    m.owner !== "jobs-crm-local-dev" ||
    !/^jobs-crm-dev-[a-f0-9]{12}$/.test(m.projectId) ||
    m.networkId !== `network-${m.projectId}` ||
    m.workdir !== dir ||
    m.configHash !== sha256(config) ||
    config !== template.replace("jobs-crm-dev-template", m.projectId) ||
    !/^[a-f0-9]{64}$/.test(m.migrationCheckpoint) ||
    (m.schemaCheckpoint !== undefined &&
      !/^[a-f0-9]{64}$/.test(m.schemaCheckpoint))
  )
    throw new Error(
      "Local DEV manifest/config identity drift; no resources changed. See local-development.md.",
    );
}
export function assertDevInventory(
  m: DevManifest,
  inventory: CleanupInventory,
  options: { complete?: boolean } = {},
) {
  const plan = planRecruitmentCleanup(m, inventory, {
    publishedPorts,
    networkLabel,
  });
  if (
    m.volumes &&
    JSON.stringify([...m.volumes].sort()) !==
      JSON.stringify(inventory.volumes.map((v) => v.Name).sort())
  )
    throw new Error("Local DEV volume identity drift");
  if (
    m.networkIdentity &&
    inventory.network &&
    m.networkIdentity !== inventory.network.Id
  )
    throw new Error("Local DEV immutable network identity drift");
  if (m.volumeIdentities)
    for (const v of inventory.volumes) {
      const recorded = m.volumeIdentities.find(
        (known) => known.name === v.Name,
      );
      if (
        !recorded ||
        recorded.createdAt !==
          (v as typeof v & { CreatedAt?: string }).CreatedAt
      )
        throw new Error("Local DEV immutable volume identity drift");
    }
  if (options.complete) {
    const names = [
      "db",
      "auth",
      "rest",
      "kong",
      "inbucket",
      "studio",
      "pg_meta",
    ]
      .map((s) => `/supabase_${s}_${m.projectId}`)
      .sort();
    if (
      !inventory.network ||
      JSON.stringify(inventory.containers.map((c) => c.Name).sort()) !==
        JSON.stringify(names)
    )
      throw new Error(
        "Local DEV service inventory incomplete; no automatic repair/reset",
      );
  }
  const expectedImages: Record<string, string> = {
    db: "postgres:17.11.0.006",
    auth: "gotrue:v2.197.0",
    rest: "postgrest:v16.5",
    kong: "kong:2.8.1",
    inbucket: "mailpit:v1.31.3",
    studio: "studio:2026.10.19-sha-b375769",
    pg_meta: "postgres-meta:v0.100.0",
  };
  for (const c of inventory.containers) {
    const extended = c as typeof c & {
      Config: { Image?: string; Cmd?: string[] };
      HostConfig: { AutoRemove?: boolean };
      State?: { Running: boolean };
      Mounts?: { Type: string; Name?: string; Destination?: string }[];
    };
    const service = c.Name.slice(
      "/supabase_".length,
      -`_${m.projectId}`.length,
    );
    const bootstrap =
      !options.complete &&
      !m.containers &&
      new RegExp(`^/supabase_auth_migrate_[a-f0-9]{12}_${m.projectId}$`).test(
        c.Name,
      );
    if (
      bootstrap &&
      (extended.HostConfig.AutoRemove !== true ||
        JSON.stringify(extended.Config.Cmd) !==
          JSON.stringify(["gotrue", "migrate"]) ||
        (extended.Mounts ?? []).length ||
        Object.values(c.HostConfig.PortBindings ?? {}).some(
          (bindings) => bindings?.length,
        ))
    )
      throw new Error("Local DEV bootstrap cleanup identity refused");
    const image = bootstrap ? "gotrue:v2.197.0" : expectedImages[service];
    if (
      !image ||
      !["public.ecr.aws/supabase/", "ghcr.io/supabase/", "supabase/"].some(
        (prefix) => extended.Config.Image === prefix + image,
      )
    )
      throw new Error("Local DEV service image pin mismatch");
    for (const mount of extended.Mounts ?? [])
      if (
        mount.Type !== "volume" ||
        !inventory.volumes.some((v) => v.Name === mount.Name)
      )
        throw new Error("Local DEV unexpected mount refused");
    if (
      service === "db" &&
      !(extended.Mounts ?? []).some(
        (mount) =>
          mount.Type === "volume" &&
          mount.Name === `supabase_db_${m.projectId}` &&
          mount.Destination === "/var/lib/postgresql/data",
      )
    )
      throw new Error("Local DEV persistent DB mount missing");
    const required: Record<string, [string, string]> = {
      db: ["5432/tcp", "56722"],
      kong: ["8000/tcp", "56721"],
      studio: ["3000/tcp", "56723"],
      inbucket: ["8025/tcp", "56724"],
    };
    if (required[service]) {
      const [port, host] = required[service];
      if (
        c.HostConfig.PortBindings?.[port]?.length !== 1 ||
        c.HostConfig.PortBindings[port][0].HostIp !== "127.0.0.1" ||
        c.HostConfig.PortBindings[port][0].HostPort !== host
      )
        throw new Error("Local DEV required requested binding missing");
      if (
        extended.State?.Running &&
        (c.NetworkSettings.Ports?.[port]?.length !== 1 ||
          c.NetworkSettings.Ports[port][0].HostIp !== "127.0.0.1" ||
          c.NetworkSettings.Ports[port][0].HostPort !== host)
      )
        throw new Error("Local DEV required effective binding missing");
    }
  }

  return plan;
}
export function assertResetConfirmation(
  m: DevManifest,
  confirmation: string | undefined,
) {
  if (confirmation !== m.projectId)
    throw new Error(
      `Reset refused. This deletes ALL Local DEV users, passwords, cases, mail and owned containers/volumes/network for ${m.projectId}. To confirm: pnpm dev:local:reset --confirm ${m.projectId}. Existing manual-dev and CI targets are excluded.`,
    );
}
