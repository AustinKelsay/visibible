# v10 fresh re-measurement: stopped by a renderer bug

The one-shot run stopped after **5 calls / $0.002635**, with no uncertain usage, no recorded outcomes and no restart. The first case selected a subject without form, and `buildRenderingPacket` threw `t.replace is not a function`. Renderer v10's name replacement assumed every plan value is text, but this harness passes the stored payload, whose `present` list is an array. The production assembly path passes only the seven text fields and was unaffected; the paired image check ran normally.

The bug is fixed so that only text plan values are rewritten, and a regression test covers it. The same frozen draw ([sample-set.json](sample-set.json), outcomes unseen) is measured again in [2026-10-27-v10b-fresh-check](../2026-10-27-v10b-fresh-check/README.md) under the same owner approval. [Ledger](ledger.json), [provider log](provider.ndjson).
