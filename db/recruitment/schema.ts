/** Product create/read model approved by DEC-052. Auth remains Supabase-owned. */
import { sql } from "drizzle-orm";
import {
  check,
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
    check("recruitment_case_saved_only", sql`${table.status} = 'Zapisane'`),
  ],
).enableRLS();
