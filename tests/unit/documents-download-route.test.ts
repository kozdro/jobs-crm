import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse, type NextRequest } from "next/server";
import { protectAuthResponse } from "@/modules/identity/infrastructure/http";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn() }));
vi.mock("@/modules/global-search/request", () => ({
  authenticated: mocks.authenticated,
  response: (body: unknown, status = 200, headers?: Headers) =>
    protectAuthResponse(NextResponse.json(body, { status, headers })),
}));
import { GET } from "@/app/documents/download/[versionId]/route";

const versionId = "2208b761-4ca5-4b6e-80d8-1c2ceff17802";
const context = { params: Promise.resolve({ versionId }) };
const request = {} as NextRequest;
const target = {
  objectKey: "opaque-owner-key",
  filename: "CV ż.txt",
  mime: "text/plain",
  bytes: 3,
};
function auth(data: unknown = target, downloadError: unknown = null) {
  const download = vi.fn().mockResolvedValue({
    data: downloadError ? null : new Blob(["abc"]),
    error: downloadError,
  });
  const from = vi.fn().mockReturnValue({ download });
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  mocks.authenticated.mockResolvedValue({
    userId: "owner",
    headers: new Headers(),
    client: { rpc, storage: { from } },
  });
  return { rpc, from, download };
}
describe("owner document download route", () => {
  beforeEach(() => mocks.authenticated.mockReset());
  it("downloads via the user client with private attachment headers", async () => {
    const client = auth();
    const result = await GET(request, context);
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("abc");
    expect(client.rpc).toHaveBeenCalledWith("document_download_target", {
      p_version_id: versionId,
    });
    expect(client.from).toHaveBeenCalledWith("documents");
    expect(client.download).toHaveBeenCalledWith(target.objectKey);
    expect(result.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(result.headers.get("content-disposition")).toContain("%C5%BC");
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("does not disclose an absent or foreign version", async () => {
    const client = auth(null);
    const result = await GET(request, context);
    expect(result.status).toBe(404);
    expect(client.download).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain(target.objectKey);
  });
  it("fails closed when Storage rejects access after a concurrent deletion", async () => {
    auth(target, new Error("denied"));
    const result = await GET(request, context);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain(target.objectKey);
  });
  it("does not return a truncated or mismatched Storage object", async () => {
    auth({ ...target, bytes: 4 });
    const result = await GET(request, context);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("abc");
  });
  it("denies unauthenticated requests and invalid metadata", async () => {
    mocks.authenticated.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(401);
    const client = auth({ ...target, mime: "text/html" });
    expect((await GET(request, context)).status).toBe(503);
    expect(client.download).not.toHaveBeenCalled();
  });
});
