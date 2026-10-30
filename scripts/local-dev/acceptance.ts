/** Opt-in real-browser QA. Adds synthetic records; never resets or deletes data. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  chromium,
  expect as playwrightExpect,
  type Page,
} from "@playwright/test";
import postgres from "postgres";
import { localEngine, readLocalDevTarget } from "./target.ts";
import { migrateLocalDev } from "./migrations.ts";

const root = resolve(import.meta.dirname, "../..");
const exec = promisify(execFile);
// This exercises next dev, whose first request compiles each route. Keep a
// bounded cold-route budget instead of Playwright's 5s production assertion default.
const expect = playwrightExpect.configure({ timeout: 30000 });
let stage = "target-confirmation";
let observation = "initial-target";
let restarted: ChildProcess | undefined;
const checks: string[] = [];
const check = (name: string) => {
  checks.push(name);
  console.log(`Local DEV acceptance PASS: ${name}`);
};
async function protectedFiles() {
  const hashes: Record<string, string | null> = {};
  for (const name of [
    ".env.local",
    ".recruitment-local/manual-dev/manifest.json",
    ".recruitment-local/manual-dev/supabase/config.toml",
  ]) {
    try {
      hashes[name] = createHash("sha256")
        .update(await readFile(resolve(root, name)))
        .digest("hex");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hashes[name] = null;
    }
  }
  return hashes;
}
async function foreignContainers(projectId: string) {
  const socket = await localEngine();
  const { stdout } = await exec(
    "docker",
    ["ps", "-a", "--no-trunc", "--format", "{{.ID}} {{.Names}} {{.State}}"],
    {
      env: {
        ...process.env,
        DOCKER_HOST: `unix://${socket}`,
        DOCKER_CONTEXT: undefined,
        DOCKER_TLS_VERIFY: undefined,
        DOCKER_CERT_PATH: undefined,
      },
      timeout: 15000,
    },
  );
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line && !line.split(" ")[1]?.endsWith(`_${projectId}`))
    .sort();
}
async function cli(args: string[]) {
  try {
    return await exec(process.execPath, ["scripts/local-dev/cli.ts", ...args], {
      cwd: root,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new Error("Local DEV command failed; output withheld");
  }
}
async function mailLink(
  mailUrl: string,
  apiUrl: string,
  email: string,
  kind: "signup" | "recovery",
) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailUrl}/api/v1/messages`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, "Mailpit messages available");
    const body = (await response.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    for (const item of body.messages) {
      if (!item.To.some((to) => to.Address === email)) continue;
      const message = await fetch(
        `${mailUrl}/api/v1/message/${encodeURIComponent(item.ID)}`,
        { redirect: "error", signal: AbortSignal.timeout(5000) },
      );
      assert.equal(message.status, 200);
      const text = (await message.json()) as { HTML?: string; Text?: string };
      const content = `${text.HTML ?? ""}\n${text.Text ?? ""}`.replaceAll(
        "&amp;",
        "&",
      );
      for (const match of content.matchAll(/https?:\/\/[^\s"<>]+/g)) {
        const url = new URL(match[0]);
        if (
          url.pathname === "/auth/v1/verify" &&
          url.searchParams.get("type") === kind
        ) {
          assert.equal(url.origin, apiUrl, "Email must use exact local API");
          return url.href;
        }
      }
    }
    await new Promise((ok) => setTimeout(ok, 150));
  }
  throw new Error("Local verification message absent");
}
async function main() {
  const target = await readLocalDevTarget();
  assert.deepEqual(process.argv.slice(2), ["--confirm", target.projectId]);
  assert.equal(target.appOrigin, "https://127.0.0.1:3163");
  assert.equal(target.apiUrl, "http://127.0.0.1:56721");
  assert.equal(target.mailUrl, "http://127.0.0.1:56724");
  const preserved = await protectedFiles();
  const foreign = await foreignContainers(target.projectId);
  const browser = await chromium.launch({ channel: "chromium" });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  context.setDefaultNavigationTimeout(60000);
  let page = await context.newPage();
  const consoleMessages: string[] = [];
  page.on("console", (entry) => consoleMessages.push(entry.text()));
  const secrets: string[] = [];
  const email = `local-dev-qa-${randomUUID()}@example.invalid`;
  let password = `Synthetic-local-dev-${randomUUID()}!`;
  secrets.push(password);
  let callbackObserved = false;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === target.appOrigin &&
      url.pathname === "/auth/callback" &&
      url.searchParams.has("code")
    )
      callbackObserved = true;
  });
  async function identity() {
    const response = await context.request.get(`${target.appOrigin}/auth/user`);
    assert.equal(response.status(), 200);
    assert.ok(response.headers()["cache-control"].includes("no-store"));
    const body = (await response.json()) as {
      user: { id: string; email: string };
    };
    assert.equal(body.user.email, email);
    return body.user.id;
  }
  async function login(p: Page) {
    await p.goto(`${target.appOrigin}/login`);
    await p.getByLabel("E-mail", { exact: true }).fill(email);
    await p.getByLabel("Hasło", { exact: true }).fill(password);
    await p.getByRole("button", { name: "Zaloguj się", exact: true }).click();
    await expect(p).toHaveURL(`${target.appOrigin}/dashboard`, {
      timeout: 30000,
    });
  }
  async function logout() {
    await page.goto(`${target.appOrigin}/account`);
    await page
      .getByRole("button", { name: "Wyloguj tutaj", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    assert.equal(
      (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
      401,
    );
  }
  async function databaseSnapshot(userId: string) {
    const sql = postgres({
      ...target.db,
      max: 1,
      ssl: false,
      onnotice: () => {},
    });
    try {
      const users = await sql`select id from auth.users where id=${userId}`;
      assert.equal(users.length, 1);
      const rows =
        await sql`select id from public.recruitment_case where owner_id=${userId}`;
      assert.equal(rows.length, 1);
      const [table] =
        await sql`select relrowsecurity from pg_class where oid='public.recruitment_case'::regclass`;
      assert.equal(table.relrowsecurity, true);
      const [rpc] =
        await sql`select prosecdef from pg_proc where oid='public.create_recruitment_case(uuid,text,text,text,boolean)'::regprocedure`;
      assert.equal(rpc.prosecdef, false);
      const [grant] =
        await sql`select has_table_privilege('anon','public.recruitment_case','SELECT') anon_select,has_table_privilege('authenticated','public.recruitment_case','DELETE') user_delete`;
      assert.equal(grant.anon_select, false);
      assert.equal(grant.user_delete, false);
      const ledger =
        await sql`select id,hash,created_at from recruitment_migrations.__drizzle_migrations order by id`;
      return { caseId: String(rows[0].id), ledger };
    } finally {
      await sql.end();
    }
  }
  try {
    stage = "signup-email-confirmation-pkce";
    await page.goto(`${target.appOrigin}/signup`);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Utwórz konto", exact: true })
      .click();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 30000 });
    assert.equal(
      (await context.request.get(`${target.appOrigin}/auth/user`)).status(),
      401,
    );
    const confirmation = await mailLink(
      target.mailUrl,
      target.apiUrl,
      email,
      "signup",
    );
    await page.goto(confirmation);
    await expect(page).toHaveURL(`${target.appOrigin}/account`, {
      timeout: 30000,
    });
    assert.equal(callbackObserved, true);
    const userId = await identity();
    for (const cookie of await context.cookies()) {
      if (cookie.name.startsWith("sb-")) {
        assert.equal(cookie.secure, true);
        assert.equal(cookie.sameSite, "Lax");
      }
    }
    check(stage);

    stage = "login-logout-recovery";
    await logout();
    await login(page);
    assert.equal(await identity(), userId);
    await logout();
    callbackObserved = false;
    await page.goto(`${target.appOrigin}/forgot-password`);
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page
      .getByRole("button", { name: "Wyślij link", exact: true })
      .click();
    await expect(page.getByRole("status")).toBeVisible();
    const recovery = await mailLink(
      target.mailUrl,
      target.apiUrl,
      email,
      "recovery",
    );
    await page.goto(recovery);
    await expect(page).toHaveURL(`${target.appOrigin}/reset-password`);
    assert.equal(callbackObserved, true);
    password = `Changed-local-dev-${randomUUID()}!`;
    secrets.push(password);
    await page.getByLabel("Nowe hasło", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Zapisz hasło", exact: true })
      .click();
    await expect(page.getByRole("status")).toBeVisible();
    await logout();
    await login(page);
    assert.equal(await identity(), userId);
    check(stage);

    stage = "real-ui-create-case";
    const title = `Local DEV persistence ${randomUUID()}`;
    await page.getByRole("button", { name: "Dodaj", exact: true }).click();
    const manual = page.getByRole("menuitem", {
      name: "Dodaj ręcznie",
      exact: true,
    });
    if (await manual.count()) await manual.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog.getByLabel("Nazwa sprawy", { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog
      .getByRole("radio", { name: "Zapisz tylko sprawę", exact: true })
      .check();
    await dialog.getByRole("button", { name: "Dalej", exact: true }).click();
    await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const before = await databaseSnapshot(userId);
    check(stage);

    stage = "real-ledger-and-schema-checkpoint-refusals";
    const checkpointTarget = await readLocalDevTarget();
    const wrongCheckpoint = "0".repeat(64);
    assert.notEqual(checkpointTarget.migrationCheckpoint, wrongCheckpoint);
    assert.notEqual(checkpointTarget.schemaCheckpoint, wrongCheckpoint);
    for (const [invalidTarget, expectedError] of [
      [
        { ...checkpointTarget, migrationCheckpoint: wrongCheckpoint },
        /ledger checkpoint tampering refused/,
      ],
      [
        { ...checkpointTarget, schemaCheckpoint: wrongCheckpoint },
        /schema drift\/checkpoint missing/,
      ],
    ] as const) {
      let checkpointSaved = false;
      await assert.rejects(
        migrateLocalDev(invalidTarget, async () => {
          checkpointSaved = true;
        }),
        expectedError,
      );
      assert.equal(checkpointSaved, false);
      assert.deepEqual(await databaseSnapshot(userId), before);
    }
    check(stage);

    stage = "owner-isolation-and-anonymous-denial";
    const otherContext = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const other = await otherContext.newPage();
      const otherEmail = `local-dev-qa-b-${randomUUID()}@example.invalid`;
      const otherPassword = `Synthetic-local-dev-b-${randomUUID()}!`;
      secrets.push(otherPassword);
      await other.goto(`${target.appOrigin}/signup`);
      await other.getByLabel("E-mail", { exact: true }).fill(otherEmail);
      await other.getByLabel("Hasło", { exact: true }).fill(otherPassword);
      await other
        .getByRole("button", { name: "Utwórz konto", exact: true })
        .click();
      await expect(other.getByRole("status")).toBeVisible();
      await other.goto(
        await mailLink(target.mailUrl, target.apiUrl, otherEmail, "signup"),
      );
      await expect(other).toHaveURL(`${target.appOrigin}/account`);
      const forbidden = await otherContext.request.get(
        `${target.appOrigin}/recruitments/${before.caseId}`,
      );
      assert.equal(forbidden.status(), 404);
      assert.equal((await forbidden.text()).includes(title), false);
      const list = await otherContext.request.get(
        `${target.appOrigin}/recruitments`,
      );
      assert.equal(list.status(), 200);
      assert.equal((await list.text()).includes(title), false);
      const anonymous = await fetch(
        `${target.apiUrl}/rest/v1/recruitment_case?select=id`,
        {
          headers: {
            apikey: target.anonKey,
            Authorization: `Bearer ${target.anonKey}`,
          },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        },
      );
      assert.ok([401, 403].includes(anonymous.status));
    } finally {
      await otherContext.close();
    }
    check(stage);

    stage = "studio-user-table-sql-and-schema";
    const studioContext = await browser.newContext();
    const studio = await studioContext.newPage();
    for (const path of [
      "/project/default/auth/users",
      "/project/default/editor",
      "/project/default/sql/new",
      "/project/default/database/tables",
    ]) {
      const response = await studio.goto(`${target.studioUrl}${path}`);
      assert.equal(response?.status(), 200);
      await expect(studio.locator("body")).not.toHaveText("");
      if (path.endsWith("/auth/users"))
        await expect(studio.getByText(email, { exact: true })).toBeVisible({
          timeout: 30000,
        });
      if (path.endsWith("/editor"))
        await expect(
          studio.getByText("recruitment_case", { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 });
    }
    await studioContext.close();
    check(stage);

    stage = "reset-refuses-without-confirmation";
    await assert.rejects(cli(["reset"]));
    const afterRefusal = await databaseSnapshot(userId);
    assert.deepEqual(afterRefusal, before);
    check(stage);

    stage = "stop-start-persists-account-case-and-ledger";
    observation = "logout-before-stop";
    await logout();
    // Persistence is a fresh login with the same credentials, independent of
    // a still-connected HMR document from the previous Next dev process.
    await page.close();
    observation = "first-stop";
    await cli(["stop"]);
    observation = "idempotent-second-stop";
    await cli(["stop"]);
    observation = "spawn-restart";
    restarted = spawn(process.execPath, ["scripts/local-dev/cli.ts", "start"], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Never persist raw CLI logs: a failed bootstrap could include credentials.
    restarted.stdout?.resume();
    restarted.stderr?.resume();
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(
        restarted.exitCode,
        null,
        "Restart process must remain alive",
      );
      try {
        const response = await context.request.get(
          `${target.appOrigin}/health/ready`,
          { timeout: 3000 },
        );
        if (response.ok()) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((ok) => setTimeout(ok, 250));
    }
    assert.equal(ready, true);
    observation = "read-resumed-target";
    const resumed = await readLocalDevTarget();
    assert.equal(resumed.projectId, target.projectId);
    assert.equal(resumed.migrationCheckpoint, target.migrationCheckpoint);
    observation = "login-same-account-after-restart";
    page = await context.newPage();
    page.on("console", (entry) => consoleMessages.push(entry.text()));
    await login(page);
    assert.equal(await identity(), userId);
    observation = "read-same-case-after-restart";
    await page.goto(`${target.appOrigin}/recruitments/${before.caseId}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    observation = "compare-persistent-database-snapshot";
    assert.deepEqual(await databaseSnapshot(userId), before);
    check(stage);

    stage = "ctrl-c-preserves-database";
    restarted.kill("SIGINT");
    await new Promise<void>((ok, no) => {
      const timeout = setTimeout(
        () => no(new Error("App shutdown timed out")),
        15000,
      );
      restarted?.once("close", () => {
        clearTimeout(timeout);
        ok();
      });
    });
    restarted = undefined;
    assert.deepEqual(await databaseSnapshot(userId), before);
    check(stage);
    stage = "protected-files-foreign-resources-and-browser-logs";
    assert.deepEqual(await protectedFiles(), preserved);
    assert.deepEqual(await foreignContainers(target.projectId), foreign);
    for (const text of consoleMessages) {
      assert.equal(
        secrets.some((secret) => text.includes(secret)),
        false,
      );
      assert.equal(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\./.test(text), false);
    }
    check(stage);
    console.log(
      `Local DEV acceptance complete: ${checks.length} stages PASS; synthetic account/case retained, app stopped, database running.`,
    );
  } finally {
    restarted?.kill("SIGINT");
    await browser.close();
  }
}
main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : "UnknownError";
  const location =
    error instanceof Error
      ? (error.stack?.match(/acceptance\.ts:(\d+):\d+/)?.[1] ?? "unknown")
      : "unknown";
  console.error(
    `Local DEV acceptance FAIL at ${stage} (${observation}, ${name}, acceptance.ts:${location}); raw details withheld to protect credentials. Completed stages: ${checks.join(", ")}`,
  );
  process.exitCode = 1;
});
