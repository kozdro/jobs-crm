import { randomUUID } from "node:crypto";
import type { DeliveryOutcome, DeliveryTransport } from "./core.ts";

const endpoint = "https://api.resend.com/emails";
const maxResponseBytes = 16_384;
const permanentErrors: Readonly<Record<number, readonly string[]>> = {
  400: [
    "validation_error",
    "invalid_parameter",
    "missing_required_field",
    "missing_required_parameter",
  ],
  401: ["missing_api_key", "restricted_api_key", "validation_error"],
  403: [
    "restricted_api_key",
    "invalid_permission",
    "suspended_api_key",
    "validation_error",
  ],
};

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxResponseBytes) throw new Error("Response too large");
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/** No exception or provider body escapes this boundary. */
export function createResendTransport(options: {
  apiKey: string;
  from: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): DeliveryTransport {
  const { apiKey, from, fetchImpl = fetch, timeoutMs = 10_000 } = options;
  if (
    !/^re_[A-Za-z0-9_-]+$/.test(apiKey) ||
    !from.trim() ||
    /[\r\n]/.test(from) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 15_000
  ) {
    throw new Error("Invalid email transport configuration");
  }
  return {
    async send(message): Promise<DeliveryOutcome> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<DeliveryOutcome>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve("unknown");
        }, timeoutMs);
      });
      const request = async (): Promise<DeliveryOutcome> => {
        try {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
              "idempotency-key": randomUUID(),
            },
            body: JSON.stringify({
              from,
              to: [message.recipient],
              subject: message.subject,
              text: message.text,
            }),
            signal: controller.signal,
            redirect: "error",
          });
          const value = await readJson(response);
          if (!value || typeof value !== "object" || Array.isArray(value))
            return "unknown";
          const body = value as Record<string, unknown>;
          if (
            response.status === 200 &&
            typeof body.id === "string" &&
            body.id.trim().length > 0
          )
            return "accepted";
          if (
            body.statusCode !== response.status ||
            typeof body.name !== "string"
          )
            return "unknown";
          if (response.status === 429 && body.name === "rate_limit_exceeded")
            return "safe_failure";
          if (permanentErrors[response.status]?.includes(body.name))
            return "permanent_failure";
          return "unknown";
        } catch {
          return "unknown";
        }
      };
      try {
        return await Promise.race([request(), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
        controller.abort();
      }
    },
  };
}
