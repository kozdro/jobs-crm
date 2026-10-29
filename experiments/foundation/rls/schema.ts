/** Synthetic Foundation PoC. Never use as a Jobs CRM product schema. */
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const foundationPoc = pgSchema("foundation_poc");

export const probeItem = foundationPoc
  .table(
    "probe_item",
    {
      ownerId: uuid("owner_id").notNull(),
      id: uuid("id").defaultRandom().notNull(),
      marker: text("marker").notNull(),
      revision: integer("revision").notNull().default(0),
    },
    (table) => [
      primaryKey({ name: "probe_item_pk", columns: [table.ownerId, table.id] }),
      check("probe_item_marker_nonempty", sql`length(${table.marker}) > 0`),
      check("probe_item_revision_nonnegative", sql`${table.revision} >= 0`),
    ],
  )
  .enableRLS();

export const probeLabel = foundationPoc
  .table(
    "probe_label",
    {
      ownerId: uuid("owner_id").notNull(),
      id: uuid("id").defaultRandom().notNull(),
      marker: text("marker").notNull(),
    },
    (table) => [
      primaryKey({
        name: "probe_label_pk",
        columns: [table.ownerId, table.id],
      }),
      check("probe_label_marker_nonempty", sql`length(${table.marker}) > 0`),
    ],
  )
  .enableRLS();

export const probeLink = foundationPoc
  .table(
    "probe_link",
    {
      ownerId: uuid("owner_id").notNull(),
      id: uuid("id").defaultRandom().notNull(),
      marker: text("marker").notNull(),
      itemId: uuid("item_id").notNull(),
      labelId: uuid("label_id").notNull(),
    },
    (table) => [
      primaryKey({ name: "probe_link_pk", columns: [table.ownerId, table.id] }),
      unique("probe_link_endpoints_unique").on(
        table.ownerId,
        table.itemId,
        table.labelId,
      ),
      foreignKey({
        name: "probe_link_item_fk",
        columns: [table.ownerId, table.itemId],
        foreignColumns: [probeItem.ownerId, probeItem.id],
      }).onDelete("cascade"),
      foreignKey({
        name: "probe_link_label_fk",
        columns: [table.ownerId, table.labelId],
        foreignColumns: [probeLabel.ownerId, probeLabel.id],
      }).onDelete("cascade"),
      index("probe_link_label_idx").on(table.ownerId, table.labelId),
      check("probe_link_marker_nonempty", sql`length(${table.marker}) > 0`),
    ],
  )
  .enableRLS();
