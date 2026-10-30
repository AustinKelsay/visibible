---
status: accepted
date: 2026-10-30
---

# Each work words its own depiction, beside its brief

The engine is meant to illustrate any work, but its shared instructions had absorbed the Bible's. Every image prompt, for any work, forbade writing on "scrolls, tablets, books, boards or halos", allowed "crucifixion", and kept "a throne or seat" empty. The planner's examples were Bible verses ("the king ready for battle", "the man standing in the gap"). The plan review and the finished-image check always looked for God drawn as a figure, with thrones, chariots and robes in their wording. Those words came from the Bible's God-figure evaluations ([ADR 0005](0005-one-scene-description-unnamed-presence.md), [ADR 0006](0006-unseen-presence-speakers-and-launch-bar.md), [ADR 0007](0007-check-each-finished-image.md)). The one switch behind them, a canon entry's `hasForm`, applied them to any entry the reading pass marked without form. For the Bible that included Nineveh, a city. For Holmes it was Southampton Road, whose name the prompt would have replaced with "the presence".

## Decision

- **A depiction profile per work.** `works/<work-id>/depiction.json` holds the wording that belongs to one work: where its writing appears, its written objects, the serious subjects it may show beyond the engine's floor of battles, blood and death, any planner examples, and the wording for each depiction mode it uses. The engine's own instructions are general and take these as parameters. [depiction.ts](../../src/lib/engine/depiction.ts) validates the file.
- **Depiction modes replace the yes/no flag.** Every canon entry has a mode. `form` entries are drawn from their canon. `effects` entries are never drawn: their canon stays out of every prompt, they get no reference sheet, and only the effects the text names stand for them. A work's profile words each mode beyond `form`. A work without `effects` wording has no such subjects: its prompts never mention them, its plan review cannot report `embodied_formless`, and its image check asks about edges, frames and lettering only. An entry in a mode the work does not word is refused before any model call, never drawn with another work's wording.
- **The Bible's wording moves verbatim.** The Bible's profile holds exactly the text the engine used, so every Bible request is byte-for-byte unchanged. [A golden test](../../src/lib/__tests__/bible-engine-golden.test.ts) pins rendering, look, plan, review and image-check requests, with their provider schemas, as captured before the move. The engine asks for exactly what it asked before, so the [release evaluation](../../llm/workflow/IMAGE_EVAL_AND_RELEASE.md) has nothing to measure. Plans and looks remade at release are fresh samples of those same requests, as after any cache refresh.
- **Mode stays stored as `hasForm`.** With two modes, `hasForm: false` is `effects` and absent or `true` is `form`. Older deployments and existing records read it unchanged, and no migration is needed. `works:correct set-depiction` lets the owner change an entry's mode.

## Why beside the brief, not in it

The brief is the owner's prose contract: tone, depiction rules, eras and style set, registered with the analysis and approved by a one-file PR. Its file hash is the brief version that every look and plan records, and that production must register before it serves images. Putting engine wording into it would have:

- forced a production re-registration;
- remade every look and plan for any wording change, even one only image prompts read;
- spent part of the brief's 400-word budget on instructions to models.

The profile is engine-facing data, closer to a style file. It is deployed with the build, versioned by content and never registered. Looks and plans record only the parts they read (`depiction_plan` for the planner and review wording, `depiction_look` for the `effects` look wording). Rendering-only wording therefore remakes nothing. The rendering packet and the saved image record the whole profile's version.

## Consequences

- A new work needs a depiction profile before it can be prepared or rendered. A work with no subjects without form needs only its writing, documents and serious-subject fields.
- On release, every cached plan and every look of a section with an `effects` entry is remade once, lazily, because it does not yet record the profile it read. Production held 55 plans and 46 looks on 29 October. Their requests are identical, so this is owner spend and first-request latency, not a change in what is asked.
- Still open:
  - More modes. The Bible's canon has entries that `effects` does not fit: Satan as a red dragon, the foolish woman as a doorway, and the Holy Spirit as a dove, which the brief allows. They need a mode that is drawn only as a non-human form. Its wording would be new prompt text and needs an image evaluation, so this record does not add it.
  - Misclassified entries. The owner can return Nineveh, the heavenly court and Southampton Road to `form` with `set-depiction`.
- The engine's general wording still carries some Bible-shaped genres in the planner's list (prophecy, oracle, parable, vision). They describe kinds of speech that many works have and were left as engine wording.
- Canon drafting, an offline owner step, still offers every work the same vocabulary for subjects without form (light, radiance, cloud, mist, fire, wind, voice). A work's profile does not yet shape drafting. The request path and saved images remain Bible-shaped by design ([ADR 0002](0002-consistent-images-from-canon-and-reference-images.md)).

## Amendment: the symbol mode (30 October 2026)

The owner funded a third mode, `symbol`: an entry drawn only in the non-human form its canon describes, never as a person. The motivating entries are Satan, whose canon is a red many-headed dragon, and the foolish woman of Proverbs 9, whose canon is a doorway. Both are stored without form today, so their canon never reaches the image.

- **Behavior.** A symbol entry keeps its canon text in the image prompt. It is not named among the selected characters, gets no reference sheet, and adds the work's symbolic-form line, which names it. The planner sees its canon form beside its name, plus the work's symbol instruction. The plan review treats it as having form, so `embodied_formless` never applies to it.
- **Storage.** It is stored as `depiction: "symbol"` with `hasForm: false`, so a deployment from before the mode treats it as `effects`, as now. `works:correct set-depiction <entry> symbol` sets it.
- **Unchanged requests.** Bible requests without a symbol entry stay byte-for-byte unchanged (golden test). Plans record the profile's symbol wording only when their section casts a symbol entry (`depiction_symbol`).
- **Not applied.** A [paid two-arm check](../../llm/releases/2026-10-30-symbol-mode/README.md) found Satan drawn as his dragon in 15 of 15 images (6 of 15 today), and acceptable images rose from 12 to 14. Its pre-declared bar still failed: the foolish woman was never selected, and figures in light rose from 2 to 3, all from one Revelation 12:9 plan that gave Michael's no-form host garments. Asked with that result, the owner overrode the bar for Satan alone ("Ship for Satan only"). The foolish woman stays without form until a check selects her.
