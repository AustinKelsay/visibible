# Told-events climb 2 (24 November 2026)

**Goal:** fix the real-image misses of lean-v7 (Acts 13:23 and 13:25 drew Paul twice each in production) without losing speaker scenes.

**Proxy:** a Flash Lite text preview, now with the production reference images attached (`--refs`).
- It copies the real failures on 13:23, Acts 7:2 and Mark 13:2.
- It disagrees with reality on 13:25 and 13:27, so it is a screen only.

**Cases:** 56 in `cases.json`.
- The 40 from round 1 plus 13:23 and the held-out verses.
- Pronoun guards where Jesus or Paul is in the "elsewhere" cast list (John 9:6, Luke 24:30).

**Budget:** $0.50 on the dev key. Spent $0.4835.

## Variants (`v*.json`, replace pairs on the v7 prompt)

| Name | Change |
| --- | --- |
| S | SETTING: "unless the moment, or what its words tell of, is somewhere else" |
| E | CANON, ELSEWHERE: "; a teller is left out of what they tell" |
| R | REFERENCE IMAGES: "; a sheet never puts its figure in the scene" |
| F | HOW TO READ: "from another time or place than the telling" in place of "away from where they are said" |

`vF` is S, E, R and F together.

## Results

**Full proxy, one sample each:**

| | Told | Present |
| --- | --- | --- |
| Base | 21/32 | 10/10 |
| `vF` | 24/32 | 9/10 |

- Gains: 13:19, 13:24, Acts 7:2, Acts 7:56 (Stephen now inside his vision), Daniel 6:22.
- Losses: 13:21 (Saul/Paul name clash), Genesis 41:17, Luke 15:3 (a parable painted in place of the teller).

**Dropping E (`vG`):** the gains vanish, so E is the lever. A softer E (`vH`, "not because their words tell of what is painted") gave told 0/8.

**Real Nano Banana 2.1, `vF`, one sample each:**

| Verse | Result |
| --- | --- |
| 13:25 | John at the Jordan, fixed (production had 0/2) |
| 13:23 | Paul in the synagogue, still a miss |
| Luke 15:3 | Jesus with the Pharisees, kept |
| 13:26 | Paul addressing the synagogue, kept |

**Mark 13:2:** still the speaker under every variant.

## Next

- Run real images, before and after, on about 20 verses (told and guards), two samples each: about $1.80.
- Then test S and R separately for minimality.

## Real before/after run (authorised $1.80; spent $1.653, climb total $2.137)

**Method:** one or two Nano Banana 2.1 images per verse per arm, graded by eye.
- The "before" (v7) images for Acts 13 are the production renders (two each for 13:23 and 13:25). For 13:26 and 2 Samuel 12:3 they are the round-1 renders.
- The sheets are in `pairs/` and `sheet1-4.jpg`.

**Told-event verses:**

| Arm | Told scene, no speaker |
| --- | --- |
| v7 | 13/20 |
| vF | 15/20 |

- **Gains:**
  - 13:21: v7 had a Paul-like figure in the anointing; vF shows Samuel with Saul.
  - 13:25: vF has John at the Jordan in 1 of 2. The other sample puts John in Antioch with Paul and Barnabas watching, so it still mixes the two scenes.
- **Unchanged misses:** 13:23 (0/2 in both arms), Mark 13:2, Genesis 40:9.
- **Already fine in v7 on real images:** Acts 7:2 (Abraham) and Acts 7:56 (Stephen in his vision). The held-out "misses" were proxy artefacts.
- **New depiction fault:** vF 13:17 draws a giant hand in the fire ("uplifted arm" taken literally, against rule 7). Probably sampling.

**Guards:** speaker kept 8/8 in both arms (13:16, 13:26, 13:38, Acts 7:51, John 18:37, Luke 15:3, John 9:6, Luke 24:30).

**Verdict:** a small gain with no regressions, but within the noise of one or two samples. Not the broad improvement hoped for. The remaining misses are other problems:
- 13:23 is an abstract claim;
- Mark 13:2 is a prophecy about the same place;
- Genesis 40:9 narrates a telling.
