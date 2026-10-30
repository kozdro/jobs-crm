/** Remove only explicitly identified owned disposable Recruitment targets. */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { stopRecruitmentTarget } from "./target.ts";
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : (
      await readdir(resolve(".recruitment-local"), {
        withFileTypes: true,
      }).catch(() => [])
    )
      .filter(
        (entry) =>
          entry.isDirectory() && /^[a-z][a-z0-9-]{0,30}$/.test(entry.name),
      )
      .map((entry) => entry.name);
for (const id of targets) {
  await stopRecruitmentTarget(id);
  console.log(`Removed owned resources for Recruitment target ${id}`);
}
