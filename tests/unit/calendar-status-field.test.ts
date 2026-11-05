import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarStatusField } from "@/components/calendar/calendar-panel";
describe("calendar resolution field", () => {
  it("associates the inline error with the invalid status select", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarStatusField, {
        id: "resolution-status",
        value: "planned",
        error: "Wybierz wynik rozliczenia.",
        onChange: () => {},
      }),
    );
    expect(html).toContain('id="resolution-status"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="resolution-status-error"');
    expect(html).toContain('id="resolution-status-error"');
    expect(html).toContain("Wybierz wynik rozliczenia.");
  });
  it("does not report an error when a result is provided", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarStatusField, {
        id: "resolution-status",
        value: "occurred",
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-invalid="false"');
    expect(html).not.toContain("resolution-status-error");
  });
});
