"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const NOSTR_RELAYS = [
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.primal.net"
];

/**
 * Convert verseId to URL path
 * "genesis-1-1" -> "/genesis/1/1"
 * "1-john-3-16" -> "/1-john/3/16"
 */
function verseIdToPath(verseId: string): string {
  const parts = verseId.split("-");
  if (parts.length < 3) {
    throw new Error(`Invalid verseId format: ${verseId}`);
  }
  const verse = parts.pop()!;
  const chapter = parts.pop()!;
  const book = parts.join("-");
  return `/${book}/${chapter}/${verse}`;
}

/**
 * Format content for Nostr post
 * Adds extension hint to image URL for legacy client compatibility
 */
function formatNostrContent(args: {
  reference: string;
  verseText: string;
  imageUrl: string;
  verseId: string;
  imageMimeType?: string;
}): string {
  // Add extension hint for clients that use URL pattern matching
  // Many clients don't support NIP-92 imeta tags yet, so they rely on
  // the URL ending in .jpg/.png/.webp to detect images
  let imageUrlWithHint = args.imageUrl;
  if (args.imageMimeType) {
    let ext = args.imageMimeType.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';
    imageUrlWithHint = `${args.imageUrl}#.${ext}`;
  }

  const pageUrl = `https://visibible.com${verseIdToPath(args.verseId)}`;

  return `${args.reference}

"${args.verseText}"

${imageUrlWithHint}

View more at ${pageUrl}`;
}

/**
 * Internal action to publish an image to Nostr relays
 * This is called fire-and-forget style from saveImage via scheduler
 */
export const publishToNostr = internalAction({
  args: {
    imageId: v.id("verseImages"),
    verseId: v.string(),
    reference: v.string(),
    verseText: v.string(),
    storageId: v.id("_storage"),
    imageMimeType: v.optional(v.string()),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const privateKey = process.env.NOSTR_PRIVATE_KEY;
    if (!privateKey) {
      console.log("[Nostr] NOSTR_PRIVATE_KEY not configured, skipping publication");
      return;
    }

    // Idempotency check: skip if already published (prevents duplicates on retry)
    const image = await ctx.runQuery(internal.verseImages.getImageById, { imageId: args.imageId });
    if (!image) {
      console.log(`[Nostr] Image ${args.imageId} not found, skipping publication`);
      return;
    }
    if (image.nostrEventId) {
      console.log(`[Nostr] Image ${args.imageId} already published as ${image.nostrEventId}, skipping`);
      return;
    }

    // Construct permanent storage URL (doesn't expire like ctx.storage.getUrl())
    // CONVEX_CLOUD_URL is a built-in Convex system variable - no manual config needed
    const convexUrl = process.env.CONVEX_CLOUD_URL;
    if (!convexUrl) {
      console.error("[Nostr] CONVEX_CLOUD_URL not available, skipping publication");
      return;
    }
    const imageUrl = `${convexUrl}/api/storage/${args.storageId}`;

    // Dynamic import of snstr (required for "use node" action)
    const { Nostr, createEvent, signEvent, getPublicKey, getEventHash, decodePrivateKey } = await import("snstr");

    // Create client with relays (initialized outside try for cleanup in finally)
    const client = new Nostr(NOSTR_RELAYS);

    try {
      // Handle both hex and nsec private key formats
      const hexKey = privateKey.startsWith("nsec1")
        ? decodePrivateKey(privateKey as `nsec1${string}`)
        : privateKey;

      await client.connectToRelays();

      // Format the content (pass mime type for URL extension hint)
      const content = formatNostrContent({
        reference: args.reference,
        verseText: args.verseText,
        imageUrl,
        verseId: args.verseId,
        imageMimeType: args.imageMimeType,
      });

      // Build imeta tag for image (NIP-92)
      // Format: ["imeta", "url <url>", "m <mime>", "dim <w>x<h>"]
      const imetaParts = [`url ${imageUrl}`];
      if (args.imageMimeType) {
        imetaParts.push(`m ${args.imageMimeType}`);
      }
      if (args.imageWidth && args.imageHeight) {
        imetaParts.push(`dim ${args.imageWidth}x${args.imageHeight}`);
      }

      // Get public key from private key
      const pubkey = getPublicKey(hexKey);

      // Create unsigned event with imeta tag for image rendering
      const unsignedEvent = createEvent({
        kind: 1,
        content,
        tags: [["imeta", ...imetaParts]],
      }, pubkey);

      // Get event hash (id) and sign it
      const eventId = await getEventHash(unsignedEvent);
      const sig = await signEvent(eventId, hexKey);

      // Assemble the full signed event
      const signedEvent = {
        ...unsignedEvent,
        id: eventId,
        sig,
      };

      // Publish the event (throws on failure)
      await client.publishEvent(signedEvent);

      // Record successful publication using pre-computed eventId
      await ctx.runMutation(internal.verseImages.recordNostrPublication, {
        imageId: args.imageId,
        eventId,
        relays: NOSTR_RELAYS,
        publishedAt: Date.now(),
      });

      console.log(`[Nostr] Published event ${eventId} for image ${args.imageId}`);
    } catch (error) {
      console.error("[Nostr] Publication failed:", error);
    } finally {
      // Always close WebSocket connections
      client.disconnectFromRelays();
    }
  },
});
