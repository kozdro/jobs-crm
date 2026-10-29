/** URL representation parity across BFF validation, RPC and direct Data API. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  readRecruitmentTarget,
  verifyRecruitmentMigrations,
  type RecruitmentTarget,
} from "../../../scripts/recruitment/target.ts";
import { parseCreateCaseInput } from "../../../src/modules/recruitment/domain/recruitment-case.ts";
import { request, type User, type Reply } from "../rls/data-api.ts";

const rpc = "/rest/v1/rpc/create_recruitment_case";
const table = "/rest/v1/recruitment_case";
type Result = {
  kind: string;
  case: { id: string; source_url: string };
  matches?: { id: string }[];
};
const call = (
  target: RecruitmentTarget,
  owner: User,
  requestId: string,
  title: string,
  source: string,
) =>
  request(
    target,
    owner.token,
    rpc,
    "POST",
    {
      p_request_id: requestId,
      p_title: title,
      p_source_url: source,
    },
    {},
    "public",
  );
const replyResult = (reply: Reply) => {
  assert.equal(reply.status, 200, "URL parity RPC must succeed");
  return reply.body as Result;
};
function canonicalSource(reply: Reply, canonical: string) {
  const result = replyResult(reply);
  assert.ok(["created", "replayed"].includes(result.kind));
  assert.equal(
    result.case.source_url,
    canonical,
    "Persisted URL must equal the pinned WHATWG/BFF representation",
  );
  return result;
}
function uniqueSource(raw: string) {
  const position = raw.indexOf("#");
  const beforeHash = position < 0 ? raw : raw.slice(0, position);
  const fragment = position < 0 ? "" : raw.slice(position);
  return (
    beforeHash +
    (beforeHash.includes("?") ? "&" : "?") +
    "qaCase=" +
    randomUUID() +
    fragment
  );
}
const vectors = [
  "https://example.invalid/a/../b?posting=42#publication",
  "https://example.invalid/a/./b",
  "https://example.invalid/a/%2e%2e/b",
  "https://example.invalid/a/.%2e/b",
  "https://example.invalid/a/%2E./b",
  "https://example.invalid/a/%2e/b",
  "https://example.invalid/a/%2e%2e//b/",
  "https://[2001:0db8:0000:0000:0000:0000:0000:0001]/offer",
  "http://[::ffff:192.0.2.128]:80/offer",
  "https://@example.invalid/offer",
  "https://agent:@example.invalid/offer",
  "https://agent:synthetic:context@example.invalid/offer",
  "https://agent%3Aname:synthetic%40value@example.invalid/offer",
  'https://example.invalid/a b<>"{}/^',
  'https://example.invalid/offer?posting=42&source=a b&literal=<>"\u0027',
  'https://example.invalid/offer#section space<>"\u0060{}',
  "https://example.invalid/a%2fb/%41?posting=00%2F42&source=a%20b#keep%2f",
  "HTTPS://EXAMPLE.INVALID:443",
  "http://example.invalid?posting=42#publication",
  "http://127.1/offer",
  "https://zażółć.example.invalid/oferta/żółć",
  "https://ex%61mple.invalid/offer",
  "https://example.invalid/a%zz?posting=%zz#keep%zz",
  "https://exa{mple}.invalid/offer",
  "https://exa`mple.invalid/offer",
  "https://exa'mple.invalid/offer",
  "https://[2001:0:0:1:0:0:1:1]/offer",
  "https://[2001:db8:1:0:0:0:0:0]/offer",
  "https://[0:0:0:0:0:0:0:0]/offer",
  "https://example.invalid/offer?posting=a/../b&path=%2e%2e#../%2e",
  `https://example.invalid/jobs?posting=${"x".repeat(10_000)}#keep`,
];

/** Every vector is sent through real HTTP with the user JWT; no source is fetched. */
export async function verifyUrlRepresentationParity(
  target: RecruitmentTarget,
  owner: User,
) {
  assert.equal(
    process.version,
    "v24.22.2",
    "URL oracle must use the pinned application Node runtime",
  );
  for (const vector of vectors) {
    const raw = uniqueSource(vector);
    const canonical = new URL(raw).href;
    const key = randomUUID();
    const title = `URL-parity-${randomUUID()}`;
    const parsed = parseCreateCaseInput({
      requestId: key,
      title,
      sourceUrl: raw,
    });
    assert.equal(
      parsed.success,
      true,
      "BFF must accept the approved HTTP(S) vector",
    );
    if (!parsed.success) throw new Error("BFF URL input unexpectedly rejected");
    assert.equal(
      parsed.data.sourceUrl,
      canonical,
      "BFF and pinned WHATWG oracle must agree",
    );

    // A raw noncanonical direct RPC may reject, or normalize to exactly the same
    // representation. It may never silently persist a different representation.
    const rawReply = await call(target, owner, key, title, raw);
    let savedId: string;
    if (rawReply.status >= 400 && rawReply.status < 500) {
      const absent = await request(
        target,
        owner.token,
        `${table}?select=id&request_id=eq.${key}`,
        "GET",
        undefined,
        {},
        "public",
      );
      assert.equal(absent.status, 200);
      assert.deepEqual(absent.body, [], "Rejected raw URL must leave no case");
      const result = canonicalSource(
        await call(target, owner, key, title, canonical),
        canonical,
      );
      assert.equal(result.kind, "created");
      savedId = result.case.id;
    } else savedId = canonicalSource(rawReply, canonical).case.id;

    const replay = canonicalSource(
      await call(target, owner, key, title, parsed.data.sourceUrl!),
      canonical,
    );
    assert.equal(
      replay.kind,
      "replayed",
      "Retry via BFF-normalized URL must preserve the original intent",
    );
    assert.equal(replay.case.id, savedId);
    const warning = replyResult(
      await call(target, owner, randomUUID(), `Different-${title}`, canonical),
    );
    assert.equal(
      warning.kind,
      "duplicates",
      "A new key/title with the same publication URL must warn",
    );
    assert.ok(warning.matches?.some((row) => row.id === savedId));

    const direct = await request(
      target,
      owner.token,
      table,
      "POST",
      {
        request_id: randomUUID(),
        title: `Direct-${title}`,
        source_url: canonical,
      },
      {},
      "public",
    );
    assert.equal(
      direct.status,
      201,
      "Canonical BFF URL must also pass direct Data API constraints",
    );
    assert.equal(
      (direct.body as { source_url: string }[])[0]?.source_url,
      canonical,
    );
    if (new URL(raw).searchParams.has("posting")) {
      assert.equal(
        new URL(canonical).searchParams.get("posting"),
        new URL(raw).searchParams.get("posting"),
        "Publication identifier must survive canonicalization",
      );
    }
  }
}

