# An unseen presence, speakers outside their words, and the launch bar

On 27 October 2026 the owner replied "ok continue. Your call on all of these" to three open questions after the [v10 re-measurement](../../llm/releases/2026-10-27-v10-image-check/RESULTS.md): how to handle throne and Sinai scenes, how to handle speakers placed in scenes, and what quality bar to launch at. These are the operator's decisions under that delegation.

**An unseen presence.** God was still drawn as a figure in 3 of 5 images each for Sinai (Exodus 19:18) and the throne vision (Isaiah 6:1). Not naming the subject had already cleared ordinary glory-cloud scenes. The remaining figures sat where the prompt described one concentrated glow: "radiance veiled in cloud… with a fire-like glow at its heart", a "robe-like train", "throne-light". A subject without form is now never drawn and never described:

- The image prompt leaves out its canon text as well as its name, the verse and the neighbours. One short block says the plan's light, cloud, smoke and fire are light and weather spread through the place, with nobody in them.
- The planner shows such a moment through the place and the people who witness it. It describes only the physical effects the text names, in its own plain words, spread through the scene or coming from beyond the frame. It leaves out the subject's throne, seat, chariot, robe or train, and any face, hands, hair or body.
- The plan review treats a robe, train, or throne or seat of its own as embodiment (`embodied_formless`).

The rule is general: it applies to every no-form subject in every style, not to a list of theophany verses. Its cost is that the presence's fixed look (for God, white-gold light veiled by cloud) no longer reaches the image; the plan's effects carry the scene instead. Refusing these scenes was rejected, because only Classical has a legacy fallback, so Watercolor and Icon readers would get no image.

**Speakers stay outside their words.** In 5 of 30 plans, the speaker or prophet stood inside the scene their words describe, such as Ezekiel on Tyre's quay or Eliphaz as the armed attacker in his own simile. When a moment is mostly someone's words (a prophecy, poem, prayer, argument, teaching, or a story, vision or memory being told), the planner draws what the words describe and leaves the speaker and listeners out, unless the text puts them inside that scene. It never makes a speaker a figure of their own words. The plan review's `outside_instant` names the same pattern.

**The launch bar.** The text-plan gate (22 of 23 fresh plans acceptable under strict scoring) is retired as a launch gate. Plans are intermediate, and that gate counts harmless canon restatement as a defect. Plans are still measured as a diagnostic. Launch is judged on images, which are what readers see, using a fixed visual matrix: the 36 fixed cases in three styles, one image each, scored by two blind model scorers with operator adjudication. Launch requires:

- At least 75% of images acceptable, and at least 65% in each style.
- A no-form subject drawn as a figure in at most 1 in 20 images of scenes where it is selected.
- Painted margins in at most 1 in 10 Watercolor images.
- Owner sign-off after viewing the contact sheet.

Then deployment (database schema first), the public switch and a 24-hour follow-up proceed. A refused Classical scene falls back to the legacy engine, so refusals count against availability only for other styles.

Before that matrix, a small check of these changes measures text plans on a new draw and images of God-appearance scenes, three of them not used for tuning.

## Amendment: no canon for a no-form subject anywhere in preparation

The [v11 check](../../llm/releases/2026-10-27-v11-image-check/RESULTS.md) cleared Sinai and three God-appearance scenes never used for tuning. The remaining figures (3 of 21 images) came from plans that copied God's canon back in, such as "white-gold radiance veiled by cloud with a fire-like glow at its heart… throne-light", or that followed the section look's "central throne". In the [text check](../../llm/releases/2026-10-27-v11-fresh-check/RESULTS.md), the same copying added an unselected divine glow to five plans. So the section look and the planner no longer receive any canon for a no-form subject, only its name and `hasForm: false`. The no-form look prompt no longer permits "an unoccupied seat". The speaker rule now names writers of letters and proverbs too, and the image rules name a corner signature or initials. The plan review still reads the full canon. One 1 Kings 22:19 case showed a separate gap: its section cast has no God entry, so none of this applies there. That is an analysis correction, not a prompt rule.

## Amendment 2: soft Watercolor edges are part of the style

The [launch matrix](../../llm/releases/2026-10-27-launch-matrix/RESULTS.md) failed the bar: 62 of 99 shown images were acceptable. Ten of the 33 Watercolor images faded to white paper along an edge or the bottom, and a retry never fixed one. On 28 October the owner viewed those ten and decided that soft white edges are acceptable in Watercolor ("yes they are!"). The bar's Watercolor-margin limit is removed. A soft fade to white no longer makes a Watercolor image flawed, and the image check no longer retries one. The style still asks for paint to every edge, and painted frames or borders remain faults in every style.

The same matrix showed two other fixable causes, and both are now rules:

