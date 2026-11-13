import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { getConvexClient, getConvexServerSecret } from "@/lib/convex-client";
import { createSessionToken, getSessionCookieOptions, validateSessionWithIp } from "@/lib/session";
import { CSRF_COOKIE_NAME, generateCsrfToken, getCsrfCookieOptions, validateCsrfToken } from "@/lib/csrf";
import { validateOrigin } from "@/lib/origin";

export const runtime = "nodejs";

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!validateOrigin(request)) return failure("Invalid origin", 403);
  const cookieStore = await cookies();
  if (!validateCsrfToken(request, cookieStore.get(CSRF_COOKIE_NAME)?.value)) {
    return failure("Refresh the page and try again", 403);
  }
  // Verification uses the new key only; old cookies are never recovery evidence.
  const session = await validateSessionWithIp(request);
  if (!session.valid || !session.sid || !session.currentIpHash) {
    return failure("Start a new session before recovering your balance", 401);
  }
  const convex = getConvexClient();
  if (!convex) return failure("Recovery is temporarily unavailable", 503);

  try {
    const serverSecret = getConvexServerSecret();
    const limit = await convex.mutation(api.rateLimit.checkRateLimit, {
      identifier: session.currentIpHash, endpoint: "session-recovery", serverSecret,
    });
    if (!limit.allowed) {
      const response = failure("Too many attempts. Please try again later", 429);
      response.headers.set("Retry-After", String(limit.retryAfter ?? 900));
      return response;
    }

    // Bound the body even if Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return failure("Enter a valid recovery code", 400);
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024) {
          await reader.cancel();
          return failure("Recovery request is too large", 413);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let code: unknown;
    try { code = JSON.parse(text)?.code; }
    catch { return failure("Enter a valid recovery code", 400); }
    if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code)) {
      return failure("Enter a valid recovery code", 400);
    }
    const result = await convex.mutation(api.sessionRecovery.redeem, {
      serverSecret, tokenHash: createHash("sha256").update(code).digest("hex"),
      requesterSid: session.sid, ipHash: session.currentIpHash,
    });
    if (!result.ok) {
      return result.reason === "use_empty_session"
        ? failure("This browser has another balance or payment history. Use a fresh private window for recovery", 409)
        : failure("This recovery code is invalid, expired or already used", 400);
    }
    const token = await createSessionToken(result.sid, session.currentIpHash);
    const response = NextResponse.json({ recovered: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(getSessionCookieOptions(token));
    response.cookies.set(getCsrfCookieOptions(generateCsrfToken()));
    return response;
  } catch {
    // Do not log request bodies, claim hashes, cookies or backend error payloads.
    return failure("Recovery is temporarily unavailable. You can retry with the same code", 503);
  }
}
