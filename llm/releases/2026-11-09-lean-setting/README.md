# Lean prompt v6: a setting block for the passage's places

**Adopted.** With the passage's places in their own SETTING block, neighbouring images show the same place in 35 of 39 pairs, against 30 of 38 for the prompt the [comparison](../2026-11-09-lean-engine/README.md) scored. The owner approved this check with the switch to the lean engine ("Yep, let's go with the slim pipeline").

The comparison found lean's weak point was places: 76% the same against the full engine's 93%. The cause was in the prompt. A verse rarely names where it happens, so the place's canon was listed with the cast "elsewhere in this passage", under an instruction to leave it out unless the moment involves it. Prompt v6 lists the section's places under SETTING and tells the model to set the moment there unless it is plainly somewhere else.

| Same place | v4 (as scored before) | v6 (setting block) |
| --- | --- | --- |
| Bible, 5 places, 3 styles | 25 of 26; 1 unclear | **27 of 27** |
| Alice, 2 places, 2 styles | 5 of 12 | **8 of 12** |
| All | 30 of 38 (79%) | **35 of 39 (90%)** |

- **Bible:** the lions' den and the Red Sea, the two places that had misses, now agree in every pair.
- **Alice:** the croquet-ground goes from 4 to 6 of 6. The tea table stays poor (2 of 6): the house behind it still changes, and Alice has no location sheets.
- **Same person,** on the character pairs these verses also form: 12 of 12 against 11 of 12.

## Method

- 48 images of the 18 cases in the Bible's and Alice's place groups, in each work's styles, on Nano Banana 2.1 from the 7 November snapshot. Holmes was left out to keep to the quoted cost; it has six place pairs.
- The v6 pairs and the v4 pairs of the same verses (102 in all) were shuffled into one blind pool and judged by two scorer agents each. Six were disputed; the operator viewed each composite and ruled by blind id ([rulings](consistency/pool/operator-rulings.json)).
- v4's Bible places scored 24 of 27 in the comparison's pool and 25 of 26 here, on the same images. That is the scorers' variance, and it is as large as the Bible's gain. The Alice gain is larger than it.
- This measures places only. It did not re-score faults on v6 images.
- **Spend: $2.0517315** on the production key under a $4.00 cap, in two parts. The first stopped when Google's image filter refused one Alice image with no usage in the reply; the runner now treats that as a refusal, and the key's usage afterwards matched the ledger to the cent, so the refusal was free. No production write.
