/** BFF read model: withdrawing after correction must retain the last version identity. */
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { readRecruitmentTarget } from "../../scripts/recruitment/target.ts";
import { account, login as sdkLogin } from "../integration/auth/fixtures.ts";
function requestId() {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6] & 15) | 0x70;
  b[8] = (b[8] & 63) | 0x80;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
test("BFF shows last corrected version after sent reference is withdrawn", async ({
  page,
}) => {
  const id = process.env.RECRUITMENT_TARGET_ID;
  if (!id) throw new Error("Guarded target required");
  const target = await readRecruitmentTarget(id),
    user = await account(target),
    { client } = await sdkLogin(target, user),
    sql = postgres({ ...target.db, max: 1, ssl: false, onnotice: () => {} });
  const caseId = randomUUID(),
    doc = randomUUID(),
    v1 = randomUUID(),
    v2 = randomUUID();
  try {
    await sql`insert into public.recruitment_case(id,owner_id,request_id,title) values(${caseId}::uuid,${user.id}::uuid,${randomUUID()}::uuid,'Synthetic sent audit')`;
    await sql`insert into public.document(id,owner_id,name,is_cv) values(${doc}::uuid,${user.id}::uuid,'Synthetic CV',true)`;
    await sql`insert into public.document_version(id,owner_id,document_id,number,state) values(${v1}::uuid,${user.id}::uuid,${doc}::uuid,1,'ready'),(${v2}::uuid,${user.id}::uuid,${doc}::uuid,2,'ready')`;
    const recorded = await client.rpc("record_application_with_documents", {
      p_request_id: randomUUID(),
      p_case_id: caseId,
      p_occurred_on: null,
      p_version_ids: [v1],
    });
    expect(recorded.error).toBeNull();
    const [ref] =
      await sql`select id,event_id from public.document_sent_reference where owner_id=${user.id}::uuid and version_id=${v1}::uuid`;
    const correction = await client.rpc("execute_document_sent_command", {
      p_request_id: requestId(),
      p_payload: {
        action: "sent-correct",
        caseId,
        eventId: ref.event_id,
        eventRevision: 0,
        referenceId: ref.id,
        revision: 0,
        versionId: v2,
      },
    });
    expect(correction.error).toBeNull();
    const withdrawal = await client.rpc("execute_document_sent_command", {
      p_request_id: requestId(),
      p_payload: {
        action: "sent-withdraw",
        caseId,
        eventId: ref.event_id,
        eventRevision: 0,
        referenceId: ref.id,
        revision: 1,
      },
    });
    expect(withdrawal.error).toBeNull();
    await page.goto(`${target.appOrigin}/login`);
    await page.getByLabel("E-mail", { exact: true }).fill(user.email);
    await page.getByLabel("Hasło", { exact: true }).fill(user.password);
    await page
      .getByRole("button", { name: "Zaloguj się", exact: true })
      .click();
    await expect(page).toHaveURL(`${target.appOrigin}/dashboard`);
    const data = await page.request.get(
      `${target.appOrigin}/documents/data?caseId=${caseId}`,
      { headers: { "x-expected-user-id": user.id } },
    );
    expect(data.status()).toBe(200);
    const body = await data.json();
    expect(body.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ref.id,
          versionId: v2,
          versionNumber: 2,
          status: "withdrawn",
        }),
      ]),
    );
    const audit = await page.request.get(
      `${target.appOrigin}/documents/audit?eventId=${ref.event_id}`,
      { headers: { "x-expected-user-id": user.id } },
    );
    expect(audit.status()).toBe(200);
    const entries = (await audit.json()).entries;
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "sent-correct", versionId: v2 }),
        expect.objectContaining({
          kind: "sent-withdraw",
          versionId: v2,
          versionNumber: 2,
        }),
      ]),
    );
  } finally {
    await sql.end();
  }
});
