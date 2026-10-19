"""Draft canon entries (#158 rules plus the #159 drafter fixes) for every entry the proof's sections put
on stage, one Haiku call per entry, batched in parallel. Checks quotes. Writes canon.json.

  python -I canon.py [entry ids…]
"""
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
  - character (people, beings, animals, groups): age range; build; skin; hair and beard; facial notes; one signature outfit (the one worn most often) and its colours; signature props the figure carries alone. For a group, describe a typical member.
  - location: terrain; architecture; vegetation; landmarks. No people.
  - object: form; material; colour.
- Fix only identity. Leave out poses, expressions, actions, weather, time of day, other people (attendants, companions, crowds) and anything that compares the figure with someone else.
- STAGES: almost every entry has exactly ONE stage. A character gets a second stage only when the text itself says they have aged from child to adult or adult to elder across the work; a location only when the text says it was built, destroyed or rebuilt. Different scenes, days, rooms, moods or events are NOT stages. At most three. Objects always have exactly one stage. Each stage is a complete entry on its own.
- Obey the work brief's depiction rules: if a rule limits how this entry may be shown, write only the permitted showing.
- `quotes`: short passages (under 120 characters, copied exactly) the entry relied on, each with the id of the unit it comes from. Only quote units you were given.
- `source`: text, tradition, invention, or mixed."""

SCHEMA = {
    "type": "object", "additionalProperties": False, "required": ["id", "kind", "stages"],
    "properties": {
        "id": {"type": "string"}, "kind": {"type": "string", "enum": ["character", "location", "object"]},
        "stages": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                                               "required": ["id", "label", "when", "text", "source", "quotes"],
                                               "properties": {"id": {"type": "string"}, "label": {"type": "string"}, "when": {"type": "string"},
                                                              "text": {"type": "string"}, "source": {"type": "string", "enum": ["text", "tradition", "invention", "mixed"]},
                                                              "quotes": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["unit", "quote"],
                                                                                                    "properties": {"unit": {"type": "string"}, "quote": {"type": "string"}}}}}}},
    },
}


def needed_entries():
    """Merged entries on stage in any proof section, keyed by work and entry id."""
    need = {}
    for m in c.moments():
        s = c.sections(m["work"]).get(m["section"])
        if not s:
            continue
        for x in c.section_cast(m["work"], s):
            need[(m["work"], x["entry"]["id"])] = x["entry"]
    return need


def entry_sections(wid, e):
    out = []
    for s in c.sections(wid).values():
        if any(x["entry"]["id"] == e["id"] for x in c.section_cast(wid, s)):
            out.append(s)
    return out


def user_prompt(wid, e):
    b = c.brief(wid)
    secs = entry_sections(wid, e)
    eras = sorted({s["era"] for s in secs if s.get("era")}) or [c.main_era(wid)["name"]]
    era_text = "\n".join(f"- {er['name']}: people: {er['people']} Dress: {er['dress']} Buildings and objects: {er['buildings_and_objects']}"
                         for er in b["eras"] if er["name"] in eras)
    sec_lines = "\n".join(f"- {s['id']}: {s['title']} ({s['start']}–{s['end']})" for s in secs[:30])
    mu = c.mention_units(e, wid)
    return f"""WORK: {c.WORKS[wid]['title']}
TONE: {b['tone']}
DEPICTION RULES:
{chr(10).join('- ' + r for r in b['depiction_rules'])}
ERAS THIS ENTRY APPEARS IN:
{era_text}

ENTRY
id: {e['id']}
kind: {e['kind']}
name: {e['name']}
aliases: {', '.join(e.get('aliases', [])) or '(none)'}
reading-pass note: {e['note']}
on stage in {len(secs)} story sections:
{sec_lines}

UNITS OF THE TEXT THAT NAME THIS ENTRY (unit id in brackets; quote only from these):
{chr(10).join(f"[{u['id']}] {u['text'].strip()}" for u in mu)}""", eras


def norm(s):
    return re.sub(r"[\s’'\"“”]+", " ", s).strip().lower()


def main(only):
    canon = c.read_json("canon.json", {})
    need = needed_entries()
    jobs, meta = [], []
    for (wid, eid), e in sorted(need.items()):
        key = f"{wid}:{eid}"
        if (only and eid not in only) or (not only and key in canon):
            continue
        user, eras = user_prompt(wid, e)
        jobs.append({"label": f"canon__{wid}__{eid}", "system": SYSTEM, "user": user, "schema_name": "canon_entry", "schema": SCHEMA,
                     "max_tokens": 4000, "out_estimate": 1200})
        meta.append((wid, e, eras))
    print(f"{len(jobs)} entries to draft of {len(need)} needed")
    results = llm.call_all(jobs, max_parallel=8)
    uidx = {w: c.units(w) for w in c.WORKS}
    for (wid, e, eras), (rec, parsed, path) in zip(meta, results):
        if parsed is None:
            print("FAILED", e["id"], rec.get("parse_error"))
            continue
        problems = []
        cap = 3 if e["kind"] == "character" else 1  # code check: objects never get stages; this prototype keeps locations to one too
        if len(parsed["stages"]) > cap:
            problems.append(f"{len(parsed['stages'])} stages drafted, kept {cap}")
            parsed["stages"] = parsed["stages"][:cap]
        for st in parsed["stages"]:
            for q in st["quotes"]:
                u = uidx[wid].get(q["unit"])
                if not u or norm(q["quote"]) not in norm(u["text"]):
                    problems.append(f"{st['id']}: quote not found: {q['quote'][:50]!r}")
            if len(st["text"]) > 520:
                problems.append(f"{st['id']}: {len(st['text'])} chars")
        canon[f"{wid}:{e['id']}"] = {"work": wid, "id": e["id"], "name": e["name"], "kind": e["kind"], "eras": eras, "stages": parsed["stages"],
                                     "quote_problems": problems, "cost": rec["cost"], "seconds": rec["seconds"]}
        print(f"  {wid}:{e['id']} {len(parsed['stages'])} stage(s) {len(parsed['stages'][0]['text'])} chars ${rec['cost']:.4f}" + (f" PROBLEMS {problems}" if problems else ""))
    c.write_json("canon.json", canon)


if __name__ == "__main__":
    main(sys.argv[1:])