- **No visible writing.** Plans for genealogies asked for a scroll of names, and Icon halos and the cross's title board carried glyphs. A list or genealogy is now shown through people, places and things, never as a written document. Plans ask for no visible writing, so scrolls, tablets, letters and books stay rolled or closed, and signs and boards are blank. The image rules forbid writing on scrolls, tablets, books, boards and halos.
- **Nothing unseen, and empty thrones.** "A faint radiance of an unseen angel" was drawn as an angel, and an unselected God sat on Revelation 4:6's throne. Plans now describe only what can be seen. When a plan keeps the light, cloud or fire of a no-form subject, it selects that subject, so the unseen-presence line applies. The no-form addendum also names its hem. The image rules keep a throne or seat empty unless the plan names who sits there.

The rest of the bar is unchanged: at least 75% acceptable overall and 65% per style, a no-form figure in at most 1 in 20, and owner sign-off.

## Amendment 3: Classical and Watercolor launch first

The [rerun](../../llm/releases/2026-10-28-launch-matrix-v2/RESULTS.md) reached 71% overall. Classical (84%) and Watercolor (78%) met the bar on their own, together 81%, while Icon fell to 50% from halo letters, scribbles and gold border bands. On 28 October the owner chose to launch Classical and Watercolor first and fix Icon afterwards. The public switch now releases only the styles in `PUBLIC_GENERIC_STYLE_IDS`. Icon stays available to the owner in owner and public modes and reports temporarily unavailable to readers, as it does today. Icon joins the list after its own measurement meets the per-style bar.

## Amendment 4: Fresco is the third public style

Icon failed two style rounds: 50% in the [rerun](../../llm/releases/2026-10-28-launch-matrix-v2/RESULTS.md) and 44% with rewritten style text in the [third run](../../llm/releases/2026-10-28-launch-matrix-v3/RESULTS.md). The owner asked for another third style.
- **Bake-off:** Gouache, Engraving and Fresco ran on 12 hard cases ([bake-off](../../llm/releases/2026-10-28-style-bakeoff/RESULTS.md)). Gouache read as another painterly oil style, so Fresco and Engraving were the distinct options, and the owner chose Fresco by its look.
- **Full matrix:** Fresco reached 24 of 33 acceptable shown images (73%) with no God figure ([Fresco matrix](../../llm/releases/2026-10-28-fresco-matrix/RESULTS.md)). With Classical and Watercolor the three styles reach 78%.

Fresco joins the shared style library, the Bible brief and `PUBLIC_GENERIC_STYLE_IDS`. Icon stays in the library, so saved Icon images keep their label, and remains owner-only.

Adding a style changes the brief file, and its version must match the active analysis. A full reread for a style list is wasteful, because no reading, canon, look or plan uses the list. `analysis.amendBriefStyles` therefore approves a brief change that differs only in `styleIds`. It verifies the old file against the registered and active versions and moves both to the new version. Cached looks and plans still name the old version and refresh lazily, which costs one planner round per moment as readers return. The [runbook](../../llm/workflow/ENGINE_RELEASE.md) gives the order.

## Amendment 5: consistency joins the bar

On 29 October the owner asked for consistency to become a release gate. The launch bar now also requires images that should agree to agree: a recurring character across stories, and the place across neighbouring verses of one section. These are judged in blind pairs from the same launch matrix, against the floors in [ADR 0008](0008-consistency-in-the-launch-bar.md). The matrix must render every verse in [the consistency groups](../../evals/images/consistency.json).

## Amendment 6: Storybook is the fourth public style, in Icon's place

Icon stayed owner-only after two failed style rounds, and on 1 November the owner asked for a safer fourth style and delegated the pick ("your call!"). Candidates were chosen because their traditions carry neither inscriptions nor a physical object with edges, the two fault classes that held Icon at 44 to 50%.
- **Bake-off:** Charcoal, Storybook and Pastel ran on the Fresco bake-off's 12 hard cases ([second bake-off](../../llm/releases/2026-11-01-style-bakeoff-2/RESULTS.md)). Charcoal and Storybook tied at 10 of 12; Pastel reached 8. No candidate drew a God figure or a frame. The predeclared tie-break on lettering, frame and margin faults chose Storybook, which had none and needed no retry.
- **Full matrix:** Storybook reached 28 of 33 acceptable shown images (85%) with no God figure in nine God scenes ([Storybook matrix](../../llm/releases/2026-11-01-storybook-matrix/RESULTS.md)). With Classical, Watercolor and Fresco the four styles reach 104 of 130 (80%).
- **Consistency ([ADR 0008](0008-consistency-in-the-launch-bar.md)):** a [consistency-verse run](../../llm/releases/2026-11-01-storybook-consistency/README.md) rendered the 14 group verses the matrix did not. All 47 Storybook pairs were judged the same person or place; pooled with the released styles' baseline verdicts the gate passes at 98% same person and 92% same place.

Storybook joins the shared style library, the Bible brief and `PUBLIC_GENERIC_STYLE_IDS` by the amendment 4 path: deploy, then the styles-only brief amendment. **It ships as measured, without a style reference.** Both measurements ran with no Storybook style reference, and a reference changes every Storybook prompt, so none is made until a run with one has met the bar; Fresco shipped the same way and still has none. Icon stays in the library, so saved Icon images keep their label, and remains owner-only. Charcoal is the measured runner-up should a monochrome style be wanted later.
