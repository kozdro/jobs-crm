import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLifecycleByRequestId } from "../../../src/modules/recruitment/application/lifecycle";
const caseId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const entry = {
  id: "44444444-4444-4444-8444-444444444444",
  request_id: requestId,
  case_id: caseId,
  kind: "close",
  cycle: 0,
  occurred_on: null,
  recorded_at: "2026-11-01T10:00:00Z",
  outcome: "Inny",
  offer_confirmed: false,
  previous_status: "Zapisane",
  previous_stage: null,
  resulting_status: "Zakończone",
  resulting_stage: null,
  expected_case_revision: 3,
  expected_task_snapshot: [],
  task_resolutions: [],
  expected_event_snapshot: [`${eventId}:2`],
  event_resolutions: [{ eventId, action: "detach" }],
};
function clientWithProjection(omitCalendar = false) {
  const calls: string[] = [];
  const from = vi.fn((table: string) => ({
    select: (columns: string) => {
      calls.push(columns);
      const selected = columns.split(",");
      const source =
        table === "recruitment_case_lifecycle"
          ? Object.fromEntries(
              Object.entries(entry).filter(
                ([key]) =>
                  selected.includes(key) &&
                  !(omitCalendar && key.startsWith("expected_event_")),
              ),
            )
          : null;
      const chain = {
        eq: () => chain,
        maybeSingle: async () => ({ data: source, error: null }),
      };
      return chain;
    },
  }));
  return { client: { from } as unknown as SupabaseClient, calls };
}
describe("Lifecycle recovery receipt", () => {
  it("retrieves and preserves the complete Calendar intent", async () => {
    const { client, calls } = clientWithProjection();
    const result = await getLifecycleByRequestId(client, caseId, requestId);
    expect(calls[0].split(",")).toEqual(
      expect.arrayContaining(["expected_event_snapshot", "event_resolutions"]),
    );
    expect(result.entry?.expected_event_snapshot).toEqual([`${eventId}:2`]);
    expect(result.entry?.event_resolutions).toEqual([
      { eventId, action: "detach" },
    ]);
  });
  it("fails closed when a receipt does not contain its Calendar snapshot", async () => {
    const { client } = clientWithProjection(true);
    await expect(
      getLifecycleByRequestId(client, caseId, requestId),
    ).rejects.toHaveProperty("kind", "unavailable");
  });
});
