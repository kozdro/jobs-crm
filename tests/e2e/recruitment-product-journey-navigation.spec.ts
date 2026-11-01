/** Blueprint F05 / DEC059: local section navigation preserves drafts and return context.
 * ADR0012: only exact public case section fragments may survive Auth SDK bootstrap.
 */
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { readRecruitmentTarget } from "../../scripts/recruitment/target.ts";
import { account, login as sdkLogin } from "../integration/auth/fixtures.ts";

for (const width of [1440, 1024, 768, 375]) {
  test(`Case section navigation keeps dirty tasks and filtered Workspace return at ${width}px`, async ({
    page,
  }) => {
    const target = await readRecruitmentTarget(
      process.env.RECRUITMENT_TARGET_ID!,
    );
    const user = await account(target);
    const { client } = await sdkLogin(target, user);
    const title = `Navigation ${randomUUID()}`;
    const created = await client.rpc("create_recruitment_case", {
      p_request_id: randomUUID(),
      p_title: title,
    });
    expect(created.error).toBeNull();
    const caseId = created.data.case.id as string;
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    await page.goto(
      `${target.appOrigin}/recruitments?view=list&sort=oldest&status=Zapisane&closedOpen=1`,
    );
    await expect(
      page.getByRole("button", { name: "Lista", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("combobox", { name: "Sortowanie", exact: true }),
    ).toHaveValue("oldest");
    await page.getByRole("button", { name: title, exact: true }).click();
    let contextURL = page.url();
    const drawer = page.getByRole("dialog", {
      name: "Podgląd sprawy",
      exact: true,
    });
    await drawer
      .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
      .click();
    await expect(page).toHaveURL(/workspaceReturn=/);
    expect(new URL(page.url()).pathname).toBe(`/recruitments/${caseId}`);
    let detailURL = page.url();
    const nav = page.getByRole("navigation", {
      name: "Sekcje sprawy",
      exact: true,
    });
    const historyLink = nav.getByRole("link", {
      name: "Historia",
      exact: true,
    });
    await historyLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${detailURL}#case-history`);
    await page.reload();
    await expect(nav).toBeVisible();
    await expect(page).toHaveURL(`${detailURL}#case-history`);
    // Workspace return context is memory-only by approved DEC059. Reload
    // intentionally drops it; preserve the legitimate fallback, not fake state.
    await expect(
      page.getByRole("link", { name: "Wróć do listy spraw", exact: true }),
    ).toHaveAttribute("href", "/recruitments");
    await page.goto(`${target.appOrigin}/recruitments/${caseId}#case-history`);
    await expect(nav).toBeVisible();
    await expect(page).toHaveURL(
      `${target.appOrigin}/recruitments/${caseId}#case-history`,
    );
    await expect(
      page.getByRole("link", { name: "Wróć do listy spraw", exact: true }),
    ).toHaveAttribute("href", "/recruitments");
    // Re-enter via the actual filtered Workspace for the separate SPA return
    // scenario. No full reload occurs between this handoff and the return.
    await page.goto(
      `${target.appOrigin}/recruitments?view=list&sort=oldest&status=Zapisane&closedOpen=1`,
    );
    await page.getByRole("button", { name: title, exact: true }).click();
    contextURL = page.url();
    await drawer
      .getByRole("link", { name: "Otwórz pełną stronę", exact: true })
      .click();
    await expect(page).toHaveURL(/workspaceReturn=/);
    detailURL = page.url();
    const actions = nav.getByRole("link", { name: "Działania", exact: true });
    await actions.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#case-actions")).toBeFocused();
    const sectionPosition = await page
      .locator("#case-actions")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, viewport: innerHeight };
      });
    expect(sectionPosition.top).toBeGreaterThanOrEqual(0);
    expect(sectionPosition.top).toBeLessThan(sectionPosition.viewport);
    await page
      .getByRole("button", { name: "Dodaj zadanie", exact: true })
      .click();
    const form = page.getByRole("form", { name: "Nowe zadanie", exact: true });
    const draft = `Niezapisane ${randomUUID()}`;
    await form.getByLabel("Tytuł zadania", { exact: true }).fill(draft);
    await historyLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${detailURL}#case-history`);
    await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
      draft,
    );
    const tasksLink = nav.getByRole("link", { name: "Zadania", exact: true });
    await tasksLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${detailURL}#case-tasks`);
    await page.goBack();
    await expect(page).toHaveURL(`${detailURL}#case-history`);
    await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
      draft,
    );
    await page.goForward();
    await expect(page).toHaveURL(`${detailURL}#case-tasks`);
    await expect(form.getByLabel("Tytuł zadania", { exact: true })).toHaveValue(
      draft,
    );
    const stored = await client
      .from("recruitment_task")
      .select("id")
      .eq("owner_id", user.id);
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual([]);
    expect(
      await page.evaluate(() => ({
        inner: innerWidth,
        scroll: document.documentElement.scrollWidth,
      })),
    ).toEqual({ inner: width, scroll: width });
    await page.screenshot({
      path: test.info().outputPath(`detail-navigation-${width}.png`),
      fullPage: true,
    });
    await form
      .getByRole("button", { name: "Anuluj edycję", exact: true })
      .click();
    await form
      .getByRole("button", { name: "Odrzuć zmiany", exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await page
      .getByRole("link", { name: "Wróć do listy spraw", exact: true })
      .click();
    await expect(page).toHaveURL(contextURL);
    await expect(
      page.getByRole("button", { name: "Lista", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("combobox", { name: "Sortowanie", exact: true }),
    ).toHaveValue("oldest");
    await expect(
      page.getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
  });
}

test("Case section fragment allowlist blocks Auth bootstrap injection and same-document owner changes", async ({
  page,
}) => {
  const target = await readRecruitmentTarget(
    process.env.RECRUITMENT_TARGET_ID!,
  );
  const owner = await account(target);
  const attacker = await account(target);
  const { client } = await sdkLogin(target, owner);
  const { session } = await sdkLogin(target, attacker);
  const created = await client.rpc("create_recruitment_case", {
    p_request_id: randomUUID(),
    p_title: `Fragment ${randomUUID()}`,
  });
  expect(created.error).toBeNull();
  const ownDetail = `/recruitments/${created.data.case.id as string}`;
  await page.goto(`${target.appOrigin}/login`);
  await page.getByLabel("E-mail", { exact: true }).fill(owner.email);
  await page.getByLabel("Hasło", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
  const authFragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: "bearer",
    expires_in: "60",
    type: "recovery",
  }).toString();
  const proofs: {
    caseLabel: string;
    phase: string;
    previousGeneration: number;
    currentGeneration: number;
    ownerUnchanged: boolean;
    hashPresent: boolean;
  }[] = [];
  const verifyOwner = async () => {
    const response = await page.request.get(`${target.appOrigin}/auth/user`);
    expect(response.status()).toBe(200);
    const identity = await response.json();
    expect(identity.user.id).toBe(owner.id);
    return identity.user.id === owner.id;
  };
  const safeNavigate = async (path: string, fragment?: string) => {
    try {
      await page.goto(
        `${target.appOrigin}${path}${fragment ? `#${fragment}` : ""}`,
      );
    } catch {
      throw new Error(
        "Synthetic fragment navigation failed; sensitive URL withheld",
      );
    }
    await expect(
      page.getByRole("button", { name: "Dodaj", exact: true }),
    ).toBeVisible();
  };
  const recordProof = async (
    caseLabel: string,
    phase: string,
    previousGeneration: number,
  ) => {
    proofs.push({
      caseLabel,
      phase,
      previousGeneration,
      currentGeneration: await page.evaluate(() => performance.timeOrigin),
      ownerUnchanged: await verifyOwner(),
      hashPresent: Boolean(new URL(page.url()).hash),
    });
    await writeFile(
      test.info().outputPath("fragment-bootstrap-owner-proof.json"),
      JSON.stringify(proofs, null, 2),
    );
  };
  for (const [caseLabel, path, fragment] of [
    ["detail/plain-token", ownDetail, authFragment],
    ["detail/anchor-token-suffix", ownDetail, `case-history&${authFragment}`],
    ["account/plain-token", "/account", authFragment],
    ["account/anchor-token-suffix", "/account", `case-history&${authFragment}`],
    ["account/noncase-anchor", "/account", "case-history"],
  ]) {
    // A new document initializes the SDK: all non-allowlisted fragments must
    // be scrubbed before bootstrap and may never replace the verified owner.
    await safeNavigate("/dashboard");
    const dashboardGeneration = await page.evaluate(
      () => performance.timeOrigin,
    );
    await safeNavigate(path, fragment);
    await expect
      .poll(() => Boolean(new URL(page.url()).hash), {
        message: `Bootstrap fragment scrubbing: ${caseLabel}`,
      })
      .toBe(false);
    await recordProof(caseLabel, "bootstrap", dashboardGeneration);
    expect(proofs.at(-1)!.currentGeneration).not.toBe(dashboardGeneration);
    // Native same-document hash navigation does not initialize the SDK. The
    // security invariant here is owner stability, not an invented hashchange
    // scrub promise. A later full reload must apply the bootstrap guard again.
    const currentGeneration = await page.evaluate(() => performance.timeOrigin);
    await safeNavigate(path, fragment);
    await recordProof(caseLabel, "same-document", currentGeneration);
    expect(proofs.at(-1)!.currentGeneration).toBe(currentGeneration);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Dodaj", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => Boolean(new URL(page.url()).hash), {
        message: `Reload fragment scrubbing: ${caseLabel}`,
      })
      .toBe(false);
    await recordProof(caseLabel, "reload", currentGeneration);
    expect(proofs.at(-1)!.currentGeneration).not.toBe(currentGeneration);
  }
  const visible = await client
    .from("recruitment_case")
    .select("id")
    .eq("id", created.data.case.id);
  expect(visible.error).toBeNull();
  expect(visible.data).toHaveLength(1);
});
