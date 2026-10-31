import type {
  CatalogCommand,
  CatalogResult,
  CatalogProfile,
} from "@/modules/companies-contacts/domain/catalog";

export class CatalogClientError extends Error {
  constructor(
    public kind: string,
    public uncertain = false,
  ) {
    super("Nie można potwierdzić operacji katalogu.");
  }
}
export function profileHref(profile: Pick<CatalogProfile, "type" | "id">) {
  return `${profile.type === "organization" ? "/companies" : "/contacts"}/${profile.id}`;
}
export function entityHref(
  type: "case" | "organization" | "contact",
  id: string,
) {
  return type === "case" ? `/recruitments/${id}` : profileHref({ type, id });
}
export function resultMatchesCommand(
  result: CatalogResult,
  command: CatalogCommand,
) {
  if (result.kind === "duplicates") return false;
  if (
    command.operation === "create-profile" ||
    command.operation === "edit-profile"
  ) {
    const profile = result.profile;
    return Boolean(
      profile &&
      profile.type === command.profileType &&
      profile.name === command.name?.trim() &&
      profile.email === (command.email?.trim() || null) &&
      (command.operation !== "edit-profile" ||
        profile.id === command.profileId),
    );
  }
  const relation = result.relation;
  if (!relation) return false;
  if (command.operation === "attach")
    return (
      relation.active &&
      relation.type === command.relationType &&
      relation.left_id === command.leftId &&
      relation.right_id === command.rightId &&
      relation.role === (command.role ?? null)
    );
  return (
    relation.id === command.relationId &&
    (command.operation === "detach"
      ? !relation.active
      : relation.active && relation.role === command.role)
  );
}
export async function catalogRead<T>(
  userId: string,
  query: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const params = new URLSearchParams({ expectedUserId: userId });
  Object.entries(query).forEach(([key, value]) =>
    params.set(key, String(value)),
  );
  const response = await fetch(`/catalog/commands?${params}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (response.status === 401 || response.status === 403)
    throw new CatalogClientError("unauthenticated");
  if (!response.ok) throw new CatalogClientError("unavailable");
  return (await response.json()) as T;
}
export async function catalogWrite(
  userId: string,
  command: CatalogCommand,
): Promise<CatalogResult> {
  let response: Response;
  try {
    response = await fetch("/catalog/commands", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...command, expectedUserId: userId }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new CatalogClientError("unavailable", true);
  }
  if (response.status === 401 || response.status === 403)
    throw new CatalogClientError("unauthenticated");
  if (response.status === 400 || response.status === 409) {
    const body = await response.json().catch(() => null);
    throw new CatalogClientError(
      body?.kind === "stale"
        ? "stale"
        : response.status === 400
          ? "invalid"
          : "conflict",
    );
  }
  if (!response.ok) throw new CatalogClientError("unavailable", true);
  const result = (await response
    .json()
    .catch(() => null)) as CatalogResult | null;
  if (
    result?.kind === "duplicates" &&
    Array.isArray(result.matches) &&
    Array.isArray(result.matchToken)
  )
    return result;
  if (
    !result ||
    (result.kind !== "saved" && result.kind !== "replayed") ||
    !resultMatchesCommand(result, command)
  )
    throw new CatalogClientError("unavailable", true);
  return result;
}
