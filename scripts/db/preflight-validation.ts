/** Pure assertions shared by the guarded F2 lifecycle and focused adversarial tests. */
import { createHash } from "node:crypto";
export interface TargetIdentity {
  id: string;
  owner: string;
  projectId: string;
  networkId: string;
  workdir: string;
  configHash: string;
  ports: { api: number; db: number };
}
export function assertManifest(
  m: TargetIdentity,
  id: string,
  dir: string,
  config: string,
) {
  if (
    m.id !== id ||
    m.owner !== "jobs-crm-foundation-f2" ||
    m.workdir !== dir ||
    !new RegExp(`^jobs-crm-f2-${id}-[a-f0-9]{12}$`).test(m.projectId) ||
    m.networkId !== `network-${m.projectId}` ||
    m.ports.api !== 56421 ||
    m.ports.db !== 56422
  )
    throw new Error("Target manifest identity mismatch");
  if (
    createHash("sha256").update(config).digest("hex") !== m.configHash ||
    !config.includes(`project_id = "${m.projectId}"`)
  )
    throw new Error("Target config tampering refused");
}
export function assertEndpoints(
  dbUrl: string,
  apiUrl: string,
  ports: { api: number; db: number },
) {
  const url = new URL(dbUrl);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error("Invalid DB protocol refused");
  if (
    url.hostname !== "127.0.0.1" ||
    Number(url.port) !== ports.db ||
    url.pathname !== "/postgres" ||
    url.username !== "postgres" ||
    apiUrl !== `http://127.0.0.1:${ports.api}` ||
    url.search ||
    url.hash
  )
    throw new Error("CLI target endpoint mismatch");
  return url;
}
export function assertPostgres(v: {
  db: string;
  current_user: string;
  version_num: number;
}) {
  if (
    v.db !== "postgres" ||
    v.current_user !== "postgres" ||
    Math.floor(v.version_num / 10000) !== 17 ||
    v.version_num < 170011
  )
    throw new Error("Database identity/version mismatch");
}
export interface ContainerIdentity {
  id: string;
  name: string;
  imageId: string;
}
export function assertContainerIdentities(
  actual: ContainerIdentity[],
  expected: ContainerIdentity[],
) {
  const sorted = (values: ContainerIdentity[]) =>
    [...values].sort((a, b) => a.name.localeCompare(b.name));
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted(expected)))
    throw new Error("Container identity/image drift refused");
}
export interface BindingContainer {
  Name: string;
  HostConfig: {
    PortBindings?: Record<
      string,
      { HostIp: string; HostPort: string }[] | null
    >;
  };
  NetworkSettings: {
    Ports?: Record<string, { HostIp: string; HostPort: string }[] | null>;
  };
}
export function assertBindings(
  containers: BindingContainer[],
  projectId: string,
  ports: { api: number; db: number },
) {
  for (const c of containers) {
    for (const bindings of Object.values(c.HostConfig.PortBindings ?? {}))
      for (const b of bindings ?? [])
        if (b.HostIp !== "127.0.0.1")
          throw new Error("Non-loopback requested binding refused");
    for (const bindings of Object.values(c.NetworkSettings.Ports ?? {}))
      for (const b of bindings ?? [])
        if (b.HostIp !== "127.0.0.1")
          throw new Error("Non-loopback effective binding refused");
  }
  const db = containers.find((c) => c.Name === `/supabase_db_${projectId}`);
  const api = containers.find((c) => c.Name === `/supabase_kong_${projectId}`);
  if (
    db?.NetworkSettings.Ports?.["5432/tcp"]?.[0]?.HostPort !==
      String(ports.db) ||
    api?.NetworkSettings.Ports?.["8000/tcp"]?.[0]?.HostPort !==
      String(ports.api)
  )
    throw new Error("Actual target port mapping mismatch");
}

export function assertEmptyPublic(surface: {
  relations: number;
  functions: number;
  anon_create: boolean;
  authenticated_create: boolean;
}) {
  if (
    surface.relations !== 0 ||
    surface.functions !== 0 ||
    surface.anon_create ||
    surface.authenticated_create
  )
    throw new Error("Public bootstrap schema must be empty and non-writable");
}
