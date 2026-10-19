"""Make reference sheets from canon entries with a fixed template, check each with a vision
model, retry failures (≤3 tries), and record time and cost. Writes sheets-<model>.json and
sheets/<entry>--<stage>--<model>.jpg (rejected tries kept as .tryN.jpg).

  python -I sheets.py flash|lite [stage ids…]
"""
import json
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import images  # noqa: E402

SHEETS_DIR = os.path.join(c.OUT, "sheets")
os.makedirs(SHEETS_DIR, exist_ok=True)
MAX_TRIES = 3
# Sheets the Lite comparison covers (one or two per kind).
LITE_SET = ["sherlock_holmes_main", "dr_watson-s1", "221b_baker_street_main", "jesus-main", "david-youth", "ark_of_the_covenant_tabernacle"]
# The ark's second stage duplicates the first (objects should not get stages); only the first is drawn.
SKIP = ["ark_of_the_covenant_shiloh_philistia"]

LAYOUT = {
    "character": ("Layout: the same figure shown three times side by side, evenly spaced, on one plain, even mid-grey background: "
                  "(1) full-length standing view facing the viewer; (2) full-length standing view in a three-quarter turn; "
                  "(3) a large head-and-shoulders close-up portrait in three-quarter view that shows the face clearly. "
                  "Calm, neutral standing pose and expression, arms relaxed. Face, hair, build, garments and colours identical in all three views. "
                  "No other people or figures."),
    "location": ("Layout: two views of this same place side by side, each filling half of the image, separated by a narrow plain mid-grey gap: "
                 "left, a wide establishing view showing the whole place and its surroundings; right, a closer ground-level view of its most "
                 "characteristic part. Clear, neutral daylight. No people, no animals."),
    "object": ("Layout: the same object shown twice side by side on one plain, even mid-grey background: left, the whole object seen from a "
               "three-quarter angle; right, a close detail of its most characteristic part. Neutral, even light. No people, no hands, no animals."),
}
HEAD = {"character": "Character reference sheet", "location": "Location reference sheet", "object": "Object reference sheet"}


def era_line(entry):
    """Content lines from the work brief: the era(s) this entry belongs to (#156: the brief owns what is shown)."""
    wid = entry["work"]
    names = entry.get("eras")
    if not names:
        # Hand-added entries have no matched sections: take the eras of their divisions' sections, never the work's main era.
        spec = next((x for x in c.ENTRIES if x["id"] == spec_id_of(entry)), None)
        divs = set(spec.get("divisions", [])) if spec else set()
        names = sorted({s["era"] for s in c.merged(wid).get("sections", []) if s.get("division") in divs and s.get("era")})
    names = names or [c.main_era(wid)["name"]]
    eras = [c.era_named(wid, n) for n in names]
    eras = [e for e in eras if e]
    if entry["kind"] == "character":
        return " ".join(f"{e['people']} {e['dress']}" for e in eras)
    return " ".join(e["buildings_and_objects"] for e in eras)


def sheet_prompt(entry, stage, style=c.STYLES["classical"]):
    return f"""{HEAD[entry['kind']]} for an illustrated edition of {c.WORKS[entry['work']]['title']}.
Art style: {style['label']}. {c.style_brief(style)}
World: {era_line(entry)}
{entry['kind'].capitalize()}: {stage['text']}
{LAYOUT[entry['kind']]}
{c.NO_TEXT}
Style negatives: {style['negative']}
Not a photograph."""


CHECK_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["views_ok", "views_note", "same_subject", "extra_figures", "background_plain", "text_present", "frame_present",
                 "canon_mismatches", "verdict", "reasons"],
    "properties": {
        "views_ok": {"type": "boolean", "description": "Every required view is present, in the right order and framing."},
        "views_note": {"type": "string"},
        "same_subject": {"type": "boolean", "description": "Every view shows the same person, place or object."},
        "extra_figures": {"type": "boolean", "description": "Any people or figures beyond the subject (for locations and objects: any people at all)."},
        "background_plain": {"type": "boolean"},
        "text_present": {"type": "boolean", "description": "Any letters, numbers, labels or captions anywhere."},
        "frame_present": {"type": "boolean", "description": "Any border, frame, panel edge, paper edge or canvas edge."},
        "canon_mismatches": {"type": "array", "items": {"type": "string"}, "description": "Each way the image contradicts the canon entry."},
        "verdict": {"type": "string", "enum": ["pass", "fail"]},
        "reasons": {"type": "array", "items": {"type": "string"}, "description": "Why it fails, one short line each; empty on pass."},
    },
}


