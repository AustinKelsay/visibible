"""Scene plans for every proof moment: one Haiku call per moment, in the production plan shape
(primarySubject, action, setting, secondaryElements, mood, timeOfDay, composition). Plans are per
moment, shared by every art style (#154). Writes plans.json.

  python -I plans.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import llm  # noqa: E402

SYSTEM = """You are the scene planner of an illustration engine. You get one moment of a work's text with its neighbours inside the same story section, the work brief's tone and depiction rules, the era, the section look, and the names of the characters, locations and objects on stage. Plan one single scene that depicts this moment. Return only JSON.
Rules: single scene, no collage. Name figures by the names given. Keep every depiction rule. Do not describe anyone's fixed appearance (canon does that); describe pose, action, placement and situational detail. Each field is one or two short phrases, at most 220 characters. No text or written elements in the scene."""
SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition"],
          "properties": {k: {"type": "string"} for k in ("primarySubject", "action", "setting", "secondaryElements", "mood", "timeOfDay", "composition")}}


def neighbours(m):
    """Previous and next unit inside the section, like today's planner input."""
    wid, s = m["work"], c.sections(m["work"]).get(m["section"])
    if not s:
        return None, None
    us = c.units(wid)
    a, b = us[m["start"]], us[m["end"]]
    div = [u for u in us.values() if u["division"] == a["division"]]
    div.sort(key=lambda u: u["idx"])
    prev = div[a["idx"] - 1] if a["idx"] - 1 >= s["start_idx"] else None
    nxt = div[b["idx"] + 1] if b["idx"] + 1 <= s["end_idx"] else None
    return prev, nxt


def main():
    plans = c.read_json("plans.json", {})
    looks = c.read_json("looks.json", {})
    jobs, meta = [], []
    for m in c.moments():
        if m["id"] in plans:
            continue
        wid, s = m["work"], c.sections(m["work"]).get(m["section"])
        b = c.brief(wid)
        era = c.era_named(wid, s.get("era") if s else None)
        look = looks.get(f"{wid}:{m['section']}", {})
        cast = c.section_cast(wid, s) if s else []
        prev, nxt = neighbours(m)
        user = f"""WORK: {c.WORKS[wid]['title']}
TONE: {b['tone']}
DEPICTION RULES:
{chr(10).join('- ' + r for r in b['depiction_rules'])}
ERA: {era['name']}. People: {era['people']} Dress: {era['dress']} Technology: {era['technology']}
STORY SECTION: {s['title'] if s else '(none)'}
SECTION LOOK: place: {look.get('place')}; time: {look.get('timeOfDay')}; weather: {look.get('weather')}; light: {look.get('light')}; clothing: {look.get('clothing')}
ON STAGE IN THIS SECTION: {', '.join(x['entry']['name'] + (' (unnamed in the text)' if not x['named'] else '') for x in cast) or '(no one listed)'}

MOMENT ({m['ref']}): {m['text']}
PREVIOUS: {prev['text'].strip()[:400] if prev else '(section starts here)'}
NEXT: {nxt['text'].strip()[:400] if nxt else '(section ends here)'}"""
        jobs.append({"label": f"plan__{m['id']}", "system": SYSTEM, "user": user, "schema_name": "scene_plan", "schema": SCHEMA, "max_tokens": 900, "out_estimate": 350})
        meta.append(m)
    print(f"{len(jobs)} plans to draft")
    for m, (rec, parsed, _) in zip(meta, llm.call_all(jobs, max_parallel=8)):
        if parsed:
            plans[m["id"]] = {**parsed, "cost": rec["cost"], "seconds": rec["seconds"]}
            print(" ", m["id"], parsed["primarySubject"][:70])
    c.write_json("plans.json", plans)


if __name__ == "__main__":
    main()
