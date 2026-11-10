# First lean-engine images in production (10 November 2026)

Readers had made no image since the switch to the lean engine (newest reader image: Genesis 2:22, 9 November 03:17 UTC, full engine). On the owner's go-ahead ("let's continue with one and two now") four owner renders went through the production request path at about 13:47 UTC, chosen for the lean engine's known risks: God drawn as a figure and narrator figures. Owner renders spend no credits; the images are saved like any other and the Nostr scheduler may post the top one from the 12:00–16:00 UTC window.

| Verse | Style | Saved image | Canon in prompt | Sheets sent | Provider cost | Credits | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Genesis 1:3 | Classical | `kh73dknmye02mbww72er2jef7d8hy8rk` | God | style reference | $0.0400 | 5 | Light breaking through cloud over the deep; no figure. |
| Genesis 2:22 | Classical | `kh7em3cfmgknmfdhrz1b2dvsb58hydkb` | Adam, God, Eve, Garden of Eden | style reference | $0.0414 | 6 | The woman brought to the man in a garden by a river; no God figure. |
| Psalms 23:1 | Storybook | `kh71exjv7st2qeawjt6nbnz2yd8hyp1x` | David | David | $0.0405 | 6 | David with his harp among sheep. He is in the cast because the verse heading names him ("A Psalm by David"), and he matches his sheet. Not an invented narrator. |
| Exodus 3:4 | Fresco | `kh75t0ta0vee24j2d0b3kr6msx8hyncc` | God, Moses, Midian, Horeb | Moses, Horeb | $0.0428 | 6 | An old Moses with his staff before the burning bush below Horeb; nobody in the fire. |

All four are acceptable. Every one used prompt `2026-11-09-lean-v6`, made no preparation call (`preparation.calls: 0`), and recorded `lookVersion` and `planVersion` as `none`. Request time was 9 to 12 seconds.

Billing behaves as designed: the request reserves the 6-credit estimate and settles on the provider's reported cost plus the 25% margin (`costUsd` $0.050 to $0.053), so the cheapest image (Genesis 1:3) settled at 5 credits. The production key's usage rose by $0.1647 for the four images, matching `openRouterUsageUsd`; it has $38.35 of its own cap left.
