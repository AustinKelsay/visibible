# Image models

Investigated October 14, 2026, against commit `59d899c`. Measurements cited as "live test" come from OpenRouter calls made that day with real production prompts. Leaderboard figures were gathered the same day; Artificial Analysis shows no update date, and the LMArena figures come from its Hugging Face dataset snapshot of 2026-10-07.

**Recommendation**

Use `google/gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) as `DEFAULT_IMAGE_MODEL`. Against the previous default, `google/gemini-2.5-flash-image`, it was twice as fast in the live test (median 3.8 s against 7.5 s) and cost slightly less ($0.0338 against $0.0389 per image). Both leaderboards also rank it well above the previous default. Each Generation still charges 5 credits, and its pre-generation Quote drops from 6 credits to 5. Google names it as the replacement for the deprecated 2.5 Flash Image.

It supports only 1K. Users who want 2K or 4K choose Gemini 3.1 Flash.

**Live test**

- Prompts: the stored production prompts for Joshua 1:2 (16:9, prompt version `2026-09-08-canonical`, with a scene plan), Acts 1:9 (3:2) and Genesis 1:3 (16:9). The last two use prompt version `2026-03-19`.
- Request: identical to the [route](../../src/app/api/generate-image/route.ts). That is `modalities: ["image", "text"]` and `image_config.aspect_ratio`, with `image_size: "1K"` sent only to models that support more than one resolution. Image-only models were sent `modalities: ["image"]`.
- Cost is `usage.cost` from the response. Credits are what the route would charge: `ceil(cost × 125)`.

| Model | Median time (calls) | Cost per image | Credits | Notes |
| --- | --- | --- | --- | --- |
| `google/gemini-3.1-flash-lite-image` | 3.8 s (5; 3.4–6.8) | $0.0338 | 5 | 1,120 image tokens at every ratio. Returns JPEG (~200 KB). 2K and 4K rejected with HTTP 400 |
| `google/gemini-2.5-flash-image` | 7.5 s (4; 7.1–7.5) | $0.0389 | 5 | 1,290 image tokens. PNG (~1.5 MB). Production average over 134 Generations was 11.3 s |
| `google/gemini-3.1-flash-image` | 10.7 s (3) | $0.0675 | 9 | |
| `google/gemini-3-pro-image` | 20.0 s (3; 18.6–26.2) | $0.140 | 18 | About 370 reasoning tokens per call |
| `google/gemini-nano-banana-2.1` | — | — | — | HTTP 429 "rate-limited upstream" on all 19 calls over about 8 minutes. Single Google AI Studio endpoint |
| `bytedance-seed/seedream-5-0-flash` | 17.6 s (3) | $0.018 | — | Ignored 1K and returned 2560×1440 |
| `microsoft/mai-image-2.6-flash` | 10.9 s (3) | $0.017–0.020 | — | Photographic look, against the style profile |
| `x-ai/grok-imagine-image-2.0` | 16.6 s (3) | $0.040 | — | |
| `black-forest-labs/flux.2-klein-4b` | 4.8 s (3) | $0.015 | — | Rendered garbled verse text in the image. Drew the wrong scene for Acts 1:9 |

`openai/gpt-image-2`, `openai/gpt-image-2.5-flare`, `black-forest-labs/flux-3-image`, `qwen/qwen-image-3` and `krea/krea-2-medium-turbo` returned HTTP 404 from chat completions. The error said each is "an image generation model and cannot be used with the chat/completions endpoint" and to use `/api/v1/images`.

The four Google models produced comparable compositions, and none drew text. Pre-generation Quotes, which include the 1,000 text-input and 1,000 text-output token allowance, are 5 credits for Lite, 6 for 2.5 Flash, 9 for 3.1 Flash and 19 for 3 Pro.

**Leaderboards**

| Model | [Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/text-to-image) Elo | [LMArena](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset) art category (rank) |
| --- | --- | --- |
| GPT Image 2.5 Sunburst | 1217 | 1394 (1) |
| GPT Image 2.5 Flare | 1207 | 1372 (2) |
| Nano Banana 2.1 | 1172 | 1277 (9) |
| Nano Banana 2 (3.1 Flash) | 1138 | 1239 (15) |
| Nano Banana Pro (3 Pro) | 1115 | 1224 (18) |
| Nano Banana 2 Lite (3.1 Flash Lite) | 1106 | 1256 (13) |
| Nano Banana (2.5 Flash) | 984 | 1146 (40) |

The art category is the closest match to the classical painterly style profile. The top-ranked GPT Image 2.5 models take 53–125 s per image and cost about $0.21, according to Artificial Analysis.

**Deprecations**

Google's [deprecations table](https://ai.google.dev/gemini-api/docs/deprecations), last updated 2026-10-12, lists:

- `gemini-2.5-flash-image`: shuts down March 15, 2027. Replacement `gemini-3.1-flash-lite-image`.
- `gemini-3.1-flash-image`: no shutdown date. Replacement `gemini-nano-banana-2.1`.
- `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview`: shut down June 25, 2026. OpenRouter still lists both, but [`fetchImageModels`](../../src/lib/image-models.ts) hides them because their stable IDs exist.

The [pricing page](https://ai.google.dev/gemini-api/docs/pricing), last updated 2026-10-14, instead gives October 2, 2026 as the 2.5 Flash Image shutdown date. OpenRouter still served it on October 14.

**Not adopted**

- **Nano Banana 2.1** ranks highest among the Google models, and its 1K list price ($0.0336) matches Lite's. It could not be measured, so its token counts and latency are unverified. Google's image-generation and pricing pages disagree on its 4K token count (2,520 against 3,780), and it thinks at medium effort by default, with billed thinking tokens. Add it to the registry after a successful live test.
- **Non-Google models** need work beyond a registry entry. Several are served only by `/api/v1/images`. The ones that work over chat completions bill a flat price per image, which OpenRouter expresses as a per-token rate times a fixed 4,175 tokens; the [image catalog](../../src/lib/image-catalog.ts) has no verified unit for that. Some also lack 21:9. The models that worked over chat completions were also slower than Lite or broke the style rules.
- **The catalog request** omits `output_modalities=image`, so `/api/v1/models` returns only the 12 models that can also output text. Image-only models such as FLUX, Seedream and GPT Image never appear in the selector.

**Saved preferences**

[PreferencesProvider](../../src/context/preferences-context.tsx) writes every preference, including `imageModel`, whenever any one of them changes. A returning visitor who had ever changed translation, ratio or resolution therefore had `google/gemini-2.5-flash-image` saved, and would have kept it after the default changed. Production had 133 Generations with 2.5 Flash Image, 18 with 3 Pro Image Preview, 5 with GPT-5 Image and 1 with 3.1 Flash Image Preview. Only 2.5 Flash Image was used in the 60 days before October 16.

Saves now also record `defaultImageModel`, and a saved model equal to it follows the current default; see [Preferences](../context/PREFERENCES.md). This moves every visitor saved on 2.5 Flash Image to Lite once, including any who chose it deliberately. They can choose it again, and that choice then persists.

**List changes (October 16)**

- **Gemini 3 Pro Image** (stable and preview) was removed from the registry. It cost about four times Lite's price, took 20 s, and ranks below Lite on both leaderboards. A visitor with it saved is asked to choose another model.
- **Models outside the registry** are no longer listed. Previously the selector showed every catalog image model and disabled the unverified ones, such as GPT-5 Image. Registered models without a usable catalog price remain listed and disabled.
- **Nano Banana 2.1** was retried on October 16 and again returned HTTP 429, "rate-limited upstream", from OpenRouter's shared Google AI Studio pool. Its catalog image output rate, $0.00003 per token, is half of Gemini 3.1 Flash's, so it would cut 2K and 4K costs if it becomes reliably available.

**Re-running this evaluation**

Re-run when the default gains a shutdown date or leaves the catalog, or when a new Google image model appears in `GET /api/v1/models`.

1. List image models with `GET https://openrouter.ai/api/v1/models?output_modalities=image` (no key needed). Without the parameter, image-only models are omitted.
2. Take three stored prompts from production `verseImages` ([CLI access](../../docs/agents/cli-access.md)). Send each one to every candidate exactly as the route does. Record time, `usage.cost`, `completion_tokens_details.image_tokens`, output dimensions, and any error.
3. Compare the images at full resolution. Look for drawn text, frames or borders, and a photographic look, all of which the prompt forbids, as well as faithfulness to the verse.
4. Check the candidate's `image_size` support. An unsupported size returns HTTP 400 naming the supported models. Confirm that each candidate's per-resolution image token counts match the [image catalog](../../src/lib/image-catalog.ts) entry.
5. Update `OUTPUT_TOKENS`, `DEFAULT_IMAGE_MODEL`, the catalog snapshot in `tests/fixtures/image-catalog.json`, and the shared test fixture's default ID.
