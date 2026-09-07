# Operational visibility

[observability.ts](../../src/lib/observability.ts) supplies structured logs, request IDs, elapsed time and in-process counters. Route instrumentation records errors, throttling and settlement outcomes. Counters are local to the running process and reset with it; they are not a durable aggregate across serverless instances.

| Endpoint | Behavior |
| --- | --- |
| [`/api/health`](../../src/app/api/health/route.ts) | Liveness, without probing provider health |
| [`/api/readiness`](../../src/app/api/readiness/route.ts) | Public ready/not-ready summary; checks required env presence and a Convex query. Authorized callers also receive details. LND is configuration-only and noncritical; this does not make a live OpenRouter/LND request. |
| [`/api/metrics`](../../src/app/api/metrics/route.ts) | JSON counter snapshot; disabled with 503 without a policy, 403 for unauthorized requests |

[ops-auth.ts](../../src/lib/ops-auth.ts) uses `READINESS_TOKEN`/`READINESS_IP_ALLOWLIST` and `METRICS_TOKEN`/`METRICS_IP_ALLOWLIST`. Either token or exact-IP policy can be configured; when both are set, both must pass. These allowlists are exact IPs, not CIDRs. Trusted proxy resolution still matters.

Use [ops route tests](../../src/app/api/__tests__/ops/health-readiness-metrics.test.ts) and [observability tests](../../src/lib/__tests__/observability.test.ts) for changes. Client product events are separate; see [Analytics](ANALYTICS.md).
