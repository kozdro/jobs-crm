import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  assertBffEnvironment,
  assertCleanupEnvironment,
  baseProcessEnvironment,
} from "./process-env.ts";
const exec = promisify(execFile);
test("BFF child receives only explicitly scoped credentials, not inherited operator secrets", async () => {
  const inherited = {
    PATH: process.env.PATH,
    DOCUMENTS_VALIDATOR_JWT: "synthetic-validator",
    DOCUMENTS_CLEANUP_JWT: "synthetic-cleanup",
    AUTH_JWT_SECRET: "synthetic-signing",
    ARBITRARY_SECRET: "synthetic-other",
  };
  const env = {
    ...baseProcessEnvironment(inherited),
    DOCUMENTS_UPLOADER_JWT: "synthetic-uploader",
    DOCUMENTS_DELETE_AUTHORIZER_JWT: "synthetic-delete",
    DOCUMENTS_VALIDATOR_SERVICE_SECRET: "synthetic-ipc",
  };
  assertBffEnvironment(env);
  assert.throws(() =>
    assertBffEnvironment({
      ...env,
      DOCUMENTS_VALIDATOR_JWT: "synthetic-validator",
    }),
  );
  const { stdout } = await exec(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify({u:!!process.env.DOCUMENTS_UPLOADER_JWT,d:!!process.env.DOCUMENTS_DELETE_AUTHORIZER_JWT,i:!!process.env.DOCUMENTS_VALIDATOR_SERVICE_SECRET,v:!!process.env.DOCUMENTS_VALIDATOR_JWT,c:!!process.env.DOCUMENTS_CLEANUP_JWT,s:!!process.env.AUTH_JWT_SECRET,o:!!process.env.ARBITRARY_SECRET}))",
    ],
    { env },
  );
  assert.deepEqual(JSON.parse(stdout), {
    u: true,
    d: true,
    i: true,
    v: false,
    c: false,
    s: false,
    o: false,
  });
});
test("cleanup child receives only its own operator credential", async () => {
  const env = {
    ...baseProcessEnvironment({
      PATH: process.env.PATH,
      DOCUMENTS_UPLOADER_JWT: "synthetic-uploader",
      DOCUMENTS_VALIDATOR_JWT: "synthetic-validator",
      DOCUMENTS_DELETE_AUTHORIZER_JWT: "synthetic-delete",
    }),
    DOCUMENTS_CLEANUP_JWT: "synthetic-cleanup",
  };
  assertCleanupEnvironment(env);
  assert.throws(() =>
    assertCleanupEnvironment({
      ...env,
      DOCUMENTS_VALIDATOR_JWT: "synthetic-validator",
    }),
  );
  const { stdout } = await exec(
    process.execPath,
    [
      "-e",
      "console.log(JSON.stringify({c:!!process.env.DOCUMENTS_CLEANUP_JWT,u:!!process.env.DOCUMENTS_UPLOADER_JWT,v:!!process.env.DOCUMENTS_VALIDATOR_JWT,d:!!process.env.DOCUMENTS_DELETE_AUTHORIZER_JWT}))",
    ],
    { env },
  );
  assert.deepEqual(JSON.parse(stdout), {
    c: true,
    u: false,
    v: false,
    d: false,
  });
});
