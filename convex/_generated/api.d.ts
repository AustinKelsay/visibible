/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers_attention from "../_helpers/attention.js";
import type * as _helpers_auth from "../_helpers/auth.js";
import type * as _helpers_contentVersion from "../_helpers/contentVersion.js";
import type * as _helpers_guestKeys from "../_helpers/guestKeys.js";
import type * as _helpers_pendingHolds from "../_helpers/pendingHolds.js";
import type * as _helpers_styleIds from "../_helpers/styleIds.js";
import type * as analysis from "../analysis.js";
import type * as bulkGenerations from "../bulkGenerations.js";
import type * as cleanup from "../cleanup.js";
import type * as costs from "../costs.js";
import type * as crons from "../crons.js";
import type * as feedback from "../feedback.js";
import type * as freeAnswers from "../freeAnswers.js";
import type * as guestAuth from "../guestAuth.js";
import type * as http from "../http.js";
import type * as invoiceReconciliation from "../invoiceReconciliation.js";
import type * as invoices from "../invoices.js";
import type * as lib_nostrScheduling from "../lib/nostrScheduling.js";
import type * as lib_proseWorks from "../lib/proseWorks.js";
import type * as libraryReset from "../libraryReset.js";
import type * as modelStats from "../modelStats.js";
import type * as nostr from "../nostr.js";
import type * as nostrScheduler from "../nostrScheduler.js";
import type * as quotes from "../quotes.js";
import type * as rateLimit from "../rateLimit.js";
import type * as sessionRecovery from "../sessionRecovery.js";
import type * as sessions from "../sessions.js";
import type * as storedAnswers from "../storedAnswers.js";
import type * as verseImages from "../verseImages.js";
import type * as verseVideos from "../verseVideos.js";
import type * as videoWorker from "../videoWorker.js";
import type * as walletMigration from "../walletMigration.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_helpers/attention": typeof _helpers_attention;
  "_helpers/auth": typeof _helpers_auth;
  "_helpers/contentVersion": typeof _helpers_contentVersion;
  "_helpers/guestKeys": typeof _helpers_guestKeys;
  "_helpers/pendingHolds": typeof _helpers_pendingHolds;
  "_helpers/styleIds": typeof _helpers_styleIds;
  analysis: typeof analysis;
  bulkGenerations: typeof bulkGenerations;
  cleanup: typeof cleanup;
  costs: typeof costs;
  crons: typeof crons;
  feedback: typeof feedback;
  freeAnswers: typeof freeAnswers;
  guestAuth: typeof guestAuth;
  http: typeof http;
  invoiceReconciliation: typeof invoiceReconciliation;
  invoices: typeof invoices;
  "lib/nostrScheduling": typeof lib_nostrScheduling;
  "lib/proseWorks": typeof lib_proseWorks;
  libraryReset: typeof libraryReset;
  modelStats: typeof modelStats;
  nostr: typeof nostr;
  nostrScheduler: typeof nostrScheduler;
  quotes: typeof quotes;
  rateLimit: typeof rateLimit;
  sessionRecovery: typeof sessionRecovery;
  sessions: typeof sessions;
  storedAnswers: typeof storedAnswers;
  verseImages: typeof verseImages;
  verseVideos: typeof verseVideos;
  videoWorker: typeof videoWorker;
  walletMigration: typeof walletMigration;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  neutralCost: import("neutral-cost/_generated/component.js").ComponentApi<"neutralCost">;
};
