"""Flag brief lines that name a single character or a single chapter/section (ticket 155's check).

Usage: python -I check_brief.py <work.json> <merged analysis.json>

A line is flagged when it contains, as whole words, a proper-name form of one cast entry
(a person, divine being, animal or other individual; groups are not individuals), the name
of one location, a chapter/section reference ("chapter 3", "Exodus 25-27", "ch. 12"), or
a division or section title. Prints the flags as JSON; `flag_brief()` is importable.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import read_divisions as rd  # noqa: E402
import work_format as wf  # noqa: E402

CHAPTER_REF = re.compile(r"\b(chapters?|ch\.|sections?|verses?|stories|story|¶)\s*\d+|\b[1-3]?\s?[A-Z][a-z]+\s\d{1,3}(?::\d+)?(?:\s?[-–]\s?\d+)?\b")
GENERIC = {"god", "lord", "the lord", "jesus", "christ"}  # kept: these are flagged too, but marked as divine/central so the owner sees the kind


def _word_re(form):
    return re.compile(r"(?<![A-Za-z])" + re.escape(form) + r"(?![A-Za-z])")


def flag_brief(work, merged):
    cast_forms = []
    for c in merged["cast"]:
        if c.get("kind") == "group":
            continue
        for f in rd.proper_forms(c):
            if len(f) >= 3:
                cast_forms.append((f, c["name"], c.get("kind", "person")))
    loc_forms = []
    for l in merged["locations"]:
        for f in rd.proper_forms(l):
            if len(f) >= 3:
                loc_forms.append((f, l["name"]))
    titles = [(d["name"], "division") for d in work["divisions"]] + [(s["title"], "section") for s in merged["sections"]]
    lines = [("tone", merged["brief"]["tone"])]
    lines += [(f"depiction_rules[{i}]", r) for i, r in enumerate(merged["brief"]["depiction_rules"])]
    for e in merged["brief"]["eras"]:
        for k in ("people", "dress", "buildings_and_objects", "technology"):
            lines.append((f"era '{e['name']}'.{k}", e[k]))
    flags = []
    for where, text in lines:
        hits = []
        for f, name, kind in cast_forms:
            if _word_re(f).search(text):
                hits.append({"kind": "character", "entity": name, "entity_kind": kind, "matched": f})
        for f, name in loc_forms:
            if _word_re(f).search(text):
                hits.append({"kind": "location", "entity": name, "matched": f})
        for m in CHAPTER_REF.finditer(text):
            hits.append({"kind": "chapter_or_section_reference", "matched": m.group(0)})
        for t, k in titles:
            if len(t) >= 6 and t.lower() in text.lower():
                hits.append({"kind": f"{k}_title", "matched": t})
        # dedupe by entity
        seen, uniq = set(), []
        for h in hits:
            key = (h["kind"], h.get("entity") or h["matched"])
            if key not in seen:
                seen.add(key)
                uniq.append(h)
        if uniq:
            flags.append({"where": where, "text": text, "hits": uniq})
    return flags


if __name__ == "__main__":
    work = wf.load(sys.argv[1])
    merged = json.load(open(sys.argv[2], encoding="utf-8"))
    for f in flag_brief(work, merged):
        print(json.dumps(f, ensure_ascii=False))
