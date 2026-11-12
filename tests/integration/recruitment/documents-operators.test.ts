/** Isolated local-only operator credentials; service key is used exclusively for fixture setup. */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { runCleanupBatch } from "../../../scripts/documents-cleanup/worker.ts";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Documents operator test requires guarded target");
const target = await readRecruitmentTarget(id);
if (!target.storage) throw new Error("Storage profile required");
const exec = promisify(execFile);
function requestId() {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6] & 15) | 0x70;
  b[8] = (b[8] & 63) | 0x80;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

test(
  "operator HTTP access is limited to pending validation and queued deletion",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const inspected = JSON.parse(
      (
        await exec("docker", [
          "inspect",
          `supabase_storage_${target.projectId}`,
        ])
      ).stdout,
    );
    const env = inspected[0].Config.Env as string[];
    const secret = env
      .find((value) => value.startsWith("AUTH_JWT_SECRET="))
      ?.slice("AUTH_JWT_SECRET=".length);
    if (!secret) throw new Error("Local Storage signing secret unavailable");
    const token = (role: string) => {
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          role,
          iss: "supabase",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString("base64url");
      const input = `${header}.${payload}`;
      return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
    };
    const uploader = token("documents_uploader"),
      validator = token("documents_validator"),
      cleanup = token("documents_cleanup");
    const sql = postgres({
      ...target.db,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    const paths = {
      pending: `${randomUUID()}/pending.txt`,
      deleting: `${randomUUID()}/deleting.txt`,
      other: `${randomUUID()}/other.txt`,
      upload: `${randomUUID()}/upload.txt`,
      ready: `${randomUUID()}/ready.txt`,
    };
    const call = (credential: string, path: string, init: RequestInit = {}) =>
      fetch(`${target.apiUrl}/storage/v1${path}`, {
        ...init,
        headers: {
          apikey: target.anonKey,
          Authorization: `Bearer ${credential}`,
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
    try {
      const documentId = randomUUID();
      await sql`insert into public.document(id,owner_id,name) values(${documentId}::uuid,${a.id}::uuid,'Synthetic operator fixture')`;
      for (const [i, phase] of (["pending", "deleting"] as const).entries()) {
        const versionId = randomUUID();
        await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${versionId}::uuid,${a.id}::uuid,${documentId}::uuid,${i + 1},${phase})`;
        await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${versionId}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${paths[phase]},5,${phase})`;
      }
      const uploadVersion = randomUUID();
      await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${uploadVersion}::uuid,${a.id}::uuid,${documentId}::uuid,3,'pending')`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${uploadVersion}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${paths.upload},5,'pending')`;
      const readyVersion = randomUUID();
      await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename,mime,size) values(${readyVersion}::uuid,${a.id}::uuid,${documentId}::uuid,4,'ready','synthetic.txt','text/plain',5)`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${readyVersion}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${paths.ready},5,'ready')`;
      for (const path of [
        paths.pending,
        paths.deleting,
        paths.other,
        paths.ready,
      ]) {
        const response = await call(
          target.serviceRoleKey,
          `/object/documents/${path}`,
          {
            method: "POST",
            headers: { "content-type": "text/plain" },
            body: "hello",
          },
        );
        assert.equal(
          response.status,
          200,
          `fixture upload failed: ${response.status}`,
        );
      }
      const get = (credential: string, path: string) =>
        call(credential, `/object/authenticated/documents/${path}`);
      const ownerReady = await get(a.token, paths.ready);
      assert.equal(ownerReady.status, 200);
      assert.equal(await ownerReady.text(), "hello");
      assert.ok(!(await get(b.token, paths.ready)).ok);
      assert.ok(!(await get(target.anonKey, paths.ready)).ok);
      const ownerSign = await call(
        a.token,
        `/object/sign/documents/${paths.ready}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: 60 }),
        },
      );
      assert.ok(!ownerSign.ok, "owner must not create signed URLs");
      const ownerList = await call(a.token, "/object/list/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefix: paths.ready.split("/")[0] }),
      });
      if (ownerList.ok) assert.deepEqual(await ownerList.json(), []);
      const ownerCopy = await call(a.token, "/object/copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bucketId: "documents",
          sourceKey: paths.ready,
          destinationKey: `${randomUUID()}/copy.txt`,
        }),
      });
      assert.ok(!ownerCopy.ok, "owner must not copy Storage objects");
      const targetRpc = (token: string | undefined) =>
        request(
          target,
          token,
          "/rest/v1/rpc/document_download_target",
          "POST",
          { p_version_id: readyVersion },
          {},
          "public",
        );
      const ownerTarget = await targetRpc(a.token);
      assert.equal(ownerTarget.status, 200);
      assert.equal(
        (ownerTarget.body as { objectKey: string }).objectKey,
        paths.ready,
      );
      const foreignTarget = await targetRpc(b.token);
      assert.equal(foreignTarget.status, 200);
      assert.equal(foreignTarget.body, null);
      assert.ok([401, 403].includes((await targetRpc(undefined)).status));
      await sql`update recruitment_private.document_object set phase='deleting' where version_id=${readyVersion}::uuid`;
      await sql`update public.document_version set state='deleting' where id=${readyVersion}::uuid`;
      assert.ok(
        !(await get(a.token, paths.ready)).ok,
        "new downloads must stop when deleting starts",
      );
      assert.equal((await targetRpc(a.token)).body, null);
      const upload = (path: string, body: string, upsert = false) =>
        call(uploader, `/object/documents/${path}`, {
          method: "POST",
          headers: { "content-type": "text/plain", "x-upsert": String(upsert) },
          body,
        });
      assert.equal((await upload(paths.upload, "hello")).status, 200);
      assert.ok(!(await get(uploader, paths.upload)).ok);
      assert.ok(!(await upload(paths.upload, "altered", true)).ok);
      assert.ok(!(await upload(`${randomUUID()}/unreserved.txt`, "hello")).ok);
      assert.equal(await (await get(validator, paths.upload)).text(), "hello");
      const valid = await get(validator, paths.pending);
      assert.equal(valid.status, 200);
      assert.equal(await valid.text(), "hello");
      for (const credential of [
        validator,
        cleanup,
        a.token,
        b.token,
        target.anonKey,
      ]) {
        const response = await get(credential, paths.other);
        assert.ok(
          !response.ok,
          `unexpected arbitrary object access: ${response.status}`,
        );
      }
      assert.ok(!(await get(cleanup, paths.pending)).ok);
      assert.ok(!(await get(cleanup, paths.deleting)).ok);
      assert.ok(!(await get(validator, paths.deleting)).ok);
      for (const credential of [a.token, b.token, target.anonKey]) {
        assert.ok(!(await get(credential, paths.pending)).ok);
        assert.ok(!(await get(credential, paths.deleting)).ok);
      }
      const signed = await call(
        validator,
        `/object/sign/documents/${paths.pending}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: 60 }),
        },
      );
      assert.ok(!signed.ok, "validator must not create a signed URL");
      const listing = await call(validator, "/object/list/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefix: paths.pending.split("/")[0] }),
      });
      if (listing.ok) assert.deepEqual(await listing.json(), []);
      const deleteMany = (credential: string, path: string) =>
        call(credential, "/object/documents", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prefixes: [path] }),
        });
      await deleteMany(uploader, paths.upload);
      assert.equal(
        (await get(target.serviceRoleKey, paths.upload)).status,
        200,
      );
      await deleteMany(validator, paths.pending);
      assert.equal(
        (await get(target.serviceRoleKey, paths.pending)).status,
        200,
      );
      await deleteMany(cleanup, paths.other);
      assert.equal((await get(target.serviceRoleKey, paths.other)).status, 200);
      const deleted = await deleteMany(cleanup, paths.deleting);
      assert.equal(deleted.status, 200);
      assert.ok(
        !(await get(target.serviceRoleKey, paths.deleting)).ok,
        "queued object was not physically deleted",
      );
      await sql`update recruitment_private.document_object set created_at=clock_timestamp()-interval '25 hours' where version_id=${uploadVersion}::uuid`;
      const rpc = (
        credential: string | undefined,
        name: string,
        body: Record<string, unknown>,
      ) =>
        request(
          target,
          credential,
          `/rest/v1/rpc/${name}`,
          "POST",
          body,
          {},
          "public",
        );
      for (const credential of [
        a.token,
        b.token,
        target.anonKey,
        uploader,
        validator,
      ]) {
        const denied = await rpc(credential, "confirm_document_cleanup", {
          p_version_id: uploadVersion,
        });
        assert.ok(
          [401, 403].includes(denied.status) ||
            (denied.status === 404 &&
              (denied.body as { code?: string }).code === "PGRST202"),
          `unexpected cleanup RPC status ${denied.status}`,
        );
      }
      const enqueued = await rpc(cleanup, "enqueue_abandoned_documents", {
        p_limit: 50,
      });
      assert.equal(enqueued.status, 200, JSON.stringify(enqueued.body));
      assert.equal(enqueued.body, 1);
      const premature = await rpc(cleanup, "confirm_document_cleanup", {
        p_version_id: uploadVersion,
      });
      assert.equal(premature.status, 409);
      assert.equal(
        (await get(target.serviceRoleKey, paths.upload)).status,
        200,
      );
      assert.equal((await deleteMany(cleanup, paths.upload)).status, 200);
      const confirmed = await rpc(cleanup, "confirm_document_cleanup", {
        p_version_id: uploadVersion,
      });
      assert.equal(confirmed.status, 200);
      assert.deepEqual(confirmed.body, { kind: "confirmed" });
      assert.deepEqual(
        (
          await rpc(cleanup, "confirm_document_cleanup", {
            p_version_id: uploadVersion,
          })
        ).body,
        { kind: "confirmed" },
      );
      const [removed] =
        await sql`select count(*)::int n from public.document_version where id=${uploadVersion}::uuid`;
      assert.equal(removed.n, 0, "unsent bytes and metadata must be removed");
      const recoveryVersion = randomUUID(),
        recoveryKey = randomUUID(),
        recoveryDoc = randomUUID(),
        recoveryRequest = requestId();
      const marker = "sensitive-synthetic-marker",
        hash = "a".repeat(64);
      await sql`insert into public.document(id,owner_id,name,is_cv) values(${recoveryDoc}::uuid,${a.id}::uuid,${marker},true)`;
      await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename,label,mime,size) values(${recoveryVersion}::uuid,${a.id}::uuid,${recoveryDoc}::uuid,1,'pending','sensitive-synthetic.txt','sensitive-synthetic-label','text/plain',5)`;
      await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase,created_at) values(${recoveryVersion}::uuid,${a.id}::uuid,${recoveryRequest}::uuid,${recoveryKey},5,'pending',clock_timestamp()-interval '25 hours')`;
      await sql`insert into recruitment_private.document_upload_command(owner_id,request_id,document_id,version_id,intent) values(${a.id}::uuid,${recoveryRequest}::uuid,${recoveryDoc}::uuid,${recoveryVersion}::uuid,${sql.json({ name: marker, sha256: hash })})`;
      await sql`insert into public.document_metadata_revision(owner_id,document_id,version_id,action,before_values,after_values) values(${a.id}::uuid,${recoveryDoc}::uuid,${recoveryVersion}::uuid,'label',${sql.json({ label: marker })},${sql.json({ label: marker })})`;
      await sql`insert into public.document_command(owner_id,request_id,document_id,version_id,payload,result,expires_at) values(${a.id}::uuid,${requestId()}::uuid,${recoveryDoc}::uuid,${recoveryVersion}::uuid,${sql.json({ label: marker, sha256: hash })},${sql.json({ kind: "saved" })},clock_timestamp()+interval '1 day')`;
      assert.equal(
        (
          await call(
            target.serviceRoleKey,
            `/object/documents/${recoveryKey}`,
            {
              method: "POST",
              headers: { "content-type": "text/plain" },
              body: "hello",
            },
          )
        ).status,
        200,
      );
      let lostResponse = false;
      const faultFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (
          !lostResponse &&
          init?.method === "DELETE" &&
          String(input).includes("/storage/v1/object/documents")
        ) {
          lostResponse = true;
          throw new Error("synthetic response loss after real delete");
        }
        return response;
      };
      const cleanupClient = (customFetch: typeof fetch) =>
        createClient(target.apiUrl, target.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: { Authorization: `Bearer ${cleanup}` },
            fetch: customFetch,
          },
        });
      const interrupted = await runCleanupBatch(cleanupClient(faultFetch));
      assert.equal(lostResponse, true);
      assert.equal(interrupted.pending, 1);
      assert.ok(!(await get(target.serviceRoleKey, recoveryKey)).ok);
      const [pendingMetadata] =
        await sql`select filename,label,mime,size from public.document_version where id=${recoveryVersion}::uuid`;
      assert.deepEqual(
        { ...pendingMetadata },
        { filename: null, label: null, mime: null, size: null },
        "deleted bytes must not leave private metadata during retry",
      );
      const [privateRows] =
        await sql`select (select name from public.document where id=${recoveryDoc}::uuid) name,(select intent from recruitment_private.document_upload_command where version_id=${recoveryVersion}::uuid) intent,(select payload from public.document_command where version_id=${recoveryVersion}::uuid limit 1) payload,(select count(*)::int from public.document_metadata_revision where version_id=${recoveryVersion}::uuid) audits`;
      assert.deepEqual(
        { ...privateRows },
        { name: null, intent: null, payload: null, audits: 0 },
      );
      for (const table of [
        "document",
        "document_version",
        "document_metadata_revision",
      ]) {
        const read = await request(
          target,
          a.token,
          `/rest/v1/${table}?select=*`,
          "GET",
          undefined,
          {},
          "public",
        );
        assert.equal(read.status, 200);
        assert.ok(!JSON.stringify(read.body).includes(marker));
        assert.ok(!JSON.stringify(read.body).includes(hash));
      }
      const recovered = await runCleanupBatch(cleanupClient(fetch));
      assert.equal(recovered.confirmed, 1);
      assert.equal(recovered.pending, 0);
      const [recovery] =
        await sql`select count(*)::int n from public.document_version where id=${recoveryVersion}::uuid`;
      assert.equal(recovery.n, 0);
    } finally {
      await call(target.serviceRoleKey, "/object/documents", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefixes: Object.values(paths) }),
      });
      await sql.end();
    }
  },
);
