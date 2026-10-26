# Forgiving scene preparation with a legacy fallback

On 27 October 2026 the owner approved making scene preparation "less heavy-handed and more forgiving and generic", fixing the prompt-length and Classical style-reference problems, and falling back to the legacy engine when the generic engine cannot prepare a verse. The [fresh measurement](../../llm/releases/2026-10-26-fresh-conditions-check/RESULTS.md) had shown the strict contract refusing 16 of 30 cases (most for an unselected place, missing evidence quotes or missing canon) while still storing flawed plans. Twelve prompt and contract rounds since 23 October had not converged. The [image check](../../llm/releases/2026-10-26-image-check/RESULTS.md) showed Watercolor refusing for prompt length and Classical drawing God as a figure without a style reference.

The planner now gets a short general contract and returns its instant, selected cast with a few words of evidence, seven scene fields and the five moment conditions. Evidence quotes are recorded for audit, not validated. The planner no longer reports missing cast. The plan review advises rather than gates:

- A depicted but unselected cast entry is selected so it receives its canon.
- Other reported problems get one re-plan, after which the plan is kept with notes.
- Missing canon and owner-constraint conflicts are only noted; owner constraints are restored verbatim.
- An unreadable review keeps the plan.
- Preparation refuses only when a subject without form is still drawn as a body after the re-plan, or when the planner's replies are unreadable twice.

When the generic engine refuses a scene before any request record, reservation or paid call, an unbound Classical request is served by the legacy engine. Non-Classical styles have no legacy renderer and still return a retryable 503. A bulk job bound to legacy by such a fallback keeps its later Classical verses on legacy, so one job never mixes engines.

Rendering rules are shorter, the prompt cap is 12,000 characters (text is about $0.001 of a $0.034 image), and every style may have a style reference, Classical included. This amends [ADR 0002](0002-consistent-images-from-canon-and-reference-images.md)'s non-Classical-only style reference and refines [ADR 0003](0003-resolve-conditions-with-each-moment.md): owner constraints stay literal, but a reported conflict no longer stops preparation.

The rejected alternative was another round of narrower prompt rules and stricter validation. Each earlier round fixed one failure class while others refused or stored, and readers got no image for refused verses. The cost of forgiveness is that some stored plans keep reviewer-noted problems; the notes make them auditable, and the release gates still measure acceptable images. This decision covers offline implementation. A paid re-measurement, the Classical style reference image in production, deployment and public activation remain separate owner decisions.
