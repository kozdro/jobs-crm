/** Bounded in-memory checks. Captured session material is never returned or persisted. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { stripVTControlCharacters } from "node:util";
const n = z.number().finite();
const code = z
  .string()
  .regex(/^[a-z0-9_]{1,64}$/)
  .nullable();
const signupResult = z.strictObject({
  userReturned: z.boolean(),
  sessionReturned: z.boolean(),
  identityCount: n.nullable(),
  errorCode: code,
});
const observationSchemas = {
  F3_BFCACHE_OBSERVATION: z.strictObject({
    restoredBeforeLogout: z.literal(true),
    revalidatedAfterRestore: z.literal(true),
    restoredAfterLogout: z.boolean(),
    privateDataVisibleAfterLogout: z.literal(false),
    authenticatedPageshowCount: n,
    persistedPageshowCount: n,
  }),
  F3_SIGNUP_UI_OBSERVATION: z.strictObject({
    newUiOutcome: z.literal("status"),
    existingUiOutcome: z.enum(["status", "alert"]),
    messagesEqual: z.boolean(),
    productionAntiEnumerationPolicy: z.literal(
      "OPEN-041/013 - provider configuration dependent",
    ),
  }),
  F3_REFRESH_FAULT_OBSERVATION: z.strictObject({
    delayedRefreshRequests: n,
    networkFailures: n,
    rejectedRefreshRequests: n,
    actualAccessExpiryReached: z.literal(true),
    explicitReLoginShown: z.literal(true),
    reconnectPreservedOwner: z.literal(true),
    unrelatedBPreserved: z.literal(true),
  }),

  F3_JWT_REPLAY: z.strictObject({
    scope: z.enum(["local", "global", "others"]),
    currentRefreshSessionRevoked: z.boolean(),
    issuedAt: n,
    exp: n,
    scopeAppliedAt: n,
    lastValidAt: n,
    firstDeniedAt: n,
    observedValidAfterLogoutSeconds: n,
    firstDeniedAfterExpSeconds: n,
  }),
  F3_SIGNUP_OBSERVATION: z.strictObject({
    confirmationsFixture: z.boolean(),
    newEmail: signupResult,
    existingEmail: signupResult,
    productionAntiEnumerationPolicy: z.literal("OPEN-041/013"),
  }),
  F3_RECOVERY_SESSION_OBSERVATION: z.strictObject({
    currentRecoveryPasswordUpdated: z.boolean(),
    otherSessions: z
      .array(
        z.strictObject({
          account: z.enum(["other-A-1", "other-A-2"]),
          refreshAccepted: z.boolean(),
          errorCode: code,
        }),
      )
      .max(8),
    unrelatedBRefreshAccepted: z.boolean(),
    productionSessionConsequencesPolicy: z.literal("OPEN-043/042"),
  }),
  F3_PASSWORD_POLICY_OBSERVATION: z.strictObject({
    securePasswordChangeFixture: z.boolean(),
    freshOrdinarySessionUpdateAccepted: z.boolean(),
    errorCode: code,
    stale24HourSession: z.literal(
      "NOT RUN - no auth schema timestamp tampering",
    ),
    productionFreshnessAndReauthPolicy: z.literal("OPEN-013/043"),
  }),
};
export interface OutputSummary {
  bytes: number;
  sha256: string;
  counts: Partial<
    Record<"tests" | "passed" | "failed" | "skipped" | "cancelled", number>
  >;
  observations: { kind: string; values: unknown }[];
}
function safeMetrics(
  content: string,
): Pick<OutputSummary, "counts" | "observations"> {
  const counts: OutputSummary["counts"] = {};
  const mapping = {
    tests: "tests",
    pass: "passed",
    fail: "failed",
    skipped: "skipped",
    cancelled: "cancelled",
  } as const;
  for (const match of content.matchAll(
    /^\s*(?:#|ℹ)\s+(tests|pass|fail|skipped|cancelled)\s+(\d+)\s*$/gm,
  ))
    counts[mapping[match[1] as keyof typeof mapping]] = Number(match[2]);
  for (const match of content.matchAll(
    /^\s*(\d+)\s+(passed|failed|skipped)\b/gm,
  ))
    counts[match[2] as "passed" | "failed" | "skipped"] = Number(match[1]);
  const observations: OutputSummary["observations"] = [];
  for (const match of content.matchAll(/\b(F3_[A-Z_]+) (\{[^\r\n]+\})/g)) {
    const schema =
      observationSchemas[match[1] as keyof typeof observationSchemas];
    if (!schema)
      throw new Error("F3 unknown structured observation (output withheld)");
    let values: unknown;
    try {
      values = JSON.parse(match[2]);
    } catch {
      throw new Error("F3 malformed structured observation (output withheld)");
    }
    const parsed = schema.safeParse(values);
    if (!parsed.success)
      throw new Error(
        "F3 structured observation failed safe field validation (output withheld)",
      );
    observations.push({ kind: match[1], values: parsed.data });
  }
  return { counts, observations };
}
export function assertPrivateValuesAbsent(
  content: string,
  privateValues: string[],
) {
  if (
    privateValues.some((value) => value.length > 0 && content.includes(value))
  )
    throw new Error("F3 private value detected (captured output withheld)");
}
export function captureAuthOutput(options: {
  publicKey: string;
  privateValues: string[];
  maxBytes?: number;
}) {
  const limit = options.maxBytes ?? 8 * 1024 * 1024;
  const chunks: string[] = [];
  let bytes = 0;
  let overflow = false;
  return {
    push(chunk: Buffer | string) {
      bytes += Buffer.byteLength(chunk);
      if (bytes <= limit) chunks.push(chunk.toString());
      else overflow = true;
    },
    verify() {
      if (overflow)
        throw new Error(
          "F3 captured output exceeded bounded scan budget (output withheld)",
        );
      const content = stripVTControlCharacters(chunks.join(""));
      assertPrivateValuesAbsent(content, options.privateValues);
      const jwt =
        content.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ??
        [];
      if (
        jwt.some((value) => value !== options.publicKey) ||
        /(?:Synthetic-F3-|Updated-synthetic-|Incorrect-synthetic-password!|Must-not-update-B-|Synthetic-do-not-update|Wrong-[a-f0-9-]{20,}|Recovered-[a-f0-9-]{20,}|Fresh-session-update-[a-f0-9-]{20,})/.test(
          content,
        ) ||
        /["']?(?:access_token|refresh_token)["']?\s*[:=]\s*["']?[A-Za-z0-9_.-]{8,}/i.test(
          content,
        )
      )
        throw new Error(
          "F3 session/password material detected (captured output withheld)",
        );
      return {
        bytes,
        sha256: createHash("sha256").update(content).digest("hex"),
        ...safeMetrics(content),
      };
    },
  };
}

/** Successful subprocess exit also needs the expected measured evidence, not empty reporter output. */
export function requireAuthObservations(
  summary: OutputSummary,
  stage: "sdk" | "browser",
) {
  if (
    !(summary.counts.passed && summary.counts.passed > 0) ||
    (summary.counts.failed ?? 0) !== 0 ||
    (summary.counts.skipped ?? 0) !== 0 ||
    (summary.counts.cancelled ?? 0) !== 0
  )
    throw new Error(
      "F3 required successful test counts missing (output withheld)",
    );
  const required =
    stage === "sdk"
      ? [
          "F3_JWT_REPLAY",
          "F3_SIGNUP_OBSERVATION",
          "F3_RECOVERY_SESSION_OBSERVATION",
          "F3_PASSWORD_POLICY_OBSERVATION",
        ]
      : [
          "F3_SIGNUP_UI_OBSERVATION",
          "F3_REFRESH_FAULT_OBSERVATION",
          "F3_BFCACHE_OBSERVATION",
        ];
  if (
    required.some(
      (kind) => !summary.observations.some((entry) => entry.kind === kind),
    )
  )
    throw new Error(
      "F3 required structured observations missing (output withheld)",
    );
  if (stage === "sdk") {
    const scopes = new Set(
      summary.observations
        .filter((entry) => entry.kind === "F3_JWT_REPLAY")
        .map((entry) => (entry.values as { scope: string }).scope),
    );
    if (["local", "global", "others"].some((scope) => !scopes.has(scope)))
      throw new Error(
        "F3 required three-scope JWT measurements missing (output withheld)",
      );
  }
}