def check_question(entry, stage):
    kind = entry["kind"]
    views = {
        "character": "three views of one figure: full-length front, full-length three-quarter, and a head-and-shoulders close-up",
        "location": "two views of one place: a wide establishing view and a closer ground-level view",
        "object": "two views of one object: the whole object and a close detail",
    }[kind]
    bg = "a plain, even grey background" if kind != "location" else "no frames and a narrow plain gap between the two views"
    return f"""You check a {kind} reference sheet for an illustrated edition before it is used as a reference image. Judge strictly from the image. Return only JSON.

The sheet must show {views}, on {bg}. It must contain no text of any kind, no frame or border, and no figures other than the subject{'' if kind == 'character' else ' (no people at all)'}. It must not contradict the canon entry below. Minor stylistic variation between views is fine; different clothing colours, hair, beard, age, build or props between views is a mismatch.

Set verdict to "fail" if any required view is missing, the views show different subjects, there are extra figures, there is text, there is a frame, or the image contradicts the canon entry in a way a reader would notice. Otherwise "pass".

CANON ENTRY: {stage['text']}"""


def run(model_key, only):
    canon = c.read_json("canon.json", {})
    sheets = c.read_json(f"sheets-{model_key}.json", {})
    jobs = []
    for spec in c.ENTRIES:
        entry = canon.get(spec["id"])
        if not entry:
            continue
        for stage in entry["stages"]:
            sid = stage["id"]
            if sid in SKIP or (only and sid not in only) or (not only and model_key == "lite" and sid not in LITE_SET):
                continue
            jobs.append((entry, stage))
    for entry, stage in jobs:
        key = f"{stage['id']}--{model_key}"
        if key in sheets and sheets[key].get("final"):
            print("skip", key, "(done)")
            continue
        prompt = sheet_prompt(entry, stage)
        question = check_question(entry, stage)
        rec = {"entry": entry["name"], "entry_id": spec_id(entry, canon), "stage": stage["id"], "stage_label": stage["label"], "kind": entry["kind"],
               "work": entry["work"], "model": images.MODELS[model_key], "prompt": prompt, "canon_text": stage["text"], "tries": [], "final": None}
        t0 = time.time()
        feedback = ""
        for n in range(1, MAX_TRIES + 1):
            label = f"sheet__{key}__t{n}"
            g = images.generate(label, model_key, prompt + feedback)
            if not g.get("raw"):
                rec["tries"].append({"n": n, "generate": g, "check": None})
                continue
            file = os.path.join(SHEETS_DIR, f"{key}.try{n}.jpg")
            images.to_jpeg(g["raw"], file)
            ck, verdict = images.vision_check(f"check__{key}__t{n}", file, question, "sheet_check", CHECK_SCHEMA)
            rec["tries"].append({"n": n, "file": os.path.relpath(file, c.OUT), "generate": {k: g.get(k) for k in ("seconds", "cost", "provider", "prompt_tokens", "completion_tokens")},
                                 "check": {k: ck.get(k) for k in ("seconds", "cost")}, "verdict": verdict, "feedback_sent": feedback})
            print(f"  {key} try {n}: {verdict and verdict['verdict']} {verdict and verdict['reasons']}")
            if verdict and verdict["verdict"] == "pass":
                final = os.path.join(SHEETS_DIR, f"{key}.jpg")
                shutil.copyfile(file, final)
                rec["final"] = os.path.relpath(final, c.OUT)
                break
            if verdict:
                feedback = "\n\nA previous attempt was rejected because: " + "; ".join(verdict["reasons"] + verdict["canon_mismatches"]) + ". Fix these."
        rec["wall_seconds"] = round(time.time() - t0, 1)
        rec["cost"] = round(sum((t["generate"].get("cost") or 0) + ((t["check"] or {}).get("cost") or 0) for t in rec["tries"]), 5)
        if not rec["final"]:
            # After three failures the engine runs without a sheet and surfaces it to the owner (#156 pattern); keep the last try for the record.
            last = next((t for t in reversed(rec["tries"]) if t.get("file")), None)
            rec["last_try"] = last and last["file"]
        sheets[key] = rec
        c.write_json(f"sheets-{model_key}.json", sheets)
    print("spend so far: $%.4f" % images.orclient.spent())


def spec_id_of(entry):
    canon = c.read_json("canon.json", {})
    return next((k for k, v in canon.items() if v.get("name") == entry.get("name") and v.get("work") == entry.get("work")), None)


def spec_id(entry, canon):
    return next(k for k, v in canon.items() if v is entry)


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2:])
