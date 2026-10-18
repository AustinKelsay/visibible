---
status: accepted
date: 2026-10-17
---

# Consistent verse images come from canon and reference images, not a continuity engine

The [S07 spec](https://github.com/AustinKelsay/visibible/issues/51) listed "a general cross-chapter character/scene continuity engine" as out of scope. The [art styles and consistency map](https://github.com/AustinKelsay/visibible/issues/135) now needs the same **character**, **location** and **section look** across verse images in three **art styles**, so this record narrows that exclusion.

Consistency comes from fixed inputs on the existing OpenRouter image request. It does not come from a new engine or from chaining images.

- **Canon text:** the written canon of the verse's characters and locations goes in the prompt.
- **Reference images:** up to three approved images are sent as `image_url` parts. They are **reference sheets** for the characters and location, and a **style reference** for non-Classical styles.
- **Model:** the default stays Nano Banana 2 Lite (`google/gemini-3.1-flash-lite-image`).
- **Independence:** every verse is still generated on its own, in any order. References are approved repo assets, never earlier verse images.

## Consequences

- **The S07 exclusion is narrowed, not removed.** Consistency covers canon characters, canon locations and one story section at a time. Minor and unnamed figures stay generic, and there is still no general engine that carries state from one image into the next.
- **Price stays at today's level on Lite, and speed stays within the limit.** In the prototype, canon text and references kept Lite at 5 credits. Latency rose from about 4 s to p50 5.0 s and p90 6.6 s, still under the 10 s limit. Quotes and fallback charges now count reference images and the real prompt length.
- **ComfyUI was rejected.**
  - It suffers cold starts.
  - A warm GPU would cost $1,260–4,486 a month.
  - Most multi-reference weights and face models carry non-commercial licences.

  FLUX.2, FLUX 3 Klein and Seedream were measured too. None met both 10 credits and 10 s with consistent results.
- **Gemini 3.1 Flash is not used for verse images.** It keeps every art style best, but costs 9 credits, and its p90 was 10.6 s against a 10 s limit. It is used only to draft reference sheets, a one-time setup cost that Visibible pays.
- **Nano Banana 2.1 is the target once it stops returning HTTP 429.** At its prices, a quote with three references would be about 7 credits instead of 6.
- **Canon and reference sheets are reviewed repo data.** The owner approves each entry and sheet in a pull request. A check fails when a sheet was drawn from an older canon entry.
- **Known limits accepted:**
  - Lite copies a location sheet's framing in about 14 of 18 images.
  - Small facial marks don't show at 1K.
  - Without a style reference, Classical sheets pull other styles toward painting, so non-Classical styles always send their style reference.

Evidence:
- The [engine research](https://github.com/AustinKelsay/visibible/blob/research/consistency-engines/llm/research/2026-10-17-consistency-engines.md) ([#136](https://github.com/AustinKelsay/visibible/issues/136)).
- The [consistency prototype](https://github.com/AustinKelsay/visibible/tree/prototype/consistency/src/lib/consistency.prototype-output) ([#142](https://github.com/AustinKelsay/visibible/issues/142)). It ran 134 images across five setups and four art styles, including the Icon follow-up.
