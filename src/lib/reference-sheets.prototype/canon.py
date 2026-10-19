"""Draft canon entries for the chosen entries (#158 rules), one Haiku call per entry, and check
that every quoted line occurs in the unit it cites. Writes canon.json.

  python -I canon.py [entry ids…]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import llm  # noqa: E402

SYSTEM = """You write CANON ENTRIES for an illustrated edition of a work of literature. A canon entry fixes the identity of one character, location or object so that independently generated images agree with each other. Return only JSON matching the schema.

Rules:
- The work's text is binding: anything it says about appearance must be in the entry.
- Where the text is silent, follow the work's widely known visual tradition if one exists; otherwise invent a look that fits the era and the work brief. Never contradict the text.
- Each entry's `text` is one prompt-ready paragraph of at most 500 characters, starting with the name and a colon.
  - character (people, beings, animals, groups): age range; build; skin; hair and beard; facial notes; signature garments and their colours; signature props. For a group, describe a typical member.
  - location: terrain; architecture; vegetation; landmarks.
  - object: form; material; colour.
- Fix only identity. Leave out poses, expressions, actions, weather, time of day and anything situational.
- STAGES: give more than one stage only when the text itself moves a character through childhood, youth, adulthood or old age across the work, or marks a location as built, destroyed or rebuilt. At most three. Each stage is a complete entry on its own, within the cap, not a base plus differences. Most entries have one stage.
- Obey the work brief's depiction rules: if a rule limits how this entry may be shown, write only the permitted showing.
- `quotes`: the short text passages (under 120 characters each, copied exactly) that the entry relied on, each with the id of the unit it comes from. Only quote units you were given. Give none if nothing in the text describes appearance.
- `source`: text (the look comes mostly from quotes), tradition, invention, or mixed.
- `appearance_from_text`: one sentence saying what the text fixes and what you had to supply."""

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["id", "kind", "stages", "appearance_from_text"],
    "properties": {
        "id": {"type": "string"},
        "kind": {"type": "string", "enum": ["character", "location", "object"]},
        "appearance_from_text": {"type": "string"},
        "stages": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "label", "when", "text", "source", "quotes"],
            "properties": {
                "id": {"type": "string"},
                "label": {"type": "string"},
                "when": {"type": "string", "description": "Which part of the work this stage covers, in a few words."},
                "text": {"type": "string"},
                "source": {"type": "string", "enum": ["text", "tradition", "invention", "mixed"]},
                "quotes": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["unit", "quote"],
                    "properties": {"unit": {"type": "string"}, "quote": {"type": "string"}}}},
            }}},
    },
}


def user_prompt(e):
    wid = e["work"]
    b = c.brief(wid)
    eras = sorted({s["era"] for s in e["sections"] if s["era"]})
    if not eras:
        eras = sorted({d["era"] for d in c.merged(wid).get("sections", []) if d.get("division") in e["divisions"] and d.get("era")})
    era_text = "\n".join(f"- {er['name']}: people: {er['people']} Dress: {er['dress']} Buildings and objects: {er['buildings_and_objects']}"
                         for er in b["eras"] if er["name"] in eras)
    secs = e["sections"]
    sec_lines = "\n".join(f"- {s['id']}: {s['title']} ({s['start']}–{s['end']})" for s in secs[:40])
    if len(secs) > 40:
        sec_lines += f"\n- … and {len(secs) - 40} more sections"
    mu = c.mention_units(e)
    unit_lines = "\n".join(f"[{u['id']}] {u['text'].strip()}" for u in mu)
    hints = "\n".join(f"- {h}" for h in e["hints"]) or "- none"
    return f"""WORK: {c.WORKS[wid]['title']}
TONE: {b['tone']}
DEPICTION RULES:
{chr(10).join('- ' + r for r in b['depiction_rules'])}
ERAS THIS ENTRY APPEARS IN:
{era_text or '- (none assigned)'}
HINTS FROM THE OWNER'S BRIEF REVIEW (lines struck from the brief because they name this entry; use them):
{hints}

ENTRY
id: {e['id']}
kind: {e['kind']}
name: {e['name']}
aliases: {', '.join(e.get('aliases', [])) or '(none)'}
reading-pass note: {e['note']}
on stage in {len(secs)} story sections:
{sec_lines or '- (hand-added entry; see the units below)'}

UNITS OF THE TEXT THAT NAME THIS ENTRY (unit id in brackets; quote only from these):
{unit_lines}"""


def norm(s):
    return re.sub(r"[\s’'\"“”]+", " ", s).strip().lower()


def check_quotes(e, parsed):
    idx = c.units(e["work"])
    problems = []
    for st in parsed["stages"]:
        for q in st["quotes"]:
            u = idx.get(q["unit"])
            if not u:
                problems.append(f"{st['id']}: unknown unit {q['unit']}")
            elif norm(q["quote"]) not in norm(u["text"]):
                problems.append(f"{st['id']}: quote not found in {q['unit']}: {q['quote'][:60]!r}")
        if len(st["text"]) > 520:
            problems.append(f"{st['id']}: text is {len(st['text'])} chars (cap 500)")
    return problems


def main(only):
    canon = c.read_json("canon.json", {})
    jobs, specs = [], []
    for spec in c.ENTRIES:
        if only and spec["id"] not in only:
            continue
        e = c.entry(spec)
        specs.append(e)
        jobs.append({"label": f"canon__{e['id']}", "system": SYSTEM, "user": user_prompt(e),
                     "schema_name": "canon_entry", "schema": SCHEMA, "max_tokens": 4000, "out_estimate": 1200})
    results = llm.call_all(jobs, max_parallel=6)
    for e, (rec, parsed, path) in zip(specs, results):
        if parsed is None:
            print("FAILED", e["id"], rec.get("parse_error"))
            continue
        problems = check_quotes(e, parsed)
        canon[e["id"]] = {"work": e["work"], "name": e["name"], "kind": e["kind"], "note": e["note"],
                          "sections": len(e["sections"]), "eras": sorted({s["era"] for s in e["sections"] if s["era"]}),
                          **parsed, "quote_problems": problems, "cost": rec["cost"], "seconds": rec["seconds"], "call": os.path.basename(path)}
        print(f"\n== {e['name']} ({e['kind']}, {len(parsed['stages'])} stage(s)) ${rec['cost']:.4f} {rec['seconds']}s")
        print("  ", parsed["appearance_from_text"])
        for st in parsed["stages"]:
            print(f"  [{st['id']}] {st['label']} — {st['when']} ({st['source']}, {len(st['text'])} chars, {len(st['quotes'])} quotes)")
            print("   ", st["text"])
        for p in problems:
            print("   PROBLEM:", p)
    c.write_json("canon.json", canon)


if __name__ == "__main__":
    main(sys.argv[1:])
