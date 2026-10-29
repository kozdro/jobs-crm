import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
/** Evidence folders are not targets; malformed existing manifests remain hard errors downstream. */
export async function cleanupTargets(stateRoot: string) {
  let entries;
  try {
    entries = await readdir(stateRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const targets: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await access(join(stateRoot, entry.name, "manifest.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(entry.name))
      throw new Error("Invalid cleanup target name");
    targets.push(entry.name);
  }
  return targets.sort();
}

/** Continue independent owned cleanups; diagnostics deliberately omit original error payloads. */
export async function cleanupAllTargets(
  targets: string[],
  removeTarget: (id: string) => Promise<void>,
) {
  const failed: string[] = [];
  for (const id of targets) {
    try {
      await removeTarget(id);
    } catch {
      failed.push(id);
    }
  }
  if (failed.length)
    throw new AggregateError(
      failed.map((id) => new Error(`Owned F2 cleanup failed: ${id}`)),
      `F2 cleanup failed for ${failed.length} target(s); every target was attempted`,
    );
}
