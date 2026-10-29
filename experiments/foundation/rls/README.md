# Synthetic Foundation F2 RLS experiment

This directory is a **non-production technical PoC**, authorized by the PR-F2
implementation task. It is not the Jobs CRM domain model, and does not resolve
OPEN-002 or OPEN-013. No migration glob from this directory belongs in a product
release.

`drizzle.f2.config.ts` defines the only migration source. Generate SQL with the
pinned Drizzle Kit; apply it exclusively through the guarded local runner in
`scripts/db/`. The config deliberately has no database credentials. Supabase CLI
owns local services, not a second history for these objects. Never use `push`.

## Schema and migration boundary

- `foundation_poc.probe_item`, `probe_label`, `probe_link`: synthetic `marker`,
  owner UUID and random UUID; primary keys are `(owner_id, id)`. This avoids
  revealing another owner's UUID through a global uniqueness constraint.
- A link has owner-qualified composite foreign keys to both endpoints. A unique
  owner/item/label tuple prevents duplicate links; deleting an owned endpoint
  cascades only its own synthetic links. This is not a product deletion policy.
- `marker` must be nonempty. These technical fixture checks set no product limits.
- v0 is the first **two** journal entries: generated tables with RLS and explicit
  revocation, then custom CRUD policies/grants. v1 is all **five** entries: a
  generated nonnegative `probe_item.revision` defaulting to zero, then a reviewed
  invoker view and minimal RPC, then database-local PostgREST exposure activation.
  Upgrade tests preserve v0 rows and their ownership.
- Custom policy SQL and invoker objects are intentionally reviewed SQL in the same
  Drizzle journal. Generated snapshots represent tables/constraints; they are not
  proof of deployed policy, view, function or grant state. Inspect the real catalog.
- Supabase boots with its verified empty, nonwritable `public` API schema. The final
  migration sets `pgrst.db_schemas` on local `authenticator` in database `postgres`
  to `public,foundation_poc`, then notifies PostgREST to reload config and schema.
  This activation happens after all PoC protections exist; it does not grant any
  role new data privileges or alter Auth identity. The guarded runner checks
  effective API exposure and waits for cache readiness before HTTP fixture/tests.

## Access contract

Only `authenticated` gets schema USAGE and SELECT/INSERT/UPDATE/DELETE on the
three tables. PUBLIC, `anon` and `service_role` receive no PoC grants. RLS trusts
`auth.uid()` exclusively. SELECT/DELETE have owner USING; INSERT has owner WITH
CHECK; UPDATE has both. Link checks also require visible owned endpoints, so a
foreign endpoint and a random missing endpoint are rejected by the same RLS
condition before an FK error can disclose existence. No authorization uses user
metadata. No managed Auth/Storage table is declared or modified here. Fixture
accounts are provisioned separately by local Auth HTTP.

`probe_item_view(owner_id,id,marker,revision)` has `security_invoker=true` and only
authenticated SELECT. `probe_set_marker(p_item_id uuid,p_marker text)` is a SQL
VOLATILE SECURITY INVOKER function with empty search_path and qualified table
name. It updates visible owned rows, increments revision and returns only those
rows. It has no owner parameter, no dynamic SQL, no helper or DEFINER bypass;
EXECUTE is explicitly revoked from PUBLIC/anon/service_role and granted only to
authenticated. This minimal RPC proves RLS behavior; it does not prove F4 atomic
batch/idempotency requirements.

The local target manifest, execution commands, safety checks, actual test counts,
service versions and cleanup procedure are documented in
[Foundation F2](../../../docs/technical/foundation-f2.md). BFF/session tests remain
NOT RUN until F3; private product entities require their own approved schema and
repeat isolation tests.

PostgreSQL grants EXECUTE on newly created functions to PUBLIC by default globally.
The per-schema default-privilege REVOKE records local intent; it cannot negate a
global built-in default. Therefore every created function has its own explicit
REVOKE before any API exposure, and the catalog suite must inspect actual ACLs.
The experiment does not change Supabase's global default privileges.
