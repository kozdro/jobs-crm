/** Product model approved by DEC-052/054/055. Auth remains Supabase-owned. */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
    currentStage: text("current_stage"),
    stageVersion: integer("stage_version").default(0).notNull(),
    caseRevision: integer("case_revision").default(0).notNull(),
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
      "recruitment_case_3b_status_stage",
      sql`(${table.status} IN ('Zapisane', 'Kontakt rozpoczęty', 'Zakończone') AND ${table.currentStage} IS NULL AND ${table.stageVersion} >= 0) OR (${table.status} = 'W rekrutacji' AND ${table.currentStage} IS NOT NULL AND char_length(${table.currentStage}) BETWEEN 1 AND 160 AND ${table.currentStage} = public.recruitment_trim(${table.currentStage}) AND ${table.stageVersion} >= 1)`,
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
    stageName: text("stage_name"),
    previousStage: text("previous_stage"),
    expectedStageVersion: integer("expected_stage_version"),
    appliedCaseRevision: integer("applied_case_revision"),
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
      "recruitment_case_event_3b_payload_valid",
      sql`((${table.kind} = 'application' AND ${table.direction} IS NULL) OR (${table.kind} = 'contact' AND ${table.direction} IS NOT NULL AND ${table.direction} IN ('inbound', 'outbound'))) AND ${table.stageName} IS NULL AND ${table.previousStage} IS NULL AND ${table.expectedStageVersion} IS NULL OR (${table.kind} IN ('invitation', 'stage-change') AND ${table.direction} IS NULL AND ${table.stageName} IS NOT NULL AND char_length(${table.stageName}) BETWEEN 1 AND 160 AND ${table.stageName} = public.recruitment_trim(${table.stageName}) AND ${table.expectedStageVersion} IS NOT NULL AND ${table.expectedStageVersion} BETWEEN 0 AND 2147483646 AND (${table.previousStage} IS NULL OR (char_length(${table.previousStage}) BETWEEN 1 AND 160 AND ${table.previousStage} = public.recruitment_trim(${table.previousStage}))))`,
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

/** Immutable correction intents and their server-derived audit snapshots. */
export const recruitmentCaseEventRevision = pgTable(
  "recruitment_case_event_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .default(sql`auth.uid()`)
      .notNull(),
    requestId: uuid("request_id").notNull(),
    caseId: uuid("case_id").notNull(),
    eventId: uuid("event_id").notNull(),
    operation: text("operation").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }),
    direction: text("direction"),
    stageName: text("stage_name"),
    expectedCaseRevision: integer("expected_case_revision").notNull(),
    expectedEventRevision: integer("expected_event_revision").notNull(),
    revision: integer("revision").notNull(),
    beforeValues: jsonb("before_values").notNull(),
    afterValues: jsonb("after_values").notNull(),
    resultingStatus: text("resulting_status").notNull(),
    resultingStage: text("resulting_stage"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("recruitment_revision_owner_request_unique").on(
      table.ownerId,
      table.requestId,
    ),
    unique("recruitment_revision_event_version_unique").on(
      table.eventId,
      table.revision,
    ),
    foreignKey({
      name: "recruitment_revision_owned_case_fk",
      columns: [table.ownerId, table.caseId],
      foreignColumns: [recruitmentCase.ownerId, recruitmentCase.id],
    }).onDelete("no action"),
    foreignKey({
      name: "recruitment_revision_event_fk",
      columns: [table.eventId],
      foreignColumns: [recruitmentCaseEvent.id],
    }).onDelete("no action"),
    check(
      "recruitment_revision_operation_valid",
      sql`${table.operation} IN ('correct','void')`,
    ),
    check(
      "recruitment_revision_versions_valid",
      sql`${table.expectedCaseRevision} >= 0 AND ${table.expectedEventRevision} >= 0 AND ${table.revision} = ${table.expectedEventRevision} + 1`,
    ),
  ],
).enableRLS();

/** DEC-057: immutable lifecycle commands and original closure snapshots. */
export const recruitmentCaseLifecycle = pgTable(
  "recruitment_case_lifecycle",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .default(sql`auth.uid()`)
      .notNull(),
    requestId: uuid("request_id").notNull(),
    caseId: uuid("case_id").notNull(),
    kind: text("kind").notNull(),
    outcome: text("outcome"),
    occurredOn: date("occurred_on", { mode: "string" }),
    offerConfirmed: boolean("offer_confirmed").notNull(),
    expectedCaseRevision: integer("expected_case_revision").notNull(),
    cycle: integer("cycle").notNull(),
    previousStatus: text("previous_status").notNull(),
    previousStage: text("previous_stage"),
    resultingStatus: text("resulting_status").notNull(),
    resultingStage: text("resulting_stage"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("recruitment_lifecycle_owner_request_unique").on(
      t.ownerId,
      t.requestId,
    ),
    unique("recruitment_lifecycle_case_cycle_kind_unique").on(
      t.caseId,
      t.cycle,
      t.kind,
    ),
    foreignKey({
      name: "recruitment_lifecycle_owned_case_fk",
      columns: [t.ownerId, t.caseId],
      foreignColumns: [recruitmentCase.ownerId, recruitmentCase.id],
    }).onDelete("no action"),
    check(
      "recruitment_lifecycle_kind_valid",
      sql`${t.kind} IN ('close','reopen')`,
    ),
    check(
      "recruitment_lifecycle_cycle_valid",
      sql`${t.cycle} >= 0 AND ${t.expectedCaseRevision} >= 0`,
    ),
    index("recruitment_lifecycle_timeline_idx").on(
      t.ownerId,
      t.caseId,
      t.occurredOn.desc().nullsLast(),
      t.recordedAt.desc(),
      t.id.desc(),
    ),
  ],
).enableRLS();

export const recruitmentClosureRevision = pgTable(
  "recruitment_closure_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .default(sql`auth.uid()`)
      .notNull(),
    requestId: uuid("request_id").notNull(),
    caseId: uuid("case_id").notNull(),
    closureId: uuid("closure_id").notNull(),
    outcome: text("outcome").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }),
    offerConfirmed: boolean("offer_confirmed").notNull(),
    expectedCaseRevision: integer("expected_case_revision").notNull(),
    expectedClosureRevision: integer("expected_closure_revision").notNull(),
    revision: integer("revision").notNull(),
    beforeValues: jsonb("before_values").notNull(),
    afterValues: jsonb("after_values").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("recruitment_closure_revision_owner_request_unique").on(
      t.ownerId,
      t.requestId,
    ),
    unique("recruitment_closure_revision_version_unique").on(
      t.closureId,
      t.revision,
    ),
    foreignKey({
      name: "recruitment_closure_revision_owned_case_fk",
      columns: [t.ownerId, t.caseId],
      foreignColumns: [recruitmentCase.ownerId, recruitmentCase.id],
    }).onDelete("no action"),
    foreignKey({
      name: "recruitment_closure_revision_closure_fk",
      columns: [t.closureId],
      foreignColumns: [recruitmentCaseLifecycle.id],
    }).onDelete("no action"),
    check(
      "recruitment_closure_revision_version_valid",
      sql`${t.expectedCaseRevision} >= 0 AND ${t.expectedClosureRevision} >= 0 AND ${t.revision} = ${t.expectedClosureRevision} + 1`,
    ),
  ],
).enableRLS();
