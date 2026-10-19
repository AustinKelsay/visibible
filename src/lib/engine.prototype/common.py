"""Shared inputs for the engine prototype (throwaway; never merged).

Reads the reading-pass prototype's analyses from RP_DATA (works, merged casts with eras, per-division
sections, Holmes moments). Holds the work-neutral style library, each work's style set, the proof sets,
and the engine rules every prompt carries.
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import work_format as wf  # noqa: E402

RP_DATA = os.environ.get("RP_DATA", "/Users/plebdev/rp-data-20261018")
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "engine.prototype-output"))
os.makedirs(OUT, exist_ok=True)

WORKS = {
    "holmes": {"input": "holmes.json", "merged": "holmes-adventures__merged__v1.json", "divisions": "holmes-adventures__*__v1.json",
               "tag": "v1", "title": "The Adventures of Sherlock Holmes", "style_set": ["classical", "watercolour", "icon"]},
    "bible": {"input": "bible-web.json", "merged": "bible-web__merged__main.json", "divisions": "bible-web__*__main.json",
              "tag": "main", "title": "The Holy Bible (WEB)", "style_set": ["classical", "watercolour", "icon"]},
}

# Work-neutral style briefs (#156), with the watercolour "no paper margins" negative from #159.
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
ENGINE_RULES = """PRIORITY RULES:
1) No text or symbols anywhere (letters, numbers, signage, labels, logos, watermarks, inscriptions).
2) Full-bleed immersive scene only (no frame, border, canvas-on-wall, poster, mockup, visible paper, matting, or blank backdrop).
3) Single unified scene only (no split panels, collage, or multi-scene layout).
4) No sexually explicit content; no lingering gore.
5) No distorted anatomy (extra limbs/fingers, malformed hands/feet, warped faces)."""

# The proof sets (#161). Bible moments are verses; Holmes moments come from the reading pass.
PROOF = {
    "bible-peter": {"work": "bible", "units": ["luke-5-8", "matthew-14-29", "matthew-26-75", "john-21-7", "acts-2-14"], "styles": "all"},
    "bible-exodus": {"work": "bible", "units": ["exodus-14-21", "exodus-14-22", "exodus-14-27"], "styles": "all"},
    "bible-genesis": {"work": "bible", "units": ["genesis-1-3"], "styles": "all"},
    "holmes-baker": {"work": "holmes", "sections_first_moment": ["a-scandal-in-bohemia-s1", "the-red-headed-league-s1", "a-case-of-identity-s1",
                                                                 "the-five-orange-pips-s1", "the-adventure-of-the-blue-carbuncle-s1"], "styles": "all"},
    "holmes-story": {"work": "holmes", "story": "the-adventure-of-the-speckled-band", "styles": ["classical"]},
}


def style_brief(s):
    return " ".join(x for x in (s["rendering"], s["palette"], s["lighting"], s["materials"], s["composition"]) if x)


_cache = {}


def work(wid):
    if ("work", wid) not in _cache:
        _cache[("work", wid)] = wf.load(os.path.join(RP_DATA, "inputs", WORKS[wid]["input"]))
    return _cache[("work", wid)]


def merged(wid):
    if ("merged", wid) not in _cache:
        _cache[("merged", wid)] = json.load(open(os.path.join(RP_DATA, "analysis", WORKS[wid]["merged"]), encoding="utf-8"))
    return _cache[("merged", wid)]


def divisions(wid):
    if ("divs", wid) not in _cache:
        out = {}
        for f in sorted(glob.glob(os.path.join(RP_DATA, "analysis", WORKS[wid]["divisions"]))):
            if "__merged__" in f or "__moments__" in f:
                continue
            d = json.load(open(f, encoding="utf-8"))
            if "sections" in d:
                out[d["division"]] = d
        _cache[("divs", wid)] = out
    return _cache[("divs", wid)]


def units(wid):
    """{unit id: unit with division and index within the division}."""
    if ("units", wid) not in _cache:
        idx = {}
        for d in work(wid)["divisions"]:
            for i, u in enumerate(wf.units_of(d)):
                idx[u["id"]] = {**u, "division": d["id"], "idx": i}
        _cache[("units", wid)] = idx
    return _cache[("units", wid)]


def sections(wid):
    """Merged sections (with era) keyed by id, each with its division's on_stage/setting lists."""
    if ("sections", wid) not in _cache:
        out = {}
        for s in merged(wid)["sections"]:
            out[s["id"]] = s
        _cache[("sections", wid)] = out
    return _cache[("sections", wid)]


def section_of_unit(wid, uid):
    u = units(wid)[uid]
    for s in sections(wid).values():
        if s["division"] == u["division"] and s["start_idx"] <= u["idx"] <= s["end_idx"]:
            return s
    return None


def holmes_moments(story):
    f = os.path.join(RP_DATA, "analysis", f"holmes-adventures__{story}__moments__v1.json")
    return json.load(open(f, encoding="utf-8"))["moments"]


