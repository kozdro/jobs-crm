# Optional Email Reminders: Auth trigger hardening assessment

Candidate: `f0d65859fa1c408f37b6a43749f18318d65fc7e5` (PR #26). Status: **BLOCKED**. This is an assessment, not evidence that the drift protection is complete.

The previous disposable QA probe attempted `ALTER TABLE auth.users DISABLE TRIGGER email_reminder_auth_changed` inside a transaction and returned SQLSTATE `42501`. The probe is preserved at `/private/tmp/jobs-email-qa-final-K4HNA6hL/fingerprint-probe.mjs`. It did not establish active trigger-drift detection. The target is no longer running; its table owner and effective role privileges were not measured in this assessment. No privilege escalation or DDL was attempted.

## Security consequence

`0019_email_reminders.sql` relies on the Auth trigger to rotate `auth_version` and disable existing intents on changes to email or confirmation timestamp. If the trigger is missing, disabled, or changed so that this no longer occurs, an existing enabled intent can persist after an address change. `email_reminder.prepare` in `0020_email_queue.sql` checks that the current address is nonempty and verified, that the task/reminder is valid, and the delivery window, but does not compare an independently recorded consent-bound address/version to the current address. Consequently a newly verified address can be returned to the worker without new consent. The worker calls `prepare` then sends to its returned address; its transaction and locks serialize concurrent changes while intact but do not repair a missed earlier trigger event. This is a static scenario, not an executed exploit.

The extended Local DEV schema checkpoint includes the trigger name, enabled state and definition, plus the private trigger function definition. It is compared against a persisted fingerprint when local migrations run. It is not continuous monitoring and is not consulted by the worker before dispatch. A checkpoint captured after pre-existing drift also cannot independently establish the intended baseline. Existing checkpoint unit tests use different hash values; they are not an active trigger DDL test or proof of worker fail-closed behavior.

## Evidence and remaining gates

- Historical PR body reports isolated migrations 21/21, integration 186/186, Chromium 195/195, and separate private-column/ACL/worker-role drift probes PASS; these do not prove active Auth trigger modification. The previous `42501` is preserved as BLOCKED.
- Hosted Application CI run [42628110593](https://github.com/kozdro/jobs-crm/actions/runs/42628110593) succeeded on the candidate; it does not establish the missing security property.
- Current session: no owned isolated target was available; no provisioning was authorized. Read-only catalog inspection, table ownership/effective privileges, active DDL test, deterministic validation-layer simulations, and worker fail-closed regression are **NOT RUN**.
- Required: establish an approved fail-closed dispatch boundary for missing/disabled/modified trigger, including previously missed address changes and A→B→A, without changing consent or retry rules; verify catalog metadata read-only and deterministic missing/disabled/changed validation, including denial along the actual dispatch path. Active DDL remains a separately identified test, only on a suitably authorized owned disposable target. Re-run appropriate runtime tests, independent read-only backend/frontend/security reviews and exact-head CI after any candidate change.

Do not mark PR #26 ready while the above protection is unverified. Preserve persistent DEV, other targets, and historical results.
