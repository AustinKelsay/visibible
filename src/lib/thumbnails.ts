/**
 * Thumbnails (#444): the small copy of a saved picture that walls of pictures and previews load instead of the full
 * painting. New pictures get one in the request that saves them (src/lib/engine/generation.ts); older pictures get
 * one from the owner's backfill (scripts/thumbnails/backfill.mts), which runs here.
 *
 * Resizing uses sharp, which the image route already loads to convert reference sheets. sharp ships prebuilt
 * binaries as optional platform packages and runs no install script, so it works with `ignore-scripts`.
 */
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

/** The thumbnail's shorter side, in pixels: sharp enough for a square tile about 190 CSS pixels wide at 2x. */
export const THUMBNAIL_SHORT_EDGE = 384;
const THUMBNAIL_QUALITY = 70;

/** A WebP data URL of the picture scaled so its shorter side is at most THUMBNAIL_SHORT_EDGE. Throws on unreadable bytes. */
export async function makeThumbnail(picture: Uint8Array): Promise<string> {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp(Buffer.from(picture))
    .rotate()
    .resize({ width: THUMBNAIL_SHORT_EDGE, height: THUMBNAIL_SHORT_EDGE, fit: "outside", withoutEnlargement: true })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

/** The parts of a Convex client the backfill uses: ConvexHttpClient, or a convex-test instance in tests. */
export type BackfillClient = {
  query<Q extends FunctionReference<"query">>(fn: Q, args: FunctionArgs<Q>): Promise<FunctionReturnType<Q>>;
  action<A extends FunctionReference<"action">>(fn: A, args: FunctionArgs<A>): Promise<FunctionReturnType<A>>;
};

export type BackfillOptions = {
  dryRun: boolean;
  /** Stop after this many pictures have been given a thumbnail. */
  limit?: number;
  /** Checked between pictures; true stops the run, keeping what it made. */
  stopRequested?: () => boolean;
};

export type BackfillDeps = {
  client: BackfillClient;
  serverSecret: string;
  /** The full picture's bytes from its address. */
  fetchPicture: (url: string) => Promise<Uint8Array>;
  makeThumbnail?: (picture: Uint8Array) => Promise<string>;
  log: (line: string) => void;
};

export type BackfillReport = {
  dryRun: boolean;
  /** Pictures without a thumbnail that this run looked at. */
  found: number;
  attached: number;
  /** Pictures another run gave a thumbnail first. */
  already: number;
  failed: Array<{ id: string; verseId: string; reason: string }>;
  stop: "complete" | "limit" | "interrupted";
};

const PAGE_SIZE = 50;

/**
 * Give every saved picture without a thumbnail one. Resumable and safe to repeat: each run reads only pictures that
 * still lack a thumbnail, and attaching keeps a thumbnail a picture already has. A dry run reads the same list and
 * changes nothing. A picture that cannot be read or resized is reported and left for a later run.
 */
export async function runThumbnailBackfill(options: BackfillOptions, deps: BackfillDeps): Promise<BackfillReport> {
  const resize = deps.makeThumbnail ?? makeThumbnail;
  const report: BackfillReport = { dryRun: options.dryRun, found: 0, attached: 0, already: 0, failed: [], stop: "complete" };
  let after: number | undefined;
  for (;;) {
    const page = await deps.client.query(api.verseImages.listPicturesWithoutThumbnail, { serverSecret: deps.serverSecret, after, limit: PAGE_SIZE });
    if (page.length === 0) return report;
    for (const picture of page) {
      if (options.stopRequested?.()) return { ...report, stop: "interrupted" };
      if (!options.dryRun && options.limit !== undefined && report.attached >= options.limit) return { ...report, stop: "limit" };
      report.found += 1;
      after = picture.creationTime;
      if (options.dryRun) {
        deps.log(`would make ${picture.id} ${picture.verseId}${picture.imageUrl ? "" : " (no picture address: would fail)"}`);
        continue;
      }
      try {
        if (!picture.imageUrl) throw new Error("The picture has no address");
        const thumbnailUrl = await resize(await deps.fetchPicture(picture.imageUrl));
        const { status } = await deps.client.action(api.verseImages.attachThumbnail, { serverSecret: deps.serverSecret, imageId: picture.id, thumbnailUrl });
        if (status === "attached") report.attached += 1;
        else if (status === "already") report.already += 1;
        deps.log(`${status} ${picture.id} ${picture.verseId}`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        report.failed.push({ id: picture.id, verseId: picture.verseId, reason });
        deps.log(`failed ${picture.id} ${picture.verseId}: ${reason}`);
      }
    }
  }
}
