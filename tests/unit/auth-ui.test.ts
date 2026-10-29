import { describe, expect, it, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ getPublicAuthConfig: vi.fn() }));
vi.mock("@/shared/public/auth-config", () => ({
  getPublicAuthConfig: mocks.getPublicAuthConfig,
}));
import { AuthForm } from "@/components/auth/auth-form";
import { Feedback } from "@/components/auth/feedback";
const config = {
  enabled: true,
  localFixture: true,
  googleEnabled: false,
  url: "https://db.example.test",
  key: "public",
  origin: "https://app.example.test",
};
beforeEach(() => mocks.getPublicAuthConfig.mockReturnValue(config));
describe("Auth UI policy and output boundary", () => {
  it("does not render credential inputs when Auth is unconfigured", () => {
    mocks.getPublicAuthConfig.mockReturnValue({ ...config, enabled: false });
    const html = renderToStaticMarkup(
      createElement(AuthForm, { mode: "login" }),
    );
    expect(html).not.toContain("<form");
    expect(html).toContain("Logowanie nie jest skonfigurowane");
  });
  it("hides unresolved signup/recovery UI outside explicit fixture while retaining login", () => {
    mocks.getPublicAuthConfig.mockReturnValue({
      ...config,
      localFixture: false,
    });
    for (const mode of ["signup", "forgot", "reset"] as const) {
      const html = renderToStaticMarkup(createElement(AuthForm, { mode }));
      expect(html).not.toContain("<form");
      expect(html).toContain("lokalnym środowisku testowym");
    }
    expect(
      renderToStaticMarkup(createElement(AuthForm, { mode: "login" })),
    ).toContain("<form");
  });
  it("requires the server-verified intended identity before enabling recovery submission", () => {
    const withoutIdentity = renderToStaticMarkup(
      createElement(AuthForm, { mode: "reset" }),
    );
    expect(withoutIdentity).toMatch(/<button[^>]* disabled=""/);
    expect(withoutIdentity).toMatch(/<input[^>]* disabled=""/);
    const withIdentity = renderToStaticMarkup(
      createElement(AuthForm, {
        mode: "reset",
        expectedUserId: "intended-owner-a",
      }),
    );
    expect(withIdentity).not.toMatch(/<button[^>]* disabled=""/);
    expect(withIdentity).not.toContain("intended-owner-a");
  });
  it("does not expose a Google action without configured provider", () => {
    const html = renderToStaticMarkup(
      createElement(AuthForm, { mode: "login" }),
    );
    expect(html).not.toContain("Kontynuuj z Google");
    expect(html).toContain("Google nie jest skonfigurowane");
  });
  it("escapes untrusted feedback as text with alert semantics", () => {
    const html = renderToStaticMarkup(
      createElement(Feedback, {
        message: '<img src=x onerror="window.injected=1">',
        error: true,
      }),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
  });
});
