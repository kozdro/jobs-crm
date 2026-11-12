import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

const maxClockSkewMs = 1000;
const permitLifetimeMs = 7 * 24 * 60 * 60 * 1000 - maxClockSkewMs;
const digestPattern = /^[0-9a-f]{64}$/;

function requestIdAt(now: number): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function signature(
  secret: Uint8Array,
  ownerId: string,
  operation: string,
  requestId: string,
  expiresAt: number,
  payloadDigest: string,
) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([ownerId, operation, requestId, expiresAt, payloadDigest]),
    )
    .digest();
}

/** Issue after authentication and after computing a digest of actual request bytes. */
export function createOperationPermit(
  secret: Uint8Array,
  ownerId: string,
  operation: "upload" | "delete" | "sent" | "document",
  payloadDigest: string,
  now = Date.now(),
) {
  if (
    secret.length < 32 ||
    !uuidPattern.test(ownerId) ||
    !digestPattern.test(payloadDigest) ||
    !Number.isSafeInteger(now)
  )
    throw new Error("Invalid operation permit input");
  if (now < 0 || now >= 2 ** 48) throw new Error("Invalid operation time");
  const requestId = requestIdAt(now);
  const expiresAt = now + permitLifetimeMs;
  const mac = signature(
    secret,
    ownerId,
    operation,
    requestId,
    expiresAt,
    payloadDigest,
  ).toString("base64url");
  return { requestId, permit: `${requestId}.${expiresAt}.${mac}` };
}

export function verifyOperationPermit(
  secret: Uint8Array,
  permit: string,
  ownerId: string,
  operation: "upload" | "delete" | "sent" | "document",
  payloadDigest: string,
  now = Date.now(),
): string | null {
  if (
    secret.length < 32 ||
    !uuidPattern.test(ownerId) ||
    !digestPattern.test(payloadDigest) ||
    !Number.isSafeInteger(now)
  )
    return null;
  const parts = permit.split(".");
  if (
    parts.length !== 3 ||
    !uuidPattern.test(parts[0]) ||
    !/^\d{13}$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  )
    return null;
  const expiresAt = Number(parts[1]);
  const issuedAt = Number.parseInt(
    parts[0].replaceAll("-", "").slice(0, 12),
    16,
  );
  if (
    !Number.isSafeInteger(expiresAt) ||
    parts[0][14] !== "7" ||
    expiresAt !== issuedAt + permitLifetimeMs ||
    issuedAt > now + maxClockSkewMs ||
    expiresAt <= now ||
    expiresAt > now + permitLifetimeMs + maxClockSkewMs
  )
    return null;
  const supplied = Buffer.from(parts[2], "base64url");
  const expected = signature(
    secret,
    ownerId,
    operation,
    parts[0],
    expiresAt,
    payloadDigest,
  );
  return supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
    ? parts[0]
    : null;
}
