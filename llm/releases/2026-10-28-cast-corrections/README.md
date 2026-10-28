# Cast corrections: Joseph of Arimathea's tomb (28 October 2026)

**Two sections no longer cast Joseph of Arimathea's Jerusalem tomb in scenes that happen elsewhere.** CodeRabbit flagged John 11:43 on #297 from the Fresco matrix log: its plan was moved from Bethany to Jerusalem because the section's cast included `joseph_of_arimathea_s_new_tomb`. A read-only scan of all 2,790 active sections found 13 that cast this tomb. Eleven are correct: the burial, the empty tomb, and Jesus meeting the women as they leave it. Two are wrong:

| Section | Scene | Why it is wrong | Previous → owner version |
| --- | --- | --- | --- |
| `john-11-38` (John 11:38–44) | Lazarus raised from the tomb | Lazarus's tomb is a cave at Bethany ("It was a cave, and a stone lay against it") | `66ed8c3b` → `0701203a` |
| `mark-5-1` (Mark 5:1–5) | Gerasene demoniac among the tombs | Those are tombs in the country of the Gerasenes, which the section already casts as `gergesene_country` | `951e3151` → `74d9f926` |

Both corrections ran `npm run works:correct -- bible-web remove-cast <section> joseph_of_arimathea_s_new_tomb` against production. The command is new in this PR; it uses the deployed `analysis.correctRecord`, so nothing was deployed. Each wrote an owner version of the section without that member. The entry and its other 11 sections are untouched.

The two sections' looks and plans named the old section versions, so they are remade the next time a reader opens one of those verses. Saved images are unchanged. No new canon entry was added: the planner takes each tomb from the text and the section look. The work stayed ready.
