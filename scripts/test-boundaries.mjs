import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectFailure, run, snapshot } from "./test-fixture.mjs";

// Exercise the real copy filter using harmless files outside the checkout.
const sourceFixture = mkdtempSync(join(tmpdir(), "jobs-crm-copy-sensitivity-"));
let copiedFixture;
try {
  for (const directory of [
    "secrets",
    "private",
    ".foundation-f2",
    ".foundation-f3",
    ".recruitment-local",
    ".local-dev",
    ".local-dev-history",
    "src",
    "node_modules",
  ]) {
    mkdirSync(join(sourceFixture, directory));
  }
  writeFileSync(
    join(sourceFixture, "secrets/omitted.txt"),
    "synthetic fixture",
  );
  writeFileSync(
    join(sourceFixture, "private/omitted.txt"),
    "synthetic fixture",
  );
  writeFileSync(join(sourceFixture, ".env.local"), "SYNTHETIC=fixture");
  writeFileSync(
    join(sourceFixture, ".foundation-f2/omitted.txt"),
    "synthetic local target state",
  );
  writeFileSync(
    join(sourceFixture, ".foundation-f3/omitted.txt"),
    "synthetic local auth state",
  );
  writeFileSync(
    join(sourceFixture, ".recruitment-local/omitted.txt"),
    "synthetic local product state",
  );
  writeFileSync(
    join(sourceFixture, ".local-dev/omitted.txt"),
    "synthetic DEV private state",
  );
  writeFileSync(
    join(sourceFixture, ".local-dev-history/omitted.txt"),
    "synthetic DEV receipts",
  );
  writeFileSync(join(sourceFixture, "src/included.ts"), "export {};\n");
  copiedFixture = snapshot(sourceFixture);
  for (const excluded of [
    "secrets",
    "private",
    ".env.local",
    ".foundation-f2",
    ".foundation-f3",
    ".recruitment-local",
    ".local-dev",
    ".local-dev-history",
  ]) {
    assert.ok(
      !existsSync(join(copiedFixture.directory, excluded)),
      `${excluded} must be omitted`,
    );
  }
  assert.ok(
    existsSync(join(copiedFixture.directory, "src/included.ts")),
    "snapshot must retain ordinary source files",
  );
  console.log(
    "PASS FQA-06 snapshot excludes private, secrets, env and local F2/F3/product/DEV state.",
  );
} finally {
  copiedFixture?.cleanup();
  rmSync(sourceFixture, { recursive: true, force: true });
}

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

  const envFixture = join(
    fixture.directory,
    "src/components/env-sensitivity.ts",
  );
  writeFileSync(
    envFixture,
    "export const forbidden = process.env.NEXT_PUBLIC_FAKE;\n",
  );
  expectFailure(
    run(fixture.directory, "eslint/bin/eslint.js", [
      envFixture,
      "--max-warnings=0",
    ]),
    /no-restricted-properties/,
    "FQA-04 unauthorized public environment read",
  );
  rmSync(envFixture);

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
