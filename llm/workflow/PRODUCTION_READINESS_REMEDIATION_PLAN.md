# Production Readiness Remediation Plan

Date: 2026-02-19
Status: In progress (P0 remediations complete; release hygiene gating remains)
Decision: Hold release sign-off until PR-18 and release gate checklist are closed

## Executive Summary

A full production-readiness audit was run across Next.js API routes, security/session controls, Convex trust boundaries, payments, credit-accounting paths, and observability.

Current state is strong in many areas (tests, session security model, credit reservation/release patterns), but there are still critical gaps that can cause security exposure or avoidable outages in production.

### Final Readiness Call

- P0 blockers identified in this audit have been remediated in code.
- Remaining work is release hygiene and final gate closure.
- Keep launch hold until dependency-audit gating is active and verified.

## Progress Update (2026-02-19, latest)

- PR-13: Complete (metrics auth path and trusted client IP derivation shipped)
- PR-14: Complete (chat/image model catalog resilience and emergency fallback shipped)
- PR-15: Complete (bounded admin-login body parsing shipped)
- PR-16: Complete (strict production proxy-trust fail-fast policy shipped)
- PR-17: Complete (mutation-level settlement invariants added for reserve/release/deduct/replay/shortfall/reconcile paths)
- PR-18: In progress (CI dependency-audit gate implemented, pending CI verification)

## Scope and Method

This review included:

- Static inspection of high-risk files:
  - `src/app/api/chat/route.ts`
  - `src/app/api/generate-image/route.ts`
  - `src/app/api/admin-login/route.ts`
  - `src/app/api/session/route.ts`
  - `src/app/api/invoice/route.ts`
  - `src/app/api/invoice/[id]/route.ts`
  - `src/app/api/metrics/route.ts`
  - `src/lib/session.ts`
  - `src/lib/validate-env.ts`
  - `convex/sessions.ts`
  - `convex/rateLimit.ts`
  - `convex/invoices.ts`
  - `convex/verseImages.ts`
