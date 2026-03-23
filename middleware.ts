import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  ANON_ID_COOKIE_NAME,
  ANON_ID_HEADER_NAME,
  createAnonId,
  getAnonIdCookieOptions,
} from "@/lib/verse-view";

function isHtmlNavigationRequest(request: NextRequest) {
  if (request.method !== "GET") {
    return false;
  }

  const accept = request.headers.get("accept") ?? "";
  const destination = request.headers.get("sec-fetch-dest");

  return accept.includes("text/html") || destination === "document";
}

export function middleware(request: NextRequest) {
  if (!isHtmlNavigationRequest(request)) {
    return NextResponse.next();
  }

  if (request.cookies.get(ANON_ID_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const anonId = createAnonId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ANON_ID_HEADER_NAME, anonId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const cookieOptions = getAnonIdCookieOptions(anonId);
  response.cookies.set(cookieOptions.name, cookieOptions.value, {
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    path: cookieOptions.path,
    maxAge: cookieOptions.maxAge,
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
