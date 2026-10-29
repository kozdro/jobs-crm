/** Real local Auth/Data API assertions, using credentials only in test memory. */
import test from "node:test";
import { readAuthTarget } from "./f3-target.ts";
import { runAuthSdkCases } from "../../tests/integration/auth/sdk-cases.ts";
const id = process.env.F3_TARGET_ID;
if (!id) throw new Error("F3_TARGET_ID required; run pnpm test:auth:f3");
test("F3 real Auth SDK and Data API", { timeout: 600_000 }, async (t) => {
  const target = await readAuthTarget(id);
  await runAuthSdkCases(
    {
      async test(name, fn) {
        let failed = false;
        await t.test(name, async () => {
          try {
            await fn();
          } catch {
            failed = true;
            throw new Error(
              `Required F3 case failed: ${name} (details withheld to protect session material)`,
            );
          }
        });
        if (failed) throw new Error(`Required F3 case failed: ${name}`);
      },
    },
    target,
  );
});
