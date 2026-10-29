import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parsePendingIntent,
  resolveSaveNext,
} from "@/components/recruitment/intent";
import { CaseContent } from "@/components/recruitment/case-content";
import { SavedCaseNotice } from "@/components/recruitment/saved-case-notice";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const owner = "54ce12b7-9e38-4b6b-80fa-c9a7d0b9b374";
const requestId = "bb395ec2-18bc-46d2-8be2-206ed5fba88c";
const item: RecruitmentCase = {
  id: "7da2cddc-f1d9-4a30-a819-c39016156af6",
  title: "Sprawa bez pracodawcy",
  description: '<img src=x onerror="window.privateData=1"> Zażółć 🧑‍💻',
  source_url: "https://example.invalid/offer?publication=42&keep=1#source",
  status: "Zapisane",
  created_at: "2026-10-29T12:00:00.000Z",
};

describe("Manual capture recovery identifier privacy boundary", () => {
  it("restores only an identifier tied to the same verified account", () => {
    const stored = JSON.stringify({ ownerId: owner, requestId });
    expect(parsePendingIntent(stored, owner)).toEqual({
      ownerId: owner,
      requestId,
    });
    expect(parsePendingIntent(stored, "different-owner")).toBeNull();
  });
  it("rejects malformed identifiers and unexpected private draft material", () => {
    for (const value of [
      null,
      "",
      "broken",
      "[]",
      "null",
      JSON.stringify({ ownerId: owner }),
      JSON.stringify({ ownerId: owner, requestId: "not-uuid" }),
      JSON.stringify({ ownerId: owner, requestId, title: "private draft" }),
    ]) {
      expect(parsePendingIntent(value, owner)).toBeNull();
    }
  });
});

describe("Manual capture save disposition", () => {
  it("keeps save-next across its duplicate confirmation and uncertain retry", () => {
    const original = resolveSaveNext("save-next", false, false);
    expect(resolveSaveNext("confirm-duplicate", false, original)).toBe(true);
    expect(resolveSaveNext("save", true, original)).toBe(true);
  });
  it("ordinary save after returning from a warning and editing closes the wizard", () => {
    const priorSaveNext = resolveSaveNext("save-next", false, false);
    const editedSave = resolveSaveNext("save", false, priorSaveNext);
    expect(editedSave).toBe(false);
    expect(resolveSaveNext("confirm-duplicate", false, editedSave)).toBe(false);
  });
  it("provides an announced success and real case action for the active modal", () => {
    const html = renderToStaticMarkup(
      createElement(SavedCaseNotice, { item, onDismiss: vi.fn() }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Sprawa została zapisana.");
    expect(html).toContain(`href="/recruitments/${item.id}"`);
    expect(html).toContain("Otwórz sprawę");
    expect(html).not.toContain("inert");
  });
});

describe("Recruitment read projection", () => {
  it("escapes private free text and preserves safe source URL identifiers", () => {
    const html = renderToStaticMarkup(createElement(CaseContent, { item }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("Zażółć 🧑‍💻");
    expect(html).toContain(
      'href="https://example.invalid/offer?publication=42&amp;keep=1#source"',
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("otwiera nową kartę");
  });
  it("labels technical creation time without inventing a business event", () => {
    const html = renderToStaticMarkup(
      createElement(CaseContent, {
        item: { ...item, description: null, source_url: null },
      }),
    );
    expect(html).toContain("Dodano do CRM");
    expect(html).toContain('dateTime="2026-10-29T12:00:00.000Z"');
    expect(html).toContain("Zapisane");
    for (const fabricated of [
      "Wysłano",
      "aplikowano",
      "Pracodawca",
      "URL źródłowy",
      "Opis",
    ])
      expect(html).not.toContain(fabricated);
  });
});
