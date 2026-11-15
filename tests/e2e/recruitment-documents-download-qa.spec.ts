/** BFF real bytes and authorization on isolated QA; DB admin only constructs synthetic state. */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readRecruitmentTarget } from "../../scripts/recruitment/target.ts";
import { account, type Account } from "../integration/auth/fixtures.ts";

test("download BFF serves only current owner and revokes after delete begins", async ({
  browser,
}) => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id) throw new Error("Guarded target required");
  const target = await readRecruitmentTarget(id);
  const [a, b] = await Promise.all([account(target), account(target)]);
  const sql = postgres({
    ...target.db,
    max: 1,
    ssl: false,
    onnotice: () => {},
  });
  const doc = randomUUID(),
    version = randomUUID(),
    key = randomUUID();
  const contexts: BrowserContext[] = [];
  const login = async (user: Account): Promise<Page> => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    return page;
  };
  try {
    await sql`insert into public.document(id,owner_id,name) values(${doc}::uuid,${a.id}::uuid,'Synthetic download')`;
    await sql`insert into public.document_version(id,owner_id,document_id,number,state,filename,mime,size) values(${version}::uuid,${a.id}::uuid,${doc}::uuid,1,'ready','synthetic.txt','text/plain',5)`;
    await sql`insert into recruitment_private.document_object(version_id,owner_id,request_id,object_key,bytes,phase) values(${version}::uuid,${a.id}::uuid,${randomUUID()}::uuid,${key},5,'ready')`;
    const put = await fetch(
      `${target.apiUrl}/storage/v1/object/documents/${key}`,
      {
        method: "POST",
        headers: {
          apikey: target.serviceRoleKey,
          Authorization: `Bearer ${target.serviceRoleKey}`,
          "content-type": "text/plain",
        },
        body: "hello",
      },
    );
    expect(put.status).toBe(200);
    const [owner, other] = await Promise.all([login(a), login(b)]);
    const anon = await browser.newContext({ ignoreHTTPSErrors: true });
    contexts.push(anon);
    const path = `${target.appOrigin}/documents/download/${version}`;
    const own = await owner.request.get(path);
    expect(own.status()).toBe(200);
    expect(await own.body()).toEqual(Buffer.from("hello"));
    expect(own.headers()["content-disposition"]).toMatch(/^attachment(?:;|$)/i);
    expect(own.headers()["cache-control"]).toContain("no-store");
    expect(own.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await other.request.get(path)).status()).toBe(404);
    expect((await anon.request.get(path)).status()).toBe(401);
    await sql`update recruitment_private.document_object set phase='deleting' where version_id=${version}::uuid`;
    await sql`update public.document_version set state='deleting' where id=${version}::uuid`;
    expect((await owner.request.get(path)).status()).toBe(404);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fetch(`${target.apiUrl}/storage/v1/object/documents`, {
      method: "DELETE",
      headers: {
        apikey: target.serviceRoleKey,
        Authorization: `Bearer ${target.serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ prefixes: [key] }),
    });
    await sql.end();
  }
});
