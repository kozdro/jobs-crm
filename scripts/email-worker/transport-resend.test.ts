import assert from "node:assert/strict";
import test from "node:test";
import { createResendTransport } from "./transport-resend.ts";
import { readWorkerConfig } from "./entrypoint-config.ts";

const message = {
  recipient: "synthetic@example.test",
  subject: "Przypomnienie",
  text: "Treść neutralna",
};
const options = { apiKey: "re_synthetic", from: "CRM <sender@example.test>" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const respond =
  (response: Response): typeof fetch =>
  async () =>
    response;

test("fixed endpoint, neutral payload, private authorization and unique idempotency headers", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const transport = createResendTransport({
    ...options,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return json(200, { id: "provider-id" });
    },
  });
  assert.equal(await transport.send(message), "accepted");
  assert.equal(await transport.send(message), "accepted");
  const [a, b] = calls;
  assert.equal(a.url, "https://api.resend.com/emails");
  assert.equal(a.init.method, "POST");
  assert.equal(a.init.redirect, "error");
  assert.deepEqual(JSON.parse(String(a.init.body)), {
    from: options.from,
    to: [message.recipient],
    subject: message.subject,
    text: message.text,
  });
  const headers = new Headers(a.init.headers);
  assert.equal(headers.get("authorization"), "Bearer re_synthetic");
  assert.match(headers.get("idempotency-key")!, /^[0-9a-f-]{36}$/);
  assert.notEqual(
    headers.get("idempotency-key"),
    new Headers(b.init.headers).get("idempotency-key"),
  );
});

test("only documented matching failure types are classified; ambiguous replies are unknown", async () => {
  for (const [status, body, expected] of [
    [429, { statusCode: 429, name: "rate_limit_exceeded" }, "safe_failure"],
    [400, { statusCode: 400, name: "validation_error" }, "permanent_failure"],
    [403, { statusCode: 403, name: "suspended_api_key" }, "permanent_failure"],
    [429, { statusCode: 429, name: "monthly_quota_exceeded" }, "unknown"],
    [
      409,
      { statusCode: 409, name: "concurrent_idempotent_requests" },
      "unknown",
    ],
    [503, { statusCode: 503, name: "service_unavailable" }, "unknown"],
    [200, {}, "unknown"],
    [400, { statusCode: 403, name: "validation_error" }, "unknown"],
  ] as const) {
    const transport = createResendTransport({
      ...options,
      fetchImpl: respond(json(status, body)),
    });
    assert.equal(await transport.send(message), expected);
  }
  assert.equal(
    await createResendTransport({
      ...options,
      fetchImpl: respond(new Response("not-json", { status: 200 })),
    }).send(message),
    "unknown",
  );
  assert.equal(
    await createResendTransport({
      ...options,
      fetchImpl: respond(new Response("x".repeat(17_000), { status: 200 })),
    }).send(message),
    "unknown",
  );
  assert.equal(
    await createResendTransport({
      ...options,
      fetchImpl: async () => {
        throw new Error("network");
      },
    }).send(message),
    "unknown",
  );
});

test("deadline bounds hung request and stalled response body; signal is aborted", async () => {
  let signal: AbortSignal | undefined;
  const transport = createResendTransport({
    ...options,
    timeoutMs: 20,
    fetchImpl: async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => {});
    },
  });
  assert.equal(await transport.send(message), "unknown");
  assert.equal(signal?.aborted, true);
  const stalled = new Response(new ReadableStream({ start() {} }), {
    status: 200,
  });
  assert.equal(
    await createResendTransport({
      ...options,
      timeoutMs: 20,
      fetchImpl: respond(stalled),
    }).send(message),
    "unknown",
  );
});

test("worker configuration rejects unsafe origins, injectable params and leaked-value errors", () => {
  const env = {
    EMAIL_WORKER_DATABASE_URL: "postgres://worker:secret@db.example.test/app",
    RESEND_API_KEY: "re_synthetic",
    EMAIL_FROM: "sender@example.test",
    APP_ORIGIN: "https://crm.example.test",
  };
  assert.equal(
    readWorkerConfig(env).applicationUrl.href,
    "https://crm.example.test/",
  );
  for (const patch of [
    { APP_ORIGIN: "https://crm.example.test/?token=secret" },
    { APP_ORIGIN: "http://crm.example.test" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    {
      EMAIL_WORKER_DATABASE_URL:
        "postgres://worker:secret@db.example.test/app?options=bad",
    },
    { RESEND_API_KEY: "bad\nkey" },
    { EMAIL_FROM: "sender@example.test\nBcc:evil@example.test" },
  ]) {
    assert.throws(
      () => readWorkerConfig({ ...env, ...patch }),
      (error: unknown) =>
        error instanceof Error &&
        !error.message.includes("secret") &&
        !error.message.includes("evil"),
    );
  }
});
