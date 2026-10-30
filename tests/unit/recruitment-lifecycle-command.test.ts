import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({
  getAuthConfig: vi.fn(),
  getRouteClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.getAuthConfig }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.getRouteClient,
}));
import { POST } from "@/app/recruitments/commands/route";
import {
  recordRecruitmentCaseEvent,
  listRecruitmentCaseEvents,
  getRecruitmentCaseEventByRequestId,
} from "@/modules/recruitment/application/case-events";
import {
  createRecruitmentCase,
  CaseRepositoryError,
} from "@/modules/recruitment/application/cases";
const owner = "00000000-0000-4000-8000-000000000001";
const input = {
  requestId: "00000000-0000-4000-8000-000000000002",
  caseId: "00000000-0000-4000-8000-000000000003",
  kind: "contact" as const,
  direction: "inbound" as const,
  occurredOn: "2026-10-01",
};
const event = {
  id: "00000000-0000-4000-8000-000000000004",
  case_id: input.caseId,
  kind: input.kind,
  direction: input.direction,
  occurred_on: input.occurredOn,
  recorded_at: "2026-10-30T12:00:00Z",
};
function request(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new NextRequest("https://app.example.test/recruitments/commands", {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin: "https://app.example.test",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      expectedUserId: owner,
      action: "record-event",
      ...input,
      ...extra,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthConfig.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: owner } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({
    data: { kind: "created", event },
    error: null,
  });
  mocks.getRouteClient.mockImplementation((_request, response) => {
    response.cookies.set("sdk-session", "synthetic");
    return { auth: { getUser: mocks.getUser }, rpc: mocks.rpc };
  });
});
describe("Lifecycle command identity and response boundary", () => {
  it("verifies identity before invoker RPC; projects no owner/intent and preserves protected cookies", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "created", event });
    expect(mocks.rpc).toHaveBeenCalledWith("record_recruitment_case_event", {
      p_request_id: input.requestId,
      p_case_id: input.caseId,
      p_kind: input.kind,
      p_direction: input.direction,
      p_occurred_on: input.occurredOn,
    });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
    expect(response.cookies.get("sdk-session")?.value).toBe("synthetic");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects unsafe origin, changed current identity and spoofed domain fields without writing", async () => {
    expect(
      (await POST(request({}, { origin: "https://foreign.test" }))).status,
    ).toBe(403);
    expect((await POST(request({ ownerId: owner }))).status).toBe(400);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: input.caseId } },
      error: null,
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["PT409", 409, "conflict"],
    ["22023", 400, "invalid"],
    ["42501", 503, "unavailable"],
    ["XX000", 503, "unavailable"],
  ])("redacts private database errors %s", async (code, status, kind) => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code, message: "private details", details: owner },
    });
    const response = await POST(request());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.kind).toBe(kind);
    expect(JSON.stringify(body)).not.toContain("private details");
    expect(JSON.stringify(body)).not.toContain(owner);
  });
  it("rejects response with an unrelated fact rather than reporting false success", async () => {
    mocks.rpc.mockResolvedValue({
      data: { kind: "created", event: { ...event, case_id: owner } },
      error: null,
    });
    expect((await POST(request())).status).toBe(503);
  });
  it("reads create replay after lifecycle transition, without treating it as a new saved case", async () => {
    const contacted = {
      id: input.caseId,
      title: "Existing",
      description: null,
      source_url: null,
      status: "Kontakt rozpoczęty",
      created_at: event.recorded_at,
    };
    mocks.rpc.mockResolvedValue({
      data: { kind: "replayed", case: contacted },
      error: null,
    });
    const result = await createRecruitmentCase(
      { rpc: mocks.rpc } as unknown as SupabaseClient,
      {
        requestId: input.requestId,
        title: "Existing",
        description: null,
        sourceUrl: null,
        allowDuplicate: false,
      },
    );
    expect(result).toEqual({ kind: "replayed", case: contacted });
  });
});
describe("Lifecycle read projection and bounded pagination", () => {
  function clientFor(data: unknown, error: unknown = null) {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      maybeSingle: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.range.mockResolvedValue({ data, error });
    chain.maybeSingle.mockResolvedValue({ data, error });
    return {
      client: { from: vi.fn(() => chain) } as unknown as SupabaseClient,
      chain,
    };
  }
  it("requests known days before unknown dates and returns explicit next-page signal without leaking private columns", async () => {
    const { client, chain } = clientFor(
      Array.from({ length: 26 }, () => ({
        ...event,
        owner_id: owner,
        request_id: input.requestId,
      })),
    );
    const result = await listRecruitmentCaseEvents(client, input.caseId, 2);
    expect(result.events).toHaveLength(25);
    expect(result.hasMore).toBe(true);
    expect(result.events[0]).toEqual(event);
    expect(chain.range).toHaveBeenCalledWith(25, 50);
    expect(chain.order.mock.calls).toEqual([
      ["occurred_on", { ascending: false, nullsFirst: false }],
      ["recorded_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(chain.eq).toHaveBeenCalledWith("case_id", input.caseId);
  });
  it.each([0, -1, 1.2, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid page %s before calling provider",
    async (page) => {
      const { client } = clientFor([]);
      await expect(
        listRecruitmentCaseEvents(client, input.caseId, page),
      ).rejects.toBeInstanceOf(CaseRepositoryError);
      expect(client.from).not.toHaveBeenCalled();
    },
  );
  it("recovers by same case and intent, without returning provider private fields", async () => {
    const { client, chain } = clientFor({
      ...event,
      owner_id: owner,
      request_id: input.requestId,
    });
    expect(
      await getRecruitmentCaseEventByRequestId(
        client,
        input.caseId,
        input.requestId,
      ),
    ).toEqual(event);
    expect(chain.eq.mock.calls).toEqual([
      ["case_id", input.caseId],
      ["request_id", input.requestId],
    ]);
  });
  it("keeps denied/absent recovery as null, and errors/malformed data as unavailable", async () => {
    expect(
      await getRecruitmentCaseEventByRequestId(
        clientFor(null).client,
        input.caseId,
        input.requestId,
      ),
    ).toBeNull();
    await expect(
      listRecruitmentCaseEvents(
        clientFor([{ ...event, kind: "invite" }]).client,
        input.caseId,
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
    await expect(
      recordRecruitmentCaseEvent(
        { rpc: vi.fn() } as unknown as SupabaseClient,
        { ...input, direction: null },
      ),
    ).rejects.toMatchObject({ kind: "invalid" });
  });
});
