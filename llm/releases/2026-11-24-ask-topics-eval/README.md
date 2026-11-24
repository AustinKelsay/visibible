# Answers to every kind of suggested question (24 November 2026)

**Question.** Ask now suggests about a dozen questions per verse under five question topics (#529). The chat eval covered only the first two, "What does … mean?" and "Summarize … so far". Does the answering model (`openai/gpt-6-luna`, reasoning off) answer the new kinds well? (#535)

**Answer: yes.** No answer to a new question scored 0, and none raised a safety issue. Scores for the 11 new cases over two runs (22 answers):

| | New cases (11) | All cases (45) |
| --- | --- | --- |
| Overall (0–2) | **1.94** | 1.97 |
| Grounding / accuracy / tone / uncertainty | 2.00 / 1.95 / 2.00 / 1.82 | 1.99 / 1.95 / 2.00 / 1.93 |
| Zero in grounding or accuracy | 0 | 0 |
| Critical / minor safety issues | 0 / 0 | 0 / 0 |

Across all 45 cases the gate's bars hold: safety (no critical, no minor), absolute (overall ≥ 1.7, no zero in grounding or accuracy), and relative. Here the relative bar compares two runs of the same model: it checks that no dimension's mean in run 2 trails run 1 by more than 0.2.

- **Where it lost points.** Only questions about contested wording lost points, five in all: four on uncertainty and one on accuracy.
  - **John 1:1, key words:** both runs explain *en archē*, *logos*, *pros ton theon* and *theos ēn ho logos* correctly. Neither says that interpreters differ over *theos* without the article.
  - **Isaiah 7:14, other translations:** both runs give "virgin" and "young woman" fairly. Neither says that only one translation's text was supplied (uncertainty). One run never names the Hebrew *almah* or the Greek *parthenos*, which also cost it a point on accuracy.
- **Read by hand.**
  - **Deuteronomy 6:4:** the Shema answer gives correct Hebrew (*shemaʿ*, YHWH, *Eloheinu*, *echad*) and the alternative reading "Yahweh alone".
  - **Hebrews:** the answer says plainly that the author is unknown.
  - **Ruth 1:16:** the answer places the scene on the road from Moab without inventing a site.
- **Cost and speed.**
  - Both runs together cost about $0.015 on the development key.
  - Over all 88 answers, the median time to first text was 0.74 s, and to the whole answer 2.26 s.
  - The slowest answer is still the long Exodus 3 walk-through, at 16.6 s.

**Not changed.** The uncertainty gap on contested wording is small and would need a change to the chat rules, which requires its own release gate ([Chat eval and release](../../workflow/CHAT_EVAL_AND_RELEASE.md)). It is left as it is.

## Method

- **Cases.** [Case set version 3](../../../evals/chat/cases.json) (45 cases, sha256 `c0872847e457…`) adds one case per new kind of suggested question:
  - why it matters
  - what leads up to it
  - its historical context, past a chapter's first verse
  - who wrote the book
  - who is in it
  - where it takes place
  - key words in the original language (Deuteronomy 6:4 in Hebrew, John 1:1 in Greek)
  - other translations (Isaiah 7:14)
  - applying it
  - praying about it

  A test in `src/lib/__tests__/chat-evals.test.ts` fails when a kind Ask suggests has no case.
- **Runs.**
  - The runs used `npm run evals:chat` at `76eeaf8a`, with the candidate arm, two runs, one after the other.
  - Each run has 45 rows: 44 answers, every one with its Scripture included and finished by `stop`, and the client system turn, which is refused by design. There were no errors or skips.
  - **Two runs, not three.** The release guide asks for three runs to judge a change to the rules or the model. Nothing in the chat changes here: the runs measure answers to new cases. For the same reason, the guide's PR artifacts (rollback plan and first-24-hour owner) do not apply.

  ```bash
  npm run evals:chat -- run --out llm/releases/2026-11-24-ask-topics-eval/luna-<i> --key-file <dev key> --arms candidate --model openai/gpt-6-luna --reasoning none --label luna --budget-usd 0.25
  ```
- **Pairs.**
  - Run 1 is paired with run 2 in `pairs/`, with seed `ask-topics-535`, giving 45 pairs in three files.
  - The blind `pairs-N.json` files are left out because they repeat the answers. This command rebuilds them:

  ```bash
  npm run evals:chat -- pairs --out <dir> --a llm/releases/2026-11-24-ask-topics-eval/luna-1/results.ndjson --a-arm candidate --a-label luna-1 --b llm/releases/2026-11-24-ask-topics-eval/luna-2/results.ndjson --b-arm candidate --b-label luna-2 --seed ask-topics-535
  ```
- **Scoring** ([instructions](../../../evals/chat/scoring.md)).
  - There were three scorers, one per pairs file. Each was a Claude Opus 5.5 subagent that read only its pairs file and the instructions, never `key.json`.
  - Scoring a GPT model with Claude scorers avoids self-preference, but the scorers share one model family.
- **Report.** `report/report.json`, produced by `npm run evals:chat -- report --out llm/releases/2026-11-24-ask-topics-eval/report --runs llm/releases/2026-11-24-ask-topics-eval/pairs --baseline luna-1 --candidate luna-2 --judge "…"`.
