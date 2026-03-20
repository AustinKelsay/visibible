type StructuredLogLevel = "info" | "warn" | "error";

type MetricLabelValue = string | number | boolean | null | undefined;
type MetricLabels = Record<string, MetricLabelValue>;

type CounterEntry = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

const PROCESS_STARTED_AT_MS = Date.now();
const metricCounters = new Map<string, CounterEntry>();

function normalizeLabels(labels: MetricLabels = {}): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (value === undefined || value === null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function buildCounterKey(name: string, labels: Record<string, string>): string {
  const labelSuffix = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return labelSuffix ? `${name}|${labelSuffix}` : name;
}

function sanitizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return cleaned.length >= 8 ? cleaned : null;
}

export function redactSid(sid: string | undefined): string | undefined {
  if (!sid) return undefined;
  if (sid.length <= 8) return "[redacted]";
  return `${sid.slice(0, 4)}...${sid.slice(-4)}`;
}

function toErrorObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

function emitStructuredLog(
  level: StructuredLogLevel,
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export type RequestObservabilityContext = {
  route: string;
  method: string;
  requestId: string;
  startedAtMs: number;
};

export function createRequestObservabilityContext(
  request: Request,
  route: string,
  options?: { requestId?: string | null }
): RequestObservabilityContext {
  const requestId =
    sanitizeRequestId(options?.requestId) ||
    sanitizeRequestId(request.headers.get("x-request-id")) ||
    crypto.randomUUID();

  return {
    route,
    method: request.method,
    requestId,
    startedAtMs: Date.now(),
  };
}

export function elapsedMs(context: RequestObservabilityContext): number {
  return Date.now() - context.startedAtMs;
}

export function incrementMetricCounter(
  name: string,
  labels: MetricLabels = {},
  amount = 1
): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const normalizedLabels = normalizeLabels(labels);
  const key = buildCounterKey(name, normalizedLabels);
  const existing = metricCounters.get(key);

  if (existing) {
    existing.value += amount;
    return;
  }

  metricCounters.set(key, {
    name,
    labels: normalizedLabels,
    value: amount,
  });
}

export function emitMetric(
  name: string,
  labels: MetricLabels = {},
  amount = 1
): void {
  incrementMetricCounter(name, labels, amount);
  emitStructuredLog("info", "metric", {
    metric: name,
    value: amount,
    labels: normalizeLabels(labels),
  });
}

export function logInfo(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  emitStructuredLog("info", event, fields);
}

export function logWarn(
  event: string,
  fields: Record<string, unknown> = {}
): void {
  emitStructuredLog("warn", event, fields);
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {}
): void {
  emitStructuredLog("error", event, {
    ...fields,
    error: toErrorObject(error),
  });
}

export function logApiFailure(args: {
  context: RequestObservabilityContext;
  stage: string;
  error: unknown;
  statusCode?: number;
  sid?: string;
  generationId?: string;
  invoiceId?: string;
}): void {
  const redactedSid = redactSid(args.sid);

  incrementMetricCounter("api_failures_total", {
    route: args.context.route,
    stage: args.stage,
    status: args.statusCode ?? "unknown",
  });

  logError("api.failure", args.error, {
    route: args.context.route,
    method: args.context.method,
    requestId: args.context.requestId,
    stage: args.stage,
    statusCode: args.statusCode,
    sid: redactedSid,
    generationId: args.generationId,
    invoiceId: args.invoiceId,
    durationMs: elapsedMs(args.context),
  });
}

export function logApiTimeout(args: {
  context: RequestObservabilityContext;
  stage: string;
  timeoutMs: number;
  sid?: string;
  generationId?: string;
}): void {
  const redactedSid = redactSid(args.sid);

  emitMetric("api_timeouts_total", {
    route: args.context.route,
    stage: args.stage,
  });
  logWarn("api.timeout", {
    route: args.context.route,
    method: args.context.method,
    requestId: args.context.requestId,
    stage: args.stage,
    timeoutMs: args.timeoutMs,
    sid: redactedSid,
    generationId: args.generationId,
    durationMs: elapsedMs(args.context),
  });
}

export function logSettlementEvent(args: {
  context: RequestObservabilityContext;
  outcome:
    | "confirmed"
    | "released"
    | "release_failed"
    | "deduct_failed"
    | "shortfall"
    | "outbox_enqueued";
  sid?: string;
  generationId?: string;
  invoiceId?: string;
  details?: Record<string, unknown>;
}): void {
  const redactedSid = redactSid(args.sid);

  emitMetric("settlement_events_total", {
    route: args.context.route,
    outcome: args.outcome,
  });
  logInfo("settlement.event", {
    route: args.context.route,
    requestId: args.context.requestId,
    outcome: args.outcome,
    ...args.details,
    sid: redactedSid,
    generationId: args.generationId,
    invoiceId: args.invoiceId,
  });
}

export function getMetricsSnapshot(): {
  scope: "process-local";
  generatedAt: string;
  processStartedAt: string;
  uptimeMs: number;
  counters: Array<{
    name: string;
    labels: Record<string, string>;
    value: number;
  }>;
} {
  return {
    scope: "process-local",
    generatedAt: new Date().toISOString(),
    processStartedAt: new Date(PROCESS_STARTED_AT_MS).toISOString(),
    uptimeMs: Date.now() - PROCESS_STARTED_AT_MS,
    counters: [...metricCounters.values()]
      .map((entry) => ({
        name: entry.name,
        labels: entry.labels,
        value: entry.value,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function getHealthSnapshot(): {
  status: "ok";
  timestamp: string;
  uptimeMs: number;
} {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - PROCESS_STARTED_AT_MS,
  };
}

export function resetObservabilityStateForTests(): void {
  metricCounters.clear();
}
