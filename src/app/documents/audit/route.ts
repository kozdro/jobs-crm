import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { getAuthConfig } from "@/shared/server/env";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
async function readAll(
  client: SupabaseClient,
  table: string,
  columns: string,
  filter: { column: string; value: string },
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq(filter.column, filter.value)
      .order("id")
      .range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new Error("Audit unavailable");
    rows.push(...(data as unknown as Row[]));
    if (data.length < 500) return rows;
  }
}
export async function GET(request: NextRequest) {
  const cookieResponse = protectAuthResponse(NextResponse.json({}));
  function reply(body: unknown, status = 200) {
    return protectAuthResponse(
      NextResponse.json(body, { status, headers: cookieResponse.headers }),
    );
  }
  try {
    const config = getAuthConfig();
    if (!config.enabled) return reply({ kind: "unavailable" }, 503);
    if (
      request.headers.get("host")?.toLowerCase() !== new URL(config.origin).host
    )
      return reply({ kind: "forbidden" }, 403);
    const documentId = request.nextUrl.searchParams.get("documentId"),
      eventId = request.nextUrl.searchParams.get("eventId");
    if (
      (documentId === null) === (eventId === null) ||
      (documentId !== null && !uuidPattern.test(documentId)) ||
      (eventId !== null && !uuidPattern.test(eventId))
    )
      return reply({ kind: "invalid" }, 400);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    if (request.headers.get("x-expected-user-id") !== data.user.id)
      return reply({ kind: "forbidden" }, 403);
    if (documentId) {
      const target = await client
        .from("document")
        .select("id")
        .eq("id", documentId)
        .maybeSingle();
      if (target.error || !target.data)
        return reply({ kind: "unavailable" }, 404);
      const [audits, versions] = await Promise.all([
        readAll(
          client,
          "document_metadata_revision",
          "id,action,version_id,recorded_at",
          { column: "document_id", value: documentId },
        ),
        readAll(client, "document_version", "id,number,state", {
          column: "document_id",
          value: documentId,
        }),
      ]);
      const entries = audits.map((audit) => {
        const version = versions.find((v) => v.id === audit.version_id);
        return {
          id: audit.id,
          kind: audit.action,
          recordedAt: audit.recorded_at,
          revision: null,
          versionNumber: version?.number ?? null,
          availability: version?.state ?? null,
        };
      });
      entries.sort((a, b) =>
        String(a.recordedAt).localeCompare(String(b.recordedAt)),
      );
      return reply({ entries });
    }
    const target = await client
      .from("recruitment_case_event")
      .select("id")
      .eq("id", eventId!)
      .maybeSingle();
    if (target.error || !target.data)
      return reply({ kind: "unavailable" }, 404);
    const references = await readAll(
      client,
      "document_sent_reference",
      "id,version_id,created_at",
      { column: "event_id", value: eventId! },
    );
    const entries: {
      id: unknown;
      kind: string;
      recordedAt: unknown;
      revision: number;
      versionNumber: unknown;
      versionId: unknown;
      availability: unknown;
    }[] = [];
    for (const ref of references) {
      const versions = await client
        .from("document_version")
        .select("id,number,state")
        .eq("id", ref.version_id)
        .maybeSingle();
      if (versions.error || !versions.data)
        throw new Error("Version unavailable");
      entries.push({
        id: ref.id,
        kind: "sent-add",
        recordedAt: ref.created_at,
        revision: 0,
        versionNumber: versions.data.number,
        versionId: ref.version_id,
        availability: versions.data.state,
      });
      const revisions = await readAll(
        client,
        "document_sent_revision",
        "id,revision,version_id,withdrawn,created_at",
        { column: "reference_id", value: String(ref.id) },
      );
      revisions.sort((a, b) => Number(a.revision) - Number(b.revision));
      let effectiveVersionId = ref.version_id;
      for (const revision of revisions) {
        if (revision.version_id) effectiveVersionId = revision.version_id;
        const version = effectiveVersionId
          ? await client
              .from("document_version")
              .select("number,state")
              .eq("id", effectiveVersionId)
              .maybeSingle()
          : null;
        if (version?.error) throw new Error("Version unavailable");
        entries.push({
          id: revision.id,
          kind: revision.withdrawn ? "sent-withdraw" : "sent-correct",
          recordedAt: revision.created_at,
          revision: Number(revision.revision),
          versionNumber: version?.data?.number ?? null,
          versionId: effectiveVersionId,
          availability: version?.data?.state ?? null,
        });
      }
    }
    entries.sort((a, b) =>
      String(a.recordedAt).localeCompare(String(b.recordedAt)),
    );
    return reply({ entries });
  } catch {
    return reply({ kind: "unavailable" }, 503);
  }
}
