"""Check present-but-unnamed cases in whole-book Bible results.

For each result: find the section containing the probe verse, then report whether the
character or location is listed there (on stage, unnamed, mentioned, or setting).
Probes: 1SA 17:50 Goliath (named only at 17:4 and 17:23); EXO 14:22 Red Sea (never
named in Exodus 14); JHN 11:35 Lazarus and Bethany (not named in 11:28-37);
JHN 19:25 the three Marys at the cross.
"""
import json
import re
import sys

PROBES = {
    "1SA": [("17:50", "goliath", "char"), ("17:50", "valley_of_elah", "loc")],
    "EXO": [("14:22", "red", "loc"), ("14:22", "pharaoh", "char")],
    "JHN": [("11:35", "lazarus", "char"), ("11:35", "bethany", "loc"), ("19:25", "mary", "char"), ("1:42", "peter", "char")],
}


def cv(u):
    m = re.search(r"(\d+)\s*:\s*(\d+)", str(u))
    return (int(m.group(1)), int(m.group(2))) if m else None


book = sys.argv[1]
for path in sys.argv[2:]:
    d = json.load(open(path))
    p, r = d["parsed"], d["record"]
    if not p:
        print(r["model_key"], "no JSON")
        continue
    out = []
    for verse, word, kind in PROBES[book]:
        v = cv(verse)
        sec = next((s for s in p["sections"] if cv(s["start"]) and cv(s["end"]) and cv(s["start"]) <= v <= cv(s["end"])), None)
        if not sec:
            out.append(f"{verse} {word}: no section")
            continue
        pool = p["characters"] if kind == "char" else p["locations"]
        ids = [c["id"] for c in pool if word in (c["id"] + " " + c["name"]).lower()]
        where = []
        for i in ids:
            for key in ("on_stage_named", "on_stage_unnamed", "mentioned_only", "setting"):
                if i in sec[key]:
                    where.append(f"{i}:{key}")
        out.append(f"{verse} {word} [{sec['start']}-{sec['end']}]: {', '.join(where) or 'NOT LISTED'}")
    print(f"{r['model_key']}: " + " | ".join(out))
