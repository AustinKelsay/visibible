"""Identity checks on "A Scandal in Bohemia" results (paragraph units).

Gold facts (from the text): the masked visitor "Count Von Kramm" is the King of Bohemia
(paragraphs 46 and 106); the "drunken-looking groom" (124) and the "Nonconformist
clergyman" (173) are Holmes in disguise; the "slim youth in an ulster" who says
"Good-night, Mister Sherlock Holmes" (215-216) is Irene Adler in disguise, as her
letter (246) confirms.
"""
import json
import re
import sys


def unit(u):
    m = re.search(r"(\d+)(?:\.(\d+))?", str(u))
    if not m:
        return None
    return int(m.group(2) or m.group(1)) if m.group(2) else int(m.group(1))


def entry(chars, *words):
    for c in chars:
        hay = " ".join([c["id"], c["name"], *c["aliases"], c["note"]]).lower()
        if all(w in hay for w in words):
            return c
    return None


def on_stage_at(p, cid, para):
    for s in p["sections"]:
        a, b = unit(s["start"]), unit(s["end"])
        if a is not None and b is not None and a <= para <= b:
            return cid in s["on_stage_named"] + s["on_stage_unnamed"], s["start"], s["end"]
    return None, None, None


for path in sys.argv[1:]:
    d = json.load(open(path))
    p, r = d["parsed"], d["record"]
    if not p:
        print(r["model_key"], "no JSON")
        continue
    chars = p["characters"]
    def names(c):
        return " ".join([c["name"], *c["aliases"]]).lower()

    kramm = [c for c in chars if "kramm" in names(c)]
    king_ok = len(kramm) == 1 and ("king" in names(kramm[0]) or "ormstein" in names(kramm[0]))
    holmes = entry(chars, "holmes")
    al = " ".join(holmes["aliases"]).lower() if holmes else ""
    irene = entry(chars, "irene")
    youth_alias = bool(irene and any(w in " ".join(irene["aliases"] + [irene["note"]]).lower() for w in ("youth", "ulster", "young man")))
    youth_separate = entry(chars, "youth") if not youth_alias else None
    present, a, b = on_stage_at(p, irene["id"], 216) if irene else (None, None, None)
    print(
        f"{r['model_key']}: {len(p['sections'])} sections, {len(chars)} characters | "
        f"King=Von Kramm one entry: {king_ok} | Holmes groom alias: {'groom' in al}, clergyman alias: {'clergyman' in al} | "
        f"Irene youth alias: {youth_alias}; separate youth entry: {youth_separate['id'] if youth_separate else None}; "
        f"Irene on stage in section with para 216 ({a}-{b}): {present}"
    )
