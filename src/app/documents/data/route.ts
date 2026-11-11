import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";
import { getRouteClient } from "@/modules/identity/infrastructure/server";
import { uuidPattern } from "@/modules/recruitment/domain/recruitment-case";
import { getAuthConfig } from "@/shared/server/env";

export const dynamic = "force-dynamic";
const pageSize = 500;
type Row = Record<string, unknown>;

async function readRows(
  client: SupabaseClient,
  table: string,
  columns: string,
  filter?: { column: string; value: string },
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = client
      .from(table)
      .select(columns)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (filter) query = query.eq(filter.column, filter.value);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("Read unavailable");
    rows.push(...(data as unknown as Row[]));
    if (data.length < pageSize) return rows;
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
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (caseId !== null && !uuidPattern.test(caseId))
      return reply({ kind: "invalid" }, 400);
    const client = getRouteClient(request, cookieResponse);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return reply({ kind: "unauthenticated" }, 401);
    if (request.headers.get("x-expected-user-id") !== data.user.id)
      return reply({ kind: "forbidden" }, 403);
    if (caseId) {
      const ownerCase = await client
        .from("recruitment_case")
        .select("id")
        .eq("id", caseId)
        .maybeSingle();
      if (ownerCase.error || !ownerCase.data)
        return reply({ kind: "unavailable" }, 404);
    }
    const [documents, versions, links, refs, revisions] = await Promise.all([
      readRows(client, "document", "id,name,is_cv,case_id,revision"),
      readRows(
        client,
        "document_version",
        "id,document_id,number,label,filename,state,revision",
      ),
      caseId
        ? readRows(client, "case_document", "id,case_id,version_id,revision", {
            column: "case_id",
            value: caseId,
          })
        : Promise.resolve([]),
      caseId
        ? readRows(
            client,
            "document_sent_reference",
            "id,case_id,event_id,version_id",
            { column: "case_id", value: caseId },
          )
        : Promise.resolve([]),
      caseId
        ? readRows(
            client,
            "document_sent_revision",
            "id,reference_id,revision,version_id,withdrawn",
          )
        : Promise.resolve([]),
    ]);
    const documentRows = documents.filter(
      (doc) =>
        ((typeof doc.name === "string" && typeof doc.is_cv === "boolean") ||
          (doc.name === null &&
            doc.is_cv === null &&
            versions.some(
              (version) =>
                version.document_id === doc.id && version.state === "deleting",
            ))) &&
        (doc.case_id === null || (caseId && doc.case_id === caseId)),
    );
    const resultDocuments = documentRows.map((doc) => ({
      id: doc.id,
      name: doc.name ?? "Dokument — usuwanie",
      isCv: doc.is_cv ?? false,
      scope: doc.case_id === null ? "library" : "case",
      revision: doc.revision,
      versions: versions
        .filter((version) => version.document_id === doc.id)
        .map((version) => ({
          id: version.id,
          number: version.number,
          label: version.label,
          filename: version.filename,
          status: version.state,
          revision: version.revision,
        })),
    }));
    const resultLinks = links.map((link) => ({
      id: link.id,
      caseId: link.case_id,
      versionId: link.version_id,
      revision: link.revision,
    }));
    const resultSent = refs.map((ref) => {
      const history = revisions
        .filter((revision) => revision.reference_id === ref.id)
        .sort((a, b) => Number(b.revision) - Number(a.revision));
      const latest = history[0];
      const versionId =
        history.find((revision) => revision.version_id)?.version_id ??
        ref.version_id;
      const version = versions.find((item) => item.id === versionId);
      if (!version) throw new Error("Sent version unavailable");
      return {
        id: ref.id,
        eventId: ref.event_id,
        versionId,
        versionNumber: version.number,
        status: latest?.withdrawn
          ? "withdrawn"
          : version.state === "deleting"
            ? "deleting"
            : version.state === "deleted"
              ? "deleted"
              : "active",
        revision: latest?.revision ?? 0,
      };
    });
    return reply({
      documents: resultDocuments,
      links: resultLinks,
      sent: resultSent,
    });
  } catch {
    return reply({ kind: "unavailable" }, 503);
  }
}
