# Observability Implementation

Date: 2026-02-18  
Status: Implemented (PR-12)

## Scope Delivered

- Structured JSON logging for critical API and settlement paths.
- Alertable counter metrics for failures, timeouts, rate-limit blocks, and settlement outcomes.
- Operational endpoints for liveness/readiness/metrics.

## Core Utility

Implemented shared observability helpers in:

- `src/lib/observability.ts`

Key functions:

- `createRequestObservabilityContext(...)`
- `logApiFailure(...)`
- `logApiTimeout(...)`
- `logSettlementEvent(...)`
- `emitMetric(...)`
- `incrementMetricCounter(...)`
- `getHealthSnapshot()`
- `getMetricsSnapshot()`

Notes:

- Logs are emitted as single-line JSON for machine parsing in log pipelines.
- Metrics are in-process counters exposed through `/api/metrics`.
- Request IDs are sanitized from `x-request-id` when available, otherwise generated server-side.

## Structured Events

Core event names emitted by the observability layer:

- `api.failure`: unexpected failures with route/stage/request metadata
- `api.timeout`: timeout paths with stage/timeout duration
- `api.rate_limited`: warning for blocked requests
- `settlement.event`: credit/invoice settlement lifecycle transitions
- `metric`: emitted when `emitMetric(...)` is called

## Counter Metrics

Key counters currently used:

- `api_failures_total`
- `api_timeouts_total`
- `api_rate_limit_blocks_total`
- `settlement_events_total`
- `invoice_created_total`
- `readiness_checks_total`
- `api_requests_total`

## Route Instrumentation

Critical routes instrumented with structured events:

- `src/app/api/chat/route.ts`
  - API rate-limit blocks
  - stream pump failures
  - settlement release/deduct outcomes
- `src/app/api/generate-image/route.ts`
  - scene planner + main generation timeouts
  - settlement shortfall/release failures/outbox enqueue fallback
  - generation handler failures
- `src/app/api/invoice/route.ts`
  - invoice creation rate-limit blocks
  - invoice creation failures
- `src/app/api/invoice/[id]/route.ts`
  - invoice status/confirm rate-limit blocks
  - LND lookup failures
  - invoice settlement confirmations

## Operational Endpoints

- `GET /api/health`
  - liveness and uptime snapshot
- `GET /api/readiness`
  - critical readiness checks:
    - required env presence
    - Convex client + probe query
  - non-critical check:
    - LND configured state
  - returns `200` when critical checks pass, otherwise `503`
- `GET /api/metrics`
  - machine-parseable counter snapshot
  - payload includes:
    - `generatedAt`
    - `uptimeMs`
    - `counters[]` (`name`, `labels`, `value`)

## Test Coverage

- `src/lib/__tests__/observability.test.ts`
  - request context generation
  - counter accumulation
  - structured failure logging behavior
- `src/app/api/__tests__/ops/health-readiness-metrics.test.ts`
  - health endpoint shape
  - readiness success/failure checks
  - metrics endpoint output
