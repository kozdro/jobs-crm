import type { SupabaseClient } from "@supabase/supabase-js";
import { CaseRepositoryError } from "@/modules/recruitment/application/cases";
import { readEvent } from "@/modules/recruitment/application/case-events";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import {
  parseDocumentApplicationIntent,
  type DocumentApplicationIntent,
} from "../domain/application";

function parseResult(value: unknown, input: DocumentApplicationIntent) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CaseRepositoryError("unavailable");
  const result = value as Record<string, unknown>;
  if (
    (result.kind !== "created" && result.kind !== "replayed") ||
    !Array.isArray(result.sentVersionIds) ||
    result.sentVersionIds.length !== input.sentVersionIds.length ||
    result.sentVersionIds.some(
      (id: unknown, i: number) =>
        typeof id !== "string" ||
        !uuidPattern.test(id) ||
        id.toLowerCase() !== input.sentVersionIds[i].toLowerCase(),
    )
  )
    throw new CaseRepositoryError("unavailable");
  const event = readEvent(result.event);
  if (
    event.case_id !== input.caseId ||
    event.kind !== "application" ||
    event.direction !== null ||
    event.occurred_on !== input.occurredOn
  )
    throw new CaseRepositoryError("unavailable");
  return {
    kind: result.kind,
    event,
    sentVersionIds: result.sentVersionIds as string[],
  };
}

/** Not exposed until the database command and the Storage boundary are verified. */
export async function recordApplicationWithDocuments(
  client: SupabaseClient,
  value: DocumentApplicationIntent,
) {
  const input = parseDocumentApplicationIntent(value);
  if (!input) throw new CaseRepositoryError("invalid");
  const { data, error } = await client.rpc(
    "record_application_with_documents",
    {
      p_request_id: input.requestId,
      p_case_id: input.caseId,
      p_occurred_on: input.occurredOn,
      p_version_ids: input.sentVersionIds,
    },
  );
  if (error)
    throw new CaseRepositoryError(
      error.code === "PT409"
        ? "conflict"
        : error.code === "22023"
          ? "invalid"
          : "unavailable",
    );
  return parseResult(data, input);
}
