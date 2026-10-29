# Legacy engine code removal (#184)

**The legacy engine's code is removed from production since 29 October 2026, 00:43 UTC** ([deployment record](deployment.json)). Release #312 (`41e3698`, `dpl_FK57gdg6XsWGAvDgvHTQPkHkforF`) shipped #307–#311 and #313. Readers saw no change: production had run only the generic engine since the [cutoff](../2026-10-28-legacy-retirement/README.md).

| Step | PR | What went |
| --- | --- | --- |
| 1 | #307 | The image route's legacy execution and its Classical fallback |
| 2 | #308, #309 | The planner allowance in quotes, the legacy prompt builder, the scene planner and the evaluation harness's direct and planner arms |
| 3 | #310, this follow-up | The scene plan cache functions, its rows and its table |
| 4 | #311 | Admission's legacy branch: `decideEngine` admits only the generic engine |

Accepted legacy requests still replay: the request fingerprint, replay, and the `legacy` engine value on records and bulk bindings stay. The `LEGACY_ENGINE` switch no longer exists. The rollback is to promote the cutoff build, `dpl_DdXpgtYvPQnxTTHHzE2HFANMW8n8` (see the caveat below).

## Checks after the deploy

- `/api/image-models`: Classical, Watercolor and Fresco are available and Icon is not. The Lite quote is 5 credits with no planner field.
- A reader page answers 200. The image route answers 405 to GET and 403 to a POST without origin or CSRF.
- No production traffic reached the logs in the first minutes, so there is no runtime log evidence yet.

## Scene plan cache

The owner chose to clear the disposable legacy plan cache after the release. The rows were exported first:

| Deployment | Rows deleted | After | Export |
| --- | --- | --- | --- |
| Production (`unique-impala-244`) | 20 (created 8 April to 16 October) | 0 | [scene-plan-cache-production.jsonl](scene-plan-cache-production.jsonl) |
| Dev (`coordinated-shepherd-515`) | 1 | 0 | [scene-plan-cache-dev.jsonl](scene-plan-cache-dev.jsonl) |

The clear used `convex import --table scenePlanCache --replace` with an empty file, which replaces only that table. The table then left the schema in the follow-up PR.

## Cleanup (29 October)

At the owner's direction ("get these cleaned up"):
- `LEGACY_ENGINE`, `ENABLE_SCENE_PLANNER` and `OPENROUTER_SCENE_PLANNER_MODEL` were removed from every Vercel environment at 01:58 UTC. No deployed code reads them, so no redeploy was needed.
- Issues #184 and #183 are closed.
- The empty `scenePlanCache` table stays listed on dev and production until it is deleted in the Convex dashboard. Convex keeps empty tables after they leave the schema, and the CLI cannot delete one without clearing every table.

**Rollback caveat:** promote the cutoff build (Vercel instant rollback) rather than rebuilding it. A promoted deployment keeps its build-time `LEGACY_ENGINE=retired`; a rebuild would not, because the variable is gone.
