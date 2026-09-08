# Convex function access inventory

This inventory covers every registered function in `convex/*.ts` at the T08 checkpoint. Internal helpers and generated component bindings are not client endpoints. Public image API projections remain unchanged. A supplied SID is a compatibility selector, never proof of ownership. Invalid/expired/revoked identities receive no private query data; private controls reject unauthorized calls. Current tier comes from the database.

Server-secret reads are reserved for Next.js after cookie validation and for trusted backend work. Invoice HTTP reads pass `ownerSid` to enforce current, non-revoked ownership before returning data. Settlement remains server/internal so accepted payments can still credit retained records. Bulk outcome writes remain available to the verified owning guest while the legacy browser worker exists; making them worker-only belongs to S06.

| Function | Registration | Access | Rule |
|---|---|---|---|
| `bulkGenerations:create` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:getActive` | query | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:get` | query | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:getVerses` | query | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:updateVerseStatus` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:updateProgress` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:pause` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:resume` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `bulkGenerations:cancel` | mutation | Guest-owned | Verified subject matches SID; current session; job ownership. Legacy worker writes retained until S06. |
| `cleanup:cleanupExpiredSessions` | internalMutation | Internal | Convex internal dispatch only |
| `cleanup:cleanupStaleRateLimits` | internalMutation | Internal | Convex internal dispatch only |
| `cleanup:cleanupAdminLoginAttempts` | internalMutation | Internal | Convex internal dispatch only |
| `costs:quoteUsdCost` | action | Server | CONVEX_SERVER_SECRET |
| `costs:recordImageCostEvent` | action | Server | CONVEX_SERVER_SECRET |
| `costs:enqueueImageCostEventOutbox` | action | Server | CONVEX_SERVER_SECRET |
| `costs:enqueueImageCostEventOutboxInternal` | internalMutation | Internal | Convex internal dispatch only |
| `costs:getPendingImageCostEventsInternal` | internalQuery | Internal | Convex internal dispatch only |
| `costs:markImageCostEventSuccessInternal` | internalMutation | Internal | Convex internal dispatch only |
| `costs:markImageCostEventFailureInternal` | internalMutation | Internal | Convex internal dispatch only |
| `costs:processCostEventOutboxBatch` | internalAction | Internal | Convex internal dispatch only |
| `feedback:submitFeedback` | mutation | Server | CONVEX_SERVER_SECRET |
| `guestAuth:sessionForToken` | query | Server | CONVEX_SERVER_SECRET |
| `guestAuth:current` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `invoices:createInvoice` | mutation | Server | CONVEX_SERVER_SECRET |
| `invoices:getInvoice` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `invoices:getSessionInvoices` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `invoices:confirmPaymentInternal` | internalMutation | Internal | Convex internal dispatch only |
| `invoices:confirmPayment` | action | Server | CONVEX_SERVER_SECRET |
| `invoices:expireInvoice` | mutation | Server | CONVEX_SERVER_SECRET |
| `modelCostStats:recordActualCost` | mutation | Server | CONVEX_SERVER_SECRET |
| `modelCostStats:backfillFromGenerationRequests` | mutation | Server | CONVEX_SERVER_SECRET |
| `modelCostStats:getEstimate` | query | Server | CONVEX_SERVER_SECRET |
| `modelCostStats:getAllEstimates` | query | Server | CONVEX_SERVER_SECRET |
| `modelStats:getModelStats` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `modelStats:getAllModelStats` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `modelStats:recordGeneration` | mutation | Server | CONVEX_SERVER_SECRET |
| `nostr:publishToNostr` | internalAction | Internal | Convex internal dispatch only |
| `nostrScheduler:claimScheduledImageForWindow` | internalMutation | Internal | Convex internal dispatch only |
| `nostrScheduler:completeScheduledWindow` | internalMutation | Internal | Convex internal dispatch only |
| `nostrScheduler:recordScheduledWindowFailure` | internalMutation | Internal | Convex internal dispatch only |
| `nostrScheduler:publishTopImageForLatestWindow` | internalAction | Internal | Convex internal dispatch only |
| `rateLimit:checkRateLimit` | mutation | Server | CONVEX_SERVER_SECRET |
| `rateLimit:getRateLimitStatus` | query | Server | CONVEX_SERVER_SECRET |
| `rateLimit:checkAdminLoginAllowed` | query | Server | CONVEX_SERVER_SECRET |
| `rateLimit:recordFailedAdminLogin` | mutation | Server | CONVEX_SERVER_SECRET |
| `rateLimit:clearAdminLoginAttempts` | mutation | Server | CONVEX_SERVER_SECRET |
| `sessions:getSession` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `sessions:createSession` | mutation | Server | CONVEX_SERVER_SECRET |
| `sessions:updateLastSeen` | mutation | Server | CONVEX_SERVER_SECRET |
| `sessions:reconcileStaleReservations` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:addCreditsInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:reserveCreditsInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:releaseReservationInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:deductCreditsInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:addCredits` | action | Server | CONVEX_SERVER_SECRET |
| `sessions:reserveCredits` | action | Server | CONVEX_SERVER_SECRET |
| `sessions:releaseReservation` | action | Server | CONVEX_SERVER_SECRET |
| `sessions:deductCredits` | action | Server | CONVEX_SERVER_SECRET |
| `sessions:getCreditHistory` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `sessions:upgradeToAdminInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:upgradeToAdmin` | action | Server | ADMIN_PASSWORD_SECRET; separate admin admission route |
| `sessions:logAdminUsageInternal` | internalMutation | Internal | Convex internal dispatch only |
| `sessions:logAdminUsage` | action | Server | CONVEX_SERVER_SECRET |
| `sessions:getAdminDailySpend` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getLatestImage` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getChapterImageStatus` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getChapterGallery` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getBooksWithImages` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getChaptersWithImages` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getPublicApiIndex` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getPublicBooksWithImages` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getPublicChaptersWithImages` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getPublicVerseLatestImage` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:listPublicVerseImagesPaginated` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getPublicChapterLatestImages` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:getImageHistory` | query | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:getGenerationRequestStatus` | query | Guest-owned | Verified subject and current session; explicit server secret for HTTP reads where supported |
| `verseImages:getScenePlanCache` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:markScenePlanCacheHit` | mutation | Server | CONVEX_SERVER_SECRET |
| `verseImages:upsertScenePlanCache` | mutation | Server | CONVEX_SERVER_SECRET |
| `verseImages:getGenerationIntent` | query | Server | CONVEX_SERVER_SECRET |
| `verseImages:createGenerationRequest` | mutation | Server | CONVEX_SERVER_SECRET |
| `verseImages:updateGenerationRequest` | mutation | Server | CONVEX_SERVER_SECRET |
| `verseImages:getImageByGenerationId` | internalQuery | Internal | Convex internal dispatch only |
| `verseImages:saveImageWithStorage` | internalMutation | Internal | Convex internal dispatch only |
| `verseImages:getImageById` | internalQuery | Internal | Convex internal dispatch only |
| `verseImages:recordImageImpression` | mutation | Public | Shared image/library metadata, aggregate ETA, or anonymous impression increment; no private session records |
| `verseImages:recordNostrPublication` | internalMutation | Internal | Convex internal dispatch only |
| `verseImages:saveImageWithUrl` | internalMutation | Internal | Convex internal dispatch only |
| `verseImages:saveImage` | action | Server | CONVEX_SERVER_SECRET |
