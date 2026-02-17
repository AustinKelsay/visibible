# Production Readiness Remediation Plan

Date: 2026-02-14
Status: In progress
Primary risk themes: security boundaries, credit-accounting integrity

## Progress Updates

### 2026-02-15

- PR-1 completed: image persistence boundary hardened.
  - Browser-direct `saveImage` invocation removed.
  - Persistence moved to server path (`/api/generate-image`).
  - `saveImage` now requires `serverSecret`.
  - Added remote host allowlist, local/private host blocking, MIME allowlist, and 10 MiB size cap.
  - Added optional env knob: `IMAGE_FETCH_ALLOWLIST`.

- PR-2 completed: reservation release idempotency and one-way settlement.
  - Added settlement state classifier (`none|reserved|released|charged`) by `generationId`.
  - Duplicate releases are no-ops after first settlement.
  - Released generations cannot be charged later.
  - Released/charged generations cannot be re-reserved.
  - Added unit coverage for settlement-state classification.

- PR-3 completed: `/api/generate-image` converted to secure POST semantics.
  - Endpoint now accepts `POST` JSON body for generation requests.
  - `GET /api/generate-image` now returns `405` with `Allow: POST`.
  - Enforced strict origin requirement (missing origin rejected).
  - Implemented CSRF validation (`x-csrf-token` must match `visibible_csrf` cookie).
  - Updated client call site (`HeroImage`) to send JSON body + CSRF header.
  - Extended integration coverage for method/origin/CSRF enforcement.

- PR-4 completed: stale reservation reconciliation cron introduced.
  - Introduced `creditLedger` index `by_reason_createdAt` for efficient stale-reservation scans.
  - Implemented `internal.sessions.reconcileStaleReservations` batch reconciler.
  - Scheduled 5-minute cron to auto-release `reservation`-only generations older than 30 minutes.
  - Reconciler enforces settlement-state checks (`reserved` only) so reruns are safe/idempotent.

- PR-5 completed: Convex trust boundary hardened for sensitive writes.
  - Enforced `serverSecret` validation on sensitive public mutations:
    - `sessions.createSession`, `sessions.updateLastSeen`
    - `invoices.createInvoice`, `invoices.expireInvoice`
    - `feedback.submitFeedback`
    - `modelStats.recordGeneration`
    - `rateLimit.checkRateLimit`, `rateLimit.recordFailedAdminLogin`, `rateLimit.clearAdminLoginAttempts`
  - Updated all server route call sites to pass `CONVEX_SERVER_SECRET`.
  - Removed direct unauthenticated browser write capability for the above paths.

### 2026-02-17

- PR-4 follow-up completed: stale reservation reconciler pagination/starvation fix.
  - Replaced fixed head-batch scan with cursor pagination for stale reservations.
  - Reconciler now advances through old settled/missing-session rows instead of reprocessing the same first batch indefinitely.
  - Prevents stranded credits from being skipped permanently when stale reservation volume exceeds per-run release limits.

- PR-3 follow-up completed: bounded POST body parsing for `/api/generate-image`.
  - Replaced direct `request.json()` parsing with `readJsonBodyWithLimit(...)`.
  - Added explicit `413 Payload too large` handling for oversized request bodies.
  - Added regression coverage to ensure oversized image-generation payloads are rejected before credit reservation logic.

- PR-6 completed: session IP-binding consistency for privileged/session-sensitive APIs.
  - Standardized session-derived identity lookups on `validateSessionWithIp` for:
    - `/api/admin-login`
    - `/api/invoice` and `/api/invoice/:id` (GET/POST)
    - `/api/rate-limit-status`
    - `/api/feedback` (optional session attribution path)
    - Existing-session reuse path in `/api/session` POST
  - Removed cookie-only session reads from privileged invoice/admin flows.
  - Added route integration coverage for IP-bound session enforcement:
    - `src/app/api/__tests__/admin-login/ip-binding.test.ts`
    - `src/app/api/__tests__/invoice/ip-binding.test.ts`

- Remaining active scope: PR-7 through PR-12 remain the current production-readiness backlog (some partially complete).

## Goals

1. Eliminate externally reachable trust-boundary breaks.
2. Guarantee credit settlement correctness under retries/failures.
3. Harden state-changing routes against CSRF and unsafe semantics.
4. Raise production confidence via tests, CI gates, and observability.

## Delivery Strategy

- Ship in small PRs with explicit acceptance criteria.
- Prioritize exploitability + financial integrity first.
- Keep behavior changes isolated and test-backed.

## PR Sequence

## Phase 1: Critical Security and Ledger Integrity

### PR-1: Lock Down Image Persistence Boundary (Blocker #1)

Scope:
- Remove browser-direct invocation of `api.verseImages.saveImage`.
- Move image persistence to server-controlled path only.
- Require server authorization for persistence action calls.
- Add outbound URL allowlist and private-network/localhost denylist checks.
- Enforce hard max byte size limits before storage.
- Restrict accepted MIME types to supported image formats.

Acceptance criteria:
- Browser can no longer trigger arbitrary server-side URL fetches for image persistence.
- Non-allowlisted URLs are rejected.
- Oversized payloads are rejected.
- Local/private target URLs are rejected.
- Valid provider URLs continue to persist successfully.

