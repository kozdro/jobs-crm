/** Remove only explicitly identified owned disposable F3 targets. */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { stopAuthTarget } from "./f3-target.ts";
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : (
      await readdir(resolve(".foundation-f3"), { withFileTypes: true }).catch(
        () => [],
      )
    )
      .filter(
        (entry) =>
          entry.isDirectory() && /^[a-z][a-z0-9-]{0,30}$/.test(entry.name),
      )
      .map((entry) => entry.name);
for (const id of targets) {
  await stopAuthTarget(id);
  console.log(`Removed owned resources for F3 target ${id}`);
}
