/** CI fallback: evidence is ignored, malformed target manifests remain hard errors. */
import { resolve } from "node:path";
import { stopTarget } from "./f2.ts";
import { cleanupTargets, cleanupAllTargets } from "./cleanup-targets.ts";
const stateRoot = resolve(import.meta.dirname, "../../.foundation-f2");
await cleanupAllTargets(await cleanupTargets(stateRoot), (id) =>
  stopTarget(id, { remove: true }),
);
