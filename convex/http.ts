import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// Convex storage IDs are alphanumeric with underscores (e.g., "kg2c7qn8vn8j9...")
const STORAGE_ID_PATTERN = /^[A-Za-z0-9_]+$/;

/**
 * Public endpoint to serve images from Convex storage.
 * URL format: /image/{storageId}
 *
 * This provides permanent URLs for stored images (e.g., for Nostr posts)
 * since ctx.storage.getUrl() returns short-lived signed URLs.
 */
http.route({
  path: "/image/{storageId}",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    // Extract exactly the second path segment: ["", "image", storageId]
    const segments = url.pathname.split("/");
    const rawStorageId = segments[2] ?? "";
    const storageId = decodeURIComponent(rawStorageId);

    if (!storageId || !STORAGE_ID_PATTERN.test(storageId)) {
      return new Response("Invalid or missing storageId", { status: 400 });
    }

    const blob = await ctx.storage.get(storageId as Id<"_storage">);
    if (!blob) {
      return new Response("Image not found", { status: 404 });
    }

    // Return the image with appropriate headers
    return new Response(blob, {
      headers: {
        "Content-Type": blob.type || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }),
});

export default http;
