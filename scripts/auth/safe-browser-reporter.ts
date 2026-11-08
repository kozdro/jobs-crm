import { createHash } from "node:crypto";
import { relative } from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Emit fixed categories and a hash of the repository-relative source path only.
// Never emit titles, errors, stack traces, attachments, URLs, or test output.
export default class SafeBrowserReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (!["failed", "timedOut", "interrupted"].includes(result.status)) return;
    const message = result.errors
      .map((error) => error.message ?? "")
      .join("\n");
    const category =
      result.status === "timedOut" || /timeout/i.test(message)
        ? "timeout"
        : /expect\(/.test(message)
          ? "assertion"
          : /(?:browser|page|context).*closed/i.test(message)
            ? "browser-closed"
            : "other";
    const fileHash = createHash("sha256")
      .update(relative(process.cwd(), test.location.file))
      .digest("hex");
    console.log(
      `F3_BROWSER_FAILURE ${JSON.stringify({ fileHash, line: test.location.line, status: result.status, category, retry: result.retry })}`,
    );
  }
}
