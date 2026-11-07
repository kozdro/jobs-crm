/** DEC-062 / Calendar Core: guarded real Auth, Data API and private event commands. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import postgres from "postgres";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id) throw new Error("Calendar requires a guarded disposable target");
const target = await readRecruitmentTarget(id);
type Row = Record<string, unknown>;
type Event = Row & { id: string; revision: number; status: string };
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.body as T;
}

test(
  "Calendar Core owner isolation, validation and replay",
  { timeout: 240_000 },
  async (t) => {
    const [a, b] = await createAccounts(target);
    const api = (
      path: string,
      method = "GET",
      body?: unknown,
      token: string | null = a.token,
    ) => request(target, token ?? undefined, path, method, body, {}, "public");
    const call = (
      name: string,
      body: unknown,
      token: string | null = a.token,
    ) => api(`/rest/v1/rpc/${name}`, "POST", body, token);
    const command = (
      payload: Row,
      requestId = randomUUID(),
      token: string | null = a.token,
    ) =>
      call(
        "execute_recruitment_calendar_command",
        { p_request_id: requestId, p_payload: payload },
        token,
      );
    const schedule = {
      startDate: "2099-05-15",
      startTime: null,
      endDate: null,
      endTime: null,
      allDay: false,
      timeZone: "Europe/Warsaw",
      startOffset: null,
      endOffset: null,
    };
    const create = (values: Row = {}) => ({
      operation: "create",
      values: {
        title: `QA ${randomUUID()}`,
        description: null,
        caseId: null,
        status: "planned",
        schedule,
        timeZone: "Europe/Warsaw",
        actual: null,
        participants: [],
        ...values,
      },
    });

    await t.test(
      "same intent is replayed, a changed intent is rejected and no fake time is created",
      async () => {
        const payload = create();
        const requestId = randomUUID();
        const first = ok<{ kind: string; event: Event }>(
          await command(payload, requestId),
        );
        const replay = ok<{ kind: string; event: Event }>(
          await command(payload, requestId),
        );
        assert.equal(first.event.id, replay.event.id);
        assert.equal(replay.kind, "replayed");
        assert.equal(first.event.status, "planned");
        assert.deepEqual(first.event.schedule, schedule);
        assert.equal(first.event.actual, null);
        denied(await command(create({ title: "Inny zamiar" }), requestId));
        const visible = ok<Event[]>(
          await api(
            `/rest/v1/recruitment_calendar_event?select=*&id=eq.${first.event.id}`,
          ),
        );
        assert.equal(visible.length, 1);
      },
    );

    await t.test(
      "A can read own event; B and anon cannot read it or mutate it directly",
      async () => {
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Calendar contact ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile;
        const event = ok<{ event: Event }>(
          await command(
            create({
              participants: [{ contactId: contact.id, attendance: "unknown" }],
            }),
          ),
        ).event;
        for (const table of [
          "recruitment_calendar_event",
          "recruitment_calendar_command",
          "recruitment_calendar_participant",
        ]) {
          const query =
            table !== "recruitment_calendar_event"
              ? `event_id=eq.${event.id}`
              : `id=eq.${event.id}`;
          const path = `/rest/v1/${table}?select=*&${query}`;
          assert.ok(ok<Row[]>(await api(path)).length > 0);
          const foreign = await api(path, "GET", undefined, b.token);
          assert.deepEqual(ok<Row[]>(foreign), []);
          assert.equal(foreign.range?.split("/")[1], "0");
          denied(await api(path, "GET", undefined, null));
          const list = await api(
            `/rest/v1/${table}?select=*&owner_id=eq.${a.id}`,
            "GET",
            undefined,
            b.token,
          );
          assert.deepEqual(ok<Row[]>(list), []);
          assert.equal(list.range?.split("/")[1], "0");
        }
        assert.equal(
          ok<Event>(
            await call("get_recruitment_calendar_event", {
              p_event_id: event.id,
            }),
          ).id,
          event.id,
        );
        assert.equal(
          ok<null>(
            await call(
              "get_recruitment_calendar_event",
              { p_event_id: event.id },
              b.token,
            ),
          ),
          null,
        );
        denied(
          await call(
            "get_recruitment_calendar_event",
            { p_event_id: event.id },
            null,
          ),
        );
        for (const token of [b.token, null]) {
          denied(
            await command(
              {
                operation: "edit",
                eventId: event.id,
                expectedRevision: event.revision,
                values: {},
              },
              randomUUID(),
              token,
            ),
          );
          denied(
            await command(
              {
                operation: "resolve",
                eventId: event.id,
                expectedRevision: event.revision,
                values: { status: "occurred" },
              },
              randomUUID(),
              token,
            ),
          );
        }
        denied(
          await api(
            `/rest/v1/recruitment_calendar_event?id=eq.${event.id}`,
            "PATCH",
            { status: "occurred" },
          ),
        );
        denied(
          await api(
            `/rest/v1/recruitment_calendar_event?id=eq.${event.id}`,
            "DELETE",
          ),
        );
        denied(
          await api("/rest/v1/recruitment_calendar_command", "POST", {
            event_id: event.id,
            owner_id: a.id,
          }),
        );
        denied(
          await api(
            `/rest/v1/recruitment_calendar_participant?event_id=eq.${event.id}`,
            "PATCH",
            { attendance: "attended" },
          ),
        );
        denied(
          await api(
            `/rest/v1/recruitment_calendar_participant?event_id=eq.${event.id}`,
            "DELETE",
          ),
        );
        const rows = ok<Event[]>(
          await api(
            `/rest/v1/recruitment_calendar_event?select=*&id=eq.${event.id}`,
          ),
        );
        assert.equal(rows[0].status, "planned");
      },
    );

    await t.test(
      "invalid title, IANA zone and nonexistent dates cannot create an event",
      async () => {
        for (const values of [
          { title: "  " },
          { title: "🧪".repeat(161) },
          { description: "x".repeat(2001) },
          { schedule: { ...schedule, timeZone: "Not/AZone" } },
          { schedule: { ...schedule, startDate: "2025-02-29" } },
        ])
          denied(await command(create(values)));
      },
    );
    await t.test(
      "foreign case and contact IDs cannot become event relations",
      async () => {
        const foreignCase = ok<{ case: { id: string } }>(
          await call(
            "create_recruitment_case",
            {
              p_request_id: randomUUID(),
              p_title: `Foreign case ${randomUUID()}`,
            },
            b.token,
          ),
        ).case.id;
        const foreignContact = ok<{ profile: { id: string } }>(
          await call(
            "execute_catalog_command",
            {
              p_request_id: randomUUID(),
              p_payload: {
                operation: "create-profile",
                profileType: "contact",
                name: `Foreign contact ${randomUUID()}`,
                email: null,
              },
            },
            b.token,
          ),
        ).profile.id;
        denied(await command(create({ caseId: foreignCase })));
        denied(
          await command(
            create({
              participants: [
                { contactId: foreignContact, attendance: "unknown" },
              ],
            }),
          ),
        );
      },
    );

    await t.test(
      "participant creation and removal use audited edit; direct INSERT, UPDATE and DELETE are refused",
      async () => {
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Edit participant ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const initial = create();
        const event = ok<{ event: Event }>(await command(initial)).event;
        denied(
          await api("/rest/v1/recruitment_calendar_participant", "POST", {
            event_id: event.id,
            contact_id: contact,
            attendance: "unknown",
          }),
        );
        const addedValues = {
          ...initial.values,
          participants: [{ contactId: contact, attendance: "unknown" }],
        };
        const added = ok<{ event: Event }>(
          await command({
            operation: "edit",
            eventId: event.id,
            expectedRevision: event.revision,
            values: addedValues,
          }),
        ).event;
        assert.deepEqual(added.participants, [
          { contactId: contact, attendance: "unknown" },
        ]);
        denied(
          await api(
            `/rest/v1/recruitment_calendar_participant?event_id=eq.${event.id}`,
            "PATCH",
            { attendance: "attended" },
          ),
        );
        denied(
          await api(
            `/rest/v1/recruitment_calendar_participant?event_id=eq.${event.id}`,
            "DELETE",
          ),
        );
        const removed = ok<{ event: Event }>(
          await command({
            operation: "edit",
            eventId: event.id,
            expectedRevision: added.revision,
            values: initial.values,
          }),
        ).event;
        assert.deepEqual(removed.participants, []);
        const entries = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${event.id}&order=recorded_at.asc`,
          ),
        );
        assert.equal(entries.length, 3);
        assert.deepEqual((entries[1].after_values as Row).participants, [
          { contactId: contact, attendance: "unknown" },
        ]);
        assert.deepEqual((entries[2].before_values as Row).participants, [
          { contactId: contact, attendance: "unknown" },
        ]);
        assert.deepEqual((entries[2].after_values as Row).participants, []);
      },
    );

    await t.test(
      "DST gaps are rejected and both explicit offsets in a repeated local hour remain distinct",
      async () => {
        const timed = {
          ...schedule,
          startDate: "2026-03-29",
          startTime: "02:30",
          startOffset: 60,
        };
        denied(await command(create({ schedule: timed })));
        const repeated = { ...timed, startDate: "2026-10-25" };
        denied(
          await command(
            create({ schedule: { ...repeated, startOffset: null } }),
          ),
        );
        for (const offset of [60, 120]) {
          const result = ok<{ event: Event }>(
            await command(
              create({ schedule: { ...repeated, startOffset: offset } }),
            ),
          );
          assert.equal((result.event.schedule as Row).startOffset, offset);
        }
      },
    );

    await t.test(
      "attention boundaries use the event zone, precise end and no fabricated midnight",
      async () => {
        const day = { ...schedule, startDate: "2026-06-01" };
        const passed = async (s: Row, at: string) =>
          ok<boolean>(
            await call("recruitment_calendar_has_passed", {
              s,
              z: "Europe/Warsaw",
              at_time: at,
            }),
          );
        assert.equal(await passed(day, "2026-06-01T21:59:59Z"), false);
        assert.equal(await passed(day, "2026-06-01T22:00:00Z"), true);
        const allDay = { ...day, allDay: true };
        assert.equal(await passed(allDay, "2026-06-01T21:59:59Z"), false);
        assert.equal(await passed(allDay, "2026-06-01T22:00:00Z"), true);
        const timed = {
          ...day,
          startTime: "10:00",
          startOffset: 120,
          endTime: "11:00",
          endOffset: 120,
        };
        assert.equal(await passed(timed, "2026-06-01T08:59:59Z"), false);
        assert.equal(await passed(timed, "2026-06-01T09:00:01Z"), true);
      },
    );

    await t.test(
      "attendance and actual time require explicit resolution and corrections preserve audit",
      async () => {
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Actual attendee ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const initial = create({
          schedule: { ...schedule, startDate: "2000-01-01" },
          participants: [{ contactId: contact, attendance: "unknown" }],
        });
        const event = ok<{ event: Event }>(await command(initial)).event;
        assert.equal(event.status, "planned");
        const historyForContact = async () =>
          ok<Event[]>(
            await call("list_recruitment_calendar_events", {
              p_contact_id: contact,
            }),
          );
        assert.deepEqual(await historyForContact(), []);
        const values = initial.values as Row;
        const occurredValues = {
          ...values,
          status: "occurred",
          actual: {
            date: "2000-01-02",
            time: null,
            offset: null,
            timeZone: "Europe/Warsaw",
          },
          participants: [{ contactId: contact, attendance: "attended" }],
        };
        const occurred = ok<{ event: Event }>(
          await command({
            operation: "resolve",
            eventId: event.id,
            expectedRevision: event.revision,
            values: occurredValues,
          }),
        ).event;
        assert.equal(occurred.status, "occurred");
        assert.deepEqual(occurred.actual, {
          date: "2000-01-02",
          time: null,
          offset: null,
          timeZone: "Europe/Warsaw",
        });
        assert.deepEqual(occurred.participants, [
          { contactId: contact, attendance: "attended" },
        ]);
        assert.deepEqual(
          (await historyForContact()).map((e) => e.id),
          [event.id],
        );
        const zoneChanged = ok<{ event: Event }>(
          await command({
            operation: "edit",
            eventId: event.id,
            expectedRevision: occurred.revision,
            values: {
              ...occurredValues,
              timeZone: "UTC",
              schedule: {
                ...schedule,
                startDate: "2000-01-01",
                timeZone: "UTC",
              },
            },
          }),
        ).event;
        assert.deepEqual(zoneChanged.actual, occurred.actual);
        const corrected = ok<{ event: Event }>(
          await command({
            operation: "resolve",
            eventId: event.id,
            expectedRevision: zoneChanged.revision,
            values: { ...values, status: "not_occurred" },
          }),
        ).event;
        assert.equal(corrected.status, "not_occurred");
        assert.deepEqual(await historyForContact(), []);
        const audit = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${event.id}&order=recorded_at.asc`,
          ),
        );
        assert.equal(audit.length, 4);
        assert.equal((audit[3].before_values as Row).status, "occurred");
        assert.deepEqual(
          (audit[3].before_values as Row).actual,
          occurred.actual,
        );
        denied(
          await command({
            operation: "resolve",
            eventId: event.id,
            expectedRevision: corrected.revision,
            values: {
              ...occurredValues,
              actual: {
                date: "2999-01-01",
                time: null,
                offset: null,
                timeZone: "Europe/Warsaw",
              },
            },
          }),
        );
      },
    );

    await t.test(
      "an already held conversation can be recorded without a synthetic plan or invented actual date",
      async () => {
        const result = ok<{ event: Event }>(
          await command(
            create({ status: "occurred", schedule: null, actual: null }),
          ),
        );
        assert.equal(result.event.status, "occurred");
        assert.equal(result.event.schedule, null);
        assert.equal(result.event.actual, null);
        const audit = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${result.event.id}`,
          ),
        );
        assert.equal(audit.length, 1);
        assert.equal(audit[0].operation, "create");
        assert.equal(audit[0].before_values, null);
      },
    );

    await t.test(
      "correcting an unplanned conversation never invents a schedule and retry preserves audit",
      async () => {
        for (const status of ["not_occurred", "cancelled"]) {
          const initial = create({
            status: "occurred",
            schedule: null,
            actual: null,
          });
          const event = ok<{ event: Event }>(await command(initial)).event;
          const correction = {
            operation: "resolve",
            eventId: event.id,
            expectedRevision: event.revision,
            values: { ...initial.values, status },
          };
          const requestId = randomUUID();
          const corrected = ok<{ kind: string; event: Event }>(
            await command(correction, requestId),
          );
          assert.equal(corrected.event.id, event.id);
          assert.equal(corrected.event.status, status);
          assert.equal(corrected.event.schedule, null);
          assert.equal(corrected.event.actual, null);
          const replay = ok<{ kind: string; event: Event }>(
            await command(correction, requestId),
          );
          assert.equal(replay.kind, "replayed");
          assert.equal(replay.event.id, event.id);
          const audit = ok<Row[]>(
            await api(
              `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${event.id}&order=recorded_at.asc`,
            ),
          );
          assert.equal(audit.length, 2);
          assert.equal((audit[1].before_values as Row).status, "occurred");
          assert.equal((audit[1].before_values as Row).schedule, null);
          assert.equal((audit[1].after_values as Row).status, status);
          assert.equal((audit[1].after_values as Row).schedule, null);
        }
      },
    );

    await t.test(
      "one contact history includes only actual participation across two cases without event copies",
      async () => {
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Shared contact ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const caseIds: string[] = [];
        for (let i = 0; i < 3; i++)
          caseIds.push(
            ok<{ case: { id: string } }>(
              await call("create_recruitment_case", {
                p_request_id: randomUUID(),
                p_title: `History case ${randomUUID()}`,
              }),
            ).case.id,
          );
        const eventIds: string[] = [];
        for (const caseId of caseIds.slice(0, 2)) {
          const created = ok<{ event: Event }>(
            await command(
              create({
                caseId,
                status: "occurred",
                schedule: null,
                actual: null,
                participants: [{ contactId: contact, attendance: "attended" }],
              }),
            ),
          );
          eventIds.push(created.event.id);
        }
        const third = ok<{ event: Event }>(
          await command(
            create({
              caseId: caseIds[2],
              status: "occurred",
              schedule: null,
              actual: null,
            }),
          ),
        );
        const history = ok<Event[]>(
          await call("list_recruitment_calendar_events", {
            p_contact_id: contact,
          }),
        );
        assert.deepEqual(
          history.map((event) => event.id).sort(),
          eventIds.sort(),
        );
        assert.ok(history.every((event) => event.id !== third.event.id));
        for (const event of history)
          assert.ok(caseIds.slice(0, 2).includes(event.case_id as string));
      },
    );

    await t.test(
      "contact history orders actual dates before pagination and places unknown dates last",
      async () => {
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Sorted contact ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const ids: string[] = [];
        for (const [actualDate, planDate] of [
          ["2020-01-01", "2099-01-01"],
          ["2022-01-01", "2001-01-01"],
          [null, "2000-01-01"],
          ["2022-01-01", "2002-01-01"],
        ] as const) {
          const actual = actualDate
            ? {
                date: actualDate,
                time: null,
                offset: null,
                timeZone: "Europe/Warsaw",
              }
            : null;
          const event = ok<{ event: Event }>(
            await command(
              create({
                status: "occurred",
                schedule: { ...schedule, startDate: planDate },
                actual,
                participants: [{ contactId: contact, attendance: "attended" }],
              }),
            ),
          ).event;
          ids.push(event.id);
        }
        const list = async (offset: number) =>
          ok<Event[]>(
            await call("list_recruitment_calendar_events", {
              p_contact_id: contact,
              p_offset: offset,
              p_limit: 2,
            }),
          );
        assert.deepEqual(
          (await list(0)).map((e) => e.id),
          [ids[3], ids[1]],
        );
        assert.deepEqual(
          (await list(2)).map((e) => e.id),
          [ids[0], ids[2]],
        );
      },
    );

    await t.test(
      "occurred, corrected not occurred, then occurred again retains first recording time and stable history order",
      async () => {
        const caseId = ok<{ case: { id: string } }>(
          await call("create_recruitment_case", {
            p_request_id: randomUUID(),
            p_title: `Occurrence history ${randomUUID()}`,
          }),
        ).case.id;
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Occurrence contact ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const actual = {
          date: "2020-01-02",
          time: null,
          offset: null,
          timeZone: "Europe/Warsaw",
        };
        const occurrence = () =>
          create({
            caseId,
            status: "occurred",
            schedule: null,
            actual,
            participants: [{ contactId: contact, attendance: "attended" }],
          });
        const initial = occurrence();
        const first = ok<{ event: Event }>(await command(initial)).event;
        const other = ok<{ event: Event }>(await command(occurrence())).event;
        const auditFirst = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${first.id}&order=recorded_at.asc,id.asc`,
          ),
        );
        const originalRecordedAt = auditFirst[0].recorded_at;
        const timeline = async () =>
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_case_timeline?select=*&case_id=eq.${caseId}&id=eq.${first.id}`,
            ),
          );
        const history = async () =>
          ok<Event[]>(
            await call("list_recruitment_calendar_events", {
              p_contact_id: contact,
            }),
          );
        assert.equal((await timeline())[0].recorded_at, originalRecordedAt);
        assert.deepEqual(
          (await history()).map((e) => e.id),
          [other.id, first.id],
        );
        const notOccurred = ok<{ event: Event }>(
          await command({
            operation: "resolve",
            eventId: first.id,
            expectedRevision: first.revision,
            values: {
              ...initial.values,
              status: "not_occurred",
              actual: null,
              participants: [{ contactId: contact, attendance: "unknown" }],
            },
          }),
        ).event;
        assert.deepEqual(await timeline(), []);
        assert.deepEqual(
          (await history()).map((e) => e.id),
          [other.id],
        );
        const occurredAgain = ok<{ event: Event }>(
          await command({
            operation: "resolve",
            eventId: first.id,
            expectedRevision: notOccurred.revision,
            values: initial.values,
          }),
        ).event;
        assert.equal(occurredAgain.id, first.id);
        assert.equal((await timeline())[0].recorded_at, originalRecordedAt);
        assert.deepEqual(
          (await history()).map((e) => e.id),
          [other.id, first.id],
        );
        const audit = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${first.id}&order=recorded_at.asc,id.asc`,
          ),
        );
        assert.equal(audit.length, 3);
        assert.equal(audit[0].recorded_at, originalRecordedAt);
      },
    );

    await t.test(
      "mixed close resolves every Task and CalendarEvent atomically; stale previews and old RPC fail closed",
      async () => {
        const caseId = ok<{ case: { id: string } }>(
          await call("create_recruitment_case", {
            p_request_id: randomUUID(),
            p_title: `Mixed close ${randomUUID()}`,
          }),
        ).case.id;
        const contact = ok<{ profile: { id: string } }>(
          await call("execute_catalog_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create-profile",
              profileType: "contact",
              name: `Attendee ${randomUUID()}`,
              email: null,
            },
          }),
        ).profile.id;
        const events: Event[] = [];
        for (let i = 0; i < 3; i++) {
          events.push(
            ok<{ event: Event }>(
              await command(
                create({
                  caseId,
                  participants: [{ contactId: contact, attendance: "unknown" }],
                }),
              ),
            ).event,
          );
        }
        const task = ok<{ task: { id: string } }>(
          await call("execute_recruitment_task_command", {
            p_request_id: randomUUID(),
            p_payload: {
              operation: "create",
              title: `Mixed task ${randomUUID()}`,
              description: null,
              dueOn: null,
              caseId,
            },
          }),
        ).task;
        const base = {
          p_case_id: caseId,
          p_operation: "close",
          p_closure_id: null,
          p_outcome: "Inny",
          p_occurred_on: null,
          p_offer_confirmed: false,
        };
        type Preview = {
          caseRevision: number;
          closureRevision: number | null;
          taskSnapshot: string[];
          eventSnapshot: string[];
          openEvents: Event[];
        };
        const preview = async () =>
          ok<Preview>(await call("preview_recruitment_case_lifecycle", base));
        const payload = (p: Preview, requestId = randomUUID()) => ({
          ...base,
          p_request_id: requestId,
          p_expected_case_revision: p.caseRevision,
          p_expected_closure_revision: p.closureRevision,
          p_expected_task_snapshot: p.taskSnapshot,
          p_task_resolutions: [{ taskId: task.id, action: "cancel" }],
          p_expected_event_snapshot: p.eventSnapshot,
          p_event_resolutions: events.map((event, i) => ({
            eventId: event.id,
            action: ["cancel", "keep", "detach"][i],
          })),
        });
        const stale = await preview();
        assert.deepEqual(
          stale.openEvents.map((e) => e.id).sort(),
          events.map((e) => e.id).sort(),
        );
        const changedValues = create({
          caseId,
          title: events[0].title,
          description: "Changed after preview",
          participants: [{ contactId: contact, attendance: "unknown" }],
        }).values;
        events[0] = ok<{ event: Event }>(
          await command({
            operation: "edit",
            eventId: events[0].id,
            expectedRevision: events[0].revision,
            values: changedValues,
          }),
        ).event;
        denied(
          await call(
            "confirm_recruitment_case_lifecycle_calendar",
            payload(stale),
          ),
        );
        const staleSet = await preview();
        const extra = ok<{ event: Event }>(
          await command(create({ caseId })),
        ).event;
        denied(
          await call(
            "confirm_recruitment_case_lifecycle_calendar",
            payload(staleSet),
          ),
        );
        const before = ok<Row[]>(
          await api(`/rest/v1/recruitment_case?select=status&id=eq.${caseId}`),
        );
        assert.equal(before[0].status, "Zapisane");
        for (const event of events) {
          const row = ok<Event[]>(
            await api(
              `/rest/v1/recruitment_calendar_event?select=*&id=eq.${event.id}`,
            ),
          )[0];
          assert.equal(row.status, "planned");
          assert.equal(row.case_id, caseId);
        }
        const fresh = await preview();
        const attempt = payload(fresh);
        attempt.p_event_resolutions.push({ eventId: extra.id, action: "keep" });
        const {
          p_expected_event_snapshot: _events,
          p_event_resolutions: _resolutions,
          ...legacy
        } = attempt;
        void _events;
        void _resolutions;
        denied(await call("confirm_recruitment_case_lifecycle_tasks", legacy));
        const sql = postgres({
          ...target.db,
          max: 1,
          ssl: false,
          onnotice: () => {},
        });
        const triggerName = `qa_calendar_failure_${randomUUID().replaceAll("-", "")}`;
        const beforeTask = ok<Row[]>(
          await api(`/rest/v1/recruitment_task?select=*&id=eq.${task.id}`),
        );
        const beforeAudit = ok<Row[]>(
          await api(
            `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${events[2].id}`,
          ),
        );
        try {
          await sql.unsafe(
            `CREATE FUNCTION public.${triggerName}() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Synthetic calendar projection failure'; END $$`,
          );
          await sql.unsafe(
            `REVOKE ALL ON FUNCTION public.${triggerName}() FROM PUBLIC,anon,authenticated,service_role`,
          );
          await sql.unsafe(
            `CREATE TRIGGER ${triggerName} AFTER UPDATE ON public.recruitment_calendar_event FOR EACH ROW WHEN (NEW.id='${events[2].id}'::uuid) EXECUTE FUNCTION public.${triggerName}()`,
          );
          denied(
            await call("confirm_recruitment_case_lifecycle_calendar", attempt),
          );
          assert.deepEqual(
            ok<Row[]>(
              await api(`/rest/v1/recruitment_task?select=*&id=eq.${task.id}`),
            ),
            beforeTask,
          );
          assert.deepEqual(
            ok<Row[]>(
              await api(
                `/rest/v1/recruitment_calendar_command?select=*&event_id=eq.${events[2].id}`,
              ),
            ),
            beforeAudit,
          );
          assert.equal(
            ok<Row[]>(
              await api(
                `/rest/v1/recruitment_case?select=status&id=eq.${caseId}`,
              ),
            )[0].status,
            "Zapisane",
          );
          for (const event of events) {
            const row = ok<Event[]>(
              await api(
                `/rest/v1/recruitment_calendar_event?select=*&id=eq.${event.id}`,
              ),
            )[0];
            assert.equal(row.status, "planned");
            assert.equal(row.case_id, caseId);
          }
        } finally {
          await sql.unsafe(
            `DROP TRIGGER IF EXISTS ${triggerName} ON public.recruitment_calendar_event`,
          );
          await sql.unsafe(`DROP FUNCTION IF EXISTS public.${triggerName}()`);
          await sql.end();
        }
        const result = ok<{ kind: string }>(
          await call("confirm_recruitment_case_lifecycle_calendar", attempt),
        );
        assert.equal(result.kind, "created");
        assert.equal(
          ok<{ kind: string }>(
            await call("confirm_recruitment_case_lifecycle_calendar", attempt),
          ).kind,
          "replayed",
        );
        const rows = await Promise.all(
          events.map(
            async (e) =>
              ok<Event[]>(
                await api(
                  `/rest/v1/recruitment_calendar_event?select=*&id=eq.${e.id}`,
                ),
              )[0],
          ),
        );
        assert.deepEqual(
          rows.map((e) => [e.status, e.case_id]),
          [
            ["cancelled", caseId],
            ["planned", caseId],
            ["planned", null],
          ],
        );
        for (const event of events) {
          const participants = ok<Row[]>(
            await api(
              `/rest/v1/recruitment_calendar_participant?select=*&event_id=eq.${event.id}`,
            ),
          );
          assert.equal(participants.length, 1);
          assert.equal(participants[0].contact_id, contact);
          assert.equal(participants[0].attendance, "unknown");
        }
        const closedEvent = ok<{ event: Event }>(
          await command(create({ caseId })),
        ).event;
        assert.equal(closedEvent.case_id, caseId);
        assert.equal(
          ok<Row[]>(
            await api(
              `/rest/v1/recruitment_case?select=status&id=eq.${caseId}`,
            ),
          )[0].status,
          "Zakończone",
        );
        const reopen = { ...base, p_operation: "reopen", p_outcome: null };
        const reopenPreview = ok<Preview>(
          await call("preview_recruitment_case_lifecycle", reopen),
        );
        ok(
          await call("confirm_recruitment_case_lifecycle_calendar", {
            ...reopen,
            p_request_id: randomUUID(),
            p_expected_case_revision: reopenPreview.caseRevision,
            p_expected_closure_revision: reopenPreview.closureRevision,
            p_expected_task_snapshot: [],
            p_task_resolutions: [],
            p_expected_event_snapshot: [],
            p_event_resolutions: [],
          }),
        );
        const afterReopen = await Promise.all(
          events.map(
            async (e) =>
              ok<Event[]>(
                await api(
                  `/rest/v1/recruitment_calendar_event?select=*&id=eq.${e.id}`,
                ),
              )[0],
          ),
        );
        assert.deepEqual(
          afterReopen.map((e) => [e.status, e.case_id]),
          rows.map((e) => [e.status, e.case_id]),
        );
        const postReopen = ok<Event[]>(
          await api(
            `/rest/v1/recruitment_calendar_event?select=*&id=eq.${closedEvent.id}`,
          ),
        )[0];
        assert.equal(postReopen.status, "planned");
        assert.equal(postReopen.case_id, caseId);
      },
    );
  },
);
