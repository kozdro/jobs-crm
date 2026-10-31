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
import {
  PageControls,
  MutationFeedback,
} from "@/components/companies-contacts/common";
import {
  acknowledgedCatalogCommand,
  catalogReadTransition,
  mayDispatchCatalogCommand,
  type CatalogReadState,
} from "@/components/companies-contacts/intent";
import type { CatalogMutation } from "@/components/companies-contacts/hooks";
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

describe("Catalog recovery survives acknowledgement and profile refetch", () => {
  it("does not allocate a new intention after an acknowledged duplicate save becomes uncertain", () => {
    const makeId = vi.fn(() => other);
    const acknowledged = acknowledgedCatalogCommand(
      create,
      [`${id}:1`],
      false,
      makeId,
    )!;
    expect(acknowledged.requestId).toBe(other);
    expect(makeId).toHaveBeenCalledTimes(1);
    expect(
      acknowledgedCatalogCommand(acknowledged, [`${id}:1`], true, makeId),
    ).toBeNull();
    expect(makeId).toHaveBeenCalledTimes(1);
    expect(
      mayDispatchCatalogCommand(
        acknowledged,
        { ...acknowledged, requestId: id },
        false,
        true,
      ),
    ).toBe(false);
    expect(
      mayDispatchCatalogCommand(acknowledged, acknowledged, false, true),
    ).toBe(true);
    expect(
      mayDispatchCatalogCommand(acknowledged, acknowledged, true, true),
    ).toBe(false);
    expect(acknowledged.requestId).toBe(other);
    expect(create.requestId).toBe(id);
  });
  it("retains the confirmed profile while its same-account same-query refresh is pending or failed", () => {
    const data = { profile };
    const state: CatalogReadState<typeof data> = {
      scope: `owner-a:${id}`,
      data,
      error: false,
      loading: false,
    };
    const pending = catalogReadTransition(state, state.scope, true);
    expect(pending.data).toBe(data);
    expect(pending.loading).toBe(true);
    const failed = catalogReadTransition(pending, state.scope, true, true);
    expect(failed.data).toBe(data);
    expect(failed.error).toBe(true);
    expect(failed.loading).toBe(false);
    expect(catalogReadTransition(state, `owner-b:${id}`, true).data).toBeNull();
    expect(
      catalogReadTransition(state, `owner-a:${other}`, true).data,
    ).toBeNull();
    expect(catalogReadTransition(state, state.scope, false).data).toBeNull();
  });
  it("disables duplicate confirmation while uncertain and keeps same-intention recovery controls", () => {
    const mutation: CatalogMutation = {
      pending: false,
      uncertain: true,
      error: "Wynik nieznany",
      duplicates: {
        kind: "duplicates",
        matches: [profile],
        matchToken: [`${id}:1`],
      },
      saved: false,
      feedbackRef: vi.fn(),
      send: vi.fn(),
      recover: vi.fn(),
      reset: vi.fn(),
      clearDraftFeedback: vi.fn(),
      acknowledge: vi.fn(),
      retry: vi.fn(),
    };
    const html = renderToStaticMarkup(
      createElement(MutationFeedback, { mutation }),
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Zapisz jako odrębny profil<\/button>/,
    );
    expect(html).toContain("Sprawdź wynik zapisu");
    expect(html).toContain("Ponów ten sam zapis");
  });
});

describe("Catalog controls retain readable labels at enlarged text sizes", () => {
  it("bounds the two controls observed overflowing the 375px panel and permits text wrapping", () => {
    const pagination = renderToStaticMarkup(
      createElement(PageControls, {
        page: 1,
        hasMore: false,
        onPage: vi.fn(),
        label: "Strony powiązań",
      }),
    );
    const panel = renderToStaticMarkup(
      createElement(RelationsPanel, {
        userId: id,
        contextType: "contact",
        contextId: other,
      }),
    );
    for (const [html, label] of [
      [pagination, "Poprzednia strona"],
      [panel, "Powiąż ze sprawą"],
    ]) {
      const button = html.match(
        new RegExp(`<button[^>]*>${label}</button>`),
      )?.[0];
      expect(button).toBeDefined();
      expect(button).toContain("max-w-full");
      expect(button).toContain("min-w-0");
      expect(button).toContain("whitespace-normal");
      expect(button).toContain("[overflow-wrap:anywhere]");
      expect(button).not.toContain("overflow-hidden");
      expect(button).not.toContain("truncate");
    }
  });
});
