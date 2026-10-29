// Full user-path assertions use native HTTP and Auth-issued JWTs, never DB admin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  assertIsolation,
  assertMassGuard,
  clear,
  createAccounts,
  denied,
  errorCode,
  request,
  rest,
  rows,
  seed,
  signIn,
  tables,
  visibleSnapshot,
  type ApiTarget,
  type Cases,
  type Fixture,
  type Row,
  type User,
} from "./data-api.ts";

export async function runMatrix(
  t: Cases,
  target: ApiTarget,
): Promise<{ users: [User, User]; cases: number }> {
  const users = await createAccounts(target);
  let cases = 0;
  async function check(
    name: string,
    fn: (users: [User, User], fixtures: [Fixture, Fixture]) => Promise<void>,
  ) {
    await t.test(name, async () => {
      const fixtures: [Fixture, Fixture] = [
        await seed(target, users[0]),
        await seed(target, users[1]),
      ];
      try {
        await fn(users, fixtures);
      } finally {
        await clear(target, users);
      }
    });
    cases++;
  }
  await check(
    "FQA-13/RLS-01 anon, absent and invalid JWT deny every table CRUD and RPC",
    async ([a, b], [fixture]) => {
      const invalid = `${a.token.slice(0, a.token.lastIndexOf(".") + 1)}invalid-signature`;
      const [header, originalClaims, signature] = a.token.split(".");
      const claims = JSON.parse(
        Buffer.from(originalClaims, "base64url").toString(),
      );
      const forgedClaims = `${header}.${Buffer.from(JSON.stringify({ ...claims, sub: b.id })).toString("base64url")}.${signature}`;
      for (const token of [undefined, target.anonKey, invalid, forgedClaims]) {
        denied(await request(target, token, rest("probe_item_view")));
        denied(
          await request(
            target,
            token,
            rest("probe_item_view", `id=eq.${fixture.probe_item.id}`),
          ),
        );
        for (const table of tables) {
          const payload = { ...fixture[table], id: randomUUID() };
          for (const [method, query, body] of [
            ["GET", "", undefined],
            ["GET", `id=eq.${fixture[table].id}`, undefined],
            ["POST", "", payload],
            [
              "PATCH",
              `id=eq.${fixture[table].id}`,
              { marker: "must-not-write" },
            ],
            ["DELETE", `id=eq.${fixture[table].id}`, undefined],
          ] as const) {
            denied(
              await request(target, token, rest(table, query), method, body),
            );
          }
        }
        denied(
          await request(target, token, rest("rpc/probe_set_marker"), "POST", {
            p_item_id: fixture.probe_item.id,
            p_marker: "must-not-write",
          }),
        );
      }
      for (const table of tables)
        assert.equal(
          rows(await request(target, a.token, rest(table)))[0].marker,
          fixture[table].marker,
        );
    },
  );
  for (const orientation of [0, 1] as const) {
    const label = orientation === 0 ? "A against B" : "B against A";
    await check(
      `FQA-14/RLS-02 ${label} list/ID/count and embedded relations`,
      async (accounts, fixtures) => {
        const own = accounts[orientation],
          other = accounts[1 - orientation];
        await assertIsolation(target, own, other, fixtures[1 - orientation]);
        const embedded = rows(
          await request(
            target,
            own.token,
            rest("probe_link", "select=*,probe_item(*),probe_label(*)"),
          ),
        ) as (Row & { probe_item: Row; probe_label: Row })[];
        assert.equal(embedded.length, 1);
        assert.equal(embedded[0].probe_item.owner_id, own.id);
        assert.equal(embedded[0].probe_label.owner_id, own.id);
        for (const table of tables) {
          const missing = await request(
            target,
            own.token,
            rest(table, `id=eq.${randomUUID()}`),
          );
          const foreign = await request(
            target,
            own.token,
            rest(table, `id=eq.${fixtures[1 - orientation][table].id}`),
          );
          assert.equal(foreign.status, missing.status);
          assert.deepEqual(
            foreign.body,
            missing.body,
            "Foreign and absent ID contracts must match",
          );
        }
      },
    );
    for (const table of tables) {
      await check(
        `FQA-15/RLS-03 ${label} ${table} own INSERT and spoof/NULL owner`,
        async (accounts, fixtures) => {
          const own = accounts[orientation],
            other = accounts[1 - orientation],
            fixture = fixtures[orientation];
          const payload = { ...fixture[table], id: randomUUID() };
          if (table === "probe_link") {
            const extraLabel = rows(
              await request(target, own.token, rest("probe_label"), "POST", {
                owner_id: own.id,
                marker: "synthetic-extra",
              }),
            )[0];
            payload.label_id = extraLabel.id;
          }
          assert.equal(
            rows(await request(target, own.token, rest(table), "POST", payload))
              .length,
            1,
          );
          for (const owner of [other.id, null])
            denied(
              await request(target, own.token, rest(table), "POST", {
                ...payload,
                id: randomUUID(),
                owner_id: owner,
              }),
            );
          assert.equal(
            rows(await request(target, other.token, rest(table))).length,
            1,
          );
        },
      );
      await check(
        `FQA-16/RLS-04 ${label} ${table} UPDATE owner transfer, unfiltered guard and broad mass isolation`,
        async (accounts, fixtures) => {
          const own = accounts[orientation],
            other = accounts[1 - orientation],
            fixture = fixtures[orientation],
            foreign = fixtures[1 - orientation][table];
          const updated = rows(
            await request(
              target,
              own.token,
              rest(table, `id=eq.${fixture[table].id}`),
              "PATCH",
              { marker: "synthetic-updated" },
            ),
          );
          assert.equal(updated.length, 1);
          assert.equal(updated[0].marker, "synthetic-updated");
          assert.equal(
            rows(
              await request(
                target,
                own.token,
                rest(table, `id=eq.${foreign.id}`),
                "PATCH",
                { marker: "must-not-write" },
              ),
            ).length,
            0,
          );
          const transfer = await request(
            target,
            own.token,
            rest(table, `id=eq.${fixture[table].id}`),
            "PATCH",
            { owner_id: other.id },
          );
          denied(transfer);
          assert.equal(
            errorCode(transfer),
            "42501",
            "Owner transfer must fail RLS WITH CHECK before any FK diagnostic",
          );
          const beforeGuard = await visibleSnapshot(target, accounts);
          assertMassGuard(
            await request(target, own.token, rest(table), "PATCH", {
              marker: "must-not-write",
            }),
          );
          assert.deepEqual(
            await visibleSnapshot(target, accounts),
            beforeGuard,
            "Unfiltered refused UPDATE must preserve every A/B row and relation",
          );
          const mass = rows(
            await request(
              target,
              own.token,
              rest(table, "id=not.is.null"),
              "PATCH",
              {
                marker: "synthetic-mass",
              },
            ),
          );
          assert.equal(mass.length, 1);
          assert.ok(mass.every((row) => row.owner_id === own.id));
          assert.equal(
            rows(
              await request(
                target,
                other.token,
                rest(table, `id=eq.${foreign.id}`),
              ),
            )[0].marker,
            foreign.marker,
          );
        },
      );
      await check(
        `FQA-17/RLS-05 ${label} ${table} DELETE own/cross, unfiltered guard and broad mass isolation`,
        async (accounts, fixtures) => {
          const own = accounts[orientation],
            other = accounts[1 - orientation],
            fixture = fixtures[orientation],
            foreign = fixtures[1 - orientation][table];
          assert.equal(
            rows(
              await request(
                target,
                own.token,
                rest(table, `id=eq.${foreign.id}`),
                "DELETE",
              ),
            ).length,
            0,
          );
          assert.equal(
            rows(
              await request(
                target,
                other.token,
                rest(table, `id=eq.${foreign.id}`),
              ),
            ).length,
            1,
          );
          assert.equal(
            rows(
              await request(
                target,
                own.token,
                rest(table, `id=eq.${fixture[table].id}`),
                "DELETE",
              ),
            ).length,
            1,
          );
          assert.equal(
            rows(
              await request(
                target,
                own.token,
                rest(table, `id=eq.${fixture[table].id}`),
              ),
            ).length,
            0,
          );
          // Restore an owner record so mass DELETE is a positive operation, not an empty success.
          if (table === "probe_link")
            rows(
              await request(target, own.token, rest(table), "POST", {
                ...fixture[table],
                id: randomUUID(),
              }),
            );
          else
            rows(
              await request(target, own.token, rest(table), "POST", {
                owner_id: own.id,
                marker: "synthetic-mass-delete",
              }),
            );
          const beforeGuard = await visibleSnapshot(target, accounts);
          assertMassGuard(
            await request(target, own.token, rest(table), "DELETE"),
          );
          assert.deepEqual(
            await visibleSnapshot(target, accounts),
            beforeGuard,
            "Unfiltered refused DELETE must preserve every A/B row and relation",
          );
          const mass = rows(
            await request(
              target,
              own.token,
              rest(table, "id=not.is.null"),
              "DELETE",
            ),
          );
          assert.ok(mass.length > 0);
          assert.ok(mass.every((row) => row.owner_id === own.id));
          assert.equal(
            rows(
              await request(
                target,
                other.token,
                rest(table, `id=eq.${foreign.id}`),
              ),
            ).length,
            1,
          );
          for (const foreignTable of tables)
            assert.equal(
              rows(
                await request(
                  target,
                  other.token,
                  rest(
                    foreignTable,
                    `id=eq.${fixtures[1 - orientation][foreignTable].id}`,
                  ),
                ),
              ).length,
              1,
              "Foreign records and relations must survive owner deletion and cascades",
            );
        },
      );
    }
    await check(
      `FQA-18/RLS-06 ${label} both link endpoints/FK and relation reassignment`,
      async (accounts, fixtures) => {
        const own = accounts[orientation],
          foreign = fixtures[1 - orientation],
          fixture = fixtures[orientation];
        for (const endpoint of ["item_id", "label_id"] as const) {
          const foreignId =
            endpoint === "item_id"
              ? foreign.probe_item.id
              : foreign.probe_label.id;
          const errors = [];
          const patchErrors = [];
          for (const id of [foreignId, randomUUID()]) {
            const payload = {
              ...fixture.probe_link,
              id: randomUUID(),
              [endpoint]: id,
            };
            const reply = await request(
              target,
              own.token,
              rest("probe_link"),
              "POST",
              payload,
            );
            denied(reply);
            assert.equal(errorCode(reply), "42501");
            errors.push(reply.body);
            const patch = await request(
              target,
              own.token,
              rest("probe_link", `id=eq.${fixture.probe_link.id}`),
              "PATCH",
              { [endpoint]: id },
            );
            denied(patch);
            assert.equal(errorCode(patch), "42501");
            patchErrors.push(patch.body);
          }
          assert.deepEqual(
            errors[0],
            errors[1],
            "Foreign and missing endpoints must not form an existence oracle",
          );
          assert.deepEqual(
            patchErrors[0],
            patchErrors[1],
            "Foreign and missing PATCH endpoints must not form an existence oracle",
          );
        }
        assert.equal(
          rows(await request(target, own.token, rest("probe_link"))).length,
          1,
        );
      },
    );
    await check(
      `FQA-19/RLS-07/08 ${label} invoker view and minimal RPC`,
      async (accounts, fixtures) => {
        const own = accounts[orientation],
          other = accounts[1 - orientation],
          fixture = fixtures[orientation],
          foreign = fixtures[1 - orientation];
        const view = rows(
          await request(target, own.token, rest("probe_item_view")),
        );
        assert.equal(view.length, 1);
        assert.equal(view[0].owner_id, own.id);
        const viewCount = await request(
          target,
          own.token,
          rest("probe_item_view", `owner_id=eq.${other.id}&select=id`),
          "HEAD",
          undefined,
          { Prefer: "count=exact" },
        );
        assert.equal(viewCount.status, 200);
        assert.equal(viewCount.range?.split("/")[1], "0");
        denied(
          await request(
            target,
            own.token,
            rest("probe_item_view", `id=eq.${fixture.probe_item.id}`),
            "PATCH",
            { marker: "view-must-be-read-only" },
          ),
        );
        assert.equal(
          rows(
            await request(
              target,
              own.token,
              rest("probe_item_view", `id=eq.${foreign.probe_item.id}`),
            ),
          ).length,
          0,
        );
        const changed = rows(
          await request(
            target,
            own.token,
            rest("rpc/probe_set_marker"),
            "POST",
            { p_item_id: fixture.probe_item.id, p_marker: "synthetic-rpc" },
          ),
        );
        assert.equal(changed.length, 1);
        assert.equal(changed[0].marker, "synthetic-rpc");
        assert.equal(changed[0].revision, 1);
        assert.equal(
          rows(
            await request(
              target,
              own.token,
              rest("rpc/probe_set_marker"),
              "POST",
              { p_item_id: foreign.probe_item.id, p_marker: "must-not-write" },
            ),
          ).length,
          0,
        );
        denied(
          await request(
            target,
            own.token,
            rest("rpc/probe_set_marker"),
            "POST",
            {
              p_item_id: foreign.probe_item.id,
              p_marker: "must-not-write",
              p_owner_id: other.id,
            },
          ),
        );
        assert.equal(
          rows(await request(target, other.token, rest("probe_item")))[0]
            .marker,
          foreign.probe_item.marker,
        );
      },
    );
    await check(
      `FQA-15/RLS-09 ${label} Auth user metadata spoof with freshly issued JWT`,
      async (accounts, fixtures) => {
        const own = accounts[orientation],
          other = accounts[1 - orientation];
        const update = await request(
          target,
          own.token,
          "/auth/v1/user",
          "PUT",
          { data: { owner_id: other.id, sub: other.id, role: "service_role" } },
        );
        assert.equal(update.status, 200);
        const refreshed = await signIn(target, own.email, own.password);
        const claims = JSON.parse(
          Buffer.from(refreshed.token.split(".")[1], "base64url").toString(),
        ) as { sub: string; user_metadata: { owner_id: string } };
        assert.equal(claims.sub, own.id);
        assert.equal(claims.user_metadata.owner_id, other.id);
        await assertIsolation(
          target,
          refreshed,
          other,
          fixtures[1 - orientation],
        );
        for (const table of tables)
          denied(
            await request(target, refreshed.token, rest(table), "POST", {
              ...fixtures[orientation][table],
              id: randomUUID(),
              owner_id: other.id,
            }),
          );
      },
    );
  }
  await check(
    "RLS-11 concurrent interleaved A/B HTTP requests retain isolated identity",
    async (accounts, fixtures) => {
      await Promise.all(
        Array.from({ length: 20 }, async (_, index) => {
          const orientation = index % 2;
          await assertIsolation(
            target,
            accounts[orientation],
            accounts[1 - orientation],
            fixtures[1 - orientation],
          );
        }),
      );
    },
  );
  return { users, cases };
}
