"""Make one style reference per style per work from a fixed template (#156): a wide view with
no people, from the style brief plus the work's main era. A vision look-check asks about people,
frames and text; failures are retried up to 3 times. Writes style-refs.json and style-refs/<work>--<style>.jpg.

  python -I stylerefs.py [work--style…]   (default: holmes and bible × watercolour, icon)
"""
import os
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import images  # noqa: E402

DIR = os.path.join(c.OUT, "style-refs")
os.makedirs(DIR, exist_ok=True)
DEFAULT = ["holmes--watercolour", "holmes--icon", "bible--watercolour", "bible--icon"]


def prompt(wid, style, v2=False):
    era = c.main_era(wid)
    if v2:
        # Template v2: one natural outdoor scene of the era, no small objects, no written matter.
        subject = (f"one wide, quiet outdoor view of the kind of place this era's stories happen in ({era['name']}): buildings and streets or "
                   f"countryside of this era, drawn from this list but shown as a single natural scene, not a collection of objects: "
                   f"{era['buildings_and_objects']} Leave out every small object, paper, book, letter, sign, poster or anything bearing writing. "
                   f"No people, no animals, no vehicles with drivers or passengers.")
    else:
        subject = f"a wide, quiet view of the world of this era, with no people and no animals: {era['buildings_and_objects']}"
    return f"""Style reference image for an illustrated edition; it exists only to show the art style.
Subject: {subject}
Art style: {style['label']}. {c.style_brief(style)}
Style negatives: {style['negative']}
One single full-bleed scene, composed as a cropped detail of a larger work: the painted scene runs off all four edges, with colour in every corner. {c.NO_TEXT}"""


SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["people_present", "animals_present", "frame_present", "text_present", "full_bleed", "verdict", "reasons"],
    "properties": {
        "people_present": {"type": "boolean"}, "animals_present": {"type": "boolean"},
        "frame_present": {"type": "boolean", "description": "Any border, frame, window shape, panel edge, paper margin or vignette."},
        "text_present": {"type": "boolean"},
        "full_bleed": {"type": "boolean", "description": "The scene reaches all four edges and corners."},
        "verdict": {"type": "string", "enum": ["pass", "fail"]},
        "reasons": {"type": "array", "items": {"type": "string"}},
    },
}
QUESTION = """You look-check a style reference image before an illustration engine uses it. Judge strictly from the image. Return only JSON.
The image must contain no people, no frame or border of any kind (including window shapes, paper margins or dark vignettes), no text, and must run to all four edges. Fail if any of these is broken; otherwise pass."""


def run(keys):
    refs = c.read_json("style-refs.json", {})
    for key in keys:
        if refs.get(key, {}).get("final"):
            print("skip", key)
            continue
        wid, sid, *flags = key.split("--")
        style = c.STYLES[sid]
        p = prompt(wid, style, v2="v2" in flags)
        rec = {"work": wid, "style": sid, "template": "v2" if "v2" in flags else "v1", "model": images.MODELS["flash"], "prompt": p, "main_era": c.main_era(wid)["name"], "tries": [], "final": None}
        t0 = time.time()
        feedback = ""
        for n in range(1, 4):
            g = images.generate(f"styleref__{key}__t{n}", "flash", p + feedback)
            if not g.get("raw"):
                rec["tries"].append({"n": n, "generate": g, "verdict": None})
                continue
            file = os.path.join(DIR, f"{key}.try{n}.jpg")
            images.to_jpeg(g["raw"], file)
            ck, verdict = images.vision_check(f"check__styleref__{key}__t{n}", file, QUESTION, "style_ref_check", SCHEMA, max_tokens=400)
            rec["tries"].append({"n": n, "file": os.path.relpath(file, c.OUT), "generate": {k: g.get(k) for k in ("seconds", "cost", "provider")},
                                 "check": {k: ck.get(k) for k in ("seconds", "cost")}, "verdict": verdict, "feedback_sent": feedback})
            print(f"  {key} try {n}: {verdict and verdict['verdict']} {verdict and verdict['reasons']}")
            if verdict and verdict["verdict"] == "pass":
                final = os.path.join(DIR, f"{key}.jpg")
                shutil.copyfile(file, final)
                rec["final"] = os.path.relpath(final, c.OUT)
                break
            if verdict:
                feedback = "\n\nA previous attempt was rejected because: " + "; ".join(verdict["reasons"]) + ". Fix these."
        rec["wall_seconds"] = round(time.time() - t0, 1)
        rec["cost"] = round(sum((t["generate"].get("cost") or 0) + ((t.get("check") or {}).get("cost") or 0) for t in rec["tries"]), 5)
        refs[key] = rec
        c.write_json("style-refs.json", refs)
    print("spend so far: $%.4f" % images.orclient.spent())


if __name__ == "__main__":
    run(sys.argv[1:] or DEFAULT)