/** Deliberate old-helper sensitivity is confined to the guarded disposable DB. */
export async function verifyOldUrlHelperSensitivity(
  target: RecruitmentTarget,
  owner: User,
) {
  await readRecruitmentTarget(target.id);
  await verifyRecruitmentMigrations(target.id);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  const signature = "public.recruitment_source_url(text)";
  const observe = async () => {
    const [fn] =
      await sql`select pg_get_functiondef(p.oid) definition,p.prosecdef,p.proacl::text acl from pg_proc p where p.oid=${signature}::regprocedure`;
    assert.ok(fn?.definition);
    assert.equal(fn.prosecdef, false);
    return fn;
  };
  const before = await observe();
  let negativeCaseId: string | null = null;
  const fingerprint = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  try {
    const source = await readFile(
      new URL(
        "../../../db/recruitment/migrations/0000_recruitment_validation.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const old = source.match(
      /CREATE FUNCTION public\.recruitment_source_url\([\s\S]+?\n\$fn\$;/,
    )?.[0];
    assert.ok(
      old,
      "Canonical historical helper must exist for negative sensitivity",
    );
    await sql.unsafe(
      old.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"),
    );
    const raw = uniqueSource("https://example.invalid/a/../b?posting=42#keep");
    const canonical = new URL(raw).href;
    const reply = await call(
      target,
      owner,
      randomUUID(),
      `Old-helper-${randomUUID()}`,
      raw,
    );
    assert.equal(reply.status, 200);
    const result = reply.body as Result;
    assert.equal(result.kind, "created");
    negativeCaseId = result.case.id;
    assert.equal(
      result.case.source_url,
      raw,
      "Negative control must reproduce the old noncanonical persistence bug",
    );
    assert.throws(
      () => canonicalSource(reply, canonical),
      { name: "AssertionError" },
      "The unchanged canonical representation oracle must reject the historical helper",
    );
  } finally {
    try {
      await sql.unsafe(before.definition);
      // Remove only the deliberately noncanonical row created by this control.
      // Product user grants remain unchanged; this is disposable fixture cleanup.
      if (negativeCaseId) {
        const removed =
          await sql`delete from public.recruitment_case where id=${negativeCaseId}::uuid and owner_id=${owner.id}::uuid returning id`;
        assert.equal(removed.length, 1);
      }
      assert.equal(
        fingerprint(await observe()),
        fingerprint(before),
        "Exact URL helper definition/ACL/INVOKER fingerprint must be restored",
      );
    } finally {
      await sql.end();
      await verifyRecruitmentMigrations(target.id);
    }
  }
}
