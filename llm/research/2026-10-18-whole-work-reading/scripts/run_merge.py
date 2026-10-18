"""Merge per-part reading-pass results into one cast with one model call.

Usage: python -I run_merge.py <label> <model_key> <outdir> <part_label>=<result.json> [...]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prompt  # noqa: E402
import run_extract  # noqa: E402

label, key, outdir = sys.argv[1:4]
parts = [a.split("=", 1) for a in sys.argv[4:]]
lines = []
for part_label, path in parts:
    p = json.load(open(path))["parsed"]
    lines.append(f"## Part {part_label}")
    lines.append("Characters:")
    for c in p["characters"]:
        lines.append(f"- {part_label}:{c['id']} | {c['name']} | aliases: {', '.join(c['aliases']) or '-'} | {c['note']}")
    lines.append("Locations:")
    for c in p["locations"]:
        lines.append(f"- {part_label}:{c['id']} | {c['name']} | aliases: {', '.join(c['aliases']) or '-'} | {c['note']}")
    b = p["brief"]
    lines.append("Brief: " + json.dumps(b, ensure_ascii=False))
work = os.environ.get("WWR_WORK", "The Adventures of Sherlock Holmes (Arthur Conan Doyle, 1892)")
user = f"Work: {work}\n\n" + "\n".join(lines)
open(f"{outdir}/{label}__input.txt", "w").write(user)
run_extract.run(label, key, prompt.MERGE_SYSTEM, user, "merge", prompt.merge_schema(), outdir, 60000)
