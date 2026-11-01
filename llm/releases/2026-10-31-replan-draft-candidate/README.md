# Give the correction request its current draft

**Offline implementation candidate; not active.** The [Cat/Queen audit](../2026-10-31-cat-queen-state-trace/README.md) found a retry that fixed the croquet hoops but lost a correct floating head. Its instruction to preserve good details did not include the draft. This package supplies that missing input to the existing correction call. It adds no planner, review pass, model call, storage type or work-specific rule.

```text
Source + guide → first plan → review
                               ↓
            same source + guide + normalized draft + problems
                               ↓
                         correction plan → review
```

## Candidate contract

The [unapplied patch](candidate.patch) changes `replanFeedback` to accept the current plan as `{ present, primarySubject, action, setting, secondaryElements, mood, timeOfDay, composition }`. Those are the actual normalized fields already passed to review: long fields retain the existing 400-character trim, and `present` contains deduplicated selection plus any cast entries added by that review. It does not send the reply's unverified `focusQuote`, `instant` or selection evidence as source facts.

The correction request labels the draft as a proposal and asks to preserve other details **only where consistent with the source, work brief, depiction rules and owner constraints**. The original inputs and review complaints remain. The result still uses the existing schema and single semantic re-plan limit, malformed-reply retry, advisory review, effects-mode stop and owner-funded accounting. A model may change the draft when source or depiction errors require it.

The patch bumps `MOMENT_CAST_PROMPT_VERSION` to `2026-10-31-moment-cast-v16`. If activated later, existing plans would refresh lazily through current dependency tracking; guides do not refresh just for this version change. This can incur preparation spend even for moments that will not need a correction. Existing admitted image packets keep their saved inputs. Inspect deployment-specific owner corrections and pins, assess refresh funding, and pass the existing quality/release gates before activation.

The implementation changes four existing runtime lines, replacing four. The remainder of the patch updates two test files and one golden request. No runtime files are changed in this package's checkout after packaging.

## Mechanical evidence

- The new request-content test fails on the current production code because `CURRENT DRAFT` is absent, and passes with the candidate. It checks trimmed fields, duplicate removal, reviewer-added cast, preserved source/complaints, excluded audit assertions, identical provider settings and four recorded calls. It verifies request wiring, not a model's ability to preserve a scene.
- A second test proves that an older planning-version dependency refreshes the plan without remaking the guide and then reuses the new plan.
- The [captured Cat replay](request-replay.json) drives the actual preparation and text-adapter paths with the four historical replies, a reused guide and an 11-record snapshot. Only the second planner request changes; the other three request bodies match exactly. The new suffix contains the floating-head draft and adds 1,251 characters to this retry's user message. Requests still total four, with four synthetic spend entries and no network calls. Historical usage/cost values replayed in memory are not new measured spend.
- Those replies were generated for the old requests and remain unchanged: the replay still ends with the historical perched Cat. This is deliberately **not** a simulated success or candidate-quality result.
- Of 27 Bible golden entries, only `prepare:exodus-19-18:3` changes, and only its user correction suffix. System messages, response schemas, provider settings and every other captured entry stay exact. The fixture scenarios and scripted replies are unchanged. Alice and Holmes goldens remain unchanged.

[verification.json](verification.json) binds the base, patch, affected files, retained request evidence and observed command logs. The first full-suite run found the expected Bible correction snapshot mismatch. The snapshot was updated after verifying that exact request boundary; the final checks are recorded in the manifest. No model/image calls, account queries or paid evaluations were made.

The final applied-candidate suite passed **1,055 tests**, with one existing skipped test. Typecheck passed; lint reported zero errors and three existing warnings. CodeRabbit raised **0 issues** on the runtime and two test files. The golden fixture changed after that review began; its single request-suffix change was verified separately and is included in the independent package review.

## Reproduce

Use a disposable checkout at `0ed826a52020fb938041d8cfb9cfd8d22279dc31`, with dependencies installed, and an absolute path to this package:

```sh
git apply --check /absolute/path/to/candidate.patch
git apply /absolute/path/to/candidate.patch
npm run works:import
npm test -- --run
npm run typecheck
npm run lint
```

The patch includes the focused tests and expected golden request. No production credentials or reference-image files are needed for these checks. `request-replay.json` contains the candidate suffix and hashes of its retained source files; the temporary investigation helper and command logs are session evidence, not runtime or repository dependencies.

## Decision and next step

This establishes a smaller, more complete handoff to the model. It does not establish causal efficacy, visual improvement, fewer retries, lower spend or human acceptance. The draft increases retry input tokens. Preserving its content too strongly could also preserve a mistake; the wording allows correction, but only model evidence can assess that tradeoff.

A later bounded text comparison should hold the first draft, source, guide, complaints and model settings fixed, repeat both arms, and inspect all outputs. Include the captured hoop/head case, its source-stated Queen smile, legitimate branch scenes, and a case that requires changing an incorrect pose or effects-mode depiction. Keep other existing faults visible rather than scoring only the target detail. Set criteria and funding before paid execution; do not activate from scripted tests alone. This package contains no paid runner or authorization.

New spend: **$0**. The last recorded cumulative spend remains **$6.82885455 of the $7 cap**, leaving **$0.17114545**; the $5 reader reserve remains protected. This is an accounting carry-forward, not a fresh account query.
