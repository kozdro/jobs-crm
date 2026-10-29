import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectFailure, run, snapshot } from "./test-fixture.mjs";

const fixture = snapshot();
try {
  const generated = run(fixture.directory, "next/dist/bin/next", ["typegen"]);
  assert.equal(
    generated.status,
    0,
    "clean snapshot must generate Next route types",
  );

  const typeFixture = join(fixture.directory, "src", "type-sensitivity.ts");
  writeFileSync(typeFixture, "export const wrong:string=null\n");
  expectFailure(
    run(fixture.directory, "typescript/bin/tsc", ["--noEmit"]),
    /TS2322.*null.*string/s,
    "FQA-02 strict typecheck sensitivity",
  );

  const lintFixture = join(fixture.directory, "src", "lint-sensitivity.ts");
  writeFileSync(lintFixture, "export const wrong: any = 42;\n");
  expectFailure(
    run(fixture.directory, "eslint/bin/eslint.js", [
      lintFixture,
      "--max-warnings=0",
    ]),
    /@typescript-eslint\/no-explicit-any/,
    "FQA-03 ESLint sensitivity",
  );
  expectFailure(
    run(fixture.directory, "prettier/bin/prettier.cjs", [
      "--check",
      typeFixture,
    ]),
    /Code style issues|Formatting issues/,
    "FQA-03 Prettier sensitivity",
  );

  mkdirSync(join(fixture.directory, "src/components"), { recursive: true });
  const importFixture = join(
    fixture.directory,
    "src/components/import-sensitivity.ts",
  );
  writeFileSync(
    importFixture,
    'export { getServerEnv } from "@/shared/server/env";\n',
  );
  expectFailure(
    run(fixture.directory, "eslint/bin/eslint.js", [
      importFixture,
      "--max-warnings=0",
    ]),
    /no-restricted-imports/,
    "FQA-03 forbidden UI import sensitivity",
  );
  rmSync(importFixture);

  // Build only the poisoned page; type/lint fixtures must not mask the boundary error.
  writeFileSync(typeFixture, 'export const correct: string = "ok";\n');
  writeFileSync(lintFixture, "export const correct: number = 42;\n");
  mkdirSync(join(fixture.directory, "src", "app"), { recursive: true });
  writeFileSync(
    join(fixture.directory, "src", "app", "page.tsx"),
    '"use client";\nimport * as serverEnv from "@/shared/server/env";\nexport default function PoisonedPage() { return <main>{Object.keys(serverEnv).join(",")}</main>; }\n',
  );
  expectFailure(
    run(fixture.directory, "next/dist/bin/next", ["build"]),
    /server-only|only works in a Server Component|cannot be imported from a Client Component/s,
    "FQA-04 server-only boundary",
  );
} finally {
  fixture.cleanup();
}
