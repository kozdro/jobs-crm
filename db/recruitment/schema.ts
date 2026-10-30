/** Product model approved by DEC-052/054. Auth remains Supabase-owned. */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

export const recruitmentCase = pgTable(
  "recruitment_case",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .default(sql`auth.uid()`)
      .notNull(),
    requestId: uuid("request_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"),
    status: text("status").default("Zapisane").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "recruitment_case_owner_fk",
      columns: [table.ownerId],
      foreignColumns: [authUsers.id],
    }).onDelete("no action"),
    unique("recruitment_case_owner_id_unique").on(table.ownerId, table.id),
    unique("recruitment_case_owner_request_unique").on(
      table.ownerId,
      table.requestId,
    ),
    index("recruitment_case_owner_created_idx").on(
      table.ownerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("recruitment_case_owner_title_idx").on(table.ownerId, table.title),
    // Never index unbounded URL text directly: a valid long URL can exceed the B-tree tuple limit.
    index("recruitment_case_owner_url_idx")
      .on(table.ownerId, sql`md5(${table.sourceUrl})`)
      .where(sql`${table.sourceUrl} IS NOT NULL`),
    check(
      "recruitment_case_title_valid",
      sql`char_length(${table.title}) BETWEEN 1 AND 160 AND ${table.title} = public.recruitment_trim(${table.title})`,
    ),
    check(
      "recruitment_case_description_valid",
      sql`${table.description} IS NULL OR (char_length(${table.description}) BETWEEN 1 AND 2000 AND ${table.description} = public.recruitment_trim(${table.description}))`,
    ),
    check(
      "recruitment_case_url_valid",
      sql`${table.sourceUrl} IS NULL OR (${table.sourceUrl} = public.recruitment_source_url(${table.sourceUrl}) AND public.recruitment_source_url(${table.sourceUrl}) IS NOT NULL)`,
    ),
    check(
      "recruitment_case_3a_status",
      sql`${table.status} IN ('Zapisane', 'Kontakt rozpoczęty')`,
    ),
  ],
).enableRLS();

/** Append-only real facts; triggers enforce atomically coupled lifecycle effects. */
export const recruitmentCaseEvent = pgTable(
  "recruitment_case_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .default(sql`auth.uid()`)
      .notNull(),
    requestId: uuid("request_id").notNull(),
    caseId: uuid("case_id").notNull(),
    kind: text("kind").notNull(),
    direction: text("direction"),
    occurredOn: date("occurred_on", { mode: "string" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("recruitment_case_event_owner_request_unique").on(
      table.ownerId,
      table.requestId,
    ),
    foreignKey({
      name: "recruitment_case_event_owned_case_fk",
      columns: [table.ownerId, table.caseId],
      foreignColumns: [recruitmentCase.ownerId, recruitmentCase.id],
    }).onDelete("no action"),
    check(
      "recruitment_case_event_kind_direction_valid",
      sql`(${table.kind} = 'application' AND ${table.direction} IS NULL) OR (${table.kind} = 'contact' AND ${table.direction} IS NOT NULL AND ${table.direction} IN ('inbound', 'outbound'))`,
    ),
    check(
      "recruitment_case_event_date_valid",
      sql`${table.occurredOn} IS NULL OR (${table.occurredOn} >= DATE '0001-01-01' AND ${table.occurredOn} <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Warsaw')::date)`,
    ),
    index("recruitment_case_event_timeline_idx").on(
      table.ownerId,
      table.caseId,
      table.occurredOn.desc().nullsLast(),
      table.recordedAt.desc(),
      table.id.desc(),
    ),
  ],
).enableRLS();
