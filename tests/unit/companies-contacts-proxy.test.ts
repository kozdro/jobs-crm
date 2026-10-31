import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
const mocks = vi.hoisted(() => ({ getRouteClient: vi.fn() }));
vi.mock("@/modules/identity/infrastructure/server", () => ({
  getRouteClient: mocks.getRouteClient,
}));
import { config, proxy } from "@/proxy";

beforeEach(() => vi.clearAllMocks());
describe("Companies and Contacts use the existing private session proxy", () => {
  it("matches both catalog lists, both profile types, RSC reads and catalog commands", () => {
    for (const url of [
      "/companies",
      "/companies?page=2",
      "/companies/00000000-0000-4000-8000-000000000001",
      "/contacts",
      "/contacts/00000000-0000-4000-8000-000000000002",
      "/catalog/commands?type=contact&page=2",
      "/recruitments/00000000-0000-4000-8000-000000000003",
    ]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
      expect(
        unstable_doesMiddlewareMatch({
          config,
          url,
          headers: { rsc: "1", "next-router-prefetch": "1" },
        }),
        `${url} RSC`,
      ).toBe(true);
    }
    for (const url of [
      "/_next/static/catalog.js",
      "/companies-other",
      "/contacts-other",
      "/health/ready",
    ])
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
  });
  it("preserves refreshed cookies on both request forwarding and response with private cache protection", async () => {
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "owner-a" } }, error: null });
    mocks.getRouteClient.mockImplementation(
      (request: NextRequest, response: NextResponse) => {
        request.cookies.set("synthetic-session", "refreshed");
        response.cookies.set("synthetic-session", "refreshed", {
          path: "/",
          secure: true,
          sameSite: "lax",
        });
        return { auth: { getUser } };
      },
    );
    for (const path of [
      "/companies",
      "/contacts/00000000-0000-4000-8000-000000000001",
    ]) {
      const request = new NextRequest(`https://app.example.test${path}`, {
        headers: { cookie: "synthetic-session=before" },
      });
      const response = await proxy(request);
      expect(response.cookies.get("synthetic-session")?.value).toBe(
        "refreshed",
      );
      expect(response.headers.get("x-middleware-request-cookie")).toContain(
        "synthetic-session=refreshed",
      );
      expect(response.headers.get("x-middleware-override-headers")).toContain(
        "cookie",
      );
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(getUser).toHaveBeenCalledTimes(2);
  });
  it("keeps auth failures private without inventing a successful identity", async () => {
    mocks.getRouteClient.mockReturnValue({
      auth: { getUser: vi.fn().mockRejectedValue(new Error("unavailable")) },
    });
    const response = await proxy(
      new NextRequest("https://app.example.test/contacts"),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
  });
});
