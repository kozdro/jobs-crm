import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { auditRenderedTextContrast } from "../tests/e2e/ui-rendered-audit.ts";
const root = new URL("..", import.meta.url).pathname;
const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage();
const results = [];
await mkdir(`${root}/docs/ux/evidence/candidates`, { recursive: true });
const sourceHash = createHash("sha256")
  .update(await readFile(`${root}/experiments/ui-foundation/candidates.html`))
  .digest("hex");
for (const theme of ["a", "b", "c"])
  for (const screen of ["dashboard", "list", "detail", "capture", "components"])
    for (const width of [1440, 1024, 768, 375, 320, 720]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(
        `file://${root}/experiments/ui-foundation/candidates.html?theme=${theme}&screen=${screen}`,
      );
      const measured = await page.evaluate(() => {
        const css = getComputedStyle(document.body);
        const rgb = (color) => {
          const c = document.createElement("canvas");
          c.width = c.height = 1;
          const x = c.getContext("2d");
          x.fillStyle = color;
          x.fillRect(0, 0, 1, 1);
          return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        const lum = (c) =>
          rgb(c)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const contrast = (a, b) => {
          let x = lum(a),
            y = lum(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const token = (n) => css.getPropertyValue(n).trim();
        const pairs = [
          ["text/surface", "--text", "--surface"],
          ["muted/surface", "--muted", "--surface"],
          ["muted/bg", "--muted", "--bg"],
          ["muted/nav", "--muted", "--nav"],
          ["accent/surface", "--accent", "--surface"],
          ["accent/selected", "--accent", "--selected"],
          ["white/accent", null, "--accent"],
          ["input/surface", "--input", "--surface"],
        ].map(([name, a, b]) => ({
          name,
          ratio: contrast(a ? token(a) : "#fff", token(b)),
          foreground: a ? token(a) : "#fff",
          background: token(b),
        }));
        return {
          innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          main: document.querySelector("main").getBoundingClientRect().width,
          pairs,
        };
      });
      const actualText = await page.evaluate(auditRenderedTextContrast);
      await page.keyboard.press("Tab");
      await page.locator("button.primary").first().focus();
      const focus = await page
        .locator("button.primary")
        .first()
        .evaluate((element) => {
          const s = getComputedStyle(element);
          return {
            visible: element.matches(":focus-visible"),
            outline: s.outlineStyle,
            width: s.outlineWidth,
            color: s.outlineColor,
          };
        });
      results.push({
        theme,
        screen,
        width,
        sourceHash,
        ...measured,
        actualText,
        focus,
      });
      if ([1440, 375].includes(width))
        await page.screenshot({
          path: `${root}/docs/ux/evidence/candidates/${theme}-${screen}-${width}.png`,
          fullPage: true,
        });
    }
await writeFile(
  `${root}/docs/ux/evidence/candidates/measurements.json`,
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify({
    renders: results.length,
    overflow: results
      .filter((x) => x.scrollWidth > x.innerWidth)
      .map((x) => ({
        theme: x.theme,
        screen: x.screen,
        width: x.width,
        scroll: x.scrollWidth,
      })),
    computedTextFailures: results
      .filter((x) => x.actualText.failures.length)
      .map((x) => ({
        theme: x.theme,
        screen: x.screen,
        width: x.width,
        failures: x.actualText.failures,
      })),
    focusFailures: results.filter(
      (x) => !x.focus.visible || x.focus.outline === "none",
    ),
    contrasts: results
      .filter((x) => x.screen === "dashboard" && x.width === 1440)
      .map((x) => ({ theme: x.theme, pairs: x.pairs })),
  }),
);
await browser.close();
if (
  results.some(
    (entry) =>
      entry.scrollWidth > entry.innerWidth ||
      entry.actualText.failures.length ||
      entry.actualText.controlFailures.length ||
      !entry.focus.visible ||
      entry.focus.outline === "none",
  )
)
  process.exitCode = 1;
