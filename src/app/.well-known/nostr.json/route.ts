import { NextResponse } from "next/server";

const VISIBIBLE_NIP05_NAME = "visibible";
const VISIBIBLE_NOSTR_PUBKEY =
  "5b98af63ee20a0d22ad24a78045a81beafb4fe13c7e602a90eef038f90c90299";
// The relays the account's posts go to (Convex NOSTR_RELAYS) and its kind-10002 relay list names.
const VISIBIBLE_NOSTR_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
];

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedName = searchParams.get("name")?.trim().toLowerCase();
  const includeVisibible =
    !requestedName ||
    requestedName === VISIBIBLE_NIP05_NAME ||
    requestedName === "_";

  const names = includeVisibible
    ? { [VISIBIBLE_NIP05_NAME]: VISIBIBLE_NOSTR_PUBKEY }
    : {};
  const relays = includeVisibible
    ? { [VISIBIBLE_NOSTR_PUBKEY]: VISIBIBLE_NOSTR_RELAYS }
    : {};

  return NextResponse.json(
    { names, relays },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  );
}
