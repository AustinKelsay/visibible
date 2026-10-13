const LNURLP_UPSTREAM_ORIGIN = "https://tower.taila60b27.ts.net:10000";
const LNURLP_UPSTREAM_TIMEOUT_MS = 10_000;

interface RouteParams {
  params: Promise<{ username: string }>;
}

function lnurlpResponse(body: string, status: number) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// Vercel reserves /.well-known, so LUD-16 discovery is proxied here instead of in vercel.json.
export async function GET(request: Request, { params }: RouteParams) {
  const { username } = await params;
  const { search } = new URL(request.url);
  const upstreamUrl = `${LNURLP_UPSTREAM_ORIGIN}/.well-known/lnurlp/${encodeURIComponent(username)}${search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(LNURLP_UPSTREAM_TIMEOUT_MS),
    });

    return lnurlpResponse(await upstream.text(), upstream.status);
  } catch {
    return lnurlpResponse(
      JSON.stringify({ status: "ERROR", reason: "Lightning service unavailable" }),
      502
    );
  }
}
