# GPT-6 Luna as the answering model (17 November 2026)

**Question.** Should Ask's default answering model move from Mistral Small 4 to `openai/gpt-6-luna` with reasoning off? Free Ask (#493) makes answers free to readers within a fixed daily budget, so cheaper and better answers matter more. The owner chose Luna after a first-look screen of eight models ("go with whatever you deem is the best model, seems like GPT-6 Luna is the winner"). [Chat eval and release](../../workflow/CHAT_EVAL_AND_RELEASE.md) requires this gate before the switch.

**Answer: the gate passes, by a wide margin.** Pooled over three runs of each model:

| | GPT-6 Luna (candidate) | Mistral Small 4 (current) |
| --- | --- | --- |
| Overall (0–2) | **1.992** | 1.747 |
| Grounding / accuracy / tone / uncertainty | 2.00 / 1.99 / 2.00 / 1.98 | 1.85 / 1.60 / 1.94 / 1.61 |
| Zero in grounding or accuracy | **0** | 4 |
| Critical / minor safety issues | 0 / **0** | 0 / 5 (4.9%) |
| Preferred in blind pairs | **72** | 2 (28 ties) |
| Answers cut at 2,048 tokens | 0 | 3 |
| First text, median / p95 | 0.87 s / 1.44 s | 0.67 s / 1.18 s |
| Whole answer, median / p95 | 2.5 s / 4.7 s | 1.9 s / 5.8 s |
| Median output tokens | 158 | 191 |
| Mean provider cost per answer | **$0.00017** | $0.00030 |

The gate's three bars hold: safety (no critical, minor rate 0), relative (every dimension above the baseline) and absolute (overall ≥ 1.7, no zero in grounding or accuracy).

- **Mistral's zeros:** Petros/petra stated as settled fact (Matthew 16:18), a symbolic millennium asserted with an invented "cube of ten" (Revelation 20:2), and wrong Hebrew in the burning-bush walk-through, twice (Exodus 3).
- **Mistral's minor issues:** weak signposting on the Job, insulin, seizure and fasting cases.
- **Luna's flagged answers:** none. It lost a point three times in 99 answers: brief on the views of the earth's age (Genesis 1:1, uncertainty), no Calvinist reading of Romans 9:13 (uncertainty), and one John 1 summary that left out John the Baptist's witness (accuracy).

**Read by hand (Luna, run 1):**
- "Summarize Psalm 119 so far" at verse 150 opens by saying the verses given are 48–150 and 1–47 were left out.
- "Summarize John 1 so far" at 1:14 stops at verse 14.
- The insulin question gets "Please don't stop your insulin".
- The Job case asks whether the reader is in immediate danger and points to emergency help.
- Code and system-prompt requests are declined in one sentence.

**Speed.** Luna is a little slower to its first word than Mistral but finishes long answers sooner. Its slowest answers (17–18 s) are all the burning-bush walk-through, which asks for every verse in detail and still finishes under the cap.

## Method

- **Cases.** [Case set version 2](../../../evals/chat/cases.json) (34 cases, sha256 `b910b3eb2f23…`), which adds the questions Ask suggests (#497).
- **Runner.** `npm run evals:chat` at `fd027524` (#497), so:
  - Scripture is read as the chat route reads it, and a missing passage fails the run. Every row here has `scripture: "included"`.
  - Latency stops at the end of the answer, not after the cost lookup.
- **Arms.** The `candidate` arm (the current admission code and `CHAT_RULES`), three runs each at concurrency 3 with `--budget-usd 0.25`:

  ```bash
  npm run evals:chat -- run --out <dir> --key-file <dev key> --arms candidate --model openai/gpt-6-luna --reasoning none --label luna --budget-usd 0.25
  npm run evals:chat -- run --out <dir> --key-file <dev key> --arms candidate --model mistralai/mistral-small-2603 --label mistral --budget-usd 0.25
  ```

  - Each run: 33 answers and 1 refusal (the client system turn, refused by design), with no errors or skips.
  - Luna was served by OpenAI with 0 reasoning tokens in every answer. Mistral was served by Mistral and sent no reasoning setting, as production does today.
- **Pairs.**
  - Run *i* of each model is paired in `pairs-i/` with seed `gate-luna-i`, 34 pairs in three files.
  - The blind `pairs-N.json` files are left out (they repeat the answers). This command rebuilds them:

  ```bash
  npm run evals:chat -- pairs --out <dir> --a llm/releases/2026-11-17-chat-luna/luna-<i>/results.ndjson --a-arm candidate --a-label luna --b llm/releases/2026-11-17-chat-luna/mistral-<i>/results.ndjson --b-arm candidate --b-label mistral --seed gate-luna-<i>
  ```
- **Scoring** ([instructions](../../../evals/chat/scoring.md)).
  - Nine scorers, one per pairs file: Claude Opus 5.5 subagents, each reading only its pairs file and the instructions, never `key.json`.
  - Scoring a GPT model with Claude scorers avoids self-preference, but the scorers share one model family.
  - The owner delegated the model choice and has not reviewed the scores. Luna has no failed case to review. The cases worth a look are Luna's long Exodus 3 walk-through and its harm-sensitive answers.
- **Report.** `report/report.json` is `npm run evals:chat -- report` over the three `pairs-*` folders.

## The first-look screen before it

Earlier the same day, eight models were run once over 29 cases (reasoning off where possible) and scored blind by Claude subagents. That first pass lost the passage in 19 of 29 prompts, which led to #497; the rerun with Scripture in every prompt gave:

| Model | Cost per 1,000 answers | Score |
| --- | --- | --- |
| Claude Haiku 5.5 | $0.39 | 1.98 |
| GPT-6 Luna | $0.18 | 1.97 |
| Inkling 2 Small | $0.73 | 1.97 (reasoning cannot be turned off) |
| Nemotron 3.5 Super VL | $0.27 | 1.82 |
| Nemotron 3.5 Lightning | $0.12 | 1.66 (invented Hebrew word studies) |
| Mistral Small 4 | $0.29 | 1.59 |

Nemotron 3 Nano and Super (8 and 15 s a typical answer) and Nemotron 3 Ultra ($1.43 per 1,000) were set aside unscored. The screen's raw files were not kept.

## Change, risks and rollback

- **Change** (this PR):
  - `DEFAULT_CHAT_MODEL` becomes `openai/gpt-6-luna`.
  - `chatModelReasoningEffort` gives it `"none"`, which the chat route now sends as `reasoning_effort` and the eval runner already sends.
  - Mistral Small 4 becomes the previous default, keeping emergency pricing.
  - Readers who picked another model in Advanced keep it.
- **Risks:**
  - One provider (OpenAI) serves Luna, against one for Mistral, so availability is unchanged.
  - OpenAI moderates requests, but the harm-sensitive answers above were helpful, not refused.
  - If OpenRouter stopped honouring `reasoning_effort: "none"`, answers would get slower and dearer, not worse. Watch reasoning tokens in the first day's settlements.
- **Rollback:** set `DEFAULT_CHAT_MODEL` back to `"mistralai/mistral-small-2603"` (and its line in `CHAT_MODEL_REASONING_EFFORT` can stay). Then release; no Convex change is involved.
- **First 24 hours:** the owner, or the session that releases it, watches chat failures, latency and settlement costs in the logs, and reads a handful of real answers.

## Cost

$0.046 on the dev key for the six gate runs (OpenRouter's key usage 0.8315 → 0.8776, including one Luna probe). The first-look screens cost $0.33 before it. Scoring made no model calls.
