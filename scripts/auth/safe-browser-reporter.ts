import { createHash } from "node:crypto";
import { relative } from "node:path";
import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import { CALENDAR_PHASES, MOVE_LINK_PHASES } from "./output-safety.ts";

type MovePhase = (typeof MOVE_LINK_PHASES)[number];
const phases = new Set<string>(MOVE_LINK_PHASES);
const isMoveTest = (test: TestCase) =>
  relative(process.cwd(), test.location.file).replaceAll("\\", "/") ===
    "tests/e2e/recruitment-global-search.spec.ts" &&
  test.title ===
    "moving link 26 across a page boundary preserves target, focus and status";

const isCalendarTest = (test: TestCase) =>
  relative(process.cwd(), test.location.file).replaceAll("\\", "/") ===
    "tests/e2e/recruitment-calendar.spec.ts" &&
  test.title ===
    "every Calendar form dialog exposes its own accessible name and focuses the title";
const calendarPhases = new Set<string>(CALENDAR_PHASES);

// Emit fixed categories and a hash of the repository-relative source path only.
// Never emit titles, errors, stack traces, attachments, URLs, or test output.
export default class SafeBrowserReporter implements Reporter {
  private readonly movePhases = new WeakMap<TestResult, MovePhase>();
  private readonly calendarPhases = new WeakMap<
    TestResult,
    (typeof CALENDAR_PHASES)[number]
  >();

  private readonly calendarActiveStep = new WeakMap<TestResult, TestStep>();

  private readonly calendarCompleted = new WeakMap<
    TestResult,
    (typeof CALENDAR_PHASES)[number]
  >();

  onStepBegin(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category !== "test.step") return;
    if (isCalendarTest(test)) {
      this.calendarActiveStep.set(result, step);
      const prefix = "CALENDAR_PHASE:";
      const value = step.title.startsWith(prefix)
        ? step.title.slice(prefix.length)
        : "";
      this.calendarPhases.set(
        result,
        calendarPhases.has(value)
          ? (value as (typeof CALENDAR_PHASES)[number])
          : "unknown",
      );
      return;
    }
    if (!isMoveTest(test)) return;
    const prefix = "F3_MOVE_PHASE:";
    const value = step.title.startsWith(prefix)
      ? step.title.slice(prefix.length)
      : "";
    this.movePhases.set(
      result,
      phases.has(value) ? (value as MovePhase) : "unknown",
    );
  }

  onStepEnd(test: TestCase, result: TestResult, step: TestStep) {
    if (!isCalendarTest(test) || step.category !== "test.step") return;
    if (this.calendarActiveStep.get(result) === step) {
      this.calendarActiveStep.delete(result);
      this.calendarPhases.set(result, "none");
    }
    if (step.error) return;
    const prefix = "CALENDAR_PHASE:";
    const value = step.title.startsWith(prefix)
      ? step.title.slice(prefix.length)
      : "";
    this.calendarCompleted.set(
      result,
      calendarPhases.has(value)
        ? (value as (typeof CALENDAR_PHASES)[number])
        : "unknown",
    );
  }

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
    const phase =
      category === "timeout" &&
      result.status !== "interrupted" &&
      (isMoveTest(test) || isCalendarTest(test))
        ? isCalendarTest(test)
          ? {
              phase: this.calendarCompleted.get(result) ?? "not_entered",
              activePhase: this.calendarPhases.get(result) ?? "not_entered",
            }
          : { phase: this.movePhases.get(result) ?? "not_entered" }
        : {};
    console.log(
      `F3_BROWSER_FAILURE ${JSON.stringify({ fileHash, line: test.location.line, status: result.status, category, retry: result.retry, ...phase })}`,
    );
  }
}
