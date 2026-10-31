import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  CatalogCommand,
  CatalogProfile,
  CatalogRelation,
} from "@/modules/companies-contacts/domain/catalog";
import {
  catalogRead,
  catalogWrite,
  CatalogClientError,
  resultMatchesCommand,
} from "@/components/companies-contacts/client";
import { ProfileForm } from "@/components/companies-contacts/profile-form";
import { RelationsPanel } from "@/components/companies-contacts/relations";
import { PageControls } from "@/components/companies-contacts/common";
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const profile: CatalogProfile = {
  id,
  type: "contact",
  name: "Osoba <script>",
  email: "person@example.test",
  revision: 1,
  created_at: "2026-10-31T10:00:00Z",
};
const create: CatalogCommand = {
  requestId: id,
  operation: "create-profile",
  profileType: "contact",
  name: profile.name,
  email: profile.email,
};
const relation: CatalogRelation = {
  id,
  type: "case-contact",
  left_id: id,
  right_id: other,
  leftLabel: "Sprawa",
  rightLabel: "Osoba",
  leftType: "case",
  rightType: "contact",
  role: null,
  active: true,
  revision: 1,
};
afterEach(() => vi.unstubAllGlobals());
describe("Catalog command confirmation boundaries", () => {
  it("only confirms the same profile values, type and edit identity", () => {
    expect(resultMatchesCommand({ kind: "saved", profile }, create)).toBe(true);
    for (const changed of [
      { ...profile, email: null },
      { ...profile, name: "Inna osoba" },
      { ...profile, type: "organization" as const },
    ])
      expect(
        resultMatchesCommand({ kind: "saved", profile: changed }, create),
      ).toBe(false);
    expect(
      resultMatchesCommand(
        { kind: "saved", profile },
        {
          ...create,
          operation: "edit-profile",
          profileId: other,
          expectedRevision: 0,
        },
      ),
    ).toBe(false);
    expect(
      resultMatchesCommand(
        { kind: "duplicates", matches: [profile], matchToken: [`${id}:1`] },
        create,
      ),
    ).toBe(false);
  });
  it("distinguishes attach, terminal detach and role change without inferring events", () => {
    const attach: CatalogCommand = {
      requestId: id,
      operation: "attach",
      relationType: "case-contact",
      leftId: id,
      rightId: other,
      role: null,
    };
    expect(resultMatchesCommand({ kind: "saved", relation }, attach)).toBe(
      true,
    );
    expect(
      resultMatchesCommand(
        { kind: "saved", relation: { ...relation, right_id: id } },
        attach,
      ),
    ).toBe(false);
    expect(
      resultMatchesCommand(
        { kind: "saved", relation: { ...relation, active: false } },
        attach,
      ),
    ).toBe(false);
    const detach: CatalogCommand = {
      requestId: id,
      operation: "detach",
      relationId: id,
      expectedRevision: 1,
    };
    expect(resultMatchesCommand({ kind: "saved", relation }, detach)).toBe(
      false,
    );
    expect(
      resultMatchesCommand(
        { kind: "saved", relation: { ...relation, active: false } },
        detach,
      ),
    ).toBe(true);
  });
  it("keeps network failures and malformed success responses uncertain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(catalogWrite(id, create)).rejects.toMatchObject({
      uncertain: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            kind: "saved",
            profile: { ...profile, name: "Wrong" },
          }),
        ),
      ),
    );
    await expect(catalogWrite(id, create)).rejects.toMatchObject({
      uncertain: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("broken")));
    await expect(catalogWrite(id, create)).rejects.toMatchObject({
      uncertain: true,
    });
  });
  it("does not turn stale rejection into an ambiguous successful write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ kind: "stale" }), { status: 409 }),
        ),
    );
    await expect(catalogWrite(id, create)).rejects.toMatchObject({
      kind: "stale",
      uncertain: false,
    });
  });
  it("sends PII only in POST body with same-origin no-store and exact request ID", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ kind: "saved", profile })),
      );
    vi.stubGlobal("fetch", fetcher);
    await catalogWrite(id, create);
    expect(fetcher).toHaveBeenCalledWith(
      "/catalog/commands",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ ...create, expectedUserId: id }),
      }),
    );
  });
  it("reads recovery with owner binding and rejects unauthenticated responses", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(catalogRead(id, { requestId: other })).rejects.toBeInstanceOf(
      CatalogClientError,
    );
    expect(fetcher.mock.calls[0][0]).toContain(`expectedUserId=${id}`);
    expect(fetcher.mock.calls[0][0]).not.toContain("person");
  });
});
describe("Catalog accessible presentation", () => {
  it("labels fields, preserves Unicode values as escaped text and does not impose UTF16 maxLength", () => {
    const html = renderToStaticMarkup(
      createElement(ProfileForm, {
        userId: id,
        type: "contact",
        profile,
        onSaved: vi.fn(),
      }),
    );
    expect(html).toContain("Nazwa kontaktu");
    expect(html).toContain("E-mail (opcjonalnie)");
    expect(html).toContain("Osoba &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("maxLength");
    expect(html).toContain("pamięci tej strony");
    expect(html).toContain("Zapisz zmiany");
  });
  it("states the relationship/history boundary and leaves employer unknown", () => {
    const html = renderToStaticMarkup(
      createElement(RelationsPanel, {
        userId: id,
        contextType: "case",
        contextId: other,
      }),
    );
    expect(html).toContain("nie oznacza udziału w jej zdarzeniach");
    expect(html).toContain("Pracodawca może pozostać nieznany");
    expect(html).toContain("Powiąż z firmą");
    expect(html).toContain("Powiąż z kontaktem");
    expect(html).not.toContain("Nieznany pracodawca");
  });
  it("keeps page controls explicitly labelled and prevents impossible pages", () => {
    const html = renderToStaticMarkup(
      createElement(PageControls, {
        page: 1,
        hasMore: false,
        onPage: vi.fn(),
        label: "Strony audytu",
      }),
    );
    expect(html).toContain('aria-label="Strony audytu"');
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2);
  });
});
