---
status: accepted
date: 2026-10-30
---

# A frozen regression suite across three works, gated fault by fault

On 30 October 2026 the owner approved point four of the engine critique and its quoted costs ("Yes let's go! Full send. Re-upping openrouter budget now."). Point four said:

- Prompts were tuned on the same 33 Bible cases that judged them, so verse-specific fixes such as "the man standing in the gap" looked like progress.
- The launch bar was one pooled acceptable rate, so one fault could get worse while another improved.
- Each measurement copied its own runner into its release folder: 35 folders hold one, about 20,600 lines in all. No two runs were quite the same.
- Outside the Bible there were three Holmes cases, no Holmes consistency groups and no third work.

The decisions below are the operator's under that delegation.

## Decisions

- **One suite, three works.** [evals/images/suite.json](../../evals/images/suite.json) names the works, their image styles, their consistency groups and the gate; [cases.json](../../evals/images/cases.json) holds the cases. The Bible keeps its 33 matrix cases and its 14 consistency verses, and adds 30 random verses. Holmes gets 15 more cases and Alice 18, each with consistency groups (Holmes, Watson, the bank cellar and the Eyford fire; Alice, the Cheshire Cat, the Hatter, the tea table and the croquet-ground). Cases are added, never replaced, and a change to them bumps the suite version.
- **Alice is the third work.** *Alice's Adventures in Wonderland* (Project Gutenberg #11) is unlike both others: a recurring cast that is mostly not human, a heroine whose size changes, and invented places. It is imported like Holmes but prepared only for evaluation: read and drafted locally with `--no-store` for $0.27 and committed as [an analysis fixture](../../evals/images/analyses/alice-in-wonderland.json). The request path still serves only the Bible ([ADR 0002](0002-consistent-images-from-canon-and-reference-images.md)). Its brief is approved by merging the PR that adds it, as every brief is.
- **A holdout nobody chooses.** Cases that tuned the engine before the suite are marked `tuned` and stay in dev. Every other case falls into the holdout when a hash of the suite seed and its id says so (40%). Random cases come from a seeded draw over a work's units that the tests replay, so nobody picked them either, and a drawn case joins the image tier exactly when it is in the holdout. Prompt work may look at dev results; holdout results only decide the gate.
- **Two paid tiers and a free one.**
  - The **text tier** prepares every case's look, plan and review fresh: 113 cases for about $0.20.
  - The **image tier** renders the plans that text run stored, in each of a work's image styles, through the check and retry readers get. That is 206 shown images for about $8. Each work's image styles are its brief's released styles, at most two outside the Bible to fit the budget.
  - The **free tier** pins each work's exact engine requests byte for byte. The Bible already had [bible-engine-golden.test.ts](../../src/lib/__tests__/bible-engine-golden.test.ts); [work-engine-golden.test.ts](../../src/lib/__tests__/work-engine-golden.test.ts) adds Holmes and Alice, so a prompt change names every work it reaches.
- **Faults, not one rate.** [evals/images/faults.json](../../evals/images/faults.json) defines the questions, once, for plans (wrong moment, speaker inside their words, missing subject, unsupported figure, broken rule, writing asked for, unseen subject given a body) and for images (lettering, painted frame, unpainted edge, extra figure, incoherent, scene not shown, anatomy, broken rule, unseen subject drawn). Unseen-subject questions go only to works whose profile words such subjects, and Watercolor's soft edges are recorded but accepted ([ADR 0006](0006-unseen-presence-speakers-and-launch-bar.md)). Two independent scorers answer every question; the operator settles their disagreements.
- **The gate.** On holdout items both runs judged, refusals, every fault and the unacceptable share may each rise by at most 5% of the items or two items, whichever is larger. A different suite, an unsettled score or a holdout item the candidate never ran fails it. The per-image bar ([ADR 0006](0006-unseen-presence-speakers-and-launch-bar.md)), the consistency gate ([ADR 0008](0008-consistency-in-the-launch-bar.md)) and owner sign-off still apply.
- **One committed runner.** `npm run evals:suite` ([scripts/evals/suite.mts](../../scripts/evals/suite.mts) over [suite-run.ts](../../src/lib/image-evals/suite-run.ts)) carries what the copied runners did: a read-only snapshot, a committed funding file, a clean checkout, a ledger that reserves every paid call before it is made, the check and retry, and blind scorer packs. A release folder now holds a run's data and never its code. An offline mode rehearses a whole run with scripted replies for free. `npm run evals:images` stays for style trials and diagnostic controls.
- **Canon drafting asks only what a work can render.** Under the shared prompt, two Alice drafts each marked six entries "without form": the Caterpillar, the Cheshire Cat, a garden, the rabbit-hole. Nothing in the brief forbids a body, and Alice's profile words no such subjects, so their plans would have been refused. A work whose depiction profile has no `effects` wording is now drafted form-only (`2026-10-30-canon-form-only-v1`): the schema offers no other choice. Works that word such subjects, the Bible among them, keep the unchanged prompt and schema. This closes the drafting item [ADR 0010](0010-work-depiction-profiles.md) left open.

## Consequences

- **The holdout is small.** It holds 20 text cases and 49 image items, enough to catch a broad regression but not a rare one. God's appearances, the Bible's hardest fault, sit almost entirely in the tuned dev cases, so the gate reads them only through the per-image bar. A stratified draw over hard classes is the next addition.
- **Two merge splits are retained, not corrected.** Alice's reading pass split the White Rabbit into four entries and Holmes's split Baker Street into three. A consistency group can name only one entry, so these show up as identity drift the suite can report but not yet pair.
- **Spend.** A release that changes rendering spends about $8.20: one text run and one image run. A prompt change that only touches preparation spends the text run alone. The evaluation allowance funds both; the owner raises it per run.
- **Launch matrices end.** The next measurement is a suite run. Earlier release folders keep their own runners as history.
