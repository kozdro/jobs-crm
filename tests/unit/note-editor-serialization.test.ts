import { describe, expect, it, vi } from "vitest";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContentRecoveryProvider } from "@/components/recruitment/content-recovery";
import {
  NoteEntry,
  type Note,
} from "@/components/recruitment/case-content-tools";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const owner = "00000000-0000-4000-8000-000000000001";
const caseId = "00000000-0000-4000-8000-000000000002";
const note: Note = {
  id: "00000000-0000-4000-8000-000000000003",
  case_id: caseId,
  body: "Prywatny szkic",
  date_kind: "ordinary",
  occurred_on: null,
  voided: false,
  revision: 0,
  created_at: "2026-01-01T00:00:00Z",
};
function render(blocked: boolean) {
  return renderToStaticMarkup(
    createElement(
      ContentRecoveryProvider as ComponentType<{
        owner: string;
        caseId: string;
        children?: ReactNode;
      }>,
      { owner, caseId },
      createElement(NoteEntry, {
        owner,
        note,
        editing: false,
        blocked,
        onEdit: () => {},
        onClose: () => {},
      }),
    ),
  );
}
describe("note edit serialization", () => {
  it("disables correction and void while another history editor is open", () => {
    const html = render(true);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Popraw notatkę<\/button>/);
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>Unieważnij notatkę<\/button>/,
    );
  });
  it("keeps correction available when no editor is open", () => {
    const html = render(false);
    expect(html).not.toMatch(
      /<button[^>]*disabled[^>]*>Popraw notatkę<\/button>/,
    );
  });
});
