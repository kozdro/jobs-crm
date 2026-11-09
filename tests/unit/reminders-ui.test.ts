import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isReminderData,
  ReminderError,
  reminderRequest,
} from "@/components/reminders/client";

const data = {
  reminders: [
    {
      id: "a",
      taskId: "b",
      taskTitle: "Test",
      date: "2026-10-25",
      time: "02:30",
      timeZone: "Europe/Warsaw",
      offset: 120,
      instant: "2026-10-25T00:30:00Z",
      state: "scheduled",
    },
  ],
  rule: null,
  suggestions: [],
};
describe("reminder UI data and transport", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects malformed read data instead of showing an empty list", () => {
    expect(isReminderData(data)).toBe(true);
    expect(
      isReminderData({
        ...data,
        reminders: [{ ...data.reminders[0], state: "unknown" }],
      }),
    ).toBe(false);
    expect(
      isReminderData({
        ...data,
        rule: { intervalDays: 0, timeZone: "Europe/Warsaw" },
      }),
    ).toBe(false);
    expect(isReminderData({})).toBe(false);
  });
  it("preserves the exact request identifier and payload on retries", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ kind: "replayed" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);
    const command = {
      operation: "disable-rule" as const,
      requestId: "00000000-0000-4000-8000-000000000001",
    };
    await reminderRequest("owner", command);
    await reminderRequest("owner", command);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...command,
      expectedUserId: "owner",
    });
  });
  it("treats a malformed successful write response as an uncertain result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
    );
    await expect(
      reminderRequest("owner", { operation: "disable-rule", requestId: "id" }),
    ).rejects.toMatchObject({
      uncertain: true,
    } satisfies Partial<ReminderError>);
  });
});

describe("in-memory reminder recovery", () => {
  it("only accepts the exact frozen attempt for the same owner", async () => {
    const { matchingAttempt } =
      await import("@/components/reminders/memory-commands");
    const command = {
      operation: "disable-rule" as const,
      requestId: "request",
    };
    const frozen = { ownerId: "owner-a", command };
    expect(matchingAttempt(frozen, frozen)).toBe(true);
    expect(matchingAttempt({ ...frozen }, frozen)).toBe(false);
    expect(matchingAttempt({ ownerId: "owner-b", command }, frozen)).toBe(
      false,
    );
    expect(matchingAttempt(null, frozen)).toBe(false);
  });
});

describe("owner-scoped draft recovery", () => {
  it("clears only the exact saved draft, preserving newer edits and other owners", async () => {
    const { clearMatchingDraft } =
      await import("@/components/reminders/memory-drafts");
    const original = {
      kind: "rule" as const,
      days: "7",
      zone: "Europe/Warsaw",
    };
    const newer = { ...original, days: "9" };
    const store = { owner: "owner-a", entries: { rule: newer } };
    expect(clearMatchingDraft(store, "owner-a", "rule", original)).toBe(store);
    expect(clearMatchingDraft(store, "owner-b", "rule", newer)).toBe(store);
    expect(clearMatchingDraft(store, "owner-a", "rule", newer).entries).toEqual(
      {},
    );
  });
});

describe("mutation feedback", () => {
  it("exposes pending and confirmed success to assistive technology", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ReminderFeedback } =
      await import("@/components/reminders/reminder-controls");
    const base = {
      pending: false,
      uncertain: false,
      error: null,
      success: false,
      send: () => {},
      retry: () => {},
    };
    const pending = renderToStaticMarkup(
      createElement(ReminderFeedback, { mutation: { ...base, pending: true } }),
    );
    const success = renderToStaticMarkup(
      createElement(ReminderFeedback, { mutation: { ...base, success: true } }),
    );
    expect(pending).toContain('role="status"');
    expect(pending).toContain("Zapisywanie");
    expect(success).toContain('role="status"');
    expect(success).toContain("Zapisano.");
  });
});

describe("optional email reminder view", () => {
  it("validates the verified address, version and known delivery state", async () => {
    const { isEmailReminderView } =
      await import("@/components/reminders/email-reminder-controls");
    const valid = {
      enabled: false,
      verified: true,
      email: "owner@example.test",
      consentVersion: "version-a",
      state: "off",
    };
    expect(isEmailReminderView(valid)).toBe(true);
    expect(
      isEmailReminderView({ ...valid, verified: false, email: null }),
    ).toBe(true);
    expect(isEmailReminderView({ ...valid, verified: false })).toBe(false);
    expect(isEmailReminderView({ ...valid, email: null })).toBe(false);
    expect(isEmailReminderView({ ...valid, consentVersion: "" })).toBe(false);
    expect(isEmailReminderView({ ...valid, state: "unexpected" })).toBe(false);
  });
  it("freezes displayed address version with intent and limits actions by outcome", async () => {
    const { createEmailReminderIntent, emailReminderAction } =
      await import("@/components/reminders/email-reminder-controls");
    const displayed = {
      enabled: false,
      verified: true,
      email: "a@example.test",
      consentVersion: "version-a",
      state: "off" as const,
    };
    const base = {
      expectedUserId: "owner",
      taskId: "task",
      configurationId: "config",
      requestId: "request",
    };
    const intent = createEmailReminderIntent(displayed, base, "enable");
    expect(intent).toMatchObject({
      consentVersion: "version-a",
      requestId: "request",
    });
    expect(Object.isFrozen(intent)).toBe(true);
    expect(
      createEmailReminderIntent(
        { ...displayed, verified: false, email: null },
        base,
        "enable",
      ),
    ).toBeNull();
    expect(emailReminderAction({ ...displayed, state: "pending" })).toBe(
      "disable",
    );
    expect(emailReminderAction({ ...displayed, state: "queued" })).toBe(
      "disable",
    );
    for (const state of [
      "dispatching",
      "accepted",
      "unknown",
      "expired",
      "failed",
    ] as const)
      expect(emailReminderAction({ ...displayed, state })).toBeNull();
    expect(emailReminderAction({ ...displayed, state: "cancelled" })).toBe(
      "enable",
    );
  });
});
