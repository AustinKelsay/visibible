"""Build each proof image's prompt from the engine's pieces (engine rules, work brief, canon, section look,
scene plan, style brief, references) and generate it on Nano Banana 2 Lite, timing each call.
Writes images.json and images/<moment>--<style>[--nosheet].jpg.

  python -I generate.py [set id or moment id filter] [--dry]
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import images  # noqa: E402

DIR = os.path.join(c.OUT, "images")
os.makedirs(DIR, exist_ok=True)
PROMPT_MAX = 8000
BRIEF_MAX = 1200
# Drawn once more without any reference images, to see what a reader gets before sheets exist.
NO_SHEET = {"a-scandal-in-bohemia-m1": "classical", "luke-5-8": "classical"}


def brief_block(wid, era_name):
    b = c.brief(wid)
    era = c.era_named(wid, era_name)
    text = (f"WORK BRIEF ({c.WORKS[wid]['title']}):\nTone: {b['tone']}\nDepiction rules:\n" + "\n".join("- " + r for r in b["depiction_rules"])
            + f"\nEra: {era['name']}. People: {era['people']} Dress: {era['dress']} Buildings and objects: {era['buildings_and_objects']} Technology: {era['technology']}")
    return text if len(text) <= BRIEF_MAX + 400 else text[:BRIEF_MAX + 400]


def pick_refs(wid, cast, canon, sheets, style):
    """Up to 3 references: style reference first for non-Classical, then character, location, second character sheets."""
    refs = []
    if style != "classical":
        r = c.read_json("style-refs.json", {}).get(f"{wid}--{style}", {})
        if r.get("final"):
            refs.append({"kind": "style", "file": r["final"]})
    chars = [x for x in cast if x["entry"]["kind"] == "character"]
    locs = [x for x in cast if x["entry"]["kind"] == "location"]
    order = chars[:1] + locs[:1] + chars[1:2]
    for x in order:
        entry = canon.get(f"{wid}:{x['entry']['id']}")
        if not entry:
            continue
        stage = entry["stages"][0]
        s = sheets.get(f"{wid}--{stage['id']}", {})
        if s.get("final") and len(refs) < 3:
            refs.append({"kind": entry["kind"], "name": entry["name"], "file": s["final"]})
    return refs[:3]


def build(m, style_id, canon, looks, plans, sheets, with_refs=True):
    wid, s = m["work"], c.sections(m["work"]).get(m["section"])
    style = c.STYLES[style_id]
    cast = c.section_cast(wid, s) if s else []
    # Canon for the cast the planner can see: at most three entries, characters first.
    entries = []
    for x in sorted(cast, key=lambda x: (x["entry"]["kind"] != "character", not x["named"])):
        e = canon.get(f"{wid}:{x['entry']['id']}")
        if e and len(entries) < 3:
            entries.append(e)
    look = looks.get(f"{wid}:{m['section']}")
    plan = plans.get(m["id"])
    refs = pick_refs(wid, cast, canon, sheets, style_id) if with_refs else []
    blocks = [
        f"Render a single, cohesive scene from {c.WORKS[wid]['title']}, {m['ref']}.",
        f"TEXT: \"{m['text'][:1500]}\"",
        c.ENGINE_RULES,
        brief_block(wid, s.get("era") if s else None),
        "CANON (fixed identity; the scene plan decides pose, expression and action):\n" + "\n".join("- " + e["stages"][0]["text"] for e in entries) if entries else "",
        (f"SECTION LOOK (shared by every image of this story section, {s['title']}):\n- Place: {look['place']}\n- Time of day: {look['timeOfDay']}\n- Weather: {look['weather']}\n- Light: {look['light']}\n- Clothing: {look['clothing']}") if look else "",
        (f"SCENE PLAN (supporting; do not override the rules above):\nPrimary subject: {plan['primarySubject']}\nAction: {plan['action']}\nSetting: {plan['setting']}\n"
         f"Secondary elements: {plan['secondaryElements']}\nMood: {plan['mood']}\nTime of day: {plan['timeOfDay']}\nComposition: {plan['composition']}") if plan else "",
        f"STYLE PROFILE: {style['label']}\nRendering: {style['rendering']}\nPalette: {style['palette']}\nLighting: {style['lighting']}\nMaterials/Texture: {style['materials']}\nComposition: {style['composition']}\n\nSTYLE NEGATIVES:\n{style['negative']}",
        ("REFERENCE IMAGES (attached after this text, in this order; use them for identity and rendering only, never as the composition):\n"
         + "\n".join(f"- Image {i + 1}: " + ("art-style reference: copy only its rendering technique, palette and texture; ignore its subject and layout."
                                              if r["kind"] == "style" else f"{r['name']}'s reference sheet ({'one figure in three views' if r['kind'] == 'character' else 'two views'}): match its identity; do not copy its poses, layout or plain background.")
                     for i, r in enumerate(refs))
         + "\nRender everything in the STYLE PROFILE above, even where a reference is painted in another style.") if refs else "",
        "SCENE PRESENTATION:\n- Depict the moment directly, as if the viewer is present inside the scene.\n- The image itself is the scene, not a photo of a painting, print or gallery piece.\n- Extend scenery, sky, darkness, architecture or atmosphere all the way to the edges.\nAspect ratio: 16:9 (WIDESCREEN landscape).",
    ]
    text = "\n\n".join(b for b in blocks if b)
    if len(text) > PROMPT_MAX:  # trim order: text excerpt first, never brief or canon
        text = text.replace(m["text"][:1500], m["text"][:600], 1)
    return text, refs, [e["id"] for e in entries]


def main(argv):
    dry = "--dry" in argv
    flt = next((a for a in argv if not a.startswith("--")), None)
    canon, looks, plans, sheets = (c.read_json(n, {}) for n in ("canon.json", "looks.json", "plans.json", "sheets.json"))
    out = c.read_json("images.json", {})
    jobs = []
    for m in c.moments():
        if flt and flt not in (m["set"], m["id"]):
            continue
        for style in m["styles"]:
            jobs.append((m, style, True, f"{m['id']}--{style}"))
        if m["id"] in NO_SHEET:
            jobs.append((m, NO_SHEET[m["id"]], False, f"{m['id']}--{NO_SHEET[m['id']]}--nosheet"))
    print(f"{len(jobs)} images; {sum(1 for j in jobs if j[3] in out and out[j[3]].get('file'))} done")
    for m, style, with_refs, key in jobs:
        if key in out and out[key].get("file"):
            continue
        text, refs, entries = build(m, style, canon, looks, plans, sheets, with_refs)
        if dry:
            print(f"== {key} ({len(text)} chars, refs {[r['file'] for r in refs]})\n{text}\n")
            continue
        t0 = time.time()
        g = images.generate(f"image__{key}", "lite", text, refs=[os.path.join(c.OUT, r["file"]) for r in refs])
        rec = {"moment": m["id"], "set": m["set"], "work": m["work"], "ref": m["ref"], "section": m["section"], "style": style, "with_refs": with_refs,
               "refs": refs, "canon_entries": entries, "prompt_chars": len(text), "prompt": text, "seconds": g["seconds"], "wall_seconds": round(time.time() - t0, 1),
               "cost": g["cost"], "credits": (g["cost"] or 0) * 125, "provider": g.get("provider"), "file": None, "error": g.get("error")}
        if g.get("raw"):
            f = os.path.join(DIR, f"{key}.jpg")
            images.to_jpeg(g["raw"], f)
            rec["file"] = os.path.relpath(f, c.OUT)
        out[key] = rec
        c.write_json("images.json", out)
    print("spend so far: $%.4f" % images.orclient.spent())


if __name__ == "__main__":
    main(sys.argv[1:])
