# Daniel's missing ministering assembly — 2026-10-22

Follow-up: the [applied correction and fresh preparation evidence](../2026-10-22-daniel-cast-repair/README.md) records deployment and application of this exact addition, followed by a retained section-look failure. The remainder of this document describes the original unapplied correction PR.

The [first v5 plan](../2026-10-22-daniel-effects-v5/README.md) described attendants without a matching section cast entry. Source review finds an assembly ministering before the Ancient of Days in WEB Daniel 7:10, inside the same Daniel 7:9–14 story section. The section's four entries omit that group. The shared owner look already mentions court attendants; removing that phrase alone would not give the source-supported assembly canon when planning 7:10.

A read-only inspection of the active generation enumerated 1,569 analysis entries in four bounded pages. No matching Daniel group was found. The heavenly court entry belongs to Job and is a location; Luke's heavenly host is explicitly the nativity group. Neither is substituted for this assembly. This is an agent source/cast judgment, not a claim that a semantic validator proves identity or depiction.

[addition.json](addition.json) is a concrete **unapplied owner correction** for [#183](https://github.com/AustinKelsay/visibible/issues/183), following [#165](https://github.com/AustinKelsay/visibible/issues/165) §4–5 and §8. It creates one character entry describing a typical group member and adds its stage to the existing section. It preserves the four existing cast assignments, reference text, work brief and moments. It does not claim the group must appear in every moment, including fixed Daniel 7:9.

The complete Daniel 7:10 quote supports the assembly's presence. The robe, physical features and other appearance choices are owner-authored illustrative choices where the text is silent, not quoted source facts. No fabricated reading-pass member key is attached. `hasForm: true` applies to the assembly; the Ancient of Days' no-form rule and canon are separate and unchanged.

The new `works:correct add-cast` path verifies every supporting quote against the exact imported work and requires the assigned stage to have evidence inside the target section. The server authenticates the owner, checks the registered work version, active generation and expected section version, rejects identity collisions or incomplete stages, and writes the new owner entry plus section assignment atomically. Exact retries are harmless. It does not call a model or rewrite a plan, look, reference, image or report. Normal dependency checks then remake the affected look/plans lazily, without freezing or rebinding their inputs.

After compatible code is deployed, the correction command is:

```sh
npm run works:correct -- bible-web add-cast --file llm/releases/2026-10-22-daniel-cast-correction/addition.json
```

The file binds generation 1, the imported WEB hash and the retained section version. If those inputs change, inspect and revise the correction rather than bypassing the stale guard. A later full reread must retain this entry ID before carrying the owner section forward; an incomplete reread that omits it is structurally refused while the active generation keeps serving.

**This PR does not run that command or deploy code.** No paid calls, production writes, images, activation or budget changes occur. The v5 plan remains held, unchanged and in history. Regression tests cover source checks, atomic failure, retries, owner history/counts, lazy preparation, selected group canon across all three styles, absent-group omission, unrelated section caches, saved-image preservation and reread behavior. Scripted planning proves that plumbing, not that Haiku will select the right figures. Live text/visual follow-up and the existing release gates remain open; no new manual approval gate is introduced.
