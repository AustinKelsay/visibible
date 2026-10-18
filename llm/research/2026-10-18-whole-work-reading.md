# Reading a whole work

Investigated October 18, 2026, against commit `aec394e` on `dev`, for [Which text model and method can read a whole work into story sections and a cast, and what does it cost?](https://github.com/AustinKelsay/visibible/issues/153). "Live test" means OpenRouter calls made that day: 48 paid calls cost $0.344, and 10 free calls cost nothing (see **Spend**). The model catalog, endpoint records and OpenRouter documentation were fetched the same day. Scripts, scores and the models' JSON outputs are in [2026-10-18-whole-work-reading/](2026-10-18-whole-work-reading/).

**Recommendation**

Read each work in parts, then merge the parts' casts. Do not read the whole work in one call.

- **Parts.** Make one call per large division the work already has: a Bible book, or a Holmes story. The calls are independent, so they can run in parallel. Each call returns strict JSON with four things: the story sections, the characters and locations with their aliases, each section's cast, and a draft brief.
- **Merge.** A second step joins the parts' entries into one cast for the work. For Holmes, one call did it. For the Bible, code should first group the entries that share a name or alias, and the model should then rule on each group, so every call stays small.
- **Model.** Use Claude Haiku 5.5 (`anthropic/claude-haiku-5.5`) with reasoning off, a JSON schema, and the Anthropic endpoint.
  - It took 11–73 s per call. All 20 of its calls on that endpoint returned complete, valid JSON.
  - It had the best section scores on 1 Samuel, and the second best averaged over three books.
  - It costs $0.10 per million input tokens and $0.50 per million output tokens, for prompts under 100,000 tokens. Its tokenizer counts 1.46 times as many tokens as OpenAI's for the same text.
- **Equal-quality, cheaper alternative.** DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash`), routed to its cheapest provider, matched Haiku on three Bible books. It cost a fifth to a third as much, but it streamed 17–18 tokens a second, so one book took 5–8 minutes. Before choosing, run the whole Bible through both models and score them; both runs together should cost under $0.50.
- **Not the free Nemotron.** The scene planner's `nvidia/nemotron-3-super-120b-a12b:free` read one Holmes story, but failed on every whole book. With a JSON schema it came back empty after about 120 s. Without a schema it finished, but its JSON was invalid.

Estimated cost with Haiku: about $0.34 for the Bible ($0.26–0.42), in about 76 calls taking about 5 minutes in parallel. Holmes was measured at $0.052, in 13 calls taking 1.5 minutes. Both are well inside the map's $10.

The models get most identities right, but the engine still needs checks around them:

- **Aliases mostly work.**
  - Simon Peter is one entry with Cephas (4 of 4 models), the King of Bohemia with Count Von Kramm (7 of 8), and Jethro with Reuel (3 of 3).
  - Disguises often become a second entry. Hosmer Angel and Hugh Boone got entries of their own, even though their notes said they were the same person as James Windibank and Neville St. Clair.
  - Only 2 of 8 models saw that the "slim youth in an ulster" is Irene Adler.
- **People who share a name get merged or dropped.**
  - None of seven models kept 1 Samuel's three men named Abinadab apart.
  - None gave the two women named Ahinoam (Saul's wife and David's) an entry each. Gemini 3.5 Flash-Lite wrote "Wife of Saul, later wife of David", fusing them into one person.
  - John's four Marys stayed apart in 3 of 4 models.
- **Unnamed presence is caught, but mislabelled.**
  - Goliath was on stage in the section holding 1 Samuel 17:50 in all 11 passes where that section does not contain his name, which appears only at 17:4 and 17:23.
  - The Red Sea was the setting of Exodus 14 in 4 of 4 passes, though Exodus 14 never names it.
  - But all nine one-chapter passes marked Goliath "named" in that section. Work out "named in this section" in code instead of asking the model.

A suggested bar for scoring a reading pass:

- **Sections, against Clear.Bible.** A pass needs Pk ≤ 0.30, WindowDiff ≤ 0.35, and boundary F1 within 2 verses ≥ 0.55. Pk and WindowDiff are boundary error rates over a sliding window, where lower is better; see **Scoring**. That is about the level at which people agree with each other on narrative text. Pk ≤ 0.20 and F1 ≥ 0.70 counts as good.
- **Names, against TIPNR.** Cast precision should be at least 0.90, and at least 90% of each book's major cast (people named in 10 or more of its verses) should be listed.

Neither model meets the whole bar yet:

- **Boundaries.** On Pk, WindowDiff and F1, Haiku passed on all three books tested and was good on 1 Samuel. DeepSeek passed on two books and was good on 1 Samuel and John; its Exodus F1 was 0.545.
- **Section count.** Both made only 0.4 times Clear.Bible's number of sections for Exodus.
- **Same-name people.** Neither kept all of them apart.

**Size of each work**

Counts use the OpenAI `o200k_base` tokenizer (GPT-4o and GPT-5 family, via `tiktoken` 0.14.0), with `cl100k_base` for comparison. Live calls report each model's own count, and the ratios below come from the same 1 Samuel request.

| | WEB Bible, 66 books | *The Adventures of Sherlock Holmes* |
| --- | --- | --- |
| Source | [eBible.org `eng-web_vpl.zip`](https://ebible.org/Scriptures/eng-web_vpl.zip), "the 2020 stable text edition", public domain. Deuterocanon dropped | [Project Gutenberg #1661](https://www.gutenberg.org/ebooks/1661), "Most recently updated: October 10, 2023", licence header and footer removed |
| Units | 31,103 verses in 1,189 chapters. The app's KJV structure has 31,102; only Romans 14 and 16 differ (where the doxology sits) | 12 stories, 2,530 paragraphs, not counting the story titles |
| Words | 749,984 | 104,350 |
| Tokens, text only | 949,096 (cl100k 962,370) | 128,757 (cl100k 129,227) |
| Tokens with unit ids | 985,300 with `## BOOK c` headings and `c:v` ids; 1,123,073 with a full `GEN 1:1` reference on every verse | 137,431 with `[n]` paragraph ids; 142,642 for the one-call input with `[s.p]` ids |
| Largest part | Psalms 55,341; Jeremiah 53,929; Ezekiel 48,226; Genesis 47,702 | 9,174–12,990 per story |
| Median chapter | 780 (largest 3,159) | |

Measured prompt tokens relative to `o200k_base`, for the same 1 Samuel request (33,023 `o200k` tokens):

- Claude Haiku 5.5: 1.455
- Gemini 3.1 Flash-Lite: 1.082
- Qwen3.8 Flash: 1.073
- Gemini 3.5 Flash-Lite: 1.057
- GLM-5.3 Flash: 1.017
- DeepSeek V4.1 Flash: 1.016
- GPT-5.6 Luna: 1.009

The whole Bible is therefore about 1.0–1.07 million tokens for most models and 1.43 million for Claude. Only GPT-5.6 Luna, DeepSeek, GLM-5.3 Flash and Gemini 3.5 Flash-Lite could hold it. They would have 7,000–55,000 tokens left for an answer that needs 160,000–360,000.

**Models**

From the [models API](https://openrouter.ai/api/v1/models) and each model's [endpoints record](https://openrouter.ai/api/v1/models/anthropic/claude-haiku-5.5/endpoints), fetched October 18.

- "Schema" means the endpoint lists `structured_outputs`, so it accepts `response_format: {type: "json_schema", strict: true}`.
- Prices are per million tokens, input / output, at the listed (cheapest) provider. The `:batch` variants of the paid models cost half; see **Cost and time**.
- Live results are from this test; see **Live test**.

| Model | Context / max output | Price | Schema | Reasoning | Live result |
| --- | --- | --- | --- | --- | --- |
| `nvidia/nemotron-3-super-120b-a12b:free` (the scene planner's default, set in [`scene-planner.ts`](../../src/lib/scene-planner.ts) and overridable with `OPENROUTER_SCENE_PLANNER_MODEL`) | 262,144 / 235,929 | Free. 20 requests a minute and 1,000 a day for this account (`GET /api/v1/key`) | Yes (one NVIDIA endpoint) | Optional; the planner sends `{enabled: false}` | Holmes story in 99.8 s. Every whole-book call failed (see below). It is slow (33–54 tokens a second). The endpoint may train on prompts (see the [October 14 note](2026-10-14-scene-planner-free-models.md)) |
| `nvidia/nemotron-3.5-super-vl:free` | 1,000,000 / 131,072 | Free, same caps | Yes | Optional | 1 Samuel 17 worked. The Holmes story and 1 Samuel came back empty at about 121 s |
| `deepseek/deepseek-v4.1-flash` | 1,048,576 / up to 943,718 (131K–943K by provider) | $0.04 / $0.144 at OpenInference, which serves a 4-bit (fp4) build; one of 34 providers. Others charge up to $0.60 / $2.40 | Yes on most providers | Optional (`effort: "none"`) | Valid on all 7 calls. 17–18 tokens a second at OpenInference. The default routing sent the first call to BaseTen at $0.30 / $1.20 |
| `anthropic/claude-haiku-5.5` (released October 7, 2026) | 1,000,000 / 128,000 | $0.10 / $0.50; $0.50 / $2.50 above 100,000 prompt tokens | Yes on Anthropic, Google and Azure; not on Bedrock or Claude on AWS | Optional (`effort: "none"`) | 20 of 20 complete on the Anthropic endpoint, at about 210–280 tokens a second. One call routed to Azure returned schema-valid JSON with no sections and an empty brief |
| `openai/gpt-5.6-luna` | 1,050,000 / 128,000 | $0.20 / $1.20; $0.40 / $1.80 above 272,000 | Yes | Optional | Valid on all 6, about 120–135 tokens a second |
| `google/gemini-3.5-flash-lite` | 1,048,576 / 65,536 | $0.30 / $2.50 | Yes | Mandatory; `minimal` used | Valid on all 4. Fastest (about 480 tokens a second), but too few sections on John |
| `google/gemini-3.1-flash-lite` | 1,048,576 / 65,536 | $0.25 / $1.50 | Yes | Optional | Valid, but sparse: 11 sections and 21 characters for all of 1 Samuel |
| `qwen/qwen3.8-flash` | 1,000,000 / 131,072 | $0.15 / $0.47 (Alibaba only) | Yes | Optional | Valid, but sparse: 15 sections for 1 Samuel |
| `z-ai/glm-5.3-flash` | 1,048,576 / up to 943,718 | $0.048 / $0.20 at OpenInference | Yes on most providers | Mandatory; `low` used | Its 1 Samuel sections covered only 69% of verses and overlapped. In one pass over Holmes it covered 2 of 12 stories |

Not tested:

- `openai/gpt-5.4-nano`: $0.20 / $1.25, 400K context.
- `openai/gpt-5-mini`: $0.25 / $2.00, reasoning mandatory.
- `google/gemini-3.8-flash`: $0.825 / $4.125.
- `minimax/minimax-m3`: $0.30 / $1.20.
- `qwen/qwen3.7-flash`: $0.03 / $0.13 up to 32,000 prompt tokens, $0.10 / $0.40 above, and $0.20 / $0.80 above 256,000. It has no schema support.
- `google/gemini-2.5-flash-lite`: its `expiration_date` is 2026-10-20.

OpenRouter behaviour that matters here:

- **Strict JSON is not guaranteed everywhere.** "Some guarantee schema-conforming output, while others translate your schema into their own structured-output format or treat it as a strong hint" ([structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)). `provider.require_parameters: true` limits routing to endpoints that accept the schema.
- **Routing changes the price.** By default OpenRouter load-balances across providers, weighted by "inverse square of the price". `provider.sort: "price"` always picks the cheapest ([provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)). For open-weight models the cheapest provider is often fp4-quantised.
- **Free models are capped.** The cap is 20 requests a minute, and 50 a day for accounts that have bought fewer than 10 credits or 1,000 a day otherwise ([limits](https://openrouter.ai/docs/api-reference/limits)). The free endpoints' roughly 120 s cut-off is not documented; it was seen in this test. Those calls left no generation record and were not billed.
- **The Batch API halves prices.** It is "typically billed at 50% of the model's standard per-token pricing", and has a 24-hour completion window; Google Vertex batches can take up to 96 hours. Results come back inline, and on Google models every request in a batch must use the same `response_format` ([Batch API](https://openrouter.ai/docs/batch-quickstart)).

**Live test**

- **Prompt.** One generic prompt and JSON schema served every work ([`prompt.py`](2026-10-18-whole-work-reading/scripts/prompt.py)).
  - Units come as numbered lines: `17:4` for verses, `[12]` for paragraphs, `[3.12]` for story 3, paragraph 12.
  - The model returns `characters` and `locations` (id, name, aliases, note), `sections`, and a `brief` (era, place, dress, buildings and objects, depiction rules).
  - Each section has its first and last unit, a title, `setting`, `on_stage_named`, `on_stage_unnamed` and `mentioned_only`.
  - The prompt asks for one entry per individual, separate entries for different people who share a name, disguises merged into the real person, and sections of 5–30 units "never split[ting] one continuous scene". It never names the Bible's or Holmes's characters.
- **Request.** Chat completions with the schema in strict mode and `provider.require_parameters: true`, `max_tokens` 60,000, temperature 0 where supported, and reasoning off or at its minimum.
  - Open-weight paid models used `provider.sort: "price"`. Haiku was pinned to the Anthropic endpoint after the Azure miss.
  - Long DeepSeek calls were streamed.
- **Inputs.**
  - 1 Samuel 17, as a first comparison.
  - Whole books: 1 Samuel (810 verses, 51 Clear.Bible sections), Exodus (1,213 verses, 80 sections) and John (879 verses, 87 sections).
  - "A Scandal in Bohemia" (262 paragraphs).
  - All 12 Holmes stories, as one call and as 12 calls plus a merge.
  - A three-book Bible merge.
- **Scoring.** [`score_bible.py`](2026-10-18-whole-work-reading/scripts/score_bible.py) compares each book's sections with Clear.Bible's [BSB pericope table](https://github.com/Clear-Bible/Biblelib/blob/main/biblelib/pericope/pericopes_eng_BSB.tsv) (commit `c077fe6`). It compares each section's named cast with [TIPNR](https://github.com/STEPBible/STEPBible-Data/tree/master/Proper%20Nouns) (commit `ed476a8`); see **Scoring** for the method. Holmes was checked by hand against the text.
- **Re-running.**
  1. Download the WEB, Gutenberg, pericope and TIPNR files linked above into `$WWR_DATA`.
  2. Run `prep_inputs.py` and `measure_tokens.py`.
  3. Run `run_extract.py`, `run_stories.py` and `run_merge.py`. Set `OR_ENV_FILE` to the env file that holds `OPENROUTER_API_KEY`; the scripts never print or store the key.
  4. Run `final_scores.py` and `spend.py`.

  The [results](2026-10-18-whole-work-reading/results/) folder holds every call's ledger entry, usage and parsed JSON, plus the merge inputs. It holds no source text.

Whole books, scored against Clear.Bible and TIPNR:

- **Sections** gives the pass's count, then Clear.Bible's.
- **Pk**, **WD** (WindowDiff) and **B** (boundary similarity) are explained under **Scoring**. Lower Pk and WD are better; higher B and F1 are better.
- **F1 ±2** is boundary F1 with a 2-verse tolerance.
- **Cast P** and **Cast R** are precision and recall of TIPNR people per section.
- **Major** is the share of people named in 10 or more of the book's verses that the pass lists.

| Book | Model | Time | Cost | Sections | Pk | WD | B | F1 ±2 | Cast P | Cast R | Major |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Samuel | Claude Haiku 5.5 | 34 s | $0.0096 | 35 / 51 | **0.161** | **0.196** | **0.575** | **0.762** | 0.948 | 0.692 | 11/11 |
| 1 Samuel | DeepSeek V4.1 Flash | 466 s | $0.0021 | 34 / 51 | 0.171 | 0.209 | 0.566 | 0.747 | 0.953 | 0.676 | 10/11 |
| 1 Samuel | Gemini 3.5 Flash-Lite | 15 s | $0.0288 | 31 / 51 | 0.181 | 0.213 | 0.538 | 0.725 | 0.975 | 0.680 | 11/11 |
| 1 Samuel | GPT-5.6 Luna | 58 s | $0.0168 | 30 / 51 | 0.191 | 0.223 | 0.519 | 0.709 | 0.963 | 0.750 | 11/11 |
| 1 Samuel | GLM-5.3 Flash | 163 s | $0.0037 | 33 / 51, 69% of verses covered | 0.236 | 0.273 | 0.439 | 0.659 | 0.944 | 0.688 | 11/11 |
| 1 Samuel | Qwen3.8 Flash | 89 s | $0.0078 | 15 / 51 | 0.315 | 0.337 | 0.280 | 0.438 | 0.968 | 0.424 | 10/11 |
| 1 Samuel | Gemini 3.1 Flash-Lite | 9 s | $0.0136 | 11 / 51 | 0.380 | 0.409 | 0.154 | 0.300 | 0.964 | 0.414 | 10/11 |
| 1 Samuel | Nemotron 3 Super (free) | 121 s; 471 s | $0 | Empty with schema; invalid JSON without (25,416 tokens) | | | | | | | |
| 1 Samuel | Nemotron 3.5 Super VL (free) | 121 s | $0 | Empty | | | | | | | |
| Exodus | Claude Haiku 5.5 | 23 s | $0.0093 | 33 / 80 | **0.272** | **0.289** | **0.405** | **0.577** | 0.919 | 0.545 | 4/4 |
| Exodus | DeepSeek V4.1 Flash | 289 s | $0.0017 | 32 / 80 | 0.294 | 0.319 | 0.369 | 0.545 | 0.907 | 0.584 | 4/4 |
| Exodus | GPT-5.6 Luna | 47 s | $0.0174 | 25 / 80 | 0.325 | 0.337 | 0.304 | 0.466 | 0.825 | 0.688 | 4/4 |
| John | DeepSeek V4.1 Flash | 440 s | $0.0023 | 57 / 87 | **0.183** | **0.203** | **0.567** | **0.732** | 0.963 | 0.861 | 7/7 |
| John | Claude Haiku 5.5 | 27 s | $0.0077 | 38 / 87 | 0.270 | 0.294 | 0.386 | 0.569 | 0.967 | 0.695 | 6/7 |
| John | GPT-5.6 Luna | 50 s | $0.0147 | 35 / 87 | 0.280 | 0.295 | 0.368 | 0.550 | 0.915 | 0.822 | 7/7 |
| John | Gemini 3.5 Flash-Lite | 13 s | $0.0247 | 22 / 87 | 0.352 | 0.359 | 0.230 | 0.374 | 0.959 | 0.475 | 5/7 |

- **Averaged over the three books,** DeepSeek scored Pk 0.216, B 0.501 and F1 0.675. Haiku scored Pk 0.234, B 0.455 and F1 0.636. One run per model and book is too small a sample to separate them.
- **Every pass made fewer sections than Clear.Bible,** most of all in Exodus's law chapters. There Clear.Bible has a section per law code ("Laws about altars"), and the models grouped them.
- **A length target over-split.** Replacing the 5–30 guidance with "aim for about 14 units per section" made Haiku over-split: 68 sections for 1 Samuel (Pk 0.262, F1 0.701) and 134 for Exodus (Pk 0.323, F1 0.689). Granularity follows the prompt, but no single number matches Clear.Bible in every book.
- **Low cast recall is partly by design.** TIPNR lists every name, including people who are only named in a genealogy, and the prompt told the model to skip those. Precision is the cleaner signal: 0.83–0.98.
- **God was missing from two books' casts.** Haiku's 1 Samuel and John casts left God out, while its Exodus cast included him. All three briefs still said not to show God as a human figure.

"A Scandal in Bohemia", one call per model (the Nemotron 3.5 VL call came back empty at 121 s):

| Check | Result |
| --- | --- |
| The masked visitor "Count Von Kramm" is the King of Bohemia, one entry | 7 of 8. Nemotron made a separate Von Kramm entry whose note says it is the King |
| The "drunken-looking groom" and the "Nonconformist clergyman" are aliases of Holmes, with no second entry | 6 of 8. GLM left them out; Nemotron also made a separate "Drunken Groom" entry |
| The "slim youth in an ulster" who says "Good-night, Mister Sherlock Holmes" is Irene Adler, as her letter later reveals | 2 of 8 (Gemini 3.5 Flash-Lite, GLM). Nemotron made a separate `slim_youth` entry; the rest left the youth out |
| Sections for 262 paragraphs | 4–14 |
| Time and cost | 4.9–151 s, $0.0009–0.0088 |

All 12 Holmes stories:

| Method | Calls | Tokens in / out | Cost | Time | Result |
| --- | --- | --- | --- | --- | --- |
| One pass, GPT-5.6 Luna | 1 | 143,710 / 10,655 | $0.0487 | 84 s | Every paragraph covered, but only 47 sections (3–5 per story). 96 characters. Hosmer Angel and Hugh Boone each have their own entry, each listing the real person as an alias |
| One pass, GLM-5.3 Flash | 1 | 144,777 / 6,380 | $0.0031 | 77 s | Sections only for stories 1 and 12: 16% of paragraphs |
| One pass, DeepSeek V4.1 Flash | 1 | 144,442 / 4,810 | $0.0018 | 262 s | The same: stories 1 and 12 only |
| One call per story, then one merge, Claude Haiku 5.5 | 12 + 1 | 242,188 / 54,637 | $0.0516 | 11–15 s per story in parallel, then 73 s to merge | 148 sections (5–20 per story). 144 story entries became 116 characters, each placed exactly once |

The merge got the cross-story identities right:

- Holmes and Watson are one entry each across all 12 stories.
- Lestrade's two stories (4 and 10) were joined.
- Mary Sutherland, mentioned in story 2 and the client in story 3, was joined.
- It kept apart seven different men called John, three Turners (Mrs. Turner, the Baker Street landlady in story 1, John Turner and Alice Turner), and "Hudson" in a diary in story 5 from Mrs. Hudson in story 8.

It made two errors:

- It merged Hugh Boone into Neville St. Clair, but left Hosmer Angel apart from James Windibank, even though its own note says "merged with him in the cast".
- It folded Watson's consulting room into Baker Street.

A merge of Haiku's Exodus, 1 Samuel and John casts (11,660 tokens in, 14,465 out, $0.0084, 41 s) did the following:

- It joined Bethlehem across books.
- It kept apart Joseph son of Jacob and Joseph of Arimathea, and Judas Iscariot and the other Judas.
- It dropped 1 of 113 entries.

**One pass or parts**

- **The Bible cannot be read in one call.**
  - Input is 1.0–1.43 million tokens, at or over every candidate's 1,000,000–1,050,000-token window.
  - Output would also be too long. Haiku wrote 5.0–11.7 tokens per verse, which comes to 160,000–360,000 tokens for the whole Bible. Gemini's output limit is 65,536 tokens, and Claude's and GPT's are 128,000.
- **Holmes fits in one call but reads badly.**
  - Two of three models stopped after story 1 and jumped to story 12, yet reported a normal finish.
  - The third covered every story, but at a third of the section detail of the per-story calls.
- **Published long-context results point the same way.**
  - On NoCha's true/false claims about recent novels, GPT-4o scored 55.8% and people 97.4%. Claims that need the whole book scored lower than claims about one sentence ([Karpinska et al., EMNLP 2024](https://arxiv.org/abs/2406.16264)).
  - In NovelQA, accuracy falls when the evidence sits past 100,000 tokens: 66.24 → 48.08 on multiple choice ([Wang et al., ICLR 2025](https://arxiv.org/abs/2403.12766)).
  - In TLDM's "storyworld" task, which asks for each character's last known location, GPT-4.1 scored 0.27 on 32–64K-token texts and 0.09 past 128K ([Hamilton et al., 2025](https://arxiv.org/abs/2505.14925)).
  - Chain of Agents, which reads in 8K chunks one after another, beat a single 200K pass on NarrativeQA (23.96 vs 6.56 with Claude 3 Opus) ([Zhang et al., NeurIPS 2024](https://arxiv.org/abs/2406.02818)).
- **Parts are cheap, fast and independent.** Any part can be re-read alone. A failed call loses one book, not the work. Each part's sections are final, because no Bible section crosses a book (prior note) and no Holmes section crosses a story.
- **Parts move identity work into the merge.** BooookScore found entity omission to be the most common error when long books are summarised in chunks ([Chang et al., ICLR 2024](https://arxiv.org/abs/2310.00785)). xCoRe, which also merges across windows, found the chunked method splits one person into several chains, while whole-book models over-merge ([Martinelli et al., EMNLP 2025](https://aclanthology.org/2025.emnlp-main.1737/)). Both errors appeared here.
- **A rolling registry is the untested middle option.** Each part would get the cast so far and reuse its ids. It needs no merge, but parts must run in order: about 66 sequential calls for the Bible, roughly 30 minutes with Haiku. The MEI results below suggest that giving the model the entity list helps.

**Identity**

What went right and wrong across this test:

| Case | What happened | Fix the engine should apply |
| --- | --- | --- |
| One person, several names | Peter = Simon = Cephas in 4 of 4 John passes. Count Von Kramm = the King 7 of 8. Jethro = Reuel 3 of 3. The merge joined Holmes, Watson and Lestrade across stories | Keep each entry's alias list. In the merge, give the model candidate groups of entries that share an alias |
| Disguises and late reveals | Models often know the disguise but still make two entries: Hosmer Angel and Hugh Boone (GPT-5.6 Luna's one pass did both), and Nemotron's Count Von Kramm and Drunken Groom. The youth in the ulster was linked to Irene Adler 2 of 8 times | Merge entries whose alias lists name each other, then let the model confirm. The owner corrects the rest |
| Different people, same name | Abinadab ×3 in 1 Samuel: 0 of 7 models kept all three apart; GLM got two. Ahinoam ×2: 0 of 7. Ahimelech the priest and Ahimelech the Hittite: 3 of 7. Exodus's two Pharaohs (the oppressor dies at 2:23): one entry in 3 of 3. John's Marys: 3 of 4 kept all four apart; Haiku missed Mary of Clopas. John's two Judases: 2 of 4. The Holmes merge kept seven Johns apart | Ask for a note per entry that says how to tell them apart, and give the merge each entry's sections. Never join entries on a shared name alone. For the Bible, score splits and merges against TIPNR's disambiguated ids |
| Present but unnamed | Goliath was on stage in the section holding 17:50 in all 11 passes whose section left out his name. The Red Sea was the setting of Exodus 14 in 4 of 4. Lazarus was listed at John 11:35 in 4 of 4, but only DeepSeek's section (11:17–37) leaves his name out. The `on_stage_named` / `on_stage_unnamed` split was wrong for Goliath in all 9 one-chapter passes | Ask only "on stage" versus "mentioned". Decide "named in this section" in code, by matching the entry's proper-name forms against the section's text |
| Divine and group figures | God was left out of two of Haiku's three book casts. The models listed armies and crowds as groups inconsistently. Gemini 3.5 Flash-Lite typed Jesus as divine, not as a person | Put depiction rules in the brief: 14 of 16 whole-book briefs said, unprompted, that God is not shown as a human figure. Treat divine and group entries as their own kinds |

Published accuracy on the same problems:

- **Alias clustering is the weakest stage.**
  - Vala et al. built character lists for 56 Sherlock Holmes stories and reached F1 0.540 (BookNLP 0.522). Their main Holmes error was failing to link a character's different names. On *Pride and Prejudice*, people who shared a surname were merged ([EMNLP 2015](https://aclanthology.org/D15-1088/)).
  - On 22 full novels, BookNLP made 1.18 clusters per character, with homogeneity 0.86 ([Vishnubhotla et al., ACL 2023](https://aclanthology.org/2023.acl-short.64/)).
- **Supplying the entity list helps.** In Major Entity Identification, GPT-4 assigned LitBank mentions to a given list of major characters at 88.8 macro F1, above a trained system (86.1). Given no list, in a single prompt, it scored 61.1 ([Manikantan et al., EMNLP 2024](https://aclanthology.org/2024.emnlp-main.652/)).
- **Whole-book coreference is hard.**
  - Off-the-shelf BookNLP scores 42.2 CoNLL-F1 (the standard coreference score, 0–100) on whole books, against 50.6 on 1,500-token splits. A model fine-tuned on book-scale data reaches 67.0 ([BOOKCOREF, Martinelli et al., ACL 2025](https://aclanthology.org/2025.acl-long.1197/)).
  - BookNLP's own README reports coreference average F1 of 79.0 for its big model. That is measured on short excerpts, and the README warns that full coreference "tends to erroneously conflate multiple distinct entities into one" ([BookNLP](https://github.com/booknlp/booknlp)).
- **Unnamed and descriptive mentions are where models lose most.** LitBank annotates descriptions such as "the doctor" and pronouns as mentions. Its best trained baseline reaches 79.3 CoNLL-F1 with gold mentions and 68.1 from raw text, on excerpts averaging 2,105 words ([Bamman et al., LREC 2020](https://aclanthology.org/2020.lrec-1.6/)). In IdentifyMe, GPT-4o resolved 81.9% of nominal and pronominal mentions in long texts; people scored 92–94% ([Manikantan et al., NAACL 2025](https://aclanthology.org/2025.naacl-short.64/)).
- **End-to-end LLM character lists miss people.** On 30 LitBank excerpts, GPT-4o's character-node F1 was 62.98, below a traditional pipeline's 70.39, because GPT-4o's recall was only 32–34 ([Amalvy et al., COLING 2025](https://arxiv.org/abs/2412.11560)).
- **Memorisation inflates scores on famous texts.** The Bible and Holmes are almost certainly in every model's training data. NoCha and ∞Bench avoid this on purpose, by using recent books or substituted entities. Scores on the proof works may overstate how well a pass reads an unknown work.

**Prior work on story sections**

| Work | Task | Reported result |
| --- | --- | --- |
| [Zehe et al., EACL 2021](https://aclanthology.org/2021.eacl-main.276/) | Scene segmentation in German dime novels | Annotator agreement 0.70 (Mathet's γ, where 1 is perfect). BERT exact-boundary F1 0.24; TextTiling 0.04. A leading error is characters and places that are mentioned but not present |
| [Shared Task on Scene Segmentation, KONVENS 2021](https://ceur-ws.org/Vol-3001/) | Same | Best exact F1 0.37 (in domain) and 0.26 (high literature) |
| [Zehe, Fischer and Hotho, NAACL 2025](https://aclanthology.org/2025.naacl-long.500/) | Same, F1 counting a border within 3 sentences as correct | GPT-4o zero-shot 0.45, Llama 3.1 405B 0.34, fine-tuned GBERT-Large 0.68, fine-tuned Llama-3-8B 0.62. 25 inspected false positives were judged plausible borders |
| [Michelmann et al., *Behavior Research Methods* 2025](https://arxiv.org/abs/2301.10297) | Event boundaries in a spoken story | GPT-3's boundaries were closer to the human consensus (distance 0.261, lower is closer) than individual people were (0.281) |
| [Pethe, Kim and Skiena, EMNLP 2020](https://aclanthology.org/2020.emnlp-main.672/) | Chapter breaks in 9,126 Gutenberg novels | Best Pk 0.284, WindowDiff 0.305, exact F1 0.453. Evenly spaced breaks give Pk 0.482 |
| [Kazantseva and Szpakowicz, NAACL 2012](https://aclanthology.org/N12-1022/) | 27 annotators segmenting *The Moonstone* | Annotator against annotator: Pk 0.33, WindowDiff 0.38 |
| [Koshorek et al., NAACL 2018](https://aclanthology.org/N18-2075/) | Wikipedia sections | Human Pk 0.150 on Wiki-50; model 0.182–0.221; random 0.53 |

No published agreement study for Bible pericopes was found.

**Scoring**

Sections, per book, over verse units:

- **Pk** ([Beeferman, Berger and Lafferty, 1999](https://doi.org/10.1023/A:1007506220214)) slides a window of k verses along the text. It counts an error whenever the reference and the pass disagree about whether the window's two ends fall in the same section. 0 is perfect; random scores about 0.5. Use k = half the mean Clear.Bible section length in the book: 8 for 1 Samuel and Exodus, 5 for John. That is NLTK's default ([`nltk.metrics.segmentation`](https://www.nltk.org/api/nltk.metrics.segmentation.html)).
- **WindowDiff** ([Pevzner and Hearst, 2002](https://aclanthology.org/J02-1002/)) uses the same window, but counts a window as wrong when the number of boundaries in it differs. Pk penalises missed boundaries more than extra ones; WindowDiff corrects that.
- **Boundary similarity B** ([Fournier, ACL 2013](https://aclanthology.org/P13-1167/)) gives partial credit for near misses. Here a near miss is within 2 verses. It is in [`segeval`](https://pypi.org/project/segeval/) 2.0.11, which installs and runs on Python 3.14. B was 0.53 between people on *The Moonstone* (Fournier).
- **Boundary F1 with a tolerance** matches each predicted section start to at most one Clear.Bible start within 2 verses. It is the easiest of the four to explain.
- **Section count** should be reported next to all of these, because Pk and WindowDiff reward passes that make too few sections. Score each book on its own, then average across books, and report the narrative books separately.
- **Data fixes.** Clear.Bible's 15 uncovered verses join a neighbouring section, as in the prior note. Use the Biblelib commit recorded in the run.

Names, per predicted section:

- **Mapping.** Map each predicted person to one TIPNR individual. A match means one of the person's name or alias forms equals one of TIPNR's English forms (its ESV, KJV and NIV renderings and its unique name). When several individuals match, take the one whose TIPNR verses overlap the person's sections most. Leave out tribe-patriarch names whose verses mostly mean the tribe (Israel, Judah, Benjamin and the rest; TIPNR files "Israel" under Jacob), and leave out deities (TIPNR's `OTHER`).
- **Gold.** The gold set for a section is every TIPNR individual named in its verses. The pass's set is every mapped person listed on stage or mentioned there.
  - **Precision** is the share of listed people who are named there.
  - **Recall** is the share of named people who are listed.
  - Predicted people with no TIPNR match, such as "Saul's servant", are counted separately. Those are the unnamed figures.
  - People named only in verses that no predicted section covers count as misses.
- **Major cast.** This is the share of individuals named in 10 or more of the book's verses who appear anywhere in the pass. Listing people is what canon needs, and per-section recall understates it because of genealogies.
- **Splits and merges.** Count both directions:
  - **Splits:** one TIPNR id that ends up under two predicted entries.
  - **Merges:** one predicted entry whose sections cover two TIPNR individuals who share a name.

  TIPNR's same-name sets (6 Marys, 10 Josephs, 29 Zechariahs per the prior note) give the test cases for free. For a single cluster-quality number, LEA over (verse, name) mentions is the coreference metric meant to fix B³'s and CEAF's known flaws ([Moosavi and Strube, ACL 2016](https://aclanthology.org/P16-1060/)). Per-section entity sets follow the "bag of entities" scoring of [Hachey, Nothman and Radford, ACL 2014](https://aclanthology.org/P14-2076/).
- **Unnamed presence.** TIPNR cannot score this. Hand-label about 30 cases, such as Goliath at 1 Samuel 17:48–58, the Red Sea in Exodus 14, Lazarus and Bethany at John 11:28–37, and the Holmes disguises. Glyssen's speaker list (MIT; see the prior note) adds checks for free: a speaker in a verse must be on stage in that verse's section.

The bar below is a suggestion; no source sets one. The pass level sits at human-to-human agreement on narrative text (Pk 0.33 and WindowDiff 0.38 on *The Moonstone*) and above GPT-4o's zero-shot scene F1 of 0.45.

| Measure | Pass | Good | Haiku 5.5 (1 Samuel / Exodus / John) | DeepSeek V4.1 Flash |
| --- | --- | --- | --- | --- |
| Pk | ≤ 0.30 | ≤ 0.20 | 0.161 / 0.272 / 0.270 | 0.171 / 0.294 / 0.183 |
| WindowDiff | ≤ 0.35 | ≤ 0.25 | 0.196 / 0.289 / 0.294 | 0.209 / 0.319 / 0.203 |
| Boundary F1 ±2 verses | ≥ 0.55 | ≥ 0.70 | 0.762 / 0.577 / 0.569 | 0.747 / 0.545 / 0.732 |
| Sections, relative to Clear.Bible | 0.5–1.5× | 0.75–1.25× | 0.69 / 0.41 / 0.44 | 0.67 / 0.40 / 0.66 |
| Cast precision | ≥ 0.90 | ≥ 0.95 | 0.948 / 0.919 / 0.967 | 0.953 / 0.907 / 0.963 |
| Major cast listed | ≥ 90% | 100% | 11/11, 4/4, 6/7 | 10/11, 4/4, 7/7 |
| Same-name groups kept apart | No wrong merge in the major cast | All kept apart | 1 Samuel 0 of 3 (Abinadab, Ahinoam, Ahimelech); Exodus's Pharaohs merged | 1 Samuel 1 of 3 (Ahimelech); Exodus's Pharaohs merged |
| Unnamed presence, hand-labelled cases | ≥ 80% | ≥ 90% | Goliath and the Red Sea caught. Lazarus untested: Haiku's section names him | Goliath (in the one-chapter pass) and Lazarus caught. Red Sea untested: DeepSeek's section includes 13:18, which names it |

Measured against this bar:

- **Haiku** fails on Exodus and John for section count, and on John for the major cast (6 of 7).
- **DeepSeek** fails on Exodus for section count and boundary F1.
- **Both** merge people who share a name.

Tune the section count first, because sections that are too long weaken section looks.

**Cost and time**

| Option | Work | Calls | Tokens in / out | Cost | Wall time |
| --- | --- | --- | --- | --- | --- |
| **Haiku 5.5, a call per part, then a merge** | Holmes, measured | 13 | 242,188 / 54,637 | **$0.052** | 1.5 min (stories in parallel, 11–15 s each; merge 73 s) |
| Same | Bible, estimated | 66 books + about 10 merge calls | 1.51M + about 0.15M / 0.16–0.36M + 0.03–0.15M | **about $0.34** ($0.26–0.42) | About 5 min in parallel; about 30 min one at a time |
| Same, through the Batch API | Bible, estimated | Same | Same | About $0.17 | Up to 24 hours |
| DeepSeek V4.1 Flash, cheapest provider, parts then merge | Holmes, estimated from story 1 | 13 | about 0.17M / 0.05M | About $0.015 | About 20 min; a 16,000-token merge at 17 tokens a second takes about 16 min |
| Same | Bible, estimated | About 76 | about 1.2M / 0.35M | **About $0.10** | 30–45 min in parallel; the slowest book bounds it |
| GPT-5.6 Luna, a call per part | Bible, estimated | About 76 | about 1.2M / 0.37M | About $0.70 | About 10 min in parallel |
| One pass, GPT-5.6 Luna | Holmes, measured | 1 | 143,710 / 10,655 | $0.049 | 84 s, but about 4 sections per story |
| One pass | Bible | | | Not possible | The input fills the largest windows, and the answer is longer than any output limit |
| Nemotron 3 Super free, a call per chapter | Bible | About 1,200 | | $0 | At least 2 days at 1,000 free requests a day; book-sized calls fail |

How the estimates were made:

- **Bible input** is the measured 985,300 `o200k` tokens, times each model's measured ratio, plus the system prompt for each of 66 calls. Every book stays under Haiku's 100,000-token price step. The largest, Psalms, comes to about 80,000 Claude tokens.
- **Bible output** uses the measured tokens per verse: Haiku wrote 11.7 (1 Samuel), 5.0 (Exodus) and 8.8 (John); DeepSeek wrote 9.8, 4.3 and 9.5. The range runs from the lowest to the highest of these.
- **The merge.** It is about 1,900 entries, at the three books' rate of 0.06 entries per verse. The merges here used about 70–95 input and 70–85 output tokens per entry. That is about 150,000 output tokens for the Bible: more than Haiku's 128,000 limit for one call, so split the merge into groups.
- **A leaner merge.** If the merge returns only member lists and a canonical name, and code joins the aliases, output falls to about 15 tokens per entry. That is the low end of the range.
- **Wall time** uses the measured output speeds: Haiku about 210–280 tokens a second, DeepSeek at OpenInference 17–18, GPT-5.6 Luna 120–135.

**Spend**

Every call's `usage.cost` was recorded, and each was checked against its [generation record](https://openrouter.ai/docs/api-reference/get-a-generation). The records' `total_cost` summed to the same $0.3437.

| Model | Calls | Cost |
| --- | --- | --- |
| `anthropic/claude-haiku-5.5` | 21 | $0.1124 |
| `openai/gpt-5.6-luna` | 6 | $0.1073 |
| `google/gemini-3.5-flash-lite` | 4 | $0.0677 |
| `google/gemini-3.1-flash-lite` | 3 | $0.0226 |
| `qwen/qwen3.8-flash` | 3 | $0.0119 |
| `deepseek/deepseek-v4.1-flash` | 7 | $0.0131 |
| `z-ai/glm-5.3-flash` | 4 | $0.0088 |
| `nvidia/nemotron-3-super-120b-a12b:free` | 6 (3 failed) | $0 |
| `nvidia/nemotron-3.5-super-vl:free` | 4 (3 failed) | $0 |
| **Total** | **58** | **$0.3437** |

Five failed free calls left no generation record. The account's key is shared with other work, so its usage counter was not used to measure this spend.

**Not verified**

- Each model ran once per input. The score differences between Haiku, DeepSeek, GPT-5.6 Luna and Gemini 3.5 Flash-Lite are within what a rerun could change.
- Only 3 of 66 books were scored. Poetry, prophecy and letters, where a "story section" is least clear, were not tested.
- The Bible-wide merge was not run. Its cost and quality are estimates from a three-book merge and the Holmes merge.
- The rolling-registry method, OpenRouter's Batch API and response healing were not tried.
- The cause of the free NVIDIA endpoints' roughly 120 s cut-off is not documented. Whether a smaller schema or a different `max_tokens` avoids it was not tested.
- Name matching in the scorer is simple. It mismatched some Marys in John (Jesus's mother is never called Mary there), so John's same-name results come from reading the outputs, not from the automatic count. It also scores only entries typed "person", so Gemini 3.5 Flash-Lite's Jesus, typed "divine", counts as missing.
- DeepSeek's cheapest provider serves an fp4 build. Quality on other providers, and whether that provider stays the cheapest, were not checked.
