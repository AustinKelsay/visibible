"""Check whole-Holmes results: one-pass outputs, or chunked outputs after a merge.

Usage:
  check_holmes_all.py onepass <result.json> [...]
  check_holmes_all.py chunked <merge.json> <story1.json> ... <story12.json>
"""
import os
import json
import re
import sys

paras = {}
for i in range(1, 13):
    n = sum(1 for l in open(f"{os.environ.get('WWR_DATA', '/tmp/wwr-data')}/inputs/holmes_story{i}.txt", encoding="utf-8") if l.startswith("["))
    paras[i] = n


def parse(u, story=None):
    m = re.search(r"(\d+)\.(\d+)", str(u))
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+)", str(u))
    return (story, int(m.group(1))) if m else None


CASES = {
    "Holmes": lambda h: "sherlock" in h,
    "Watson": lambda h: "watson" in h and "sherlock" not in h and "mrs" not in h.split("|")[0],
    "Lestrade": lambda h: "lestrade" in h,
    "Irene Adler": lambda h: "irene" in h,
    "Windibank/Hosmer Angel": lambda h: "windibank" in h or "hosmer" in h,
    "St. Clair/Hugh Boone": lambda h: ("st. clair" in h or "st clair" in h or "st_clair" in h or "boone" in h) and "mrs" not in h.split("|")[0],
}


def hay(c):
    return (c["name"] + " " + c["id"]).lower() + " | " + " ".join(c["aliases"] + [c["note"]]).lower()


def report(name, chars, sections_by_story, extra=""):
    per_story = {s: len(v) for s, v in sorted(sections_by_story.items())}
    print(f"== {name}: {len(chars)} characters; sections per story {per_story}; total {sum(per_story.values())} {extra}")
    for case, pred in CASES.items():
        hits = [c["id"] for c in chars if pred(hay(c))]
        print(f"   {case}: {len(hits)} entries {hits[:5]}")
    irene = [c for c in chars if "irene" in hay(c)]
    print("   Irene youth alias:", any(w in hay(c) for c in irene for w in ("youth", "ulster", "young man")))
    johns = [c["name"] for c in chars if re.search(r"\bjohn\b", c["name"].lower())]
    print("   'John' names:", johns)


mode = sys.argv[1]
if mode == "onepass":
    for path in sys.argv[2:]:
        d = json.load(open(path))
        p, r = d["parsed"], d["record"]
        if not p:
            print(r["model_key"], "no JSON", r["parse_error"])
            continue
        by = {}
        covered = {i: set() for i in paras}
        for s in p["sections"]:
            a, b = parse(s["start"]), parse(s["end"])
            if not a or not b:
                continue
            by.setdefault(a[0], []).append(s)
            if a[0] == b[0] and a[0] in covered:
                covered[a[0]] |= set(range(a[1], b[1] + 1))
        cov = sum(len(covered[i] & set(range(1, paras[i] + 1))) for i in paras) / sum(paras.values())
        report(f"{r['model_key']} one pass ({r['seconds']} s, out {r['completion_tokens']} tokens, ${r['cost']})", p["characters"], by, f"; paragraph coverage {cov:.2f}")
else:
    merge = json.load(open(sys.argv[2]))["parsed"]
    by = {}
    for i, path in enumerate(sys.argv[3:], 1):
        by[i] = json.load(open(path))["parsed"]["sections"]
    report("chunked + merge", merge["characters"], by)
