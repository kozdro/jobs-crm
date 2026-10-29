// Synthetic foundation PoC only. Administrative key is confined to account setup.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export const schema = "foundation_poc";
export const tables = ["probe_item", "probe_label", "probe_link"] as const;
export type Table = (typeof tables)[number];
export type Row = {
  id: string;
  owner_id: string;
  marker: string;
  item_id?: string;
  label_id?: string;
  revision?: number;
};
export type ApiTarget = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};
export type Reply = { status: number; body: unknown; range: string | null };
export type User = {
  id: string;
  token: string;
  email: string;
  password: string;
};
export type Cases = {
  test(name: string, fn: () => Promise<void>): Promise<unknown>;
};

export async function request(
  target: Pick<ApiTarget, "apiUrl" | "anonKey">,
  token: string | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
  profile: string | null = schema,
): Promise<Reply> {
  const response = await fetch(`${target.apiUrl}${path}`, {
    method,
    headers: {
      apikey: target.anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(profile
        ? { "Accept-Profile": profile, "Content-Profile": profile }
        : {}),
      Prefer: "return=representation,count=exact",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const raw = await response.text();
  let result: unknown = null;
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = { nonJsonResponse: true };
    }
  }
  return {
    status: response.status,
    body: result,
    range: response.headers.get("content-range"),
  };
}

export function rows(reply: Reply): Row[] {
  const code = errorCode(reply);
  const safeCode =
    typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)
      ? code
      : "none";
  assert.ok(
    reply.status >= 200 && reply.status < 300,
    `Data API expected success; status=${reply.status}; code=${safeCode}`,
  );
  assert.ok(Array.isArray(reply.body), "Data API expected row array");
  return reply.body as Row[];
}
export function denied(reply: Reply): void {
  assert.ok(
    reply.status >= 400 && reply.status < 500,
    `Expected denial; status=${reply.status}`,
  );
}
export function errorCode(reply: Reply): string | undefined {
  return (reply.body as { code?: string } | null)?.code;
}

export function assertMassGuard(reply: Reply): void {
  assert.equal(
    reply.status,
    400,
    "Unfiltered mutation must be refused by safeupdate",
  );
  assert.equal(
    errorCode(reply),
    "21000",
    "Expected the observed PostgreSQL safeupdate guard code",
  );
  const message = (reply.body as { message?: unknown } | null)?.message;
  assert.ok(
    typeof message === "string" && /requires a WHERE clause/i.test(message),
    "Expected the observed safeupdate WHERE requirement",
  );
}

export async function visibleSnapshot(
  target: ApiTarget,
  users: User[],
): Promise<Row[][][]> {
  const result: Row[][][] = [];
  for (const user of users) {
    const objects: Row[][] = [];
    for (const table of tables)
      objects.push(
        rows(await request(target, user.token, rest(table))).sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      );
    result.push(objects);
  }
  return result;
}
export const rest = (table: string, query = "") =>
  `/rest/v1/${table}${query ? `?${query}` : ""}`;

export async function signIn(
  target: ApiTarget,
  email: string,
  password: string,
): Promise<User> {
  const result = await request(
    target,
    undefined,
    "/auth/v1/token?grant_type=password",
    "POST",
    { email, password },
  );
  const authCode = (result.body as { error_code?: unknown } | null)?.error_code;
  const safeCode =
    typeof authCode === "string" && /^[a-z_]+$/.test(authCode)
      ? authCode
      : "none";
  assert.equal(
    result.status,
    200,
    `Local Auth password grant must succeed (error_code=${safeCode})`,
  );
  const body = result.body as { access_token: string; user: { id: string } };
  assert.equal(
    typeof body.access_token,
    "string",
    "Auth must return access token",
  );
  const claims = JSON.parse(
    Buffer.from(body.access_token.split(".")[1], "base64url").toString(),
  ) as { sub: string; role: string };
  assert.equal(claims.sub, body.user.id);
  assert.equal(claims.role, "authenticated");
  return { id: body.user.id, token: body.access_token, email, password };
}

