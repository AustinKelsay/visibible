"""Reference sheets for proof entries on stage in 2+ sections (#159): Nano Banana 2 Lite, fixed template,
hard-fault check only (text, frame, extra figures, missing view, different subjects), up to three tries.
Writes sheets.json and sheets/<work>--<stage>.jpg.

  python -I sheets.py
"""
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import images  # noqa: E402

DIR = os.path.join(c.OUT, "sheets")
os.makedirs(DIR, exist_ok=True)
LAYOUT = {
    "character": ("Layout: the same figure shown three times side by side, evenly spaced, on one plain, even mid-grey background: "
                  "(1) full-length standing view facing the viewer; (2) full-length standing view in a three-quarter turn; "
                  "(3) a large head-and-shoulders close-up portrait in three-quarter view that shows the face clearly. "
                  "Calm, neutral standing pose and expression, arms relaxed. Face, hair, build, garments and colours identical in all three views. No other people or figures."),
    "location": ("Layout: two views of this same place side by side, each filling half of the image, separated by a narrow plain mid-grey gap: "
                 "left, a wide establishing view; right, a closer ground-level view of its most characteristic part. Clear, neutral daylight. No people, no animals."),
    "object": ("Layout: the same object shown twice side by side on one plain, even mid-grey background: left, the whole object from a three-quarter angle; "
               "right, a close detail. Neutral, even light. No people, no hands, no animals."),
}
HEAD = {"character": "Character reference sheet", "location": "Location reference sheet", "object": "Object reference sheet"}


def era_line(entry):
    eras = [c.era_named(entry["work"], n) for n in entry["eras"]]
    if entry["kind"] == "character":
        return " ".join(f"{e['people']} {e['dress']}" for e in eras)
    return " ".join(e["buildings_and_objects"] for e in eras)


def prompt(entry, stage, style=c.STYLES["classical"]):
    return f"""{HEAD[entry['kind']]} for an illustrated edition of {c.WORKS[entry['work']]['title']}.
Art style: {style['label']}. {c.style_brief(style)}
World: {era_line(entry)}
{entry['kind'].capitalize()}: {stage['text']}
{LAYOUT[entry['kind']]}
{c.NO_TEXT}
Style negatives: {style['negative']}
Not a photograph."""


SCHEMA = {"type": "object", "additionalProperties": False,
          "required": ["views_ok", "same_subject", "extra_figures", "text_present", "frame_present", "canon_notes", "verdict", "reasons"],
          "properties": {"views_ok": {"type": "boolean"}, "same_subject": {"type": "boolean"}, "extra_figures": {"type": "boolean"},
                         "text_present": {"type": "boolean"}, "frame_present": {"type": "boolean"},
                         "canon_notes": {"type": "array", "items": {"type": "string"}, "description": "Ways the image departs from the canon entry; notes only, never a failure."},
                         "verdict": {"type": "string", "enum": ["pass", "fail"]}, "reasons": {"type": "array", "items": {"type": "string"}}}}


def question(entry, stage):
    views = {"character": "three views of one figure: full-length front, full-length three-quarter, and a head-and-shoulders close-up",
             "location": "two views of one place: a wide view and a closer view", "object": "two views of one object: the whole object and a close detail"}[entry["kind"]]
    extra = "no figures other than the subject" if entry["kind"] == "character" else "no people at all"
    return f"""You check a {entry['kind']} reference sheet before it is used as a reference image. Judge strictly from the image. Return only JSON.
It must show {views}; {extra}; no text of any kind; no frame or border around the image. All views must show the same subject. The plain grey background and the narrow plain gap or divider between the views are part of the sheet layout and are NOT a frame or panel edge.
Fail ONLY for these hard faults: a required view missing, views showing different subjects, extra figures, text, or a frame. Anything about likeness to the canon entry (build, age, colours, props) goes in canon_notes and never causes a fail.
CANON ENTRY (for notes only): {stage['text']}"""


def recheck():
    """Re-run only the vision check on existing tries of unfinished sheets (after a checker-brief change)."""
    canon = c.read_json("canon.json", {})
    sheets = c.read_json("sheets.json", {})
    for skey, rec in sheets.items():
        if rec["final"]:
            continue
        entry = canon[f"{rec['work']}:{rec['entry']}"]
        stage = next(st for st in entry["stages"] if st["id"] == rec["stage"])
        for t in rec["tries"]:
            if not t.get("file"):
                continue
            ck, v = images.vision_check(f"recheck__{skey}__t{t['n']}", os.path.join(c.OUT, t["file"]), question(entry, stage), "sheet_check", SCHEMA)
            t["recheck"] = v
            print(f"  {skey} try {t['n']} recheck: {v and v['verdict']} {v and v['reasons']}")
            if v and v["verdict"] == "pass":
                final = os.path.join(DIR, f"{skey}.jpg")
                shutil.copyfile(os.path.join(c.OUT, t["file"]), final)
                rec["final"] = os.path.relpath(final, c.OUT)
                break
    c.write_json("sheets.json", sheets)


def main():
    if "--recheck" in sys.argv:
        return recheck()
    canon = c.read_json("canon.json", {})
    sheets = c.read_json("sheets.json", {})
    for key, entry in canon.items():
        wid = entry["work"]
        if c.recurrence(wid).get(entry["id"], 0) < 2:
            continue
        for stage in entry["stages"]:
            skey = f"{wid}--{stage['id']}"
            if skey in sheets and (sheets[skey]["final"] or len(sheets[skey]["tries"]) >= 3):
                continue
            rec = {"work": wid, "entry": entry["id"], "name": entry["name"], "kind": entry["kind"], "stage": stage["id"], "canon_text": stage["text"],
                   "prompt": prompt(entry, stage), "tries": [], "final": None}
            t0, feedback = time.time(), ""
            for n in range(1, 4):
                g = images.generate(f"sheet__{skey}__t{n}", "lite", rec["prompt"] + feedback)
                if not g.get("raw"):
                    rec["tries"].append({"n": n, "error": g.get("error")})
                    continue
                f = os.path.join(DIR, f"{skey}.try{n}.jpg")
                images.to_jpeg(g["raw"], f)
                ck, v = images.vision_check(f"check__{skey}__t{n}", f, question(entry, stage), "sheet_check", SCHEMA)
                rec["tries"].append({"n": n, "file": os.path.relpath(f, c.OUT), "seconds": g["seconds"], "cost": g["cost"], "check_seconds": ck["seconds"], "check_cost": ck["cost"], "verdict": v})
                print(f"  {skey} try {n}: {v and v['verdict']} {v and v['reasons']} notes={v and v['canon_notes']}")
                if v and v["verdict"] == "pass":
                    final = os.path.join(DIR, f"{skey}.jpg")
                    shutil.copyfile(f, final)
                    rec["final"] = os.path.relpath(final, c.OUT)
                    break
                if v:
                    feedback = "\n\nA previous attempt was rejected because: " + "; ".join(v["reasons"]) + ". Fix these."
            rec["wall_seconds"] = round(time.time() - t0, 1)
            sheets[skey] = rec
            c.write_json("sheets.json", sheets)
    print(json.dumps({k: (v["final"] is not None, len(v["tries"])) for k, v in sheets.items()}, indent=0))
    print("spend so far: $%.4f" % images.orclient.spent())


if __name__ == "__main__":
    main()
