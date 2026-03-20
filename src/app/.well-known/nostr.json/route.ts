import { NextResponse } from "next/server";

const VISIBIBLE_NIP05_NAME = "visibible";
const VISIBIBLE_NOSTR_PUBKEY =
  "eeee78227f04eae05d1cf338dbf39d462af360389b8d09cf7b7b32d216a976bf";
const VISIBIBLE_NOSTR_RELAYS = [
  "wss://relay.nostr.band",
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