export async function assertRegistrationClosed(
  target: ApiTarget,
): Promise<void> {
  // Privileged reads observe fixture setup only. The attempted signup itself is anonymous.
  async function accountIds(): Promise<string[]> {
    const response = await fetch(
      `${target.apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      {
        headers: {
          apikey: target.serviceRoleKey,
          Authorization: `Bearer ${target.serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      },
    );
    assert.equal(
      response.status,
      200,
      "Local fixture account inventory must be readable",
    );
    const body = (await response.json()) as { users: { id: string }[] };
    assert.ok(Array.isArray(body.users));
    assert.ok(
      body.users.length < 1000,
      "Fixture inventory must not be truncated",
    );
    return body.users.map((user) => user.id).sort();
  }
  const before = await accountIds();
  const signup = await request(target, undefined, "/auth/v1/signup", "POST", {
    email: `forbidden-signup-${randomUUID()}@example.invalid`,
    password: `Synthetic-F2-${randomUUID()}!`,
  });
  denied(signup);
  assert.equal(
    (signup.body as { error_code?: string }).error_code,
    "signup_disabled",
  );
  assert.deepEqual(
    await accountIds(),
    before,
    "Rejected anonymous signup must not create an account",
  );
}

export async function createAccounts(target: ApiTarget): Promise<[User, User]> {
  const users: User[] = [];
  for (const name of ["a", "b"]) {
    const email = `foundation-${name}-${randomUUID()}@example.invalid`;
    const password = `Synthetic-F2-${randomUUID()}!`;
    // Privileged setup ends here; this token never reaches tested Data API requests.
    const response = await fetch(`${target.apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: target.serviceRoleKey,
        Authorization: `Bearer ${target.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    assert.equal(
      response.status,
      200,
      "Local admin fixture account creation must succeed",
    );
    await response.arrayBuffer();
    users.push(await signIn(target, email, password));
  }
  assert.notEqual(users[0].id, users[1].id);
  return users as [User, User];
}

export type Fixture = Record<Table, Row>;
export async function seed(target: ApiTarget, user: User): Promise<Fixture> {
  const fixture = {} as Fixture;
  for (const table of tables) {
    const payload: Row = {
      id: randomUUID(),
      owner_id: user.id,
      marker: `synthetic-${randomUUID()}`,
    };
    if (table === "probe_link") {
      payload.item_id = fixture.probe_item.id;
      payload.label_id = fixture.probe_label.id;
    }
    fixture[table] = rows(
      await request(target, user.token, rest(table), "POST", payload),
    )[0];
    assert.equal(
      fixture[table].owner_id,
      user.id,
      "Positive owner precondition must hold",
    );
  }
  return fixture;
}

export async function clear(target: ApiTarget, users: User[]): Promise<void> {
  for (const table of ["probe_link", "probe_item", "probe_label"] as const) {
    for (const user of users)
      rows(
        await request(
          target,
          user.token,
          rest(table, "id=not.is.null"),
          "DELETE",
        ),
      );
  }
}

export async function assertIsolation(
  target: ApiTarget,
  user: User,
  other: User,
  fixture: Fixture,
): Promise<void> {
  for (const table of tables) {
    const positive = rows(
      await request(
        target,
        other.token,
        rest(table, `id=eq.${fixture[table].id}`),
      ),
    );
    assert.equal(
      positive.length,
      1,
      "Foreign fixture must exist and be visible to its owner",
    );
    const reply = await request(target, user.token, rest(table));
    const visible = rows(reply);
    assert.ok(
      visible.every((row) => row.owner_id === user.id),
      "Cross-owner list leak",
    );
    assert.equal(
      rows(
        await request(
          target,
          user.token,
          rest(table, `id=eq.${fixture[table].id}`),
        ),
      ).length,
      0,
      "Cross-owner ID leak",
    );
    const count = await request(
      target,
      user.token,
      rest(table, `owner_id=eq.${other.id}&select=id`),
      "HEAD",
      undefined,
      { Prefer: "count=exact" },
    );
    assert.equal(count.status, 200);
    assert.equal(count.range?.split("/")[1], "0", "Cross-owner count leak");
  }
}
