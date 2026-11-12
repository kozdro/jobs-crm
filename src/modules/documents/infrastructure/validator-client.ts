import "server-only";
import { getDocumentsSecrets } from "@/shared/server/env";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";

/** A caller must first establish that this pending version belongs to the user. */
export async function validatePendingVersion(versionId: string): Promise<void> {
  if (!uuidPattern.test(versionId)) throw new Error("Validator unavailable");
  const secrets = getDocumentsSecrets();
  if (
    !secrets.validatorUrl ||
    !secrets.validatorServiceSecret ||
    Buffer.byteLength(secrets.validatorServiceSecret) < 32
  )
    throw new Error("Validator unavailable");
  const endpoint = new URL(secrets.validatorUrl);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
      ))
  )
    throw new Error("Validator unavailable");
  const response = await fetch(new URL("/validate", endpoint), {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${secrets.validatorServiceSecret}`,
    },
    body: JSON.stringify({ versionId }),
    signal: AbortSignal.timeout(35000),
  });
  const result: unknown = await response.json();
  if (
    !response.ok ||
    !result ||
    typeof result !== "object" ||
    (result as Record<string, unknown>).kind !== "ready" ||
    (result as Record<string, unknown>).versionId !== versionId
  )
    throw new Error("Document finalization unconfirmed");
}
