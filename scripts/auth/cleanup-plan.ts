/** Cleanup accepts incomplete owned resources; runtime readiness uses stricter checks. */
export interface CleanupScope {
  projectId: string;
  networkId: string;
  containers?: { id: string; name: string; imageId: string }[];
}
export interface CleanupContainer {
  Id: string;
  Name: string;
  Image: string;
  Config: { Labels?: Record<string, string> };
  HostConfig: {
    NetworkMode: string;
    PortBindings?: Record<
      string,
      { HostIp: string; HostPort: string }[] | null
    >;
  };
  NetworkSettings: {
    Networks?: Record<string, unknown>;
    Ports?: Record<string, { HostIp: string; HostPort: string }[] | null>;
  };
}
export interface CleanupInventory {
  containers: CleanupContainer[];
  volumes: { Name: string; Labels?: Record<string, string> }[];
  network?: {
    Id: string;
    Name: string;
    Labels?: Record<string, string>;
    Options?: Record<string, string>;
    Containers?: Record<string, unknown>;
  };
}
export function planAuthCleanup(
  scope: CleanupScope,
  inventory: CleanupInventory,
) {
  const ports: Record<string, string> = {
    "5432/tcp": "56522",
    "8000/tcp": "56521",
    "8025/tcp": "56524",
  };
  for (const c of inventory.containers) {
    if (
      !c.Id ||
      !c.Name.startsWith("/supabase_") ||
      !c.Name.endsWith(`_${scope.projectId}`) ||
      c.Config.Labels?.["com.supabase.cli.project"] !== scope.projectId ||
      c.HostConfig.NetworkMode !== scope.networkId ||
      Object.keys(c.NetworkSettings.Networks ?? {}).some(
        (name) => name !== scope.networkId,
      )
    )
      throw new Error("F3 cleanup container ownership/network mismatch");
    const known = scope.containers?.find((entry) => entry.id === c.Id);
    if (
      scope.containers &&
      (!known || known.name !== c.Name || known.imageId !== c.Image)
    )
      throw new Error("F3 cleanup container identity/image drift");
    for (const mapping of [c.HostConfig.PortBindings, c.NetworkSettings.Ports])
      for (const [port, bindings] of Object.entries(mapping ?? {}))
        for (const b of bindings ?? [])
          if (b.HostIp !== "127.0.0.1" || ports[port] !== b.HostPort)
            throw new Error("F3 cleanup binding mismatch");
  }
  for (const v of inventory.volumes)
    if (
      !/^supabase_[a-z0-9_-]+$/.test(v.Name) ||
      !v.Name.endsWith(`_${scope.projectId}`) ||
      v.Labels?.["com.supabase.cli.project"] !== scope.projectId
    )
      throw new Error("F3 cleanup volume ownership mismatch");
  const n = inventory.network;
  if (
    n &&
    (!n.Id ||
      n.Name !== scope.networkId ||
      n.Labels?.["jobs-crm.foundation-f3"] !== scope.projectId ||
      n.Options?.["com.docker.network.bridge.host_binding_ipv4"] !==
        "127.0.0.1" ||
      Object.keys(n.Containers ?? {}).some(
        (id) => !inventory.containers.some((c) => c.Id === id),
      ))
  )
    throw new Error("F3 cleanup network ownership/binding/attachment mismatch");
  return {
    containerIds: inventory.containers.map((c) => c.Id),
    volumeNames: inventory.volumes.map((v) => v.Name),
    networkIds: n ? [n.Id] : [],
  };
}
