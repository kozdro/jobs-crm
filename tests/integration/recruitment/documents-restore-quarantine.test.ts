/** Targeted disposable QA proof; no production or persistent DEV target accepted. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { quarantineLocalTarget } from "../../../scripts/documents-restore/replay-local.ts";
import {
  startRecruitmentTarget,
  migrateRecruitmentTarget,
  stopRecruitmentTarget,
} from "../../../scripts/recruitment/target.ts";
const exec = promisify(execFile);
test(
  "local quarantine denies anon and authenticated Data and Storage access",
  { timeout: 300_000, skip: process.env.DOCUMENTS_RESTORE_OWN_TARGET !== "1" },
  async () => {
    const id = `restore-qa-${randomUUID().slice(0, 8)}`;
    let started = false;
    try {
      const target = await startRecruitmentTarget(id);
      started = true;
      await migrateRecruitmentTarget(id);
      await quarantineLocalTarget(id);
      const objectKey = randomUUID();
      const created = await fetch(
        `${target.apiUrl}/storage/v1/object/documents/${objectKey}`,
        {
          method: "POST",
          headers: {
            apikey: target.serviceRoleKey,
            Authorization: `Bearer ${target.serviceRoleKey}`,
            "content-type": "text/plain",
          },
          body: "hello",
        },
      );
      assert.equal(created.status, 200);
      const inspected = JSON.parse(
        (
          await exec("docker", [
            "inspect",
            `supabase_storage_${target.projectId}`,
          ])
        ).stdout,
      );
      const secret = (inspected[0].Config.Env as string[])
        .find((value) => value.startsWith("AUTH_JWT_SECRET="))
        ?.slice("AUTH_JWT_SECRET=".length);
      if (!secret) throw new Error("Local token secret unavailable");
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          role: "authenticated",
          sub: randomUUID(),
          iss: "supabase",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString("base64url");
      const body = `${header}.${payload}`;
      const userJwt = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
      for (const credential of [target.anonKey, userJwt]) {
        const headers = {
          apikey: target.anonKey,
          Authorization: `Bearer ${credential}`,
        };
        const data = await fetch(
          `${target.apiUrl}/rest/v1/document_version?select=id`,
          { headers },
        );
        assert.ok(
          !data.ok,
          `Data API should deny quarantined access (${data.status})`,
        );
        const storage = await fetch(
          `${target.apiUrl}/storage/v1/object/authenticated/documents/${objectKey}`,
          { headers },
        );
        assert.ok(
          !storage.ok,
          `Storage must deny quarantined access (${storage.status})`,
        );
      }
    } finally {
      if (started) await stopRecruitmentTarget(id);
    }
  },
);
