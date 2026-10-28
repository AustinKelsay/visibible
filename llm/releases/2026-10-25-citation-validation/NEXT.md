# Proposed next step: resolve situational conditions per moment

**Decision recorded 26 October 2026:** the owner replied “continue” to option A. The [offline candidate](../2026-10-26-moment-conditions/README.md) and [ADR 0003](../../../docs/adr/0003-resolve-conditions-with-each-moment.md) implement and record that choice. The original proposal below is retained as its rationale; it grants no paid execution.

**Original proposal; design only.** The completed [comparison](RESULTS.md) fails the text gate. No application/schema change, paid run, look rewrite or deployment implements this proposal. The current accepted [contract](../2026-10-24-rendering-contract/README.md#ownership-and-bounded-handling) supplies the original five-field section look verbatim to every moment and stops on a reported look conflict. It explicitly has no per-moment look override and calls for a separate repair design before implementation.

## A — recommended: one resolved situation per moment

Keep the shared look as a versioned guide and provenance, and keep source, engine rules, brief and full selected canon binding. Generate this moment's place, time, weather, light and situational clothing together with its scene plan in one planner response. Review that resolved packet and selected canon together. Share the resulting moment content across every style and reader translation; style still owns rendering only.

```text
source + brief + assigned canon + unchanged section look (guide)
  -> one moment plan with resolved situational conditions
  -> review exact resolved content + full selected canon
  -> store versioned moment content
  -> render the same content in every style
```

The original section look stays stored and traceable. Its raw prose would no longer be a second, potentially incompatible instruction in the rendering packet. Explicit owner look corrections remain owner actions. Resolution is a new generated artifact, not an overwrite of owner prose or deletion of reported bad fields. Selected identity/appearance and no-form depiction rules cannot be overridden by situational resolution. Where a source leaves time/weather open, the plan may make one compatible illustrative choice; source-stated facts stay binding.

This changes the accepted meaning of the section look from literal shared rendering input to a guide. The owner must choose that policy before implementation. Any explicit owner constraint that cannot be reconciled with source/canon must still stop for correction; the resolver must not silently reinterpret an owner's contradictory instruction as optional. The implementation design must distinguish explicit constraints from generated suggestions and represent that distinction before migrating any owner look. Existing owner looks cannot safely be assumed to be optional guides.

### Evidence and proposed behavior

These are hand-authored design targets using retained cases, not new model outputs or proof of improvement.

| Case and current outcome | Proposed ownership |
| --- | --- |
| `r027`, Exodus 14:5: both arms refuse a sea-shore look paired with Pharaoh receiving news in his palace. The section includes the camp and pursuit. | A moment about Pharaoh may resolve to the palace; a later camp moment resolves to the shore. Neither inherits the other's occupants or divine effects. Location canon applies when that location is depicted; character canon remains fixed across both. |
| `f019`, Exodus 23:16: candidate refuses low late-afternoon shared light versus a late-morning plan. The verse specifies harvest festivals, not a clock time. | Make one internally compatible light/time choice for the illustrated harvest scene. Do not independently pick two times and pay a reviewer to reject their disagreement. |
| `f022`, Romans 4:7: candidate stores framing Paul plus unsupported background soldiers. | Source/cast review must still reject unsupported narrative framing and participants. Moving the look into a guide cannot make these additions valid. |

Cross-moment consistency must preserve selected canon and reuse the same resolved content for every style/translation. Sections spanning places/times need explicit moment transitions, not one compulsory setting. A future implementation should first replay these actual failed packets offline, check owner-constraint protection and cache/provenance changes, and verify that renderer/reviewer consume the same resolved content. It then needs a separately frozen semantic comparison; no improvement is claimed from a scripted replay.

## B — retain literal shared looks and add explicit correction

Keep the current rendering contract. Give the owner a concrete correction workflow for reported look/canon conflicts, with versioned edits and ordinary invalidation. A generated replacement look could be proposed for owner review rather than silently applied. Multi-place/time sections would need structured ranges or explicit section changes so one shared look can remain compatible with every moment. This keeps the literal input policy but can require more owner intervention and cannot by itself fix false conflict reports or unsupported identities.

## Scope after the choice

Both options still need stronger semantic review evidence: baseline `f006`'s Canaan/Israel geography report, candidate `f022`'s framing identity and candidate `f015`'s formed-stage/radiance mismatch remain retained counterexamples. The present comparison does not identify a better model or prove that another prompt fixes them. Do not treat all 17 reported look-conflict refusals per arm as valid defects, and do not waive the existing quality/availability gates.

After a policy choice, implement and verify the smallest bounded candidate offline. Freeze its actual protocol, costs and retained/fresh controls before requesting any paid authorization. Remaining evaluation allowance is **$0.25338890**, but the completed grant authorizes no further execution. Visual work, current request-path measurements, human acceptance and activation follow only after the relevant preceding gates pass.
