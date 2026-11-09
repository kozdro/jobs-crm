import type { Sql } from "postgres";
import type { DeliveryOutcome, DeliveryTransport } from "./core.ts";

/**
 * Each claim is committed before dispatch. Prepare and finish share a transaction,
 * so a concurrent owner change waits across the provider handoff. If the process
 * fails, queue redelivery marks the committed dispatching attempt unknown.
 * The transport must apply a bounded timeout and classify uncertainty as unknown.
 */
export async function processQueueOnce(
  sql: Sql,
  transport: DeliveryTransport,
  applicationUrl: URL,
): Promise<boolean> {
  if (
    applicationUrl.protocol !== "https:" ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.pathname !== "/" ||
    applicationUrl.search ||
    applicationUrl.hash
  ) {
    throw new Error("Invalid application URL");
  }

  await sql`select email_reminder.enqueue_due()`;
  const [claim] = await sql<
    { attempt: string | null }[]
  >`select email_reminder.claim() as attempt`;
  if (!claim?.attempt) return false;
  const attempt = claim.attempt;

  await sql.begin(async (tx) => {
    // postgres.js transaction handles are callable at runtime; its Omit-based
    // TransactionSql declaration drops the tagged-template call signature.
    const query = tx as unknown as Sql;
    const [prepared] = await query<
      { recipient: string | null }[]
    >`select email_reminder.prepare(${attempt}::uuid) as recipient`;
    if (!prepared?.recipient) return;
    let outcome: DeliveryOutcome = "unknown";
    try {
      const value = await transport.send({
        recipient: prepared.recipient,
        subject: "Przypomnienie",
        text: `Masz przypomnienie w aplikacji. Zaloguj się, aby je zobaczyć: ${applicationUrl.href}`,
      });
      if (
        value === "accepted" ||
        value === "safe_failure" ||
        value === "permanent_failure" ||
        value === "unknown"
      )
        outcome = value;
    } catch {
      // Failure after request dispatch is ambiguous.
    }
    await query`select email_reminder.finish(${attempt}::uuid, ${outcome})`;
  });
  return true;
}
