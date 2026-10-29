import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
]) {
  test(`FQA-08 technical scaffold renders at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Jobs CRM", exact: true }),
    ).toBeVisible();

    const card = page.locator('[data-slot="card"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-slot="badge"]')).toHaveText(
      "Fundament aplikacji",
    );
    await expect(card).toHaveCSS("border-top-width", "1px");
    await expect(page.getByRole("main")).toHaveCSS("display", "flex");
    await expect(page.getByRole("main")).toHaveCSS("padding-top", "24px");
    expect(
      await card.evaluate((element) =>
        parseFloat(getComputedStyle(element).borderRadius),
      ),
    ).toBeGreaterThan(0);

    const icon = page.getByTestId("foundation-icon");
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    await expect(icon).toHaveAttribute("stroke-width", "2");
    await expect(icon).toHaveClass(/lucide/);
    expect(await icon.locator("path, circle").count()).toBeGreaterThan(0);
    expect(
      await icon.evaluate((element) => element.tagName.toLowerCase()),
    ).toBe("svg");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("FQA-08 readiness is a public, constant, side-effect-free response", async ({
  request,
}) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.get("/health/ready", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["location"]).toBeUndefined();
    expect(response.headers()["set-cookie"]).toBeUndefined();
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ready" });
  }
});
