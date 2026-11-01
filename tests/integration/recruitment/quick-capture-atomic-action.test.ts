/** DEC-061: real Auth/Data API/PostgreSQL atomic create + optional fact. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  errorCode,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Atomic Action requires guarded disposable target");
const target = await readRecruitmentTarget(id);
const rpc = "/rest/v1/rpc/create_recruitment_case_atomic";
const recoveryRpc = "/rest/v1/rpc/get_recruitment_case_capture_receipt";
const api = (
  token: string | undefined,
  path: string,
  method = "GET",
  body?: unknown,
) => request(target, token, path, method, body, {}, "public");
const privateApi = (
  token: string | undefined,
  path: string,
  method = "GET",
  body?: unknown,
) => request(target, token, path, method, body, {}, "recruitment_private");
const db = () =>
  postgres({ ...target.db, max: 1, ssl: false, onnotice: () => {} });
const warsawToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

type Action =
  | { kind: "save_only" }
  | {
      kind: "application" | "contact_inbound" | "contact_outbound";
      occurredOn: string | null;
      factConfirmed: true;
    };
type Intent = {
  title: string;
  description: string | null;
  sourceUrl: string | null;
  action: Action;
};
type Case = { id: string; owner_id: string; title: string; status: string };
type Event = {
  id: string;
  owner_id: string;
  request_id: string;
  case_id: string;
  kind: string;
  direction: string | null;
  occurred_on: string | null;
};
type Receipt = {
  requestId: string;
  contractVersion: 1;
  intent: Intent;
  intentFingerprint: string;
  case: Case;
  event: Event | null;
  recordedAt: string;
};
type AtomicResult =
  | { kind: "created" | "replayed"; receipt: Receipt }
  | {
      kind: "duplicates";
      matches: Case[];
      hasMore: boolean;
      intentFingerprint: string;
      matchSetFingerprint: string;
    };

function body(
  title: string,
  action: Action,
  extra: Partial<Intent> = {},
): Intent {
  return {
    title,
    description: null,
    sourceUrl: null,
    action,
    ...extra,
  };
}
function command(
  requestId: string,
  intent: unknown,
  duplicateAcknowledgement?: unknown,
) {
  return {
    p_request_id: requestId,
    p_intent: intent,
    ...(duplicateAcknowledgement === undefined
      ? {}
      : { p_duplicate_acknowledgement: duplicateAcknowledgement }),
  };
}
function successful(reply: Reply): AtomicResult {
  assert.equal(
    reply.status,
    200,
    `Expected RPC success; status=${reply.status}`,
  );
  const result = reply.body as AtomicResult;
  assert.ok(["created", "replayed", "duplicates"].includes(result.kind));
  return result;
}
function receipt(reply: Reply): Receipt {
  const result = successful(reply);
  assert.ok(result.kind === "created" || result.kind === "replayed");
  assert.ok(result.receipt?.requestId);
  assert.ok(result.receipt?.case?.id);
  return result.receipt;
}
function conflict(reply: Reply) {
  assert.equal(reply.status, 409, "Expected an HTTP 409 intent conflict");
  assert.equal(errorCode(reply), "PT409", "Expected the PT409 conflict code");
}
async function countRows(
  ownerId: string,
  requestId: string,
  targetTable: "recruitment_case",
): Promise<Case[]>;
async function countRows(
  ownerId: string,
  requestId: string,
  targetTable: "recruitment_case_event",
): Promise<Event[]>;
async function countRows(
  ownerId: string,
  requestId: string,
  targetTable: "recruitment_case" | "recruitment_case_event",
): Promise<(Case | Event)[]> {
  const connection = db();
  try {
    let rows: (Case | Event)[];
    if (targetTable === "recruitment_case") {
      rows = await connection<Case[]>`
            select id, owner_id, title, status from public.recruitment_case
            where owner_id = ${ownerId} and request_id = ${requestId}::uuid`;
    } else {
      rows = await connection<Event[]>`
            select id, owner_id, request_id, case_id, kind, direction, occurred_on
            from public.recruitment_case_event
            where owner_id = ${ownerId} and request_id = ${requestId}::uuid`;
    }
    return Array.from(rows);
  } finally {
    await connection.end();
  }
}
async function receiptRows(ownerId: string, requestId: string) {
  const connection = db();
  try {
    const rows = await connection<Receipt[]>`
      select receipt from recruitment_private.recruitment_case_capture_receipt
      where owner_id = ${ownerId} and request_id = ${requestId}::uuid`;
    return Array.from(rows);
  } finally {
    await connection.end();
  }
}

async function captureHistorySnapshot(ownerId: string, caseId: string) {
  const connection = db();
  try {
    const cases = await connection`
      select id, owner_id, request_id, status, current_stage, stage_version, case_revision
      from public.recruitment_case
      where owner_id = ${ownerId} and id = ${caseId}::uuid`;
    const facts = await connection`
      select id, owner_id, request_id, case_id, kind, direction, occurred_on, revision, voided
      from public.recruitment_case_event_current
      where owner_id = ${ownerId} and case_id = ${caseId}::uuid
      order by id`;
    const corrections = await connection`
      select id, request_id, event_id, operation, revision, occurred_on, direction
      from public.recruitment_case_event_revision
      where owner_id = ${ownerId} and case_id = ${caseId}::uuid
      order by id`;
    const lifecycle = await connection`
      select id, request_id, kind, cycle, expected_case_revision, resulting_status
      from public.recruitment_case_lifecycle
      where owner_id = ${ownerId} and case_id = ${caseId}::uuid
      order by expected_case_revision, id`;
    return {
      cases: Array.from(cases),
      facts: Array.from(facts),
      corrections: Array.from(corrections),
      lifecycle: Array.from(lifecycle),
    };
  } finally {
    await connection.end();
  }
}

test(
  "DEC-061 P1: four actions persist one case and zero or one truthful event",
  { timeout: 120_000 },
  async (t) => {
    const [a] = await createAccounts(target);
    const actions: Action[] = [
      { kind: "save_only" },
      { kind: "application", occurredOn: "2000-01-02", factConfirmed: true },
      { kind: "contact_inbound", occurredOn: null, factConfirmed: true },
      {
        kind: "contact_outbound",
        occurredOn: warsawToday(),
        factConfirmed: true,
      },
    ];
    for (const action of actions) {
      await t.test(action.kind, async () => {
        const requestId = randomUUID();
        const intent = body(`Atomic ${action.kind} ${randomUUID()}`, action);
        const saved = receipt(
          await api(a.token, rpc, "POST", command(requestId, intent)),
        );
        assert.equal(saved.contractVersion, 1);
        assert.equal(saved.requestId, requestId);
        assert.deepEqual(saved.intent, intent);
        assert.equal(
          saved.case.status,
          action.kind === "save_only" ? "Zapisane" : "Kontakt rozpoczęty",
        );
        assert.ok(Number.isFinite(Date.parse(saved.recordedAt)));
        if (action.kind === "save_only") {
          assert.equal(saved.event, null);
          assert.deepEqual(
            await countRows(a.id, requestId, "recruitment_case_event"),
            [],
          );
        } else {
          assert.ok(saved.event?.id);
          assert.equal(saved.event?.case_id, saved.case.id);
          assert.equal(
            saved.event?.kind,
            action.kind === "application" ? "application" : "contact",
          );
          assert.equal(
            saved.event?.direction,
            action.kind === "contact_inbound"
              ? "inbound"
              : action.kind === "contact_outbound"
                ? "outbound"
                : null,
          );
          assert.equal(
            saved.event?.occurred_on,
            action.kind === "application"
              ? "2000-01-02"
              : action.kind === "contact_outbound"
                ? warsawToday()
                : null,
          );
          const events = await countRows(
            a.id,
            requestId,
            "recruitment_case_event",
          );
          assert.equal(events.length, 1);
          assert.equal(events[0].id, saved.event?.id);
          assert.equal(events[0].owner_id, a.id);
          assert.equal(events[0].request_id, requestId);
        }
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case")).length,
          1,
        );
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case"))[0].owner_id,
          a.id,
        );
        assert.equal((await receiptRows(a.id, requestId)).length, 1);
      });
    }
  },
);

test(
  "DEC-061 P2: full-intent replay, canonical key order, changed-intent conflict and recovery GET are read-only",
  { timeout: 120_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const requestId = randomUUID();
    const intent = body(
      `Replay ${randomUUID()}`,
      {
        kind: "application",
        occurredOn: null,
        factConfirmed: true,
      },
      {
        description: "sensitive but server-owned receipt",
        sourceUrl: "https://example.invalid/job?id=one",
      },
    );
    const first = receipt(
      await api(a.token, rpc, "POST", command(requestId, intent)),
    );

    await t.test(
      "same canonical intent and reordered JSON replay one immutable result",
      async () => {
        const reordered = {
          action: {
            factConfirmed: true,
            occurredOn: null,
            kind: "application",
          },
          sourceUrl: intent.sourceUrl,
          title: intent.title,
          description: intent.description,
        };
        const replay = successful(
          await api(a.token, rpc, "POST", command(requestId, reordered)),
        );
        assert.equal(replay.kind, "replayed");
        assert.deepEqual((replay as { receipt: Receipt }).receipt, first);
        const recovered = await api(a.token, recoveryRpc, "POST", {
          p_request_id: requestId,
        });
        assert.equal(recovered.status, 200);
        assert.deepEqual(recovered.body, { kind: "receipt", receipt: first });
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case")).length,
          1,
        );
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case_event")).length,
          1,
        );
      },
    );

    await t.test(
      "every changed business field conflicts without mutation",
      async () => {
        const changed: Intent[] = [
          { ...intent, title: `${intent.title} changed` },
          { ...intent, description: "changed" },
          { ...intent, sourceUrl: "https://example.invalid/job?id=two" },
          {
            ...intent,
            action: {
              kind: "application",
              occurredOn: "2000-01-01",
              factConfirmed: true,
            },
          },
          {
            ...intent,
            action: {
              kind: "contact_inbound",
              occurredOn: null,
              factConfirmed: true,
            },
          },
        ];
        for (const input of changed)
          conflict(await api(a.token, rpc, "POST", command(requestId, input)));
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case")).length,
          1,
        );
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case_event")).length,
          1,
        );
        assert.equal((await receiptRows(a.id, requestId)).length, 1);
      },
    );

    await t.test(
      "concurrent same owner/key/intent converges on one persisted receipt",
      async () => {
        const concurrentId = randomUUID();
        const concurrentIntent = body(`Concurrent ${randomUUID()}`, {
          kind: "contact_inbound",
          occurredOn: null,
          factConfirmed: true,
        });
        const replies = await Promise.all(
          Array.from({ length: 4 }, () =>
            api(a.token, rpc, "POST", command(concurrentId, concurrentIntent)),
          ),
        );
        const values = replies.map(receipt);
        assert.equal(new Set(values.map((value) => value.case.id)).size, 1);
        assert.equal(new Set(values.map((value) => value.event?.id)).size, 1);
        assert.equal(
          (await countRows(a.id, concurrentId, "recruitment_case")).length,
          1,
        );
        assert.equal(
          (await countRows(a.id, concurrentId, "recruitment_case_event"))
            .length,
          1,
        );
        assert.equal((await receiptRows(a.id, concurrentId)).length, 1);
      },
    );

    await t.test(
      "B and anonymous recovery cannot read A receipt or metadata",
      async () => {
        for (const token of [b.token, undefined]) {
          const result = await api(token, recoveryRpc, "POST", {
            p_request_id: requestId,
          });
          if (token === b.token) {
            assert.equal(result.status, 200);
            assert.deepEqual(result.body, { kind: "not-found" });
          } else denied(result);
          assert.equal(
            JSON.stringify(result.body).includes(first.intent.title),
            false,
          );
          assert.equal(
            JSON.stringify(result.body).includes(first.intentFingerprint),
            false,
          );
        }
      },
    );

    await t.test(
      "private receipt schema rejects owner, B and anonymous read/write verbs; replay remains immutable",
      async () => {
        const table = "/rest/v1/recruitment_case_capture_receipt";
        const requestIdForInsert = randomUUID();
        const attemptedReceipt = {
          ...first,
          requestId: requestIdForInsert,
        };
        const attemptedInsert = {
          owner_id: a.id,
          request_id: requestIdForInsert,
          contract_version: first.contractVersion,
          intent: first.intent,
          intent_fingerprint: first.intentFingerprint,
          case_id: first.case.id,
          event_id: first.event?.id ?? null,
          receipt: attemptedReceipt,
        };
        const filter = `?owner_id=eq.${a.id}&request_id=eq.${requestId}`;
        const cleanup = db();
        try {
          for (const token of [a.token, b.token, undefined]) {
            denied(await privateApi(token, `${table}?select=*`));
            denied(await privateApi(token, table, "POST", attemptedInsert));
            denied(
              await privateApi(token, `${table}${filter}`, "PATCH", {
                recorded_at: "2099-01-01T00:00:00.000Z",
              }),
            );
            denied(await privateApi(token, `${table}${filter}`, "DELETE"));
          }
        } finally {
          try {
            await cleanup`
              delete from recruitment_private.recruitment_case_capture_receipt
              where owner_id = ${a.id}::uuid and request_id = ${requestIdForInsert}::uuid
            `;
          } finally {
            await cleanup.end();
          }
        }

        assert.deepEqual(
          await receiptRows(a.id, requestIdForInsert),
          [],
          "Direct Data API INSERT must not create a receipt",
        );
        const replay = successful(
          await api(a.token, rpc, "POST", command(requestId, intent)),
        );
        assert.equal(replay.kind, "replayed");
        assert.deepEqual((replay as { receipt: Receipt }).receipt, first);
        const recovered = await api(a.token, recoveryRpc, "POST", {
          p_request_id: requestId,
        });
        assert.equal(recovered.status, 200);
        assert.deepEqual(recovered.body, { kind: "receipt", receipt: first });
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case")).length,
          1,
        );
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case_event")).length,
          1,
        );
        assert.equal((await receiptRows(a.id, requestId)).length, 1);
      },
    );

    await t.test(
      "same requestId is owner-scoped and GET never mutates",
      async () => {
        const bIntent = body(`B separate namespace ${randomUUID()}`, {
          kind: "save_only",
        });
        const bReceipt = receipt(
          await api(b.token, rpc, "POST", command(requestId, bIntent)),
        );
        assert.notEqual(bReceipt.case.id, first.case.id);
        const before = {
          aCases: await countRows(a.id, requestId, "recruitment_case"),
          aEvents: await countRows(a.id, requestId, "recruitment_case_event"),
          aReceipts: await receiptRows(a.id, requestId),
        };
        await api(a.token, recoveryRpc, "POST", { p_request_id: requestId });
        await api(b.token, recoveryRpc, "POST", { p_request_id: requestId });
        assert.deepEqual(
          {
            aCases: await countRows(a.id, requestId, "recruitment_case"),
            aEvents: await countRows(a.id, requestId, "recruitment_case_event"),
            aReceipts: await receiptRows(a.id, requestId),
          },
          before,
        );
      },
    );
  },
);

test(
  "DEC-061 P2: duplicate warning precedes mutation and acknowledgement binds the current full match set",
  { timeout: 120_000 },
  async () => {
    const [a] = await createAccounts(target);
    const title = `Full duplicate set ${randomUUID()}`;
    const requestId = randomUUID();
    const intent = body(title, { kind: "save_only" });
    const connection = db();
    try {
      const seed = Array.from({ length: 21 }, () => ({
        owner_id: a.id,
        request_id: randomUUID(),
        title,
        status: "Zapisane",
      }));
      await connection`insert into public.recruitment_case ${connection(seed)}`;
    } finally {
      await connection.end();
    }

    const warning = successful(
      await api(a.token, rpc, "POST", command(requestId, intent)),
    );
    assert.ok(warning.kind === "duplicates");
    assert.equal(warning.matches.length, 20);
    assert.equal(warning.hasMore, true);
    assert.deepEqual(await countRows(a.id, requestId, "recruitment_case"), []);
    assert.deepEqual(
      await countRows(a.id, requestId, "recruitment_case_event"),
      [],
    );
    assert.deepEqual(await receiptRows(a.id, requestId), []);

    const addMatch = db();
    try {
      await addMatch`
        insert into public.recruitment_case(owner_id,request_id,title,status)
        values (${a.id},${randomUUID()}::uuid,${title},'Zapisane')
      `;
    } finally {
      await addMatch.end();
    }
    const oldAcknowledgement = {
      intentFingerprint: warning.intentFingerprint,
      matchSetFingerprint: warning.matchSetFingerprint,
      createSeparateCase: true,
    };
    const refreshed = successful(
      await api(
        a.token,
        rpc,
        "POST",
        command(requestId, intent, oldAcknowledgement),
      ),
    );
    assert.ok(refreshed.kind === "duplicates");
    assert.equal(refreshed.hasMore, true);
    assert.notEqual(refreshed.matchSetFingerprint, warning.matchSetFingerprint);
    assert.deepEqual(await countRows(a.id, requestId, "recruitment_case"), []);
    assert.deepEqual(await receiptRows(a.id, requestId), []);

    const currentAcknowledgement = {
      intentFingerprint: refreshed.intentFingerprint,
      matchSetFingerprint: refreshed.matchSetFingerprint,
      createSeparateCase: true,
    };
    const created = receipt(
      await api(
        a.token,
        rpc,
        "POST",
        command(requestId, intent, currentAcknowledgement),
      ),
    );
    assert.equal(created.case.title, title);
    assert.equal(created.case.status, "Zapisane");
    assert.equal(created.event, null);
    assert.equal(
      (await countRows(a.id, requestId, "recruitment_case")).length,
      1,
    );
    assert.equal((await receiptRows(a.id, requestId)).length, 1);

    const racingTitle = `Duplicate race ${randomUUID()}`;
    const racing = await Promise.all(
      [randomUUID(), randomUUID()].map((racingId) =>
        api(
          a.token,
          rpc,
          "POST",
          command(racingId, body(racingTitle, { kind: "save_only" })),
        ),
      ),
    );
    const outcomes = racing.map(successful);
    assert.equal(
      outcomes.filter((value) => value.kind === "created").length,
      1,
    );
    assert.equal(
      outcomes.filter((value) => value.kind === "duplicates").length,
      1,
    );
    const createdResult = outcomes.find(
      (
        value,
      ): value is Extract<AtomicResult, { kind: "created" | "replayed" }> =>
        value.kind === "created",
    );
    const duplicateResult = outcomes.find(
      (value): value is Extract<AtomicResult, { kind: "duplicates" }> =>
        value.kind === "duplicates",
    );
    assert.ok(createdResult);
    assert.ok(duplicateResult);
    assert.ok(createdResult.receipt.case.id);
    assert.ok(
      duplicateResult.matches.some(
        (match) => match.id === createdResult.receipt.case.id,
      ),
    );
  },
);

test(
  "DEC-061 P1/P2: PostgreSQL failures after case, event and receipt roll back every write",
  { timeout: 120_000 },
  async (t) => {
    const [a] = await createAccounts(target);
    const connection = db();
    const failFunction = "recruitment_private.qa_atomic_capture_failpoint";
    const eventTrigger = "qa_atomic_event_failure";
    const caseTrigger = "qa_atomic_case_failure";
    const receiptTrigger = "qa_atomic_receipt_failure";
    try {
      await connection.unsafe(`
        create or replace function ${failFunction}() returns trigger
        language plpgsql as $$ begin raise exception 'synthetic atomic QA failure'; end $$
      `);
      for (const [name, table, timing] of [
        [caseTrigger, "public.recruitment_case", "after"],
        [eventTrigger, "public.recruitment_case_event", "after"],
        [
          receiptTrigger,
          "recruitment_private.recruitment_case_capture_receipt",
          "after",
        ],
      ] as const) {
        await t.test(`failure after ${table}`, async () => {
          await connection.unsafe(`
            create trigger ${name} ${timing} insert on ${table}
            for each row execute function ${failFunction}()
          `);
          const requestId = randomUUID();
          const input = body(`Rollback ${name} ${randomUUID()}`, {
            kind: "application",
            occurredOn: null,
            factConfirmed: true,
          });
          try {
            denied(await api(a.token, rpc, "POST", command(requestId, input)));
          } finally {
            await connection.unsafe(
              `drop trigger if exists ${name} on ${table}`,
            );
          }
          assert.deepEqual(
            await countRows(a.id, requestId, "recruitment_case"),
            [],
          );
          assert.deepEqual(
            await countRows(a.id, requestId, "recruitment_case_event"),
            [],
          );
          assert.deepEqual(await receiptRows(a.id, requestId), []);
        });
      }
    } finally {
      for (const [name, table] of [
        [caseTrigger, "public.recruitment_case"],
        [eventTrigger, "public.recruitment_case_event"],
        [
          receiptTrigger,
          "recruitment_private.recruitment_case_capture_receipt",
        ],
      ] as const) {
        await connection
          .unsafe(`drop trigger if exists ${name} on ${table}`)
          .catch(() => {});
      }
      await connection
        .unsafe(`drop function if exists ${failFunction}()`)
        .catch(() => {});
      await connection.end();
    }
  },
);

test(
  "DEC-061 compatibility and hostile input: legacy keys remain save-only and malformed action is rejected",
  { timeout: 120_000 },
  async (t) => {
    const [a] = await createAccounts(target);
    await t.test(
      "legacy save-only command still works, but same key cannot become compound",
      async () => {
        const requestId = randomUUID();
        const legacy = await api(
          a.token,
          "/rest/v1/rpc/create_recruitment_case",
          "POST",
          {
            p_request_id: requestId,
            p_title: `Legacy ${randomUUID()}`,
            p_description: null,
            p_source_url: null,
            p_allow_duplicate: false,
          },
        );
        assert.equal(legacy.status, 200);
        const compound = body(`Changed legacy ${randomUUID()}`, {
          kind: "application",
          occurredOn: null,
          factConfirmed: true,
        });
        conflict(await api(a.token, rpc, "POST", command(requestId, compound)));
        assert.deepEqual(
          await countRows(a.id, requestId, "recruitment_case_event"),
          [],
        );
        assert.deepEqual(await receiptRows(a.id, requestId), []);
      },
    );

    await t.test(
      "legacy save-only replay remains compatible without adding or reanimating a fact",
      async () => {
        const requestId = randomUUID();
        const atomicIntent = body(`Atomic prior ${randomUUID()}`, {
          kind: "save_only",
        });
        const saved = receipt(
          await api(a.token, rpc, "POST", command(requestId, atomicIntent)),
        );
        const legacy = await api(
          a.token,
          "/rest/v1/rpc/create_recruitment_case",
          "POST",
          {
            p_request_id: requestId,
            p_title: atomicIntent.title,
            p_description: null,
            p_source_url: null,
            p_allow_duplicate: false,
          },
        );
        assert.equal(legacy.status, 200);
        assert.equal((legacy.body as { kind: string }).kind, "replayed");
        assert.equal(
          (legacy.body as { case: { id: string } }).case.id,
          saved.case.id,
        );
        assert.deepEqual(
          await countRows(a.id, requestId, "recruitment_case_event"),
          [],
        );
        assert.equal((await receiptRows(a.id, requestId)).length, 1);
        assert.equal(
          (await countRows(a.id, requestId, "recruitment_case"))[0].id,
          saved.case.id,
        );
      },
    );

    await t.test(
      "atomic request rejects malformed, unconfirmed, future and unknown fields",
      async () => {
        const base = body(`Invalid ${randomUUID()}`, { kind: "save_only" });
        const invalid = [
          {
            ...base,
            action: {
              kind: "application",
              occurredOn: null,
              factConfirmed: false,
            },
          },
          { ...base, action: { kind: "application", occurredOn: null } },
          { ...base, action: { kind: "save_only", occurredOn: null } },
          {
            ...base,
            action: {
              kind: "application",
              occurredOn: "2999-01-01",
              factConfirmed: true,
            },
          },
          {
            ...base,
            action: {
              kind: "application",
              occurredOn: "2000-02-30",
              factConfirmed: true,
            },
          },
          { ...base, ownerId: randomUUID() },
          { ...base, status: "W rekrutacji" },
          { ...base, caseId: randomUUID() },
          { ...base, eventId: randomUUID() },
          { ...base, recordedAt: new Date().toISOString() },
          { ...base, recorded_at: new Date().toISOString() },
          { ...base, unexpected: "not allowed" },
        ];
        for (const intent of invalid) {
          const requestId = randomUUID();
          denied(await api(a.token, rpc, "POST", command(requestId, intent)));
          assert.deepEqual(
            await countRows(a.id, requestId, "recruitment_case"),
            [],
          );
          assert.deepEqual(await receiptRows(a.id, requestId), []);
        }
      },
    );
  },
);

test(
  "DEC-061 P1/P2: original atomic receipt replays unchanged after fact correction, close and reopen",
  { timeout: 120_000 },
  async () => {
    const [a] = await createAccounts(target);
    const requestId = randomUUID();
    const intent = body(`History replay ${randomUUID()}`, {
      kind: "application",
      occurredOn: null,
      factConfirmed: true,
    });
    const original = receipt(
      await api(a.token, rpc, "POST", command(requestId, intent)),
    );
    assert.ok(original.event);

    const correctionPreviewReply = await api(
      a.token,
      "/rest/v1/rpc/preview_recruitment_case_correction",
      "POST",
      {
        p_case_id: original.case.id,
        p_event_id: original.event.id,
        p_operation: "correct",
        p_occurred_on: "2001-02-03",
        p_direction: null,
        p_stage_name: null,
      },
    );
    assert.equal(correctionPreviewReply.status, 200);
    const correctionPreview = correctionPreviewReply.body as {
      caseRevision: number;
      eventRevision: number;
      blockedBy: unknown[];
    };
    assert.deepEqual(correctionPreview.blockedBy, []);
    const corrected = await api(
      a.token,
      "/rest/v1/rpc/correct_recruitment_case_event",
      "POST",
      {
        p_request_id: randomUUID(),
        p_case_id: original.case.id,
        p_event_id: original.event.id,
        p_operation: "correct",
        p_expected_case_revision: correctionPreview.caseRevision,
        p_expected_event_revision: correctionPreview.eventRevision,
        p_occurred_on: "2001-02-03",
        p_direction: null,
        p_stage_name: null,
      },
    );
    assert.equal(corrected.status, 200);
    assert.equal((corrected.body as { kind: string }).kind, "created");

    const close = {
      p_case_id: original.case.id,
      p_operation: "close",
      p_closure_id: null,
      p_outcome: "Inny",
      p_occurred_on: null,
      p_offer_confirmed: false,
    };
    const closePreviewReply = await api(
      a.token,
      "/rest/v1/rpc/preview_recruitment_case_lifecycle",
      "POST",
      close,
    );
    assert.equal(closePreviewReply.status, 200);
    const closePreview = closePreviewReply.body as {
      caseRevision: number;
      closureRevision: number;
      status: string;
    };
    assert.equal(closePreview.status, "Zakończone");
    const closed = await api(
      a.token,
      "/rest/v1/rpc/confirm_recruitment_case_lifecycle",
      "POST",
      {
        ...close,
        p_request_id: randomUUID(),
        p_expected_case_revision: closePreview.caseRevision,
        p_expected_closure_revision: closePreview.closureRevision,
      },
    );
    assert.equal(closed.status, 200);
    assert.equal((closed.body as { kind: string }).kind, "created");

    const reopen = {
      p_case_id: original.case.id,
      p_operation: "reopen",
      p_closure_id: null,
      p_outcome: null,
      p_occurred_on: null,
      p_offer_confirmed: false,
    };
    const reopenPreviewReply = await api(
      a.token,
      "/rest/v1/rpc/preview_recruitment_case_lifecycle",
      "POST",
      reopen,
    );
    assert.equal(reopenPreviewReply.status, 200);
    const reopenPreview = reopenPreviewReply.body as {
      caseRevision: number;
      closureRevision: number;
      status: string;
    };
    assert.equal(reopenPreview.status, "Kontakt rozpoczęty");
    const reopened = await api(
      a.token,
      "/rest/v1/rpc/confirm_recruitment_case_lifecycle",
      "POST",
      {
        ...reopen,
        p_request_id: randomUUID(),
        p_expected_case_revision: reopenPreview.caseRevision,
        p_expected_closure_revision: reopenPreview.closureRevision,
      },
    );
    assert.equal(reopened.status, 200);
    assert.equal((reopened.body as { kind: string }).kind, "created");

    const beforeReplay = await captureHistorySnapshot(a.id, original.case.id);
    const receiptBeforeReplay = await receiptRows(a.id, requestId);
    assert.equal(beforeReplay.cases.length, 1);
    assert.equal(beforeReplay.cases[0].status, "Kontakt rozpoczęty");
    assert.ok(Number(beforeReplay.cases[0].case_revision) >= 3);
    assert.equal(beforeReplay.facts.length, 1);
    assert.equal(
      beforeReplay.facts[0].occurred_on instanceof Date
        ? beforeReplay.facts[0].occurred_on.toISOString().slice(0, 10)
        : beforeReplay.facts[0].occurred_on,
      "2001-02-03",
    );
    assert.equal(beforeReplay.facts[0].revision, 1);
    assert.equal(beforeReplay.corrections.length, 1);
    assert.deepEqual(
      beforeReplay.lifecycle.map((entry) => entry.kind),
      ["close", "reopen"],
    );

    const replay = successful(
      await api(a.token, rpc, "POST", command(requestId, intent)),
    );
    assert.equal(replay.kind, "replayed");
    assert.deepEqual((replay as { receipt: Receipt }).receipt, original);
    const recovered = await api(a.token, recoveryRpc, "POST", {
      p_request_id: requestId,
    });
    assert.equal(recovered.status, 200);
    assert.deepEqual(recovered.body, { kind: "receipt", receipt: original });
    assert.deepEqual(
      await captureHistorySnapshot(a.id, original.case.id),
      beforeReplay,
      "Receipt replay must not revert correction/lifecycle projections or add events",
    );
    assert.deepEqual(await receiptRows(a.id, requestId), receiptBeforeReplay);
  },
);
