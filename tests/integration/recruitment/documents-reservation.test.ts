/** SQL simulation of revoked commands, plus actual direct Data API denial. Not product upload evidence. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import { createAccounts, request } from "../rls/data-api.ts";
const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Documents reservation test requires guarded target");
const target = await readRecruitmentTarget(id);
function requestId(at = Date.now()) {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(at, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const s = bytes.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

test(
  "finalize denies clients; simulated reservations serialize quota",
  { timeout: 120_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const intent = {
      scope: "library",
      name: "Synthetic",
      isCv: false,
      filename: "fixture.txt",
      mime: "text/plain",
      bytes: 20 * 1024 * 1024,
      sha256: "a".repeat(64),
    };
    for (const user of [a, b, undefined]) {
      const result = await request(
        target,
        user?.token,
        "/rest/v1/rpc/finalize_document_upload",
        "POST",
        {
          p_version_id: randomUUID(),
          p_bytes: 1,
          p_mime: "text/plain",
          p_sha256: "a".repeat(64),
        },
        {},
        "public",
      );
      assert.ok(
        [401, 403, 404].includes(result.status),
        `Expected validator-only RPC, got ${result.status}`,
      );
    }
    const anonReservation = await request(
      target,
      undefined,
      "/rest/v1/rpc/reserve_document_upload",
      "POST",
      { p_request_id: requestId(), p_intent: intent },
      {},
      "public",
    );
    assert.ok([401, 403].includes(anonReservation.status));
    const sql = postgres({
      ...target.db,
      max: 4,
      ssl: false,
      onnotice: () => {},
    });
    const reserve = (requestId: string, bytes: number, owner = a.id) =>
      sql.begin(async (tx) => {
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: owner, role: "authenticated" }),
        ]);
        const [row] = await tx.unsafe(
          "select public.reserve_document_upload($1::uuid,$2::text::jsonb) result",
          [requestId, JSON.stringify({ ...intent, bytes })],
        );
        return row.result as { kind: string; versionId: string };
      });
    try {
      const firstId = requestId();
      const first = await reserve(firstId, intent.bytes);
      assert.equal(first.kind, "reserved");
      const reconcileApi = (token: string | undefined) =>
        request(
          target,
          token,
          "/rest/v1/rpc/reconcile_document_upload",
          "POST",
          { p_request_id: firstId },
          {},
          "public",
        );
      const ownReconcile = await reconcileApi(a.token);
      assert.equal(ownReconcile.status, 200);
      assert.equal((ownReconcile.body as { kind: string }).kind, "pending");
      const foreignReconcile = await reconcileApi(b.token);
      assert.equal(foreignReconcile.status, 200);
      assert.equal(
        (foreignReconcile.body as { kind: string }).kind,
        "cancelled",
      );
      assert.ok([401, 403].includes((await reconcileApi(undefined)).status));
      await assert.rejects(
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ role: "documents_validator" }),
          ]);
          await tx.unsafe(
            "select public.finalize_document_upload($1::uuid,$2::integer,$3::text,$4::text)",
            [first.versionId, intent.bytes, intent.mime, intent.sha256],
          );
        }),
        (error: unknown) => (error as { code?: string }).code === "PT409",
      );
      const replay = await reserve(firstId, intent.bytes);
      assert.equal(replay.kind, "replayed");
      assert.equal(replay.versionId, first.versionId);
      await assert.rejects(reserve(firstId, intent.bytes - 1));
      for (let n = 1; n < 51; n++) await reserve(requestId(), intent.bytes);
      const race = await Promise.allSettled([
        reserve(requestId(), 4 * 1024 * 1024),
        reserve(requestId(), 4 * 1024 * 1024),
      ]);
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(race.filter((r) => r.status === "rejected").length, 1);
      const [total] =
        await sql`select sum(bytes)::bigint total from recruitment_private.document_object where owner_id=${a.id}::uuid`;
      assert.equal(Number(total.total), 1024 * 1024 * 1024);
      await assert.rejects(reserve(requestId(), 1));
      const reconcile = (key: string) =>
        sql.begin(async (tx) => {
          await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
            JSON.stringify({ sub: b.id, role: "authenticated" }),
          ]);
          const [row] = await tx.unsafe(
            "select public.reconcile_document_upload($1::uuid) result",
            [key],
          );
          return row.result as { kind: string };
        });
      const fenced = requestId();
      assert.equal((await reconcile(fenced)).kind, "cancelled");
      await assert.rejects(reserve(fenced, 1, b.id));
      await assert.rejects(
        reserve(requestId(Date.now() - 8 * 86400_000), 1, b.id),
      );
      const fixed = Date.UTC(2026, 0, 1);
      const [expiry] =
        await sql`select recruitment_private.document_request_expiry(${requestId(fixed)}::uuid) expiry`;
      assert.equal(
        new Date(expiry.expiry).getTime(),
        fixed + 7 * 86400_000 - 1000,
      );
      assert.equal(
        (await reserve(requestId(Date.now() + 500), 1, b.id)).kind,
        "reserved",
      );
      await assert.rejects(reserve(requestId(Date.now() + 5000), 1, b.id));
      const contested = requestId();
      const simultaneous = await Promise.allSettled([
        reserve(contested, 1, b.id),
        reconcile(contested),
      ]);
      const reservation = simultaneous[0],
        reconciliation = simultaneous[1];
      assert.equal(reconciliation.status, "fulfilled");
      if (reconciliation.status === "fulfilled") {
        if (reconciliation.value.kind === "cancelled")
          assert.equal(reservation.status, "rejected");
        else {
          assert.equal(reconciliation.value.kind, "pending");
          assert.equal(reservation.status, "fulfilled");
        }
      }
    } finally {
      await sql.end();
    }
  },
);
