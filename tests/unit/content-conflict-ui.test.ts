import { describe, expect, it } from "vitest";
import {
  readConflictSnapshot,
  sameConflictSnapshot,
} from "@/components/recruitment/content-conflict";
import {
  canonicalCaseLink,
  linkFormError,
} from "@/components/recruitment/content-form-validation";
import { canClearContentConflict } from "@/components/recruitment/content-intent";
import type { ContentConflict } from "@/components/recruitment/content-recovery";
const caseId = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const conflict: ContentConflict = {
  requestId: "req",
  id,
  operation: "correct-note",
  expectedRevision: 0,
};
const note = {
  id,
  case_id: caseId,
  revision: 1,
  voided: false,
  body: "Nowa treść",
  date_kind: "historical" as const,
  occurred_on: "2020-01-02",
  created_at: "2026-01-01T10:00:00Z",
};
describe("canonical URL and stale review", () => {
  it("uses the Quick Capture HTTP(S) parser and freezes canonical Unicode URL.href", () => {
    const raw = "  https://zażółć.example/ścieżka ze spacją?q=ą#część  ";
    const canonical = new URL(raw.trim()).href;
    expect(canonicalCaseLink(raw)).toBe(canonical);
    expect(linkFormError(raw)).toBeNull();
    for (const invalid of [
      "",
      "javascript:alert(1)",
      "ftp://example.test",
      "https://example.test/\\host",
      "https://example.test/\u0000",
    ])
      expect(canonicalCaseLink(invalid)).toBeNull();
  });
  it("requires a newer authorized target before a stale note may be reviewed", () => {
    expect(readConflictSnapshot(note, conflict, caseId)).toEqual(note);
    expect(
      readConflictSnapshot({ ...note, revision: 0 }, conflict, caseId),
    ).toBeNull();
    expect(
      readConflictSnapshot({ ...note, case_id: "other" }, conflict, caseId),
    ).toBeNull();
    expect(
      readConflictSnapshot({ ...note, id: "other" }, conflict, caseId),
    ).toBeNull();
    expect(
      readConflictSnapshot(
        { ...note, occurred_on: "2026-02-30" },
        conflict,
        caseId,
      ),
    ).toBeNull();
  });
  it("compares every displayed mutable field and revision on the second read", () => {
    expect(sameConflictSnapshot(note, { ...note })).toBe(true);
    expect(
      sameConflictSnapshot(note, { ...note, body: "Równoległa korekta" }),
    ).toBe(false);
    expect(sameConflictSnapshot(note, { ...note, revision: 2 })).toBe(false);
    expect(sameConflictSnapshot(note, { ...note, voided: true })).toBe(false);
  });
  it("never releases a newer intent, a different conflict or an active frozen request", () => {
    expect(canClearContentConflict("req", "req", "idle", false, null)).toBe(
      true,
    );
    expect(canClearContentConflict("old", "new", "idle", false, null)).toBe(
      false,
    );
    expect(canClearContentConflict("req", "req", "idle", true, null)).toBe(
      false,
    );
    expect(canClearContentConflict("req", "req", "idle", false, "new")).toBe(
      false,
    );
    expect(canClearContentConflict("req", "req", "checking", false, null)).toBe(
      false,
    );
  });
  it("requires a matching source, case, canonical URL and newer revision for link snapshots", () => {
    const linkConflict: ContentConflict = {
      requestId: "req",
      id,
      source: "legacy",
      operation: "correct-link",
      expectedRevision: 1,
    };
    const link = {
      id,
      case_id: caseId,
      source: "legacy",
      revision: 2,
      voided: false,
      url: "https://example.test/",
      role: "unspecified",
      position: 0,
      created_at: "2026-01-01T10:00:00Z",
    };
    expect(readConflictSnapshot(link, linkConflict, caseId)).toEqual(link);
    expect(
      readConflictSnapshot(
        { ...link, source: "additional" },
        linkConflict,
        caseId,
      ),
    ).toBeNull();
    expect(
      readConflictSnapshot(
        { ...link, url: "https://example.test" },
        linkConflict,
        caseId,
      ),
    ).toBeNull();
    expect(
      readConflictSnapshot({ ...link, revision: 1 }, linkConflict, caseId),
    ).toBeNull();
  });
});
