import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CaseRepositoryError,
  resolveLegacyCaseLinks,
} from "@/modules/recruitment/application/cases";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

const one: RecruitmentCase = {
  id: "1d9c0a47-5927-4949-9000-cfc986eac9c3",
  title: "A",
  description: null,
  source_url: "https://before.example/",
  status: "Zapisane",
  current_stage: null,
  stage_version: 0,
  created_at: "2026-01-01T00:00:00Z",
};
const two: RecruitmentCase = {
  ...one,
  id: "ec926255-d233-4d93-88ec-0a6e50022ad4",
  title: "B",
  source_url: null,
};
function client(rows: unknown, error: unknown = null) {
  const query = {
    select: () => query,
    eq: () => query,
    in: async () => ({ data: rows, error }),
  };
  return {
    from: (name: string) => {
      expect(name).toBe("case_link_current");
      return query;
    },
  } as unknown as SupabaseClient;
}
describe("owner-scoped effective legacy links on business reads", () => {
  it("uses current link and preserves immutable input", async () => {
    const original = { ...one };
    const result = await resolveLegacyCaseLinks(
      client([{ case_id: one.id, url: "https://after.example/" }]),
      [one, two],
    );
    expect(result.map((x) => x.source_url)).toEqual([
      "https://after.example/",
      null,
    ]);
    expect(one).toEqual(original);
  });
  it("does not resurrect the original URL after void", async () => {
    expect(
      (await resolveLegacyCaseLinks(client([]), [one]))[0].source_url,
    ).toBeNull();
  });
  it("fails closed on read errors or inconsistent duplicate results", async () => {
    await expect(
      resolveLegacyCaseLinks(client(null, { code: "failure" }), [one]),
    ).rejects.toBeInstanceOf(CaseRepositoryError);
    await expect(
      resolveLegacyCaseLinks(
        client([
          { case_id: one.id, url: "https://a/" },
          { case_id: one.id, url: "https://b/" },
        ]),
        [one],
      ),
    ).rejects.toBeInstanceOf(CaseRepositoryError);
  });
});
