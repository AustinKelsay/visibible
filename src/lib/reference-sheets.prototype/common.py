"""Shared inputs for the reference-sheets prototype (throwaway; never merged).

Reads the reading-pass prototype's outputs (works, merged casts, per-division sections)
from RP_DATA and writes nothing there. Chosen entries, work-neutral style briefs and the
fixed sheet/style-reference templates live here so every phase sees the same text.
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import work_format as wf  # noqa: E402

RP_DATA = os.environ.get("RP_DATA", "/Users/plebdev/rp-data-20261018")
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "reference-sheets.prototype-output"))
os.makedirs(OUT, exist_ok=True)

WORKS = {
    "holmes": {"input": "holmes.json", "merged": "holmes-adventures__merged__v1.json",
               "divisions": "holmes-adventures__*__v1.json", "tag": "v1", "title": "The Adventures of Sherlock Holmes"},
    "bible": {"input": "bible-web.json", "merged": "bible-web__merged__main.json",
              "divisions": "bible-web__*__main.json", "tag": "main", "title": "The Holy Bible (WEB)"},
}

# The handful of entries this prototype draws. `hand_made` marks an entry the reading pass did
# not list (the ark, which the pass folded into the text rather than tagging as an object).
ENTRIES = [
    {"work": "holmes", "id": "sherlock_holmes", "kind": "character"},
    {"work": "holmes", "id": "dr_watson", "kind": "character"},
    {"work": "holmes", "id": "lestrade", "kind": "character"},
    {"work": "holmes", "id": "221b_baker_street", "kind": "location"},
    {"work": "bible", "id": "jesus", "kind": "character"},
    {"work": "bible", "id": "simon_peter", "kind": "character"},
    {"work": "bible", "id": "moses", "kind": "character"},
    {"work": "bible", "id": "david", "kind": "character"},
    {"work": "bible", "id": "goliath", "kind": "character"},
    {"work": "bible", "id": "temple_in_jerusalem", "kind": "location"},
    {"work": "bible", "id": "ark_of_the_covenant", "kind": "object", "hand_made": True,
     "name": "The ark of the covenant", "aliases": ["the ark", "ark of Yahweh", "ark of God", "ark of the covenant"],
     "note": "The gold-covered chest built in Exodus, carried into battle and captured by the Philistines in 1 Samuel.",
     "members": ["EXO:ark", "1SA:ark"], "divisions": ["EXO", "1SA"]},
]

# Struck brief lines go to the drafter as hints (#158). Keyed by entry id.
HINTS = {
    "sherlock_holmes": ["Holmes is lean and sharp-eyed, in dressing-gown or ulster, with pipe and violin; disguises are convincing costumes, never real addiction.",
                        "Holmes's cocaine use is never shown explicitly."],
    "jesus": ["Jesus is drawn as a 1st-century Jewish man, without halo or stereotyped blue robe unless the scene calls for a glory motif."],
    "goliath": ["Violence (plagues, Goliath's death, the crucifixion, the death of Saul) is depicted with weight but without gratuitous gore."],
}

# Work-neutral style briefs (#156): no work, place, people or era named.
STYLES = {
    "classical": {
        "id": "classical", "label": "Classical Painterly",
        "rendering": "Stylized, painterly, mysterious, expansive; epic scale. The painterly treatment belongs to the depicted world itself, not to a photographed physical artwork.",
        "palette": "Mature, grounded color; rich but restrained contrast.",
        "lighting": "Luminous, dramatic lighting.",
        "materials": "Gritty, raw texture; avoid polished digital smoothness.",
        "composition": "Cinematic, immersive viewpoint; heroic but grounded.",
        "negative": "Avoid photorealism or a photographic look. Avoid childish/cartoonish styling. Never present the scene as a painting on a wall, gallery piece, framed artwork, mural, poster, manuscript page, or printed illustration. Do not show canvas texture, paper edges, matting, border, mockup, or surrounding room. The depicted world must fill the image edge-to-edge.",
    },
    "watercolour": {
        "id": "watercolour", "label": "Ink & Watercolor",
        "rendering": "Loose pen-and-ink drawing with transparent watercolour washes; expressive, airy and contemplative, like a travelling artist's field study of the work's world.",
        "palette": "Transparent washes of ochre, sienna, indigo and sage; luminous lights.",
        "lighting": "Bright, airy daylight; shadows as cool layered washes.",
        "materials": "Confident ink linework, wet-in-wet blooms, granulating pigment.",
        "composition": "Sketch-like economy; detail concentrated on key subjects, softer surroundings.",
        "negative": "Paint washes and scenery all the way into every edge and all four corners: no white or unpainted paper margins, no white vignette, no fading out to blank paper at the edges, no paper edges, sketchbook, tape or border. Avoid photorealism, digital airbrush smoothness and cartoon caricature.",
    },
    "icon": {
        "id": "icon", "label": "Byzantine Icon",
        "rendering": "Byzantine icon painting: flat, frontal, stylised figures with elongated proportions, solemn timeless expressions, inverse perspective and symbolic rather than naturalistic space.",
        "palette": "Burnished gold-leaf sky, deep reds, ultramarine, ochres and earth greens.",
        "lighting": "No cast shadows; inner light shown through layered highlights; gold glow.",
        "materials": "Egg tempera and gold-leaf texture within the scene.",
        "composition": "Hieratic, balanced staging; the key subject largest and central; stylised rocks, buildings and trees.",
        "negative": "Never show a wooden panel, panel edges, frame, border, arched or rounded top, wall, or the icon as a physical object. No plain, dark or unpainted corners: the gold sky and stylised landscape run edge-to-edge into all four corners. Avoid photorealism and modern illustration.",
    },
}

NO_TEXT = ("Absolutely no text of any kind anywhere: no names, labels, captions, titles, letters, numbers, "
           "arrows, colour swatches, rulers, frames, borders or panel dividers.")


def style_brief(s):
    return " ".join(x for x in (s["rendering"], s["palette"], s["lighting"], s["materials"], s["composition"]) if x)


# ---------------------------------------------------------------- loading

_cache = {}


def work(wid):
    if ("work", wid) not in _cache:
        _cache[("work", wid)] = wf.load(os.path.join(RP_DATA, "inputs", WORKS[wid]["input"]))
    return _cache[("work", wid)]


def merged(wid):
    if ("merged", wid) not in _cache:
        _cache[("merged", wid)] = json.load(open(os.path.join(RP_DATA, "analysis", WORKS[wid]["merged"]), encoding="utf-8"))
    return _cache[("merged", wid)]


def division_files(wid):
    files = sorted(glob.glob(os.path.join(RP_DATA, "analysis", WORKS[wid]["divisions"])))
    return [f for f in files if "__merged__" not in f and "__moments__" not in f]


def divisions(wid):
    """{division id: per-division analysis} for the chosen tag."""
    if ("divs", wid) not in _cache:
        out = {}
        for f in division_files(wid):
            d = json.load(open(f, encoding="utf-8"))
            if "sections" in d:
                out[d["division"]] = d
        _cache[("divs", wid)] = out
    return _cache[("divs", wid)]


def units(wid):
    """{unit id: unit dict with division id} across the whole work."""
    if ("units", wid) not in _cache:
        idx = {}
        for d in work(wid)["divisions"]:
            for u in wf.units_of(d):
                idx[u["id"]] = {**u, "division": d["id"]}
        _cache[("units", wid)] = idx
    return _cache[("units", wid)]


def entry(spec):
    """The merged cast/location entry for a chosen entry, plus kind, hints and its sections."""
    wid = spec["work"]
    m = merged(wid)
    if spec.get("hand_made"):
        e = {k: spec[k] for k in ("id", "name", "aliases", "note", "members", "divisions")}
    else:
        pool = m["cast"] if spec["kind"] == "character" else m["locations"]
        e = dict(next(x for x in pool if x["id"] == spec["id"]))
    e["kind"] = spec["kind"]
    e["work"] = wid
    e["hints"] = HINTS.get(spec["id"], [])
    member_ids = set(e["members"])
    secs = []
    for did, d in divisions(wid).items():
        for s in d["sections"]:
            ids = [o["id"] for o in s.get("on_stage", [])] + list(s.get("setting", []))
            if any(f"{did}:{i}" in member_ids for i in ids):
                secs.append({"id": s["id"], "division": did, "title": s.get("title"), "start": s["start"], "end": s["end"],
                             "era": section_era(wid, s["id"])})
    e["sections"] = secs
    return e


def section_era(wid, sid):
    m = merged(wid)
    for s in m.get("sections", []):
        if s.get("id") == sid:
            return s.get("era")
    return None


def brief(wid):
    return merged(wid)["brief"]


def main_era(wid):
    """The era with the most story sections (#156)."""
    counts = merged(wid).get("brief_checks", {}).get("sections_per_era") or {}
    name = max(counts, key=counts.get) if counts else brief(wid)["eras"][0]["name"]
    return next(e for e in brief(wid)["eras"] if e["name"] == name)


def era_named(wid, name):
    return next((e for e in brief(wid)["eras"] if e["name"] == name), None)


def mention_units(e, cap_chars=14000):
    """Units in the entry's divisions whose text names the entry or an alias (word boundary)."""
    wid = e["work"]
    names = [e["name"]] + [a for a in e.get("aliases", []) if len(a) > 2]
    pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in names) + r")\b", re.I)
    hits = [u for u in units(wid).values() if u["division"] in e["divisions"] and pat.search(u["text"])]
    total = sum(len(u["text"]) for u in hits)
    if total > cap_chars:  # keep an even spread through the work rather than the first N
        step = total / cap_chars
        keep, acc = [], 0.0
        for i, u in enumerate(hits):
            if i >= acc:
                keep.append(u)
                acc += step
        hits = keep
    return hits


def read_json(name, default=None):
    p = os.path.join(OUT, name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default


def write_json(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
