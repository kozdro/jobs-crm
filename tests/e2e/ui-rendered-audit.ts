/** Runs inside Chromium: computed colors, alpha-composited ancestor surfaces. */
export function auditRenderedTextContrast() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d")!;
  type Color = [number, number, number, number];
  function rgba(value: string): Color {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  }
  function over(top: Color, bottom: Color): Color {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    return [0, 1, 2]
      .map(
        (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / alpha,
      )
      .concat(alpha) as Color;
  }
  function luminance(color: Color) {
    return color
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  const results: {
    text: string;
    foreground: Color;
    background: Color;
    ratio: number;
    minimum: number;
  }[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    const text = [...element.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .trim();
    if (!text || ["SCRIPT", "STYLE", "OPTION"].includes(element.tagName))
      continue;
    if (
      element.closest('[disabled], [aria-disabled="true"], [hidden], .sr-only')
    )
      continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (rect.width <= 1 || rect.height <= 1 || style.visibility !== "visible")
      continue;
    const ancestors: HTMLElement[] = [];
    let current: HTMLElement | null = element;
    let skip = false;
    while (current) {
      const css = getComputedStyle(current);
      if (Number(css.opacity) !== 1 || css.backgroundImage !== "none")
        skip = true;
      ancestors.unshift(current);
      current = current.parentElement;
    }
    // Gradients/group opacity need pixel sampling; never report an invented ratio.
    if (skip) continue;
    const background = ancestors.reduce(
      (bg, node) => over(rgba(getComputedStyle(node).backgroundColor), bg),
      [255, 255, 255, 1] as Color,
    );
    const foreground = over(rgba(style.color), background);
    const first = luminance(foreground),
      second = luminance(background);
    const ratio =
      (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    const large =
      parseFloat(style.fontSize) >= 24 ||
      (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    results.push({
      text: text.slice(0, 90),
      foreground,
      background,
      ratio,
      minimum: large ? 3 : 4.5,
    });
  }
  const controls = [];
  for (const element of document.querySelectorAll<HTMLInputElement>(
    "input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
  )) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1 || element.closest("[hidden]"))
      continue;
    const style = getComputedStyle(element);
    if (style.visibility !== "visible" || style.borderTopStyle === "none")
      continue;
    const ancestors: HTMLElement[] = [];
    let current: HTMLElement | null = element;
    while (current) {
      ancestors.unshift(current);
      current = current.parentElement;
    }
    const background = ancestors.reduce(
      (bg, node) => over(rgba(getComputedStyle(node).backgroundColor), bg),
      [255, 255, 255, 1] as Color,
    );
    const border = over(rgba(style.borderTopColor), background);
    const first = luminance(border),
      second = luminance(background);
    controls.push({
      label: element.labels?.[0]?.textContent?.trim() ?? element.type,
      border,
      background,
      ratio:
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05),
    });
  }
  return {
    checked: results.length,
    controls,
    controlFailures: controls.filter((item) => item.ratio + 0.01 < 3),
    failures: results.filter((item) => item.ratio + 0.01 < item.minimum),
    pairs: [
      ...new Map(
        results.map((item) => [
          JSON.stringify([item.foreground, item.background, item.minimum]),
          item,
        ]),
      ).values(),
    ],
  };
}
