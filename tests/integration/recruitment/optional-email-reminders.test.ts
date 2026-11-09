/** Owner isolation and consent contract through the actual Data API. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readRecruitmentTarget } from "../../../scripts/recruitment/target.ts";
import {
  createAccounts,
  denied,
  request,
  type Reply,
} from "../rls/data-api.ts";

const id = process.env.RECRUITMENT_TARGET_ID;
if (!id)
  throw new Error("Email reminder QA requires an owned disposable target");
const target = await readRecruitmentTarget(id);
function ok<T>(reply: Reply): T {
  assert.equal(reply.status, 200, `Unexpected Data API status ${reply.status}`);
  return reply.body as T;
}

test(
  "email consent is opt-in, owner-scoped, replay-safe and revocable",
  { timeout: 90_000 },
  async () => {
    const [a, b] = await createAccounts(target);
    const rpc = (
      name: string,
      body: unknown,
      token: string | undefined = a.token,
    ) =>
      request(
        target,
        token,
        `/rest/v1/rpc/${name}`,
        "POST",
        body,
        {},
        "public",
      );
    const task = ok<{ task: { id: string; revision: number } }>(
      await rpc("execute_recruitment_task_command", {
        p_request_id: randomUUID(),
        p_payload: {
          operation: "create",
          title: `Synthetic ${randomUUID()}`,
          description: null,
          dueOn: null,
          caseId: null,
        },
      }),
    ).task;
    const configurationId = randomUUID();
    ok(
      await rpc("execute_recruitment_reminder_command", {
        p_request_id: configurationId,
        p_payload: {
          operation: "set-reminder",
          taskId: task.id,
          expectedRevision: task.revision,
          date: "2099-01-01",
          time: "12:00",
          timeZone: "Europe/Warsaw",
          offset: 60,
        },
      }),
    );
    const args = { p_task_id: task.id, p_configuration_id: configurationId };
    const read = (token: string | undefined = a.token) =>
      rpc("read_email_reminder", args, token);
    const command = (
      enabled: boolean,
      requestId = randomUUID(),
      token: string | undefined = a.token,
    ) =>
      rpc(
        "execute_email_reminder",
        { ...args, p_request_id: requestId, p_enabled: enabled },
        token,
      );
    assert.deepEqual(
      ok<{ enabled: boolean; email: string; verified: boolean }>(await read()),
      {
        enabled: false,
        email: a.email,
        verified: true,
      },
    );
    denied(await read(b.token));
    denied(await command(true, randomUUID(), b.token));
    const anonymous = await request(
      target,
      undefined,
      "/rest/v1/rpc/read_email_reminder",
      "POST",
      args,
      {},
      "public",
    );
    denied(anonymous);
    const requestId = randomUUID();
    assert.equal(
      ok<{ kind: string }>(await command(true, requestId)).kind,
      "created",
    );
    assert.equal(
      ok<{ kind: string }>(await command(true, requestId)).kind,
      "replayed",
    );
    denied(await command(false, requestId));
    assert.equal(ok<{ enabled: boolean }>(await read()).enabled, true);
    // Mutate only this test's synthetic owner via the guarded local admin fixture.
    const changeEmail = async (email: string) => {
      const response = await fetch(
        `${target.apiUrl}/auth/v1/admin/users/${a.id}`,
        {
          method: "PUT",
          headers: {
            apikey: target.serviceRoleKey,
            Authorization: `Bearer ${target.serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, email_confirm: true }),
          signal: AbortSignal.timeout(15_000),
          redirect: "error",
        },
      );
      assert.equal(
        response.status,
        200,
        "Synthetic account email update failed",
      );
    };
    await changeEmail(`changed-${randomUUID()}@example.invalid`);
    assert.equal(ok<{ enabled: boolean }>(await read()).enabled, false);
    await changeEmail(a.email);
    assert.equal(
      ok<{ enabled: boolean }>(await read()).enabled,
      false,
      "A→B→A must not reactivate consent",
    );
    ok(await command(true));
    assert.equal(ok<{ enabled: boolean }>(await read()).enabled, true);
    ok(await command(false));
    assert.equal(ok<{ enabled: boolean }>(await read()).enabled, false);
  },
);
