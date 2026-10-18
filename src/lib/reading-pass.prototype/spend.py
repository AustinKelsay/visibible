"""Sum the spend from the ledger and check every call against OpenRouter's generation record.

Usage: python -I spend.py [--verify] [out.json]
"""
import json
import os
import sys
import time
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import orclient  # noqa: E402

verify = "--verify" in sys.argv
out_path = next((a for a in sys.argv[1:] if a.endswith(".json")), None)
rows = [json.loads(l) for l in open(orclient.LEDGER, encoding="utf-8")]
by_kind = defaultdict(lambda: {"calls": 0, "cost": 0.0, "prompt_tokens": 0, "completion_tokens": 0, "invalid": 0})
total = 0.0
calls = []
for r in rows:
    kind = r["label"].split("__")[0] + " " + ("merge" if "merge" in r["label"] else "brief" if "brief" in r["label"] else "moments" if "moments" in r["label"] else "read")
    k = by_kind[kind]
    k["calls"] += 1
    k["cost"] += r.get("cost") or 0
    k["prompt_tokens"] += r.get("prompt_tokens") or 0
    k["completion_tokens"] += r.get("completion_tokens") or 0
    k["invalid"] += 0 if r.get("valid_json") else 1
    total += r.get("cost") or 0
    calls.append({k2: r.get(k2) for k2 in ("label", "ts", "seconds", "prompt_tokens", "completion_tokens", "cost", "valid_json", "finish_reason", "gen_id")})
gen_total, missing = 0.0, 0
if verify:
    for c in calls:
        if not c["gen_id"]:
            missing += 1
            continue
        d = None
        for _ in range(4):
            status, d, _ = orclient.generation(c["gen_id"])
            if status == 200:
                break
            time.sleep(1.5)
        if d and status == 200:
            c["generation_cost"] = d["data"].get("total_cost")
            gen_total += d["data"].get("total_cost") or 0
        else:
            missing += 1
for kind, k in sorted(by_kind.items()):
    print(f"{kind:32s} calls {k['calls']:3d}  invalid {k['invalid']}  in {k['prompt_tokens']:8d}  out {k['completion_tokens']:7d}  ${k['cost']:.4f}")
print(f"ledger calls {len(rows)}, usage.cost total ${total:.4f}")
if verify:
    print(f"generation records total_cost ${gen_total:.4f}; calls without a record: {missing}")
if out_path:
    json.dump({"usage_cost_total": round(total, 4), "generation_total": round(gen_total, 4) if verify else None, "calls_without_record": missing,
               "by_kind": by_kind, "calls": calls, "cap": orclient.SPEND_CAP, "model": "anthropic/claude-haiku-5.5"},
              open(out_path, "w", encoding="utf-8"), indent=1)
