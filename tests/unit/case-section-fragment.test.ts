import { describe, expect, it } from "vitest";
import { isCaseSectionFragment } from "@/shared/validation/case-section-fragment";

const id = "a1b2c3d4-1234-4abc-8def-1234567890ab";
const path = `/recruitments/${id}`;
const fragments = [
  "#case-details",
  "#case-links",
  "#case-relations",
  "#case-tasks",
  "#case-calendar",
  "#case-lifecycle",
  "#case-actions",
  "#case-history",
];

describe("exact case section fragment boundary", () => {
  it.each(fragments)(
    "accepts only the exact section %s on a UUID case URL",
    (fragment) => {
      expect(isCaseSectionFragment(path, fragment)).toBe(true);
      expect(
        isCaseSectionFragment(`/recruitments/${id.toUpperCase()}`, fragment),
      ).toBe(true);
    },
  );

  it.each([
    "",
    "/",
    "/account",
    "/login",
    "/signup",
    "/reset-password",
    "/auth/callback",
    "/tasks",
    "/recruitments",
    "/recruitments/not-a-uuid",
    `${path}/`,
    `${path}/edit`,
    `${path}?historyPage=2`,
    `${path}\n`,
    `/RECRUITMENTS/${id}`,
    `//recruitments/${id}`,
    `/other${path}`,
    `/recruitments/${id.slice(0, -1)}`,
    `/recruitments/%61${id.slice(1)}`,
  ])("rejects every section on an unrecognized path %j", (pathname) => {
    for (const fragment of fragments)
      expect(isCaseSectionFragment(pathname, fragment)).toBe(false);
  });

  it.each([
    "",
    "#",
    "#history",
    "#case-History",
    "#CASE-HISTORY",
    "#case-history ",
    "#case-history\n",
    " #case-history",
    "#%63ase-history",
    "#case%2Dhistory",
    "#case-history%00",
    "#access_token=untrusted",
    "#refresh_token=untrusted",
    "#error=access_denied",
    "#code=untrusted",
    "#type=recovery",
    "#case-history&access_token=untrusted",
    "#case-history?access_token=untrusted",
    "#case-history#access_token=untrusted",
    "#access_token=untrusted&case-history",
  ])("rejects encoded, appended or token-like fragments %j", (fragment) => {
    expect(isCaseSectionFragment(path, fragment)).toBe(false);
  });
  it.each(["#case-links", "#case-calendar"])(
    "never accepts modified or token-bearing versions of %s",
    (fragment) => {
      for (const suffix of [
        " ",
        "\n",
        "%00",
        "&access_token=untrusted",
        "?refresh_token=untrusted",
        "#type=recovery",
      ]) {
        expect(isCaseSectionFragment(path, fragment + suffix)).toBe(false);
      }
      expect(
        isCaseSectionFragment(path, fragment.replace("case", "%63ase")),
      ).toBe(false);
      expect(isCaseSectionFragment(`/recruitments/${id}/edit`, fragment)).toBe(
        false,
      );
      expect(isCaseSectionFragment(`/recruitments/${id}\n`, fragment)).toBe(
        false,
      );
      expect(isCaseSectionFragment("/account", fragment)).toBe(false);
    },
  );
});
