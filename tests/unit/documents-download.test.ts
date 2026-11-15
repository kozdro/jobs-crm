import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "@/modules/documents/domain/download";

describe("document download header", () => {
  it("encodes Unicode and header delimiters instead of reflecting them", () => {
    const header = attachmentDisposition('CV ż.pdf\r\nX-Injected: yes"');
    expect(header).toContain('filename="document"');
    expect(header).toContain("%C5%BC");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain("%0D%0A");
  });
  it("handles invalid Unicode without throwing", () => {
    expect(attachmentDisposition("\ud800.pdf")).toContain("%EF%BF%BD.pdf");
  });
});
