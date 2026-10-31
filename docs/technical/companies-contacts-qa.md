# Companies & Contacts — QA

**Décision:** DEC-058, approved 1A/2A/3A. **Agent:** /root/companies_qa_run, qa-engineer; model/reasoning inherited NOT EXPOSED. Applies plan-slice, implement-slice, verify-acceptance and harness delivery.

## Plan and scope

AC-CC-001–006/008/011: profiles independent of case, many-to-many actual links, agency without employer, explicit current affiliations and separate processes. Adapted TC-006/008/014/025; whole TC-019/025/034 not covered. AC-CC-007/009/010 deferred: no communication or event participant model. Link is not event participation.

Integration tests use synthetic local Auth accounts A/B/anon and user JWT through Data API/RPC, with BFF Origin/CSRF checks. Admin is fixture/catalog/physical-upgrade only, never the authorizing identity for business commands. Cases cover list/direct ID/count/dedup/audit/recovery isolation, cross-owner links both ways, spoof owner, direct audit/registry tampering, confirmed duplicate flow and race, same-key replay/mismatch, stale edits, attach/detach/role change and retry ABA, migration data preservation and unchanged lifecycle.

Browser tests use production HTTPS Chromium, existing visual language, create/edit/view/link/detach/role correction, duplicate reuse or explicit new, errors/uncertain recovery, pagination, no PII in browser persistence/logs, XSS text, keyboard and 1440/1024/768/375 widths.

## Runtime isolation

Canonical target566xx ports are occupied by earlier resources, so QA will use a separate source-identical runtime with an explicit local adapter to free ports; owned target only, pinned Node24.22.2/pnpm12.16.1. Persistent DEV and all pre-existing containers must retain IDs/names/ports. Source manifest records canonical and runtime hashes; no copying a migration after its ledger was created.

## Results

**NOT RUN:** runtime pending settled backend/frontend candidate. All new tests remain planned until real execution.
