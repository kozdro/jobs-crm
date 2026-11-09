import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  route: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/shared/server/env", () => ({ getAuthConfig: mocks.config }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.route,
}));
import { GET, POST } from "@/app/reminders/email/route";
const owner = "00000000-0000-4000-8000-000000000001";
const task = "00000000-0000-4000-8000-000000000002";
const configId = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const consentVersion = "00000000-0000-4000-8000-000000000005";
const url = "https://app.example.test/reminders/email";
const payload = {
  expectedUserId: owner,
  taskId: task,
  configurationId: configId,
  requestId,
  operation: "enable",
  consentVersion,
};
function post(
  body: Record<string, unknown>,
  origin = "https://app.example.test",
) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      host: "app.example.test",
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    enabled: true,
    origin: "https://app.example.test",
  });
  mocks.user.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  mocks.route.mockReturnValue({
    auth: { getUser: mocks.user },
    rpc: mocks.rpc,
  });
  mocks.rpc.mockResolvedValue({ data: { kind: "created" }, error: null });
});
describe("email reminder route boundary", () => {
  it("uses trusted current identity and passes only the frozen consent intent", async () => {
    const response = await POST(post(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "created" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("execute_email_reminder", {
      p_request_id: requestId,
      p_task_id: task,
      p_configuration_id: configId,
      p_enabled: true,
      p_consent_version: consentVersion,
    });
    expect(mocks.user.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
  });
  it("rejects changed account, unsafe origin and client-selected email before any write", async () => {
    expect((await POST(post(payload, "https://attacker.example"))).status).toBe(
      403,
    );
    expect(
      (await POST(post({ ...payload, email: "synthetic@example.test" })))
        .status,
    ).toBe(400);
    mocks.user.mockResolvedValue({ data: { user: { id: task } }, error: null });
    expect((await POST(post(payload))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires the observed version for enable, but permits disable without it", async () => {
    const withoutVersion: Record<string, unknown> = { ...payload };
    delete withoutVersion.consentVersion;
    expect((await POST(post(withoutVersion))).status).toBe(400);
    expect(
      (await POST(post({ ...withoutVersion, operation: "disable" }))).status,
    ).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("execute_email_reminder", {
      p_request_id: requestId,
      p_task_id: task,
      p_configuration_id: configId,
      p_enabled: false,
      p_consent_version: null,
    });
  });
  it("reads only an exact owner-scoped request and handles stale configuration", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        enabled: false,
        email: null,
        verified: false,
        consentVersion,
        state: "off",
      },
      error: null,
    });
    const query = new URLSearchParams({
      expectedUserId: owner,
      taskId: task,
      configurationId: configId,
    });
    const response = await GET(
      new NextRequest(`${url}?${query}`, {
        headers: { host: "app.example.test" },
      }),
    );
    expect(await response.json()).toEqual({
      enabled: false,
      email: null,
      verified: false,
      consentVersion,
      state: "off",
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT412" } });
    expect((await POST(post(payload))).status).toBe(409);
  });
});