Test coverage:
- Unit tests for URL validation and size limits.
- API integration tests for accepted/rejected persistence paths.

---

### PR-2: Enforce Idempotent Reservation Release + One-Way Settlement (Blocker #3)

Scope:
- Make `releaseReservation` single-settlement per `generationId`.
- Prevent duplicate refunds after prior release/charge.
- Enforce legal state transitions for reservation lifecycle.
- Ensure retry-safe behavior for chat/image failure cleanup paths.

Acceptance criteria:
- Repeated release calls do not increase credits after first release.
- Post-deduct release is no-op or hard reject (without balance impact).
- Ledger state for a generation is consistent and auditable.

Test coverage:
- Duplicate release sequence tests.
- Deduct-then-release and release-then-deduct tests.
- Retry/replay integration tests.

---

### PR-3: Convert Image Generation to POST + CSRF + Strict Origin (Blocker #5)

Scope:
- Convert `/api/generate-image` from `GET` to `POST`.
- Require CSRF token validation on state-changing request.
- Require strict origin validation for state-changing request.
- Return `405` on `GET`.
- Update client call sites to use JSON body.

Acceptance criteria:
- No cost-incurring operation is reachable via `GET`.
- Missing/invalid CSRF token returns `403`.
- Invalid/missing origin for mutating request returns `403`.
- Existing valid requests still succeed via `POST`.

Test coverage:
- Method, CSRF, and origin enforcement tests.

## Phase 2: Critical Follow-Ons

### PR-4: Stale Reservation Reconciliation Cron (Blocker #4)

Scope:
- Add janitor job to find stale reservation-only generations.
- Auto-release stale reservations safely and idempotently.
- Log reconciliation outcomes for audit.

Acceptance criteria:
- Crashed/aborted requests no longer strand reserved credits indefinitely.
- Reconciler is safe under reruns.

---

### PR-5: Convex Trust Boundary Hardening (Blocker #2)

Scope:
- Move sensitive public mutations/actions behind server-authenticated boundaries.
- Keep only low-risk public write paths publicly callable.
- Add explicit classification of trusted vs untrusted callers.

Acceptance criteria:
- Sensitive state transitions are not callable from arbitrary browser clients.

---

### PR-6: Session IP-Binding Consistency (High #6) [Completed 2026-02-17]

Scope:
- Standardize privileged/session-sensitive API routes on `validateSessionWithIp`.
- Remove direct cookie-only session reads for privileged operations.

Acceptance criteria:
- Privileged routes consistently enforce token + IP binding policy.

---

### PR-7: Invoice Polling Throttling (High #9)

Scope:
- Add per-session/IP rate limiting for invoice status checks.
- Apply to both GET and POST invoice status/confirm flows as needed.

Acceptance criteria:
- Repeated polling cannot hammer LND beyond defined thresholds.

---

### PR-8: Main OpenRouter Timeout and Explicit Cleanup (High #8)

Scope:
- Add abort timeout for primary image generation OpenRouter request.
- Ensure explicit reservation cleanup path on timeout.

Acceptance criteria:
- Hung upstream requests time out deterministically.
- Reservation is consistently settled on timeout/failure.

## Phase 3: Scalability, Hardening, and Operational Readiness

### PR-9: Cleanup Throughput and Frequency Scaling (High #7)

Scope:
- Replace fixed 100-row deletes with paginated loops.
- Increase cron frequency for high-churn tables.
- Prefer indexed cleanup patterns.

Acceptance criteria:
- Cleanup keeps pace with expected production data growth.

---

### PR-10: Security Header Hardening (Medium #10)

Scope:
- Add HSTS header.
- Tighten CSP progressively to reduce/remove unsafe directives where possible.

Acceptance criteria:
- Hardened baseline headers in production without breaking runtime assets.

---

### PR-11: CI Production Gates + Coverage Thresholds (Medium #11)

Scope:
- Add `next build` to CI.
- Enforce minimum coverage thresholds.
- Add targeted integration tests for credit/payment/Convex flows.

Acceptance criteria:
- Regressions that break production build or critical-path coverage fail CI.

---

### PR-12: Structured Observability and Health Signals (Medium #12)

Scope:
- Introduce structured logging on critical API and settlement paths.
- Add alertable metrics for failures/timeouts/settlement anomalies.
- Add health/readiness endpoints and minimal SLO-oriented checks.

Acceptance criteria:
- Failures are machine-parseable and alertable.
- Operators can quickly detect and triage outages/regressions.

## Implementation Notes

- PR-1, PR-2, PR-3 are mandatory pre-production gates.
- PR-4 through PR-8 should follow immediately after Phase 1.
- Roll out with canary monitoring of:
  - Reservation release rates
  - Deduct/release mismatch
  - Image persistence failure rates
  - Invoice polling rate-limit hit rates

## Done Definition

- All acceptance criteria met.
- New/updated tests pass.
- `npm run lint`, `npm run typecheck`, and `npm test` pass.
- Security-sensitive behavior documented in code comments and route docs.
