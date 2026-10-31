import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultWorkspaceQuery,
  type WorkspaceCase,
} from "@/modules/recruitment/domain/workspace";
import {
  resetWorkspacePages,
  workspacePreset,
  workspacePresetName,
  WorkspaceRecord,
} from "@/components/recruitment/recruitment-workspace";
import {
  rememberWorkspaceNavigation,
  findWorkspaceNavigation,
  clearWorkspaceNavigation,
  workspaceReturnHref,
} from "@/components/recruitment/workspace-navigation";

afterEach(clearWorkspaceNavigation);
describe("read-only Workspace presentation and navigation contracts", () => {
  it("applies preset status sets without discarding organization, person or sort and resets all pages", () => {
    const query = {
      ...defaultWorkspaceQuery(),
      organizationId: "org",
      contactId: "person",
      sort: "oldest" as const,
      page: 4,
      columnPages: {
        Zapisane: 3,
        "Kontakt rozpoczęty": 4,
        "W rekrutacji": 5,
        Zakończone: 6,
      },
    };
    const active = workspacePreset(query, "active");
    expect(active.statuses).toEqual([
      "Zapisane",
      "Kontakt rozpoczęty",
      "W rekrutacji",
    ]);
    expect(active.organizationId).toBe("org");
    expect(active.contactId).toBe("person");
    expect(active.sort).toBe("oldest");
    expect(active.page).toBe(1);
    expect(Object.values(active.columnPages)).toEqual([1, 1, 1, 1]);
    expect(workspacePresetName(active)).toBe("active");
    const closed = workspacePreset(query, "closed");
    expect(closed.closedOpen).toBe(true);
    expect(closed.statuses).toEqual(["Zakończone"]);
    expect(workspacePresetName(closed)).toBe("closed");
    expect(workspacePresetName(workspacePreset(query, "all"))).toBe("all");
    expect(workspacePresetName({ ...query, statuses: [] })).toBeNull();
    expect(resetWorkspacePages(query).organizationId).toBe("org");
  });
  it("retains only real owner-scoped return context and cannot manufacture context for direct/cross-owner links", () => {
    const value = {
      token: "return-token",
      userId: "owner-a",
      href: "/recruitments?view=list&page=3",
      scrollY: 180,
      boardScroll: 320,
      columns: { Zapisane: 56 },
    };
    rememberWorkspaceNavigation(value);
    expect(findWorkspaceNavigation("owner-a", "return-token")).toEqual(value);
    expect(workspaceReturnHref("owner-a", "return-token")).toBe(
      "/recruitments?view=list&page=3#workspace-return=return-token",
    );
    expect(workspaceReturnHref("owner-b", "return-token")).toBe(
      "/recruitments",
    );
    expect(workspaceReturnHref("owner-a", "forged")).toBe("/recruitments");
    expect(workspaceReturnHref("owner-a")).toBe("/recruitments");
    clearWorkspaceNavigation();
    expect(findWorkspaceNavigation("owner-a")).toBeNull();
  });
  it("escapes case and M:N labels, shows roles and a truthful fragment without mutation controls", () => {
    const item: WorkspaceCase = {
      id: "case",
      title: "<script>title</script>",
      description: null,
      source_url: null,
      status: "W rekrutacji",
      current_stage: "Etap A",
      stage_version: 1,
      created_at: "2026-10-31T09:00:00.000Z",
      organizations: [
        { id: "a", name: "Agency <script>", role: "agency" },
        { id: "b", name: "Employer B", role: "employer" },
      ],
      organizationsHasMore: true,
    };
    const html = renderToStaticMarkup(createElement(WorkspaceRecord, { item }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Agency");
    expect(html).toContain("agencja");
    expect(html).toContain("Employer B");
    expect(html).toContain("pracodawca");
    expect(html).toContain("Fragment powiązań");
    expect(html).toContain("Etap A");
    expect(html).toContain("Dodano do CRM");
    expect(html).not.toContain("draggable");
    expect(html).not.toContain("Zakończ sprawę");
    expect(html).not.toContain("Zapisz");
  });
});
