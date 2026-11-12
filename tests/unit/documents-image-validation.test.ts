import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateImageContent } from "@/modules/documents/application/validate-image";

describe("document image validation", () => {
  it.each(["png", "jpeg"] as const)(
    "decodes genuine %s bytes",
    async (format) => {
      const bytes = await sharp({
        create: { width: 2, height: 2, channels: 3, background: "white" },
      })
        .toFormat(format)
        .toBuffer();
      expect(await validateImageContent(bytes, format)).toBe(true);
      expect(
        await validateImageContent(bytes, format === "png" ? "jpeg" : "png"),
      ).toBe(false);
      expect(await validateImageContent(bytes.subarray(0, 12), format)).toBe(
        false,
      );
      expect(
        await validateImageContent(
          Buffer.concat([bytes, Buffer.from("<script>alert(1)</script>")]),
          format,
        ),
      ).toBe(false);
      expect(
        await validateImageContent(
          Buffer.concat([bytes, Buffer.from([0xff, 0xd9])]),
          format,
        ),
      ).toBe(false);
    },
  );
  it("rejects a PNG with a corrupt checksum", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const corrupt = Buffer.from(png);
    corrupt[corrupt.length - 1] ^= 1;
    expect(await validateImageContent(corrupt, "png")).toBe(false);
  });
  it("accepts a real progressive JPEG", async () => {
    const image = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "white" },
    })
      .jpeg({ progressive: true })
      .toBuffer();
    expect(await validateImageContent(image, "jpeg")).toBe(true);
  });
});
