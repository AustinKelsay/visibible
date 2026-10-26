# Resolve conditions with each moment: offline candidate

The owner replied “continue” to option A after [PR #276](https://github.com/AustinKelsay/visibible/pull/276): resolve this moment's setting, time, weather, light and situational clothing with its plan while retaining canon and explicit owner constraints. [ADR 0003](../../../docs/adr/0003-resolve-conditions-with-each-moment.md) records the accepted tradeoff. This candidate implements that policy offline. No new paid run, production queries/writes, application/backend deployment, images or activation is included.

## One content packet

```text
source + brief + cast + section look (generated guide / literal owner constraints)
  -> planner v10: evidence + selected cast + scene fields + five moment conditions
  -> review v8: exact moment conditions + scene fields + full selected canon
  -> versioned plan stores all reviewed generated content
  -> renderer v8: same conditions + scene + full selected canon, in every style
```

The original generated section look is kept unchanged, including bad wording, as a guide and provenance dependency. It is supplied to planning without establishing participants, events or manifestations. The planner resolves one compatible situation from source; the raw guide no longer supplies a second instruction to rendering. Source-stated conditions, canon identity/appearance, depiction rules and brief stay binding. A generated condition fault receives the existing single re-plan together with its scene; a repeated failure stops before references, credits or image work. No new preparation call or retry tier is added. Expected plan completion increases from 900 to 1,200 tokens for costing; the 2,400-token completion limit is unchanged.

New plan payloads contain required `situation` values for place, time, weather, light and clothing, generated in the same response as the scene fields. Their content participates in the plan version. Conditions are shared across styles/translations and survive all prompt trims. Only variation, neighbor hints and style detail may be trimmed; an overrun refuses the packet. The legacy `lookDetailIncluded` provenance flag remains true for v8 packets. Rendering with no moment conditions refuses rather than falling back to a historical look.

## Owner protection and compatibility

An owner-authored look, or one with unknown provenance, remains a literal constraint. The planner must copy every value exactly; code refuses a reinterpretation before semantic review. A reported source/canon conflict then stops for explicit owner correction. The full original look remains stored even when canon/brief dependencies change; it is not regenerated over an owner edit. This conservative rule avoids guessing which clauses the owner considered optional.

The plan names both the look's content version and a new ownership-policy input. Taking ownership of identical look bytes invalidates the generated interpretation. Preparation and assembly recheck ownership/version, including after reference loading; the Convex mutation also refuses a stale plan write atomically. A generated look write cannot replace an owner look. Historical plans remain readable through an optional backend field, but new preparation requires it and new renderer v8 refuses its absence. Backend schema deployment must precede an app writing the new payload; neither is authorized here. Saved images keep their original prompts/provenance.

## Offline evidence and limits

The full suite passes **1,029 tests, with one existing skip**, plus lint and type checks. Ten new moment-condition tests use the actual failed Exodus 14:5 and Exodus 23:16 input packets with hand-authored new conditions. They establish guide retention, exact review/render input, persistence, reuse across three styles, ownership invalidation with identical bytes, unknown-provenance protection, refused owner reinterpretation, owner-conflict containment, an in-flight ownership change and refusal of old direct rendering inputs. Existing Convex tests additionally prove atomic stale-write/owner-write refusal and cache behavior. The API regression proves repeated generated-condition failures stop after one re-plan with no image, credit reservation, loaded reference or request record.

These scripted conditions and clean reviews are not fresh model outputs, rescored paid outcomes or a semantic improvement measurement. Original input snapshots and first scores are unchanged. The previous full comparison remains **3/30 acceptable candidate versus 4/30 baseline, both 0/7 retained**. Romans framing Paul/background soldiers, formed Jesus versus radiance and questionable Canaan/Israel conflict reports remain semantic counterexamples. One retained Daniel packet now correctly refuses an 8,000-character overrun rather than trimming required conditions; this is containment, not restored availability.

The previous paid protocols intentionally reject changed source hashes. Replay them at their retained evidence branches/commits; never update their manifests to fit this candidate.

## Next evaluation boundary

Evaluation allowance remains **$17.50**, measured usage **$17.20161110**, retained uncertainty **$0.045**, remaining **$0.25338890**. The earlier grant ended. Preparation and smoke allowances stay separate. Before any new paid run, freeze the actual immutable v7 baseline and this candidate, exact source/canon fixtures, paired cold preparations, owner-constraint and semantic controls, first-outcome scoring, accounting/restart guards and fresh provider estimates. Retained-case diagnostics cannot establish fresh-case or visual reliability. The proposal must be explicit about that limitation and cannot weaken the broad 22/23 fresh, 7/7 retained, zero-flaw release-validation standard.

Current full-request latency/accounting, visual compliance/likeness, human acceptance, explicit public activation and the named 24-hour follow-up remain outstanding. The text candidate has no live semantic verdict yet.
