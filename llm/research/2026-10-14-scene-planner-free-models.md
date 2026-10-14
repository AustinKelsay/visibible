# Scene planner free models

Investigated October 14, 2026, against commit `bf318e0`. Measurements cited as "live test, 2026-10-14" come from OpenRouter calls made that day with the real planner prompt. OpenRouter behavior is cited from its documentation and public catalog API, fetched the same day.

**Recommendation**

Keep `nvidia/nemotron-3-super-120b-a12b:free` as the scene planner, and keep `reasoning: { enabled: false }` in the request. It returned a valid Scene plan on every call (6/6, 244–608 ms, zero reasoning tokens), and of the models that did, its plans followed the verse most closely. Because it is free, it adds 0 credits to a Generation's Quote and Credit charge. `nvidia/nemotron-3.5-lightning:free` also worked on every call but produced weaker plans; treat it as a stopgap.

The free variant has two costs. OpenRouter caps free-model requests per account, and the variant's only endpoint is marked as retaining prompts and possibly training on them. The planner prompt contains only public Scripture text, the chapter theme and the style profile. If either cost becomes unacceptable, the paid `nvidia/nemotron-3-super-120b-a12b` is the closest replacement. It was not live-tested, and it would add the 1-credit minimum to each uncached Generation's Quote ([token pricing](../../src/lib/token-pricing.ts)).

**Why scene planning stopped**

