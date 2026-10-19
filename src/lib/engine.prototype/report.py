"""results.json, contact sheets per proof set, and review.html for the owner.

  python -I report.py
"""
import collections
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import orclient  # noqa: E402

MAGICK = "/opt/homebrew/bin/magick"


def main():
    imgs = c.read_json("images.json", {})
    ledger = [json.loads(l) for l in open(orclient.LEDGER, encoding="utf-8")] if os.path.exists(orclient.LEDGER) else []
    spend = sum(r.get("cost") or 0 for r in ledger)
    by = collections.defaultdict(float)
    for r in ledger:
        by[r["label"].split("__")[0]] += r.get("cost") or 0
    done = [v for v in imgs.values() if v.get("file")]
    secs = sorted(v["seconds"] for v in done)
    stats = {"images": len(done), "failed": len(imgs) - len(done),
             "seconds_mean": round(sum(secs) / len(secs), 2) if secs else None, "seconds_p90": secs[int(0.9 * (len(secs) - 1))] if secs else None,
             "seconds_max": max(secs) if secs else None, "cost_mean": round(sum(v["cost"] or 0 for v in done) / len(done), 5) if done else None,
             "credits_mean": round(sum(v["credits"] for v in done) / len(done), 2) if done else None, "credits_max": round(max(v["credits"] for v in done), 2) if done else None,
             "prompt_chars_max": max(v["prompt_chars"] for v in done) if done else None, "over_10s": sum(1 for s in secs if s > 10)}
    # Contact sheets: one per set, rows = moments, columns = styles.
    sheets = {}
    for set_id, p in c.PROOF.items():
        rows = [v for v in done if v["set"] == set_id]
        if not rows:
            continue
        styles = c.WORKS[p["work"]]["style_set"] if p["styles"] == "all" else p["styles"]
        moments = []
        for v in rows:
            if v["moment"] not in moments:
                moments.append(v["moment"])
        files = []
        for mid in moments:
            for st in styles:
                f = next((v["file"] for v in rows if v["moment"] == mid and v["style"] == st and v["with_refs"]), None)
                files.append(os.path.join(c.OUT, f) if f else "xc:grey")
        out = os.path.join(c.OUT, f"contact-{set_id}.jpg")
        # montage needs a label font; build rows with +append and stack them with -append instead.
        args = [MAGICK, "-background", "#222"]
        for r in range(0, len(files), len(styles)):
            row = files[r:r + len(styles)]
            args += ["("] + [x for f in row for x in ([f] if f != "xc:grey" else ["-size", "480x270", "xc:grey"])] + ["-resize", "480x270", "-bordercolor", "#222", "-border", "4", "+append", ")"]
        args += ["-append", "-quality", "80", out]
        subprocess.run(args, check=True)
        sheets[set_id] = os.path.relpath(out, c.OUT)
    results = {"question": "Does the whole engine hold up on Sherlock Holmes and the Bible? (#161)", "spend_usd": round(spend, 4), "spend_by_phase": {k: round(v, 4) for k, v in by.items()},
               "image_stats": stats, "contact_sheets": sheets, "images": imgs, "canon": c.read_json("canon.json"), "looks": c.read_json("looks.json"),
               "plans": c.read_json("plans.json"), "sheets": c.read_json("sheets.json"), "style_refs": c.read_json("style-refs.json")}
    c.write_json("results.json", results)
    html = ["<!doctype html><meta charset=utf-8><title>Engine prototype (#161)</title><style>body{font:14px/1.4 system-ui;margin:20px;max-width:1600px}img{max-width:100%;display:block}h2{margin-top:30px}p{margin:4px 0}small{color:#555}</style>",
            f"<h1>Engine prototype</h1><p>Spend ${results['spend_usd']}. {json.dumps(stats)}</p>"]
    for set_id, f in sheets.items():
        html.append(f"<h2>{set_id}</h2><p><small>columns: {', '.join(c.WORKS[c.PROOF[set_id]['work']]['style_set'] if c.PROOF[set_id]['styles']=='all' else c.PROOF[set_id]['styles'])}</small></p><img src='{f}'>")
    html.append("<h2>Every image</h2>")
    for k, v in imgs.items():
        if v.get("file"):
            html.append(f"<h3>{k}</h3><p><small>{v['ref']} · {v['seconds']} s · {v['credits']:.1f} credits · refs {[r['file'] for r in v['refs']]}</small></p><img src='{v['file']}' style='max-width:900px'>")
    with open(os.path.join(c.OUT, "review.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(html))
    print(json.dumps({k: results[k] for k in ("spend_usd", "spend_by_phase", "image_stats", "contact_sheets")}, indent=1))


if __name__ == "__main__":
    main()
