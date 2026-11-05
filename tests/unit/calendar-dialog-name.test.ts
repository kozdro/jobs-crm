import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  calendarDialogA11y,
  eventDialogName,
  panelDialogName,
} from "@/components/calendar/form-logic";

describe("Calendar dialog accessible names", () => {
  it.each([
    [panelDialogName("create"), "Nowe wydarzenie"],
    [panelDialogName("occurred"), "Zapisz odbytą rozmowę"],
    [panelDialogName("edit"), "Zachowany szkic zmiany wydarzenia"],
    [panelDialogName("resolve"), "Zachowany szkic zmiany wydarzenia"],
    [eventDialogName("edit", "planned"), "Edytuj wydarzenie"],
    [eventDialogName("edit", "occurred"), "Skoryguj wydarzenie"],
    [eventDialogName("resolve", "planned"), "Rozlicz wydarzenie"],
  ])("links dialog and visible title for %s", (name, expected) => {
    const props = calendarDialogA11y(name, "dialog-title-test");
    const html = renderToStaticMarkup(
      createElement(
        "div",
        { role: "dialog", ...props.popup },
        createElement("h2", props.title, name),
      ),
    );
    expect(props.popup["aria-label"]).toBe(expected);
    expect(props.popup["aria-labelledby"]).toBe(props.title.id);
    expect(html).toContain(`aria-label="${expected}"`);
    expect(html).toContain('aria-labelledby="dialog-title-test"');
    expect(html).toContain(`<h2 id="dialog-title-test">${expected}</h2>`);
  });
});
