"""Style references per style per work from the v2 template (#159), with the look-check. References the
reference-sheets prototype already made with the same template are copied, not remade.
Writes style-refs.json and style-refs/<work>--<style>.jpg.

  python -I stylerefs.py
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
PRIOR_REFS = {  # made by prototype/reference-sheets with template v2 and the same style briefs
    "holmes--icon": "holmes--icon--v2.jpg", "bible--watercolour": "bible--watercolour--v2.jpg",
}
PRIOR_DIR = os.environ.get("PRIOR_STYLE_REFS", "/tmp/prior-style-refs")


def prompt(wid, style):
    era = c.main_era(wid)
    return f"""Style reference image for an illustrated edition; it exists only to show the art style.
Subject: one wide, quiet outdoor view of the kind of place this era's stories happen in ({era['name']}): buildings and streets or countryside of this era, drawn from this list but shown as a single natural scene, not a collection of objects: {era['buildings_and_objects']} Leave out every small object, paper, book, letter, sign, poster or anything bearing writing. No people, no animals, no vehicles with drivers or passengers.
Art style: {style['label']}. {c.style_brief(style)}
Style negatives: {style['negative']}
One single full-bleed scene, composed as a cropped detail of a larger work: the painted scene runs off all four edges, with colour in every corner. {c.NO_TEXT}"""


SCHEMA = {"type": "object", "additionalProperties": False, "required": ["people_present", "frame_present", "text_present", "full_bleed", "verdict", "reasons"],
          "properties": {"people_present": {"type": "boolean"}, "frame_present": {"type": "boolean"}, "text_present": {"type": "boolean"},
                         "full_bleed": {"type": "boolean"}, "verdict": {"type": "string", "enum": ["pass", "fail"]}, "reasons": {"type": "array", "items": {"type": "string"}}}}
QUESTION = """You look-check a style reference image before an illustration engine uses it. Judge strictly from the image. Return only JSON.
Fail if it contains any people, any frame or border (including window shapes, paper margins or vignettes), any text, or does not run to all four edges. Otherwise pass."""


def main():
    refs = c.read_json("style-refs.json", {})
    for wid, w in c.WORKS.items():
        for sid in w["style_set"]:
            if sid == "classical":
                continue
            key = f"{wid}--{sid}"
            if key in refs:
                continue
            prior = os.path.join(PRIOR_DIR, PRIOR_REFS.get(key, ""))
            if PRIOR_REFS.get(key) and os.path.exists(prior):
                shutil.copyfile(prior, os.path.join(DIR, f"{key}.jpg"))
                refs[key] = {"work": wid, "style": sid, "final": f"style-refs/{key}.jpg", "copied_from": "prototype/reference-sheets (template v2)", "tries": []}
                continue
            style = c.STYLES[sid]
            rec = {"work": wid, "style": sid, "prompt": prompt(wid, style), "tries": [], "final": None}
            t0, feedback = time.time(), ""
            for n in range(1, 4):
                g = images.generate(f"styleref__{key}__t{n}", "flash", rec["prompt"] + feedback)
                if not g.get("raw"):
                    rec["tries"].append({"n": n, "error": g.get("error")})
                    continue
                f = os.path.join(DIR, f"{key}.try{n}.jpg")
                images.to_jpeg(g["raw"], f)
                ck, v = images.vision_check(f"check__styleref__{key}__t{n}", f, QUESTION, "style_ref_check", SCHEMA, max_tokens=400)
                rec["tries"].append({"n": n, "file": os.path.relpath(f, c.OUT), "seconds": g["seconds"], "cost": g["cost"], "verdict": v})
                print(f"  {key} try {n}: {v and v['verdict']} {v and v['reasons']}")
                if v and v["verdict"] == "pass":
                    shutil.copyfile(f, os.path.join(DIR, f"{key}.jpg"))
                    rec["final"] = f"style-refs/{key}.jpg"
                    break
                if v:
                    feedback = "\n\nA previous attempt was rejected because: " + "; ".join(v["reasons"]) + ". Fix these."
            rec["wall_seconds"] = round(time.time() - t0, 1)
            refs[key] = rec
            c.write_json("style-refs.json", refs)
    c.write_json("style-refs.json", refs)
    print({k: v["final"] for k, v in refs.items()})


if __name__ == "__main__":
    main()