def member_index(wid):
    """{'division:local id': merged entry (with kind character/location)}."""
    if ("members", wid) not in _cache:
        m = merged(wid)
        idx = {}
        for e in m["cast"]:
            for mem in e["members"]:
                idx[mem] = {**e, "kind": "character"}
        for e in m["locations"]:
            for mem in e.get("members", []):
                idx[mem] = {**e, "kind": "location"}
        _cache[("members", wid)] = idx
    return _cache[("members", wid)]


def section_cast(wid, s):
    """Merged entries on stage (characters) and setting (locations) for a section, with named flags."""
    idx = member_index(wid)
    by_id = {**{e["id"]: {**e, "kind": "character"} for e in merged(wid)["cast"]},
             **{e["id"]: {**e, "kind": "location"} for e in merged(wid)["locations"]}}
    cast, seen = [], set()

    def add(local, named):
        # Merged sections may carry division-local ids or merged ids; accept both.
        e = idx.get(f"{s['division']}:{local}") or by_id.get(local)
        if e and e["id"] not in seen:
            seen.add(e["id"])
            cast.append({"entry": e, "named": named})

    for o in s.get("on_stage", []):
        add(o["id"], o.get("named", True))
    for lid in s.get("setting", []):
        add(lid, True)
    return cast


def recurrence(wid):
    """{merged entry id: number of sections it is on stage or a setting in}."""
    if ("recur", wid) not in _cache:
        cnt = {}
        for s in sections(wid).values():
            for c in section_cast(wid, s):
                cnt[c["entry"]["id"]] = cnt.get(c["entry"]["id"], 0) + 1
        _cache[("recur", wid)] = cnt
    return _cache[("recur", wid)]


RP_SCRIPTS = os.environ.get("RP_SCRIPTS", "/Users/plebdev/Desktop/Projects/visibible/.claude/worktrees/agent-a6b33bbfc4de9b7f0/src/lib/reading-pass.prototype")


def struck_rules(wid):
    """Depiction rules the brief check flags for naming a single character or place (#155): struck from the
    brief the engine reads; they reach the canon drafter as hints instead (#158)."""
    if ("struck", wid) not in _cache:
        sys.path.insert(0, RP_SCRIPTS)
        import check_brief  # noqa: E402
        flags = check_brief.flag_brief(work(wid), merged(wid))
        _cache[("struck", wid)] = {f["text"] for f in flags if f.get("where", "").startswith("depiction_rules")}
    return _cache[("struck", wid)]


def brief(wid):
    b = dict(merged(wid)["brief"])
    b["depiction_rules"] = [r for r in b["depiction_rules"] if r not in struck_rules(wid)]
    return b


def main_era(wid):
    counts = merged(wid).get("brief_checks", {}).get("sections_per_era") or {}
    name = max(counts, key=counts.get) if counts else brief(wid)["eras"][0]["name"]
    return next(e for e in brief(wid)["eras"] if e["name"] == name)


def era_named(wid, name):
    return next((e for e in brief(wid)["eras"] if e["name"] == name), None) or main_era(wid)


def moments():
    """The proof's moments: [{id, set, work, section, start, end, text, styles}]."""
    out = []
    for set_id, p in PROOF.items():
        wid = p["work"]
        styles = WORKS[wid]["style_set"] if p["styles"] == "all" else p["styles"]
        if "units" in p:
            for uid in p["units"]:
                u = units(wid)[uid]
                s = section_of_unit(wid, uid)
                out.append({"id": uid, "set": set_id, "work": wid, "section": s["id"] if s else None, "start": uid, "end": uid,
                            "ref": u["ref"], "text": u["text"].strip(), "styles": styles})
        else:
            if "story" in p:
                sec_ids = [s["id"] for s in merged(wid)["sections"] if s["division"] == p["story"]]
            else:
                sec_ids = p["sections_first_moment"]
            for sid in sec_ids:
                story = sections(wid)[sid]["division"]
                m = next(m for m in holmes_moments(story) if m["section"] == sid)
                us = units(wid)
                text = " ".join(us[f"{story}-{n}"]["text"].strip() for n in range(m["start_n"], m["end_n"] + 1))
                out.append({"id": m["id"], "set": set_id, "work": wid, "section": sid, "start": m["start"], "end": m["end"],
                            "ref": f"{sections(wid)[sid]['division_name']} ¶{m['start_n']}–{m['end_n']}", "text": text, "styles": styles,
                            "summary": m.get("summary")})
    return out


def mention_units(e, wid, cap_chars=14000):
    names = [e["name"]] + [a for a in e.get("aliases", []) if len(a) > 2]
    pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in names) + r")\b", re.I)
    hits = [u for u in units(wid).values() if u["division"] in e["divisions"] and pat.search(u["text"])]
    total = sum(len(u["text"]) for u in hits)
    if total > cap_chars:
        step, keep, acc = total / cap_chars, [], 0.0
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
