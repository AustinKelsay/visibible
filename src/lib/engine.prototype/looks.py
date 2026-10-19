"""Section looks for the proof's story sections: one Haiku call per section. Writes looks.json.

  python -I looks.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import llm  # noqa: E402

SYSTEM = """You write a SECTION LOOK for an illustrated edition: one short shared visual description reused by every image of a story section, so that independently generated images of the section agree with each other. Return only JSON.
Rules: each value is one or two short phrases, at most 200 characters. Describe only what stays the same across the whole section: place, time of day, weather, light, and situational clothing or props. Leave out poses, actions and individual moments. If the section spans a change (night into morning), say so once. Obey the work brief's depiction rules. Mention no text or written elements."""
SCHEMA = {"type": "object", "additionalProperties": False, "required": ["place", "timeOfDay", "weather", "light", "clothing"],
          "properties": {k: {"type": "string"} for k in ("place", "timeOfDay", "weather", "light", "clothing")}}


def main():
    looks = c.read_json("looks.json", {})
    jobs, meta = [], []
    for m in c.moments():
        wid, sid = m["work"], m["section"]
        if not sid or f"{wid}:{sid}" in looks or any(x == (wid, sid) for x in meta):
            continue
        s = c.sections(wid)[sid]
        us = [u for u in c.units(wid).values() if u["division"] == s["division"] and s["start_idx"] <= u["idx"] <= s["end_idx"]]
        us.sort(key=lambda u: u["idx"])
        text = "\n".join(f"[{u['id']}] {u['text'].strip()}" for u in us)[:20000]
        b = c.brief(wid)
        era = c.era_named(wid, s.get("era"))
        user = f"""WORK: {c.WORKS[wid]['title']}
DEPICTION RULES:
{chr(10).join('- ' + r for r in b['depiction_rules'])}
ERA: {era['name']}. People: {era['people']} Dress: {era['dress']} Buildings and objects: {era['buildings_and_objects']}
STORY SECTION: {s['title']} ({s['start_ref']}–{s['end_ref']})
TEXT:
{text}"""
        jobs.append({"label": f"look__{wid}__{sid}", "system": SYSTEM, "user": user, "schema_name": "section_look", "schema": SCHEMA,
                     "max_tokens": 800, "out_estimate": 300})
        meta.append((wid, sid))
    print(f"{len(jobs)} looks to draft")
    for (wid, sid), (rec, parsed, _) in zip(meta, llm.call_all(jobs, max_parallel=8)):
        if parsed:
            looks[f"{wid}:{sid}"] = {**parsed, "cost": rec["cost"], "seconds": rec["seconds"]}
            print(" ", sid, parsed["place"][:60], "|", parsed["timeOfDay"][:40])
    c.write_json("looks.json", looks)


if __name__ == "__main__":
    main()