- Verification commands:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run test:coverage`
- Dependency audit attempt:
  - `npm audit --omit=dev` (blocked by network/DNS in current environment)

## Verification Results

### Passed

- `npm run lint` passed
- `npm run typecheck` passed
- `npm test` passed
  - 19 test files
  - 232 tests

### Coverage Snapshot (from latest `npm run test:coverage`)

- Global:
  - Statements: 71.33%
  - Branches: 60.30%
  - Functions: 76.66%
  - Lines: 72.05%
- Notable hotspot:
  - `convex/sessions.ts` lines ~67.26% (major improvement from prior ~18.34%)

### Not completed in this environment

- `npm audit --omit=dev` failed due DNS/network unavailability to npm registry.

## Findings (Complete)

## P0-1: Metrics endpoint IP allowlist is spoofable via forwarded headers

Severity: P0

Impact:
- If operators rely on `METRICS_IP_ALLOWLIST`, an attacker may spoof `x-forwarded-for`/`x-real-ip` and gain access to internal metrics.
- This can expose operational internals and traffic/error patterns.

Evidence:
- `src/app/api/metrics/route.ts:17`
- `src/app/api/metrics/route.ts:51`
- `src/app/api/metrics/route.ts:56`
- Route trusts forwarded headers directly instead of trusted-proxy-aware client IP derivation.

Required remediation:
- Replace direct forwarded-header parsing with trusted proxy-aware resolver from `src/lib/session.ts` (`getClientIp`) or equivalent extracted shared utility.
- In production, prefer token-only auth for `/api/metrics`, or require BOTH valid token and allowlisted trusted IP.

Acceptance criteria:
- Spoofed `x-forwarded-for` requests are rejected when peer is untrusted.
- Metrics endpoint access behavior is explicitly tested for trusted/untrusted proxy scenarios.

## P0-2: Chat/image core flows are tightly coupled to OpenRouter models API availability

Severity: P0

Impact:
- Temporary `/models` API outage can cascade into user-visible failures for core product operations.
- Current behavior can reject otherwise usable models due to missing pricing fetch during request handling.

Evidence:
- Chat path:
  - `src/app/api/chat/route.ts:343`
  - `src/lib/chat-models.ts:80`
  - `src/lib/chat-models.ts:91`
  - `src/lib/chat-models.ts:275`
  - `src/lib/chat-models.ts:281`
- Image path:
  - `src/app/api/generate-image/route.ts:641`
  - `src/lib/image-models.ts:195`
  - `src/lib/image-models.ts:206`

Required remediation:
- Introduce resilient pricing/model fallback strategy:
  - Persist last-known-good model/pricing snapshot (Convex or in-memory + periodic refresh).
  - Use bounded stale cache when live models fetch fails.
  - Hardcode fallback pricing for default critical models as emergency baseline.
- Decouple request-time critical path from hard dependency on live `/models` fetch.

Acceptance criteria:
- Simulated `/models` outage still allows chat/image generation for default models with known safe pricing.
- Availability test confirms no full outage when model catalog API is transiently down.

## P1-1: Admin login route uses unbounded JSON parse

Severity: P1

Impact:
- Memory/DoS hardening inconsistency on privileged endpoint.

Evidence:
- `src/app/api/admin-login/route.ts:97` uses `request.json()` directly.
- Other high-risk endpoints use `readJsonBodyWithLimit` (`src/lib/request-body.ts`).

Required remediation:
- Replace `request.json()` with bounded parser (`readJsonBodyWithLimit`) and explicit 400/413 handling.
- Add body-size limit constant for admin login endpoint.

Acceptance criteria:
- Oversized admin login payload returns 413.
- Invalid JSON returns controlled 400.

## P1-2: IP-based controls can silently degrade if proxy trust is unset/mis-set

Severity: P1

Impact:
- Rate limiting and session IP-binding fidelity may degrade in production if proxy trust isn’t configured correctly.
- In worst case, requests may collapse into non-ideal identity behavior (peer IP only/unknown behavior depending runtime).

Evidence:
- `src/lib/session.ts:357`
- `src/lib/session.ts:362`
- `src/lib/session.ts:431`
- `src/lib/validate-env.ts:272`

Required remediation:
- Add strict production startup policy:
  - Fail readiness/startup when `NODE_ENV=production` and neither `TRUST_PROXY_PLATFORM` nor vetted `TRUSTED_PROXY_IPS` is configured (unless explicitly waived via a documented override).
- Add runtime metric/log signal for number of requests resolved as `unknown` or untrusted peer-only.

Acceptance criteria:
- Production misconfiguration is fail-fast, not best-effort.
- Proxy-trust integration tests cover both Vercel and custom proxy modes.

## P1-3: Critical Convex credit/accounting logic has low direct test coverage

Severity: P1

Impact:
- High business-risk logic (credit reservation/deduction/refunds/shortfall) may regress despite route-level tests.

Evidence:
- Coverage output: `convex/sessions.ts` lines ~12.94%.
- File complexity and state machine are significant:
  - `convex/sessions.ts:460`
  - `convex/sessions.ts:570`
  - `convex/sessions.ts:649`

Required remediation:
- Add direct Convex unit/integration tests for ledger state transitions and edge cases:
  - reserve -> release idempotency
  - reserve -> charge with exact match
  - reserve -> charge with refund
  - reserve -> charge with shortfall
  - duplicate/replay safety
  - stale-reconciliation interactions

Acceptance criteria:
- `convex/sessions.ts` line and branch coverage meaningfully increased.
- New tests pin expected ledger invariants per generationId.

## P2-1: Dependency vulnerability status is unknown from this run

Severity: P2

Impact:
- Vulnerability posture not confirmed in this environment.

Evidence:
- `npm audit --omit=dev` failed due `ENOTFOUND registry.npmjs.org`.

Required remediation:
- Run dependency audit in CI/networked environment.
- Fail release on high/critical vulnerabilities unless explicitly waived with documented rationale.

Acceptance criteria:
- Audit report attached to release checklist.

## Positive Findings (Keep)

The following foundations are solid and should be preserved:

- Security headers baseline in Next config:
  - `next.config.ts`
- Session/CSRF/origin controls are broadly implemented:
  - `src/lib/session.ts`
  - `src/lib/csrf.ts`
  - `src/lib/origin.ts`
- Credit reservation/release/deduction patterns are thoughtful and include idempotency controls:
  - `convex/sessions.ts`
- Invoice ownership/IP-bound session checks exist:
  - `src/app/api/invoice/route.ts`
  - `src/app/api/invoice/[id]/route.ts`
- Health/readiness/metrics endpoints and structured observability are present:
  - `src/app/api/health/route.ts`
  - `src/app/api/readiness/route.ts`
  - `src/app/api/metrics/route.ts`
  - `src/lib/observability.ts`
- SSRF hardening and image allowlist controls are in place for image persistence:
  - `convex/verseImages.ts:159`
  - `convex/verseImages.ts:182`

## Remediation Plan (Actionable)

## Phase A: Blockers (P0) - required before beta launch

### PR-13: Secure metrics auth path and trusted client IP derivation

Status: Complete

Scope:
- Refactor metrics route to trusted-proxy-aware IP resolution (shared utility).
- Enforce production auth policy:
  - preferred: bearer token required
  - optional: trusted IP allowlist as secondary control only

Files:
- `src/app/api/metrics/route.ts`
- `src/lib/session.ts` (or extracted shared ip util)
- `src/app/api/__tests__/ops/health-readiness-metrics.test.ts`

### PR-14: Decouple generation availability from live `/models` fetch

Status: Complete

Scope:
- Add resilient model/pricing cache with stale fallback.
- Add emergency fallback pricing map for default chat/image models.
- Guard against full user-facing outage when `/models` is unavailable.

Files:
- `src/lib/chat-models.ts`
- `src/lib/image-models.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/generate-image/route.ts`
- tests in `src/app/api/__tests__/chat/*` and `src/app/api/__tests__/generate-image/*`

## Phase B: Pre-scale hardening (P1)

### PR-15: Bounded body parsing for admin login

Status: Complete

Scope:
- Use `readJsonBodyWithLimit` in `src/app/api/admin-login/route.ts`.
- Add 413/400 tests.

### PR-16: Enforce strict production proxy-trust policy

Status: Complete

Scope:
- Update env validation policy to fail-fast in production if trust settings are absent/misconfigured.
- Add tests for fail-fast behavior.

Files:
- `src/lib/validate-env.ts`
- `src/lib/__tests__/validate-env.test.ts`

### PR-17: Expand direct Convex settlement coverage

Status: Complete

Scope:
- Add dedicated tests for `convex/sessions.ts` state transitions and invariants.
- Increase branch coverage around shortfall/refund/replay paths.

Files:
- `tests/convex/sessions.test.ts` (expand)
- additional targeted Convex tests as needed

## Phase C: Release hygiene (P2)

### PR-18: Dependency audit gating

Status: In progress

Scope:
- Add CI step for `npm audit` (or approved scanner) in networked environment.
- Add release policy for vulnerability severity thresholds.

Current implementation:
- `.github/workflows/ci.yml` includes `npm audit --omit=dev --audit-level=high`.
- Explicit waiver path is supported via `SECURITY_AUDIT_WAIVER` (must include rationale).

## Release Gate Checklist (must pass)

- [x] P0 remediations complete and merged.
- [x] Run and pass: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage` (no critical-path regressions in coverage).
- [ ] Dependency audit run in CI with no unwaived high/critical findings.
- [ ] Readiness endpoint green in target environment.
- [ ] Proxy trust settings verified in production environment variables.
- [ ] Metrics endpoint auth behavior manually verified against spoof attempts.

## Test Additions Required

- Metrics spoofing tests:
  - untrusted peer + spoofed `x-forwarded-for` must fail
  - trusted peer + allowlisted client may pass if policy allows
- Catalog outage resilience tests:
  - `/models` fetch failure still allows default chat/image operations
- Admin login body-size tests:
  - oversize payload -> 413
  - invalid JSON -> 400
- Convex settlement invariants:
  - one-way settlement and idempotency under replay
  - shortfall behavior and ledger consistency

## Operational Follow-ups

- Add alert on spikes in:
  - `api_failures_total` for `chat_handler`, `generate_image_handler`
  - `api_rate_limit_blocks_total` anomaly by endpoint
  - `readiness.not_ready`
- Add metric for unresolved/unknown client IP resolution outcomes in production.
- Document explicit proxy-trust runbook and verification steps in deployment docs.

## Notes on Prior Completed Work

The prior remediation sequence (PR-1 through PR-12) provided a strong baseline and remains valuable. This document supersedes previous "completed" status by adding newly identified production blockers from the latest full-codebase audit on 2026-02-19.
