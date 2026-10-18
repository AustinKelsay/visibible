"""Sum live spend from the ledger and check each call against OpenRouter's generation record.

Usage: python -I spend.py <ledger.jsonl> [--verify]
"""
import os
import json
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

rows = [json.loads(l) for l in open(sys.argv[1])]
verify = "--verify" in sys.argv
by_model = defaultdict(lambda: {"calls": 0, "billed": 0, "failed": 0, "cost": 0.0})
total = 0.0
gen_total = 0.0
missing = 0
for r in rows:
    m = by_model[r["model"]]
    m["calls"] += 1
    c = r.get("cost") or 0
    if r.get("cost") is not None:
        m["billed"] += 1
    if not r.get("valid_json"):
        m["failed"] += 1
    m["cost"] += c
    total += c
    if verify and not r.get("gen_id"):
        missing += 1
    elif verify:
        import orclient

        for attempt in range(3):
            status, d, _ = orclient.generation(r["gen_id"])
            if status == 200:
                break
            time.sleep(1)
        if status == 200:
            gen_total += d["data"].get("total_cost") or 0
        else:
            missing += 1
for model, m in sorted(by_model.items(), key=lambda kv: -kv[1]["cost"]):
    print(f"{model:45s} calls {m['calls']:3d}  no-usable-JSON {m['failed']:2d}  ${m['cost']:.4f}")
print(f"ledger calls {len(rows)}, usage.cost total ${total:.4f}")
if verify:
    print(f"generation records total_cost ${gen_total:.4f}; calls without a generation record: {missing}")