Production set `OPENROUTER_SCENE_PLANNER_MODEL=openai/gpt-oss-20b:free`. OpenRouter no longer lists that ID. On 2026-10-14 the [models API](https://openrouter.ai/api/v1/models) listed only `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, their `:batch` variants and `openai/gpt-oss-safeguard-20b`. The newest production `scenePlanCache` row before the fix was created 2026-05-20 with that planner model. Cache hits do not create rows, so that date bounds the last successful uncached plan, not the removal date. No primary source gives the date OpenRouter removed the `:free` variant.

Before running the planner, the [image route](../../src/app/api/generate-image/route.ts) asks [`getScenePlannerEstimatedCreditsCost`](../../src/lib/scene-planner.ts) for the per-call credits. [`getChatModelPricing`](../../src/lib/chat-models.ts) returns null for a model missing from the catalog, because only the chat default has emergency pricing. The route then sets `runScenePlanner = false` and uses the direct verse prompt. Skipping unpriced work is deliberate, but that branch writes no log.

The code default at the time, `openai/gpt-oss-120b`, would have failed too. Its reasoning is mandatory, and it spent 217–234 reasoning tokens of the 220-token limit, returning empty content with `finish_reason: "length"` (live test, 2026-10-14). OpenRouter bills those reasoning tokens even when content is empty, while the route charges no planner credits when no plan comes back.

Every planner failure ends the same way: the Generation completes with the direct prompt, `scenePlannerUsed` is false, and no planner credits are charged. Only some paths log.

| Planner outcome | Route behavior | Logged |
| --- | --- | --- |
| Pricing unknown (model removed or malformed rates) | Planner skipped | No |
| Pricing lookup throws | Planner skipped | `console.warn` |
| Non-2xx response (400, 403, 429) | Direct prompt | `console.warn` with status only |
| Empty content (`finish_reason: "length"`) | Direct prompt | No |
| JSON without `primarySubject`, `action` or `setting` ([`normalizeScenePlan`](../../src/lib/image-prompts.ts)) | Direct prompt | No |
| Unparseable JSON or network error | Direct prompt | `logApiFailure` |
| Timeout (`SCENE_PLANNER_TIMEOUT_MS`, default 10 s) | Direct prompt | `logApiTimeout` |

The table records behavior at the time of the outage. Since #122, every row also records one `scene_planner_outcomes_total` count and a `scene_planner.outcome` log.

The fix (commit `088b20d`, merged to `dev` in PR #120 as `bf318e0`, released to `main` in PR #121) changed `DEFAULT_SCENE_PLANNER_MODEL`, added `reasoning: { enabled: false }` to the request, and updated the Vercel variable in all environments. After deploy, a Joshua 1:2 Generation at 2026-10-14 19:16 UTC wrote a `scenePlanCache` row with plannerModel `nvidia/nemotron-3-super-120b-a12b:free`. Its generation record shows `scenePlannerUsed: true` and a total of 5 credits ($0.0487), the same as an unplanned image earlier that day, so the planner added 0.

**Method**

- Prompt: [`buildScenePlannerPrompt`](../../src/lib/image-prompts.ts) for Genesis 1:3, John 11:35 and 1 Samuel 17:49.
- Settings matching the route: `temperature: 0.2`, `max_tokens: 220`, 10 s timeout. Only `model` and `reasoning` varied.
- Candidates: the free text models in the 2026-10-14 catalog (17 entries that [`isModelFree`](../../src/lib/chat-models.ts) treats as free), plus the old paid default and `openai/gpt-oss-20b` for comparison. Valid means the response contained a parseable JSON Scene plan.
- Not tested: `dots-studio/dots-3-note-preview:free`, `liquid/lfm-2.5-2.6b:free`, `poolside/laguna-s-2.1:free`, `poolside/laguna-xs-2.1:free`, `cohere/north-mini-code:free`, `nvidia/nemotron-3.5-content-safety:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `openrouter/free` and two Lyria music previews (code, safety, small, preview, music or router entries). `openrouter/free` also picks a model at random, while the plan cache is keyed by the configured `plannerModel`.

**Results**

Live test, 2026-10-14. `mandatory` is the model's `reasoning.mandatory` flag in the [models API](https://openrouter.ai/api/v1/models) on the same day.

| Model | `reasoning` sent | `mandatory` | Valid plans | Notes |
| --- | --- | --- | --- | --- |
| `openai/gpt-oss-120b` (old default, paid) | none | true | 0/3 | 217–234 reasoning tokens, `finish_reason: "length"`, empty content |
| `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | `{ enabled: false }` | true | 0/3 each | HTTP 400 "Reasoning is mandatory for this endpoint and cannot be disabled" |
| `openai/gpt-oss-120b` | `{ effort: "low" }` | true | 2/3 | One call still used 241 reasoning tokens and returned empty |
| `openai/gpt-oss-20b` (paid) | `{ effort: "low" }` | true | 3/3 | One call used 357 reasoning tokens |
| `nvidia/nemotron-3-super-120b-a12b:free` | `{ enabled: false }` | false | 6/6 (two runs) | 244–608 ms, 0 reasoning tokens, detailed verse-faithful plans |
| `nvidia/nemotron-3-super-120b-a12b:free` | none, or `{ effort: "low" }` | false | 0/3 each | 220 reasoning tokens, empty content |
| `nvidia/nemotron-3.5-lightning:free` | `{ enabled: false }` | false | 6/6 | 92–486 ms, weaker plans |
| `nvidia/nemotron-3.5-lightning:free` | none, or `{ effort: "low" }` | false | 0/3 | 220 reasoning tokens, empty content |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | `{ enabled: false }` | false | 2/3 | One response with no content and no `finish_reason` |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | none, or `{ effort: "low" }` | false | 0–1/3 | Empty, or reasoning text leaked into content ("The user wants a JSON …") |
| `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free` | any | false | 0/3 | HTTP 429 "Provider returned error" on every call |
| `thinkingmachines/inkling:free`, `inkling-small:free` | none | false | 0/3 | HTTP 403 "… is only available on agentic h[osts]" |

With reasoning on, the Nemotron models spent the entire 220-token limit on reasoning. `effort: "low"` did not bound reasoning in practice: OpenRouter documents `low` as roughly 20% of `max_tokens`, yet Super used all 220 tokens and `openai/gpt-oss-20b` once used 357.

**Plan quality**

Same verses, both with `{ enabled: false }`:

| Verse | Nemotron 3 Super | Nemotron 3.5 Lightning |
| --- | --- | --- |
| John 11:35 ("Jesus wept.") | Subject "Jesus kneeling beside a tomb"; action "weeping with head bowed and hands clasped"; setting "rocky Judean landscape outside Bethany with distant hills and sparse olive trees" | Subject "Jesus"; action "standing motionless", which misses the verse; setting "garden path surrounded by olive trees" |
| Genesis 1:3 | "divine radiance emerging from darkness", "light breaking forth from the void" | Subject "divine voice", which cannot be depicted |
| 1 Samuel 17:49 | Acceptable; adds Goliath staggering, armies on the ridge, and a composition built on the sling's arc | Acceptable |

The production Joshua 1:2 plan from Super had subject "Joshua standing on the eastern bank of the Jordan River", action "receiving divine command to cross into the Promised Land", and secondary elements including Israelite tribespeople and pillars of cloud and fire.

**Constraints from OpenRouter**

- **Reasoning counts against `max_tokens`.** Reasoning tokens are output tokens and are billed. On most providers they share the request's `max_tokens`; when reasoning uses all of it, the response has `finish_reason: "length"` and empty content, and the reasoning is still billed. `exclude: true` only hides reasoning; it is still billed and still counts. ([Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#reasoning-tokens-and-max_tokens))
- **Reasoning controls.** `reasoning` takes `effort` (`max`, `xhigh`, `high`, `medium`, `low`, `minimal`, or `none`, which "disables reasoning entirely") or `max_tokens`, plus `exclude` and `enabled`. `enabled: true` means medium effort. The docs map `reasoning: { enabled: false }` only in the Anthropic Messages section, and the chat request schema in [openapi.json](https://openrouter.ai/openapi.json) lists only `effort` and `summary`. That `enabled: false` turns reasoning off for chat completions is shown by the live test and production, not by documentation. The documented `{ effort: "none" }` also returned 0 reasoning tokens from Super in a three-verse spot check with a shortened prompt; switch to it if `enabled: false` stops working.
- **Mandatory reasoning.** A catalog entry's `reasoning.mandatory: true` means the model rejects disabling. Both `openai/gpt-oss-*` models are mandatory; the tested Nemotron, Gemma and Inkling free models are not. ([Per-model reasoning options](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#discovering-per-model-reasoning-options))
- **Rate limits.** IDs ending in `:free` allow 20 requests per minute, and 50 per day if the account has purchased fewer than 10 credits in total, or 1,000 per day at 10 or more. More keys or accounts do not raise this. Paid variants have no platform request cap. A 429 can also come from the upstream provider, which fits the Gemma results. `GET /api/v1/key` reports `free_model_daily_requests`. ([Limits](https://openrouter.ai/docs/api-reference/limits), [FAQ](https://openrouter.ai/docs/faq)) Visibible's tier was not checked. The daily counter covers all free-model requests on the account. Each uncached Generation makes one planner call, so bulk generation of a long book can reach 1,000 in a day; beyond that the planner gets 429s and Generations continue unplanned.
- **Data policy.** OpenRouter does not log prompts or completions unless the account opts in ([FAQ](https://openrouter.ai/docs/faq), [data collection](https://openrouter.ai/docs/guides/privacy/data-collection)). Providers have their own policies. The account has separate settings, for paid and for free models, that allow routing to providers that may train ([provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)). The only endpoint for the Super free variant is NVIDIA under its API Trial Terms, marked `training: true` and `retainsPrompts: true` in the endpoint data on its [model page](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free). The paid variant's DeepInfra and DekaLLM endpoints are marked neither. Production calls succeed, so the account's free-model setting evidently allows training providers; the setting itself was not checked. OpenRouter states no rule that every free variant logs or trains; the policy is per endpoint.
- **Removal.** A `:free` variant is its own catalog entry. A request for a variant with no entry does not fall back to the base model; inference fails ([model variants](https://openrouter.ai/docs/guides/routing/model-variants/overview)). Free variants "may have different rate limits or availability compared to paid versions" ([free variant](https://openrouter.ai/docs/guides/routing/model-variants/free)), and "free model availability changes frequently" ([free models router](https://openrouter.ai/docs/guides/routing/routers/free-router)). The catalog's `expiration_date` is "the date after which the model may be removed" ([openapi.json](https://openrouter.ai/openapi.json), `Model` schema). On 2026-10-14 it was null for the Super free variant and 2026-10-31 for both Poolside Laguna free variants. No documented notice period for removing free variants was found.

**Re-running this evaluation**

Re-run when the planner model leaves the catalog, gains an `expiration_date`, or starts returning errors.

1. Detect. In production, find the newest `scenePlanCache` `createdAt` per `plannerModel`, and check `scenePlannerUsed` on recent generation records ([CLI access](../../docs/agents/cli-access.md)). No new rows while uncached Generations continue means the planner is skipped or failing. Since [#122](https://github.com/AustinKelsay/visibible/issues/122), the `scene_planner_outcomes_total` counter and `scene_planner.outcome` warnings show which; nothing alerts on them.
2. Shortlist free text models from `GET /api/v1/models` (no key needed) whose `reasoning` is absent or has `mandatory: false`. The request disables reasoning, so a mandatory-reasoning model fails with HTTP 400. Using one would mean changing the request to a low effort with a larger `max_tokens`, and the results above show `effort: "low"` still returns empty content sometimes.
3. Call each candidate with the real prompt on the three verses above, varying only `reasoning` (none, `{ enabled: false }`, `{ effort: "low" }`). Record valid plans, latency, `usage.completion_tokens_details.reasoning_tokens`, `finish_reason` and HTTP errors. Run the leaders twice. The Super free endpoint also lists `response_format` and `structured_outputs` ([endpoints](https://openrouter.ai/api/v1/models/nvidia/nemotron-3-super-120b-a12b:free/endpoints)); a JSON schema request is untested.
4. Compare plans for a depictable subject and the verse's actual action. John 11:35 and Genesis 1:3 separated the models in this run.
5. Check the winner's endpoint data policy on its model page and its `expiration_date`.
6. Update `DEFAULT_SCENE_PLANNER_MODEL`, the `.env` examples and the Vercel variable in every environment. The plan cache key includes `plannerModel`, so existing plans are not reused. Confirm with a new `scenePlanCache` row for the new `plannerModel` and a generation record showing `scenePlannerUsed: true`.
