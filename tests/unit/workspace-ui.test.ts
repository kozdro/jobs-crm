import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AccountSession,
  SessionControls,
} from "@/components/auth/account-session";
import { AccountMenu } from "@/components/workspace/account-menu";
import { SidebarNavigation } from "@/components/workspace/sidebar";
import { CaseListItem } from "@/components/recruitment/case-content";
import type { RecruitmentCase } from "@/modules/recruitment/domain/recruitment-case";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item: RecruitmentCase = {
  id: "synthetic-case",
  title: "Zażółć <script> — rozmowa o współpracy",
  description: "Długi kontekst ".repeat(100),
  source_url: "https://example.test/oferta?publication=42#source",
  status: "Zapisane",
  current_stage: null,
  stage_version: 0,
  created_at: "2026-10-30T09:15:00.000Z",
};

describe("Workspace presentation boundaries", () => {
  it("renders the closed account menu under the session boundary without a runtime composition error", () => {
    const sessionProps = {
      userId: "synthetic-owner",
      children: createElement(AccountMenu),
    };
    const html = renderToStaticMarkup(
      createElement(AccountSession, sessionProps),
    );
    expect(html).toContain('aria-label="Menu konta"');
    expect(html).not.toContain('role="menuitem"');
  });
  it("keeps private children hidden until browser session verification, including session controls", () => {
    const sessionProps = {
      userId: "synthetic-owner",
      children: createElement(
        "div",
        null,
        "PRIVATE_CASE_CANARY",
        createElement(SessionControls),
      ),
    };
    const html = renderToStaticMarkup(
      createElement(AccountSession, sessionProps),
    );
    expect(html).toContain("Sprawdzanie sesji");
    expect(html).toMatch(/<div hidden=""><div>PRIVATE_CASE_CANARY/);
    for (const label of [
      "Wyloguj tutaj",
      "Wyloguj wszędzie",
      "Wyloguj pozostałe sesje",
    ])
      expect(html).toContain(label);
    expect(html).toContain("tokeny dostępu mogą działać do wygaśnięcia");
  });
  it("marks the current module and renders future modules without invented destinations", () => {
    const html = renderToStaticMarkup(
      createElement(SidebarNavigation, {
        pathname: "/recruitments/synthetic-case",
      }),
    );
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/recruitments"/,
    );
    for (const name of [
      "Zadania",
      "Kalendarz",
      "Dokumenty",
      "Firmy",
      "Kontakty",
    ])
      expect(html).toContain(name);
    expect((html.match(/aria-disabled="true"/g) ?? []).length).toBe(3);
    expect((html.match(/<a /g) ?? []).length).toBe(4);
    expect(html).toContain('href="/companies"');
    expect(html).toContain('href="/contacts"');
    expect(html).not.toContain("/tasks");
    expect(html).not.toContain("/calendar");
    expect(html).not.toContain("/documents");
  });
  it("retains compact record data and exact destination while escaping free text", () => {
    const html = renderToStaticMarkup(createElement(CaseListItem, { item }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("line-clamp-2");
    expect(html).toContain(item.description);
    expect(html).toContain(
      'href="https://example.test/oferta?publication=42#source"',
    );
    expect(html).toContain("example.test");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('dateTime="2026-10-30T09:15:00.000Z"');
    expect(html).toContain("Dodano do CRM");
    expect(html).toContain("Zapisane");
  });
});
