"""Tabulate score_bible.py JSON lines as a Markdown table."""
import json
import sys

rows = [json.loads(l) for l in sys.stdin if l.strip().startswith("{")]
print("| Model | Time s | In / out tokens | Cost $ | Sections (ref) | Pk | WD | B | Boundary F1 ±2 | Cast P | Cast R | Recurring listed | Same-name groups with as many entries as individuals (not verified identities) |")
print("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for r in rows:
    if "error" in r:
        print(f"| {r['model']} | {r['seconds']} | — | — | failed: {r['error']} | | | | | | | | |")
        continue
    groups = r.get("same_name_groups", {})
    kept = sum(1 for v in groups.values() if int(v.split()[0]) >= int(v.split()[3]))
    print(
        f"| {r['model']} | {r['seconds']} | {r['prompt_tokens']:,} / {r['completion_tokens']:,} | {r['cost']:.4f} | "
        f"{r['sections']} ({r['ref_sections']}) | {r['pk']} | {r['windowdiff']} | {r['B']} | {r['boundary_tol2']['f1']} | "
        f"{r['cast']['precision']} | {r['cast']['recall']} | {r['recurring_listed']} | {kept}/{len(groups)} |"
    )
