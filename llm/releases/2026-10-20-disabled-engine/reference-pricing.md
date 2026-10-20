# Reference input pricing evidence

Observed 2026-10-20. This supports a billing correction for #183; it is not production reservation/settlement proof or release acceptance.

The live OpenRouter Lite catalog lists `prompt: 0.00000025`, `completion: 0.0000015` and `image_output: 0.00003` (USD per token), with no `image` field. The old generic quote returned null whenever references were attached. The evaluation harness retained the resulting images and actual charges, but the production admission path would refuse those requests before image generation.

[Google's pricing](https://ai.google.dev/gemini-api/docs/pricing) gives Lite the same $0.25/M rate for text and image input. [Google's media-resolution contract](https://ai.google.dev/gemini-api/docs/media-resolution) assigns 1,120 tokens per image at the default Gemini 3 resolution. The current OpenRouter chat request leaves media resolution at that default. The verified Gemini 3.1 Flash family can therefore quote references using `reference count × 1,120 × prompt rate` when the catalog omits a separate input-image price. An explicit price takes precedence. Other model families are unchanged.

The [checked source fixture](../../../tests/fixtures/lite-reference-pricing.json) retains the catalog capture, nine completed evaluation request IDs, actual model, prompt lengths, reference counts, native token usage and actual charges. These are the first repeats of three Holmes cases in three styles, queried through OpenRouter's generation-details endpoint. No new image calls were made for this correction. The reported provider model was `google/gemini-3.1-flash-lite-image-20260630`.

All nine calls carried two or three references. Each actual charge reconciles to `native input tokens × 0.00000025 + 1,120 output image tokens × 0.00003`. The new prompt-aware estimates cover those observed charges with less than $0.001 variance and quote five credits after the existing 25% markup and one final rounding. This small sample supports the pricing units; it does not prove a maximum spend or validate every possible prompt.

The original evaluation records keep their null quotes. The fixture test is an offline comparison against the corrected policy, not a rewrite of historical estimates. A request-path integration test verifies that a reference-bearing Lite request with this catalog shape reaches one image call, reserves credits, persists the new billing commitment and settles from actual usage; owner preparation stays in its separate ledger. Real production accounting remains a release check.

Policy version: `google-input-output-tokens-2026-10-20`. A future request media-resolution change needs a corresponding policy update. Accepted request replays and saved images retain their original commitments and charges.
