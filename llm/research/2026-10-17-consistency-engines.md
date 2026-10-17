# Consistency engines

Investigated October 17, 2026, against commit `3ba118b`, for [Which engine keeps characters and locations consistent at our price and speed?](https://github.com/AustinKelsay/visibible/issues/136). Measurements cited as "live test" come from OpenRouter calls made that day. There were 23 billed calls costing $0.904 in total, plus three HTTP 429s, which were not billed. Documentation, prices and catalog records were fetched the same day; page dates are given where the page shows one.

**Recommendation**

Keep Nano Banana on the existing OpenRouter chat-completions request. Add each character's and location's reference art as `image_url` parts after the text prompt. ComfyUI is not needed. Reference art is a fixed canon asset, never an earlier verse image, so every verse stays generatable on its own and in any order.

- **Gemini 3.1 Flash Image** (`google/gemini-3.1-flash-image`, Nano Banana 2) is the documented fit. Google gives it up to 4 character references and 10 object references per request. With one to three references it cost $0.068–0.069 per image (9 credits) and took 7.1–10.1 s in the live test. That is inside the map's ceilings, but close to the 10 s edge. Google's [deprecations table](https://ai.google.dev/gemini-api/docs/deprecations) (updated 2026-10-12) names Nano Banana 2.1 as its replacement, with no shutdown date announced, so treat 3.1 Flash as the interim choice.
- **Gemini 3.1 Flash Lite Image** (`google/gemini-3.1-flash-lite-image`, Nano Banana 2 Lite), today's default, also accepts references. It stayed at 5 credits ($0.034–0.035) and took 4.5–8.2 s. Google says Lite is "Not optimized for multiple reference inputs" and gives it no character slots. In the live test it kept costumes and props, but pasted the location reference in as a fixed backdrop every time (4 of 4). With six references it also drew duplicate figures.
- **Gemini Nano Banana 2.1** (`google/gemini-nano-banana-2.1`) has Flash's reference slots at Lite's output price. OpenRouter's only endpoint for it returned 429 "rate-limited upstream" on all three calls, as on October 14 and 16. Adding Visibible's own Google key to OpenRouter ([BYOK](https://openrouter.ai/docs/guides/overview/auth/byok)) would move it onto our own Google rate limits. The fee is 5% of list price, and pay-as-you-go accounts get the first $25,000 of list-price usage each month free.

The consistency prototype should compare Lite and 3.1 Flash on the same canon; see the last section. References are cheap: each one bills as about 1,120 prompt tokens, which is $0.0003 on Lite and $0.0006 on 3.1 Flash.

ComfyUI fails three constraints:

- **Speed.** No host publishes its cold-start time, and the hosts bill model loading.
- **Price.** Holding the 10 s target needs an always-on GPU worker at $1,260–4,486 a month.
- **Licences.** Most strong open multi-reference models forbid commercial use or depend on face models that do.

The open models that are commercially usable are also sold as hosted APIs. Two were measured through OpenRouter and did no better than Nano Banana. No other hosted multi-reference model met both the 10 credit and 10 s ceilings with consistent results.

**Comparison**

Credits are what the route would charge, `ceil(usage.cost × 125)`. "Chat" means the current `POST /api/v1/chat/completions` request. "/images" means OpenRouter's separate `POST /api/v1/images`.

| Engine | Mechanism | References per request | Cost per 1K image, references included | Latency | Operating burden | Integration fit |
| --- | --- | --- | --- | --- | --- | --- |
| Nano Banana 2 Lite | Reference images in the prompt | Google: 14 objects, no character slots. OpenRouter: 14 | Live: $0.0340 (1 ref) to $0.0355 (6 refs). 5 credits | Live: 4.5–8.2 s (1–6 refs) | None new | Chat. Add `image_url` parts and an input-token quote |
| Nano Banana 2 (3.1 Flash) | Same | Google: 4 characters + 10 objects. OpenRouter: 14 | Live: $0.0681–0.0693. 9 credits | Live: 7.1–10.1 s (1–3 refs) | None new | Same |
| Nano Banana 2.1 | Same | Google: 4 characters + 10 objects. OpenRouter: 14 | List: $0.0336 output + $1.50/M input, so 3 refs add about $0.005. Billed thinking, medium by default, unmeasured | Not measured: HTTP 429 | Shared-pool 429s. BYOK needs a Google key | Same |
| Nano Banana Pro (3 Pro) | Same, plus style references | 5 characters + 6 objects + 3 style | $0.140 measured on [October 14](2026-10-14-image-models.md). 18 credits | 20 s on October 14 | None | Over the price ceiling |
| FLUX.2 [pro] | Multi-reference editing | OpenRouter: 8 | Live: $0.090 (3 refs, 2 MP output). 12 credits | Live: 20.7 s | None | Chat works. Flat megapixel billing the catalog cannot quote |
| FLUX.2 [klein] 4B | Multi-reference editing | 4 | Live: $0.016 (1 ref) | Live: 4.1 s | None | Chat works. Flat megapixel billing |
| FLUX 3 Image Klein | Multi-reference editing | 10 | Live: $0.009 (3 refs) | Live: 18.5 s | None | /images only |
| Seedream 5.0 Flash | Multi-reference generation | OpenRouter: 14 | Live: $0.018. Input images free | Live: 16.7–20.0 s | None | Chat works. Returns 2560×1440 (it ignored `image_size: "1K"` on October 14) |
| GPT Image 2 / 2.5 | Image edits | 16 | $0.053 at medium quality for 1024² plus input tokens at $8/M | 54–123 s ([Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/editing)) | None | /images only. Too slow |
| ComfyUI on Comfy API, RunPod or Modal | LoRAs, IP-Adapter, PuLID, or a multi-reference edit model | 1–10, by model | GPU compute only, my arithmetic: $0.007–0.011 per warm FLUX.1-dev image on an H100. One idle window adds $0.007–0.066. An always-on worker costs $1,260–4,486 a month | 6.5 s warm on an H100 (FLUX.1-dev text-to-image). Cold starts unpublished, model loading billed | Build and maintain images, models, nodes and LoRAs. Review licences | New provider, key and deployment |

**Live test**

- **Reference art.** Lite drew three references from text: a three-view sheet of Moses, a three-view sheet of Aaron, and an empty Pharaoh's throne hall. Each was a 1376×768 JPEG of 114–177 KB at $0.0336.
- **Verses.** Exodus 3:5, 14:21, 7:10 and 5:1 (KJV), at 16:9. Each prompt came from the real [`buildImagePrompt`](../../src/lib/image-prompts.ts) with a hand-written Scene plan, no neighbouring verses, and the Classical style profile. The four prompts were 2,607–2,794 characters before any canon was added.
- **Canon blocks.** A text canon block described each figure. An image canon block named each attached image ("Image 1: Moses. Keep his face, white hair and beard … exactly as shown") and said to use each reference only for identity. The blocks added 300–840 characters. That pushed every prompt past the 2,800-character `PROMPT_MAX_CHARS`, which the test bypassed.
- **Request.** Identical to the [route](../../src/app/api/generate-image/route.ts), except that `content` became an array: the text first, then one `image_url` part per reference. References were base64 data URLs, except for one https URL. `image_size: "1K"` was sent only to 3.1 Flash.
- **Measurements.** Time is wall-clock from the request to the full response. OpenRouter's [generation record](https://openrouter.ai/docs/api-reference/get-a-generation) reports 0.2–1 s less. Cost is `usage.cost`, which matched each generation record's `total_cost`. The record's `num_media_prompt` matched the number of references sent.

| Model | References | Calls | Time | Cost per image | Credits | Output |
| --- | --- | --- | --- | --- | --- | --- |
| Lite | None (text canon) | 6 | 3.1–5.5 s (median 3.6) | $0.0336–0.0338 | 5 | JPEG, about 200 KB |
| Lite | 1 | 2 | 4.5, 5.3 s | $0.0340 | 5 | |
| Lite | 2 (one an https URL) | 1 | 8.2 s | $0.0343 | 5 | |
| Lite | 3 | 3 | 5.3–7.1 s (median 6.1) | $0.0346 | 5 | |
| Lite | 6 | 1 | 6.0 s | $0.0355 | 5 | |
| 3.1 Flash | 1 | 1 | 8.5 s | $0.0681 | 9 | PNG, 1.6–2.8 MB |
| 3.1 Flash | 2 (one an https URL) | 1 | 10.1 s | $0.0687 | 9 | |
| 3.1 Flash | 3 | 2 | 7.1, 7.7 s | $0.0693 | 9 | |
| Nano Banana 2.1 | 1 or 3 | 3 | — | — | — | HTTP 429, "limit_source": "upstream_provider_shared_pool" |
| FLUX.2 [klein] 4B (chat) | 1 | 1 | 4.1 s | $0.016 | 2 | 1920×1072 PNG, 3.9 MB |
| Seedream 5.0 Flash (chat) | 1, 3 | 2 | 16.7, 20.0 s | $0.018 | 3 | 2560×1440 JPEG |
| FLUX.2 [pro] (chat) | 3 | 1 | 20.7 s | $0.090 | 12 | 1920×1072 PNG |
| FLUX 3 Image Klein (/images) | 3 | 1 | 18.5 s | $0.009 | 2 | 1360×768 JPEG |

One further Lite call, the Moses sheet prompt, was billed, but a script error discarded its response. Its cost is taken as $0.0337, equal to the identical rerun, and is included in the $0.904 total.

What the images showed (the images were not committed):

- **Text canon alone keeps costumes.** A one-line description in the prompt kept Moses's white beard, red mantle with an ochre border and cream tunic across three verses. It also kept Aaron's head cloth, indigo robe and saffron sash. It did not fix the shape of Moses's staff, the hall's architecture, or faces.
- **Image canon on Lite also fixes props and places, but copies the location.** The staff matched the sheet's crook, and the hall matched its columns, dais and canopied throne. All four images given the hall reference reused its exact camera position as a backdrop. That includes the one whose prompt asked for "a new camera angle", so the Scene plan's composition was ignored. Lite also added figures resembling the references: a second elder in Moses's colours in a crowd (1 reference), and with six references, a second throne and more look-alikes. In one three-reference image, Aaron's beard turned white.
- **3.1 Flash held identity the same way and handled the location better.** Of two images with the hall reference, one reused the backdrop. The other showed the same hall from a new angle without being asked. One image drew small glyph-like marks on the throne base.
- **A style reference worked on both models.** The test sent a public-domain Doré engraving ([Wikimedia URL](https://commons.wikimedia.org/wiki/File:Gustave_Dor%C3%A9_-_The_Holy_Bible_-_Plate_I,_The_Deluge.jpg)) as the style reference and the Classical Moses sheet as the character reference. Lite and 3.1 Flash both produced a monochrome engraving with Moses's crook, hair and beard intact. 3.1 Flash left an orange pillar of fire despite "no color". Google documents style references only for 3 Pro, so this behaviour is undocumented.
- **Reference art needs review.** Lite wrote "FRONT VIEW", "THREE-QUARTER VIEW" and "SIDE PROFILE" under the Aaron sheet, despite "no text".
- **Other models showed the same reference-bleed failures.**
  - Seedream 5.0 Flash gave the best three-reference image: a new viewpoint and both characters correct. It also added one look-alike scribe, and took 17–20 s.
  - FLUX.2 [pro] drew Moses twice, dropped Aaron, put Aaron's indigo and saffron on Pharaoh's court, and added a signature-like mark.
  - FLUX 3 Image Klein dressed Pharaoh in Aaron's robe and head cloth.
  - FLUX.2 [klein] 4B kept Moses, but its look was smoother and more digital than the style profile allows.
- **Faces were not tested.** The compositions were full-figure at 1K, so faces were small. An elderly white-bearded Moses is an archetype every model draws alike. This sample cannot separate face identity from costume identity.

**Nano Banana with reference images**

- **Request path.** Chat completions accepts images as `image_url` content parts, either an https URL or a base64 data URL, one part per image. The count "varies per provider and per model". OpenRouter recommends "sending the text prompt first, then the images" ([image inputs](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding)). The catalog lists `image` as an input modality for all four Google models ([models API](https://openrouter.ai/api/v1/models?output_modalities=image)). The /images endpoint records allow `input_references` up to 14 for Lite, 3.1 Flash and 2.1 ([endpoint records](https://openrouter.ai/api/v1/images/models/google/gemini-3.1-flash-lite-image/endpoints)).
- **Sources and providers.** The live test confirmed both base64 and https references. That means public Convex storage URLs could be passed instead of inlining file bytes in the Vercel function. OpenRouter serves Lite and 3.1 Flash from both Google Vertex and Google AI Studio, but 2.1 only from AI Studio.
- **Google's limits** ([image generation](https://ai.google.dev/gemini-api/docs/image-generation), updated 2026-10-09). "Nano Banana models allow you to mix up to 14 reference images", split by model:

| Model | Objects ("high-fidelity") | Characters ("to maintain character consistency") | Style references |
| --- | --- | --- | --- |
| 3.1 Flash Lite Image | Up to 14 | N/A | N/A |
| Nano Banana 2.1 and 3.1 Flash Image | Up to 10 | Up to 4 | N/A |
| 3 Pro Image | Up to 6 | Up to 5 | Up to 3 |

- **Google's consistency guidance.**
  - Its model list calls Lite "Not optimized for multiple reference inputs or multi-turn sequential editing", and credits 3.1 Flash with "multi-reference image consistency".
  - Under Limitations: "gemini-nano-banana-2.1 and gemini-3.1-flash-image support character resemblance of up to 4 characters and the fidelity of up to 10 objects in a single workflow", and "gemini-2.5-flash-image works best with up to 3 images as input".
  - Its character-consistency recipe (360° views) says to "include previously generated images in subsequent prompts". The map forbids chaining verse images, so canon reference art plays that role instead.
  - Google recommends multi-turn editing for iteration. That is also chaining, so it does not apply.
- **Input billing.** Gemini 3 models count an image at 1,120 tokens by default ([media resolution](https://ai.google.dev/gemini-api/docs/media-resolution), updated 2026-10-13). The live test matched: each reference added about 1,118 prompt tokens. OpenRouter bills these at the model's prompt rate, and lists no separate `image` price for Lite, 3.1 Flash or 2.1. Google's [pricing page](https://ai.google.dev/gemini-api/docs/pricing) (updated 2026-10-16) states the same input rates. Per reference, that is $0.00028 on Lite ($0.25/M), $0.00056 on 3.1 Flash ($0.50/M) and $0.00168 on 2.1 ($1.50/M).
- **Quotes.** The [image catalog](../../src/lib/image-catalog.ts) quote assumes 1,000 text input tokens and ignores references. Adding 1,120 tokens per reference leaves Lite at 5 credits even with 14 references. 3.1 Flash moves from 9 to 10 credits from the third reference on ($0.0724 × 125 = 9.05). Live charges stayed at 5 and 9.

**ComfyUI**

No ComfyUI trial was run. The documented costs and licences already rule it out. The two commercially usable open models that matter, FLUX.2 [klein] 4B and FLUX 3 Image Klein, were measured as hosted APIs instead.

Hosting, from each provider's pricing and docs:

| Host | GPU price | Cold start | Burden |
| --- | --- | --- | --- |
| [Comfy API](https://comfy.org/platform/comfy-api.md) serverless deployments, [launched](https://blog.comfy.org/p/comfy-api-is-live-deploy-comfyui) 2026-09-30 | RTX PRO 6000 $4.54/h, H100 $6.23/h. Model storage $0.20/GB-month | Not published. A flex worker "is billed per second from the moment it starts (including startup and model loading)" and then idles 30 s. `--min` workers are billed at all times ([docs](https://docs.comfy.org/development/serverless/overview)) | You build each release from a ComfyUI version, custom nodes and models. Workers per deployment are capped at 2, 2, 10 or 20 by plan |
| [Comfy Cloud](https://comfy.org/pricing) subscription | $20, $35, $100 or $700 a month in credits, at $4.54 per RTX PRO 6000 hour | Not published | Custom LoRAs from the Creator plan up. Standard includes 2 API deployments of up to 2 workers each. Trial: "5 free runs on real GPUs" |
| [RunPod Serverless](https://www.runpod.io/pricing) (updated 2026-10-08) with [worker-comfyui](https://github.com/runpod-workers/worker-comfyui) | H100 $4.79/h, L40S $1.75/h | Not published. Active workers default to 0; they are "Always-on workers (eliminates cold starts)" ([endpoint settings](https://docs.runpod.io/serverless/endpoints/endpoint-configurations)) | You maintain the Docker image, models and nodes. Request bodies are capped at 10 MB (`/run`) and 20 MB (`/runsync`) |
| [Modal](https://modal.com/pricing) | H100 $0.001097/s, L40S $0.000542/s | Not published for ComfyUI. Memory snapshots make "initialization-heavy Functions" start "3-10x faster", but "GPU Memory Snapshots do not speed up model loading from storage" ([memory snapshots](https://modal.com/docs/guide/memory-snapshots)) | You maintain everything |

- **Speed.** A vendor benchmark ([TheStageAI](https://huggingface.co/TheStageAI/Elastic-FLUX.1-dev)) times FLUX.1-dev at 1024² and 28 steps at 6.46 s on an H100 and 16 s on an L40S. Only a warm H100 meets 10 s. No host publishes a cold-start time, and each cold start loads a 4–32B checkpoint into GPU memory.
- **Cost, my arithmetic.** Warm H100 compute is $0.007–0.011 per FLUX.1-dev image. After a lone request, the idle window adds $0.007 (RunPod, 5 s), $0.052 (Comfy API, 30 s) or $0.066 (Modal's default 60 s, per its [cold start guide](https://modal.com/docs/guide/cold-start)). An always-on worker for 720 hours a month costs $1,260 on a RunPod L40S, $2,843 on a Modal H100, $3,449 on a RunPod H100 and $4,486 on a Comfy API H100. At Lite's $0.034, $1,260 buys about 37,000 images a month. The [October 14 evaluation](2026-10-14-image-models.md) counted 157 production Generations across the four models then in use.
- **Partner nodes add nothing.** Comfy's [partner nodes](https://docs.comfy.org/tutorials/partner-nodes/pricing) and Comfy Router call the same third-party APIs, including Nano Banana 2 Lite, FLUX.2 [pro] and Seedream, priced in Comfy credits. They offer nothing OpenRouter lacks.

Techniques and licences. Licence values were checked against each model card's metadata on Hugging Face:

| Technique | What it keeps | Per-character setup | Commercial use of the weights |
| --- | --- | --- | --- |
| Character or style LoRA | Identity or style, learned | Training per character per style, at least 10 images each ([fal klein trainer](https://fal.ai/models/fal-ai/flux-2-klein-4b-base-trainer/llms.txt)). FLUX.1-dev LoRA training is $2 a run on [fal](https://fal.ai/models/fal-ai/flux-lora-fast-training) | Follows the base model |
| IP-Adapter | Image as prompt | None | SD 1.5 and SDXL: [Apache-2.0](https://huggingface.co/h94/IP-Adapter). FLUX versions ([XLabs](https://huggingface.co/XLabs-AI/flux-ip-adapter-v2), [InstantX](https://huggingface.co/InstantX/FLUX.1-dev-IP-Adapter)) inherit FLUX.1 [dev]'s non-commercial licence |
| PuLID, InstantID | Faces only | None | Both need insightface face models, which are "for non-commercial research purposes only" ([insightface](https://github.com/deepinsight/insightface)). [InstantID](https://github.com/instantX-research/InstantID) checkpoints are research-only |
| ControlNet | Pose and structure, not identity | None | Varies; FLUX Canny [dev] is non-commercial |
| FLUX.1 Kontext [dev] | Multi-reference editing | None | [Non-commercial](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev) |
| FLUX.2 [dev] (32B) | Up to 6 references recommended | None | [Non-commercial](https://huggingface.co/black-forest-labs/FLUX.2-dev) |
| FLUX.2 [klein] 4B | Up to 4 references | None | [Apache-2.0](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B) |
| FLUX 3 Image Klein (October 2026) | Up to 10 references | None | [FLUX Kommunity](https://huggingface.co/black-forest-labs/flux-3-image-klein/blob/main/LICENSE.md): outputs may be used commercially only by a "Qualifying User" with gross annualized revenue below US$5,000,000 |
| Qwen-Image-Edit-2509 and 2511 | 1–3 references "optimal" | None | [Apache-2.0](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) |
| Qwen-Image-2.1 | Up to 10 references | None | [Qwen Research Licence](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE), non-commercial |

LoRAs are the one technique only self-hosting offers. They also multiply setup: every canon entry needs about 10 training images and a training run in each of three styles. They also require the always-warm GPU above.

**Other hosted multi-reference models**

Prices are from each provider's pricing page. OpenRouter paths are from its [catalog](https://openrouter.ai/api/v1/images/models) and the live test.

- **FLUX.2 (Black Forest Labs).**
  - fal states FLUX.2 [pro] edits "cost $0.03 for the first megapixel of output, plus $0.015 per extra megapixel of input and output, rounded up" ([fal](https://fal.ai/models/fal-ai/flux-2-pro/edit)). BFL's own [pricing page](https://docs.bfl.ml/quick_start/pricing) loads its FLUX.2 rates in the browser, and its text could not be read.
  - OpenRouter's FLUX.2 [pro] [record](https://openrouter.ai/api/v1/images/models/black-forest-labs/flux.2-pro/endpoints) lists only $0.03 per output megapixel. The live call nevertheless cost $0.09, which matches fal's input charge.
  - OpenRouter lists [klein] 4B at $0.014 per output megapixel with up to 4 references. It lists [flex] at about $0.06 and [max] at about $0.07 per output megapixel, both before input charges.
  - All of them have flat image or megapixel prices that the [image catalog](../../src/lib/image-catalog.ts) has no verified unit for.
- **FLUX 3 Image Klein** costs $0.009 per 1K image at BFL, and "Text to image and image editing cost the same" ([BFL pricing](https://docs.bfl.ml/quick_start/pricing)). It takes up to 10 references, and on OpenRouter it is reachable only through /images ([record](https://openrouter.ai/api/v1/images/models/black-forest-labs/flux-3-image-klein/endpoints)).
- **FLUX.1 Kontext [pro] / [max]** take one image plus three marked "Experimental Multiref" ([BFL API](https://api.bfl.ai/openapi.json)). They are not on OpenRouter.
- **Seedream 5.0 Flash** costs $0.018 per output image, with input images at $0 and up to 14 references ([OpenRouter record](https://openrouter.ai/api/v1/images/models/bytedance-seed/seedream-5-0-flash/endpoints)). Seedream 4.5 and 5.0 Lite cost $0.035–0.040, and [Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/editing) times 4.5 at 11.6 s. 5.0 Pro adds $0.003 per input image and takes 56 s.
- **GPT Image 2 / 2.5** accept "up to 16 images" on `images/edits` ([edit reference](https://developers.openai.com/api/reference/cli/resources/images/methods/edit/index.md)). At 1024² medium quality, GPT Image 2 costs $0.053 ([image generation](https://developers.openai.com/api/docs/guides/image-generation)), plus image input at $8/M tokens ([pricing](https://developers.openai.com/api/docs/pricing)). Generation takes 54–123 s. On OpenRouter they are /images only.
- **Qwen Image 3** takes 4 references at $0.03 plus $0.003 per input image, through /images only ([record](https://openrouter.ai/api/v1/images/models/qwen/qwen-image-3/endpoints)). It was not measured; Artificial Analysis times it at 5.8 s for text only.
- **Runway Gen-4 References** take 3 references at $0.05–0.08 ([Runway pricing](https://docs.dev.runwayml.com/guides/pricing/)). **Ideogram Character** takes 1 reference at $0.10–0.20 on [Replicate](https://replicate.com/ideogram-ai/ideogram-character). Neither is on OpenRouter.

**What the prototype should test**

For [Does the chosen engine hold characters and locations steady across verses and art styles?](https://github.com/AustinKelsay/visibible/issues/142):

1. **Lite against 3.1 Flash, on identical canon and prompts.** Retry Nano Banana 2.1 first. If it still returns 429, decide whether a Google BYOK key is acceptable. A third arm worth one run: Lite for verses with one canon reference, and 3.1 Flash when there are more.
2. **Text canon against image canon.** Text descriptions alone kept costumes consistent here. The value of references is in faces, props and places, so judge those separately.
3. **A character with a distinctive face**, alongside Moses, in at least one close or medium shot. That separates face identity from costume.
4. **Location references in two forms:** one establishing view, and two or three views from different angles. Count how often the output reuses a reference's viewpoint and ignores the Scene plan's composition. Lite did so 4 of 4 times here.
5. **Duplicates and attribute bleed at 1, 3 and 5 references.** Look for extra look-alike figures, and for one character's clothing appearing on another. Cap references per image at the count where this starts.
6. **Art styles.** Compare a sheet made in each style with a Classical sheet plus a style reference image. The Classical sheet carried Moses's shape into an engraving here, but lost his colours.
7. **Reference art production.** Check each sheet for drawn labels or text before it becomes canon. A sheet costs $0.034 on Lite or $0.068 on 3.1 Flash.
8. **Latency at p50 and p90,** with references sent as base64 against Convex storage URLs. Only one URL-reference call per model was timed here: 8.2 s on Lite and 10.1 s on 3.1 Flash.
9. **Prompt budget.** The canon block adds 300–840 characters to prompts already at 2,600–2,800. Measure the quality cost of trimming other blocks, and how the cost changes as `PROMPT_MAX_CHARS` is raised.
10. **Charges.** Record `usage.cost`, `prompt_tokens` and `num_media_prompt` for every image. Confirm that each reference adds about 1,120 prompt tokens and that the Quote, with references counted, stays at or below 10 credits.

**Not verified**

- Nano Banana 2.1's latency, thinking-token cost and reference quality: it returned 429 on every call.
- Cold-start times for any ComfyUI host.
- Multi-reference latency of FLUX.2 [dev] or Qwen-Image-Edit on rented GPUs.
- BFL's prices for commercial licences of its [dev] weights.
- Whether a FLUX Kommunity "Qualifying User" may run the model in Visibible's production; this needs legal review.
- The live samples are small (one to three images per configuration), so the failure rates above are indications, not measurements.
