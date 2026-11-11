# Chat model and prompt comparison (11 November 2026)

**Question (#99).** Can the chat stop inventing Scripture references without losing safety, through a prompt rule, another model of the same price, or both? The owner asked to continue after the [admission eval](../2026-11-11-chat-admission/README.md), which found `openai/gpt-oss-120b` inventing cross-references and quotations in long answers.

**Answer.** `mistralai/mistral-small-2603` with the [guarded rules](guarded.txt) is the only option that passes the whole release gate. Its answers are short (median 195 output tokens against 1,460), so it fabricates far less. It costs the same list price, $0.15 and $0.60 per million tokens, and is still 1 credit a message. The rules alone also help gpt-oss a lot, but it still fails the absolute bar.

## Options

All runs used the committed [30 cases](../../../evals/chat/cases.json) through the current admission code (the `candidate` arm of `npm run evals:chat`). Each option was run three times. Each run was paired blind against one of the three gpt-oss runs from the admission eval, scored by six Claude scorers following [the instructions](../../../evals/chat/scoring.md), and pooled with `report`. The gate is the [release guide's](../../workflow/CHAT_EVAL_AND_RELEASE.md).

| Option | Overall (option / gpt-oss) | Grounding | Preferred (option / gpt-oss / tie) | Zero grounding or accuracy | Minor safety | Critical | Gate (safety / relative / absolute) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [gpt-oss + cite rule](cite-carefully.txt) | 1.42 / 1.22 | 0.95 / 0.68 | 48 / 25 / 17 | 23 | 2 of 90 | 0 | pass / pass / fail |
| Mistral Small 4, no rule | 1.70 / 1.22 | 1.68 / 0.64 | 67 / 15 / 8 | 6 | 5 of 90 (5.6%) | 0 | **fail** / pass / fail |
| gpt-oss + [guarded rules](guarded.txt) | 1.60 / 1.25 | 1.23 / 0.67 | 68 / 15 / 7 | 12 | 1 of 90 | 0 | pass / pass / fail |
| **Mistral Small 4 + guarded rules** | **1.78 / 1.19** | **1.81 / 0.66** | **71 / 9 / 10** | **0** | **1 of 90** | **0** | **pass / pass / pass** |
| DeepSeek V3.2 | not scored | | | | | | too slow (below) |

The gpt-oss column moves between rows (1.19–1.25) because each option was scored by different scorers. Compare within a row.

**What each option did:**
- **Mistral without rules** wrote the Python function in all three runs. It answered "as a pirate" twice, and gave weak signposting on abuse, insulin and the dry fast. Those are the minor safety issues that fail its gate.
- **The guarded rules** add three things: stay in role and decline off-topic requests in a sentence or two; cite only what is supplied or certain; put safety first, with helplines only when certain. Under them both models declined code and role-play in every run, and wrong helpline numbers mostly disappeared.
- **Where invention remains,** scorers found it in long, table-heavy answers on either model. Mistral's guarded answers are mostly short, and a few miss part of what a case expects (for example the Nicodemus link for John 3:16, or naming every tradition on a contested verse).

## Operations

Per option, over the three runs (87 answered cases; one case per run is the refused system turn):

| Option | Median output tokens | Median latency | Over 30 s | Over 60 s | Cut at 2,048 | Errors | Cost of 3 runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-oss (today) | 1,460 | 14.2 s | 6 | 0 | 5 | 0 | $0.019 |
| gpt-oss + cite rule | 1,254 | 20.3 s | 21 | 0 | 2 | 0 | $0.029 |
| DeepSeek V3.2 | 1,139 | 42.5 s | 63 | 21 | 4 | 3 timeouts | $0.040 |
| Mistral Small 4 | 470 | 13.6 s | 0 | 0 | 3 | 0 | $0.035 |
| gpt-oss + guarded | 963 | 26.2 s | 32 | 2 | 3 | 0 | $0.017 |
| Mistral + guarded | 195 | 12.0 s | 8 | 3 | 2 | 0 | $0.020 |

The chat route allowed 30 seconds (`maxDuration`). Latency depends on which OpenRouter provider serves a call and when: one gpt-oss guarded run had 27 of 29 answers over 30 s, and one Mistral guarded answer took 145 s. Answers over the limit are cut off, and the stale-reservation job refunds them after 30 minutes. DeepSeek was dropped for latency.

## Decision and change

Recommended: Mistral Small 4 as the default, with the guarded rules in every chat's system prompt, and the route allowed 60 seconds. The change ([#415](https://github.com/AustinKelsay/visibible/pull/415)) does three things:
- **Default model:** `DEFAULT_CHAT_MODEL` becomes `mistralai/mistral-small-2603`, first among the suggestions. gpt-oss stays in the list and keeps emergency pricing for guests who saved it.
- **Rules:** `CHAT_RULES` holds [guarded.txt](guarded.txt) word for word, after the guidance in both prompts, exactly as measured. A test checks the match.
- **Time limit:** `maxDuration` becomes 60 for `/api/chat`.

Guests who chose a model keep it; the rules apply to every model. **Choosing the default is the owner's decision**, per #99: "no self-approved theological evaluation".

**Risks:**
- **Short answers:** Mistral's answers are short, and some lack depth a guest may want.
- **Slow answers:** about 3% took over 60 s in these runs and would still be cut.
- **Scorers:** all scoring is by Claude scorers; the owner has not reviewed the failed cases.

**Rollback:** revert the merge, or set `DEFAULT_CHAT_MODEL` back to `openai/gpt-oss-120b`.

**First 24 hours** (owner: the repository owner, from the 11 November 2026 deploy, `03b2fd5`): watch chat failures, `incomplete` answers and latency in the logs, and read a few live answers.

**Still open after release:** the owner merged on 11 November ("merge") knowing the failed and edge cases had only model review. A human review of them is outstanding. The worst cases are listed per run in `scoring/r*/scores-*.json`, where the candidate's zero-grounding and safety findings are in `scoring/report.json`.

## Cost

$0.158 on the dev key for this comparison (`usage` 49.0089 → 49.1673): four candidate series of three runs, plus DeepSeek. Scoring made no OpenRouter calls. The dev key has about $0.83 of its own cap left.

## Files

- **Per option:** `<option>/run1..3/` holds `results.ndjson`, plus `manifest.json` for the guarded runs. The cite-rule, DeepSeek and unguarded Mistral runs ran from `abbfbe0`, before manifests existed; their case set is the same file, hash `672095528d60…`. `<option>/scoring/` holds each run's key, scores and pairs manifest, and the pooled `report.json`. The blind pair files are left out because they repeat the answers; `npm run evals:chat -- pairs` with the manifest's results and seed rebuilds them exactly.
- **Baseline answers:** the gpt-oss runs these were paired against are `../2026-11-11-chat-admission/{run1,rep2,rep3}` (candidate arm).
