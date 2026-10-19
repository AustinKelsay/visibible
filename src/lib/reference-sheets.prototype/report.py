"""Write results.json and review.html (a self-contained contact sheet for the owner's blind
review: engine verdicts are hidden until a button is pressed).

  python -I report.py
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as c  # noqa: E402
import orclient  # noqa: E402


def recurrence(wid):
    """How many merged entries stand on stage (or are a setting) in 2+ story sections."""
    m = c.merged(wid)
    member_to = {}
    for x in m["cast"]:
        for mem in x["members"]:
            member_to[mem] = ("character", x["id"])
    for x in m["locations"]:
        for mem in x.get("members", []):
            member_to[mem] = ("location", x["id"])
    cnt = collections.Counter()
    n_sections = 0
    for did, d in c.divisions(wid).items():
        for s in d["sections"]:
            n_sections += 1
            for i in [o["id"] for o in s.get("on_stage", [])] + list(s.get("setting", [])):
                if f"{did}:{i}" in member_to:
                    cnt[member_to[f"{did}:{i}"]] += 1
    by_kind = collections.Counter()
    for (kind, _), v in cnt.items():
        if v >= 2:
            by_kind[kind] += 1
    return {"sections": n_sections, "entries": len(cnt), "recurring": sum(by_kind.values()), "recurring_by_kind": dict(by_kind),
            "units": sum(1 for u in c.units(wid).values() if u["division"] in c.divisions(wid)), "divisions": len(c.divisions(wid))}


def main():
    canon = c.read_json("canon.json", {})
    sheets = {**c.read_json("sheets-flash.json", {}), **c.read_json("sheets-lite.json", {})}
    refs = c.read_json("style-refs.json", {})
    ledger = [json.loads(l) for l in open(orclient.LEDGER, encoding="utf-8")] if os.path.exists(orclient.LEDGER) else []
    spend = sum(r.get("cost") or 0 for r in ledger)
    by_kind = collections.defaultdict(float)
    for r in ledger:
        k = r["label"].split("__")[0]
        by_kind[k] += r.get("cost") or 0

    def stats(items):
        gen = [t["generate"] for s in items for t in s["tries"] if t.get("file")]
        chk = [t["check"] for s in items for t in s["tries"] if t.get("check")]
        tries = [len(s["tries"]) for s in items]
        return {"sheets": len(items), "passed": sum(1 for s in items if s["final"]),
                "first_try_pass": sum(1 for s in items if s["tries"] and s["tries"][0].get("verdict", {}) and s["tries"][0]["verdict"]["verdict"] == "pass"),
                "tries_total": sum(tries), "mean_tries": round(sum(tries) / len(tries), 2) if tries else None,
                "gen_cost_mean": round(sum(g["cost"] or 0 for g in gen) / len(gen), 4) if gen else None,
                "gen_seconds_mean": round(sum(g["seconds"] for g in gen) / len(gen), 1) if gen else None,
                "check_cost_mean": round(sum(k["cost"] or 0 for k in chk) / len(chk), 5) if chk else None,
                "check_seconds_mean": round(sum(k["seconds"] for k in chk) / len(chk), 1) if chk else None,
                "wall_seconds_mean": round(sum(s["wall_seconds"] for s in items) / len(items), 1) if items else None,
                "cost_per_passed_sheet": round(sum(s["cost"] for s in items) / max(1, sum(1 for s in items if s["final"])), 4) if items else None}

    flash = [s for s in sheets.values() if s["model"].endswith("flash-image")]
    lite = [s for s in sheets.values() if s["model"].endswith("lite-image")]
    rec = {w: recurrence(w) for w in c.WORKS}
    # Whole-Bible projection by unit count (31,102 verses).
    bible_scale = 31102 / rec["bible"]["units"]
    projection = {}
    for name, st in (("flash", stats(flash)), ("lite", stats(lite))):
        if not st["cost_per_passed_sheet"]:
            continue
        projection[name] = {
            "per_sheet_usd": st["cost_per_passed_sheet"], "wall_seconds": st["wall_seconds_mean"],
            "holmes_recurring": rec["holmes"]["recurring"], "holmes_usd": round(rec["holmes"]["recurring"] * st["cost_per_passed_sheet"], 2),
            "bible_4_books_recurring": rec["bible"]["recurring"], "bible_4_books_usd": round(rec["bible"]["recurring"] * st["cost_per_passed_sheet"], 2),
            "whole_bible_recurring_est": round(rec["bible"]["recurring"] * bible_scale), "whole_bible_usd_est": round(rec["bible"]["recurring"] * bible_scale * st["cost_per_passed_sheet"]),
            "whole_bible_hours_sequential_est": round(rec["bible"]["recurring"] * bible_scale * st["wall_seconds_mean"] / 3600, 1),
        }
    results = {
        "question": "Can reference sheets be made and checked without the owner? (#159)",
        "models": {"sheets": ["google/gemini-3.1-flash-image", "google/gemini-3.1-flash-lite-image"], "canon_and_checks": "anthropic/claude-haiku-5.5"},
        "spend_usd": round(spend, 4), "spend_by_phase": {k: round(v, 4) for k, v in by_kind.items()}, "billed_calls": len(ledger),
        "canon": canon, "sheet_stats": {"flash": stats(flash), "lite": stats(lite)}, "recurrence": rec, "projection": projection,
        "sheets": sheets, "style_refs": refs,
    }
    c.write_json("results.json", results)
    write_html(results)
    print(json.dumps({k: results[k] for k in ("spend_usd", "spend_by_phase", "sheet_stats", "recurrence", "projection")}, indent=1))


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def write_html(r):
    parts = ["""<!doctype html><meta charset=utf-8><title>Reference sheets prototype (#159)</title>
<style>body{font:14px/1.4 system-ui;margin:20px;max-width:1500px}img{width:100%;display:block;background:#ddd}
.card{border:1px solid #ccc;padding:10px;margin:14px 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.v{display:none;background:#f6f6f6;padding:8px;margin-top:6px;font-size:13px}.show .v{display:block}
.pass{color:#060}.fail{color:#a00}small{color:#555}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:3px 8px;text-align:left}
.tries img{width:32%;display:inline-block;margin-right:1%}</style>
<h1>Reference sheets prototype</h1><p>Spend $SPEND. <button onclick="document.body.classList.toggle('show')">Show / hide engine verdicts</button></p>
""".replace("SPEND", str(r["spend_usd"]))]
    n = 0
    for key, s in r["sheets"].items():
        n += 1
        img = s["final"] or s.get("last_try")
        tries = s["tries"]
        parts.append(f"<div class=card><h2>{n}. {esc(s['entry'])} <small>— {esc(s['stage_label'])} · {s['kind']} · {s['model'].split('/')[-1]}</small></h2>")
        parts.append(f"<p><b>Canon:</b> {esc(s['canon_text'])}</p>")
        if img:
            parts.append(f"<img src='{img}'>")
        parts.append(f"<p><small>{len(tries)} tr{'y' if len(tries)==1 else 'ies'}, {s['wall_seconds']} s wall, ${s['cost']:.3f}; final: {'yes' if s['final'] else 'NO (engine would run without a sheet and surface this)'}</small></p>")
        parts.append("<div class=v>")
        for t in tries:
            v = t.get("verdict") or {}
            parts.append(f"<p>Try {t['n']}: <b class={v.get('verdict','fail')}>{esc(v.get('verdict','no image'))}</b> {esc('; '.join(v.get('reasons', [])))} "
                         f"<i>{esc('; '.join(v.get('canon_mismatches', [])))}</i> <small>views_ok={v.get('views_ok')} same={v.get('same_subject')} extra={v.get('extra_figures')} "
                         f"plain={v.get('background_plain')} text={v.get('text_present')} frame={v.get('frame_present')}</small></p>")
        if len(tries) > 1:
            parts.append("<div class=tries>" + "".join(f"<img src='{t['file']}'>" for t in tries if t.get("file")) + "</div>")
        parts.append("</div></div>")
    parts.append("<h1>Style references</h1>")
    for key, s in r["style_refs"].items():
        n += 1
        img = s["final"] or next((t["file"] for t in reversed(s["tries"]) if t.get("file")), None)
        parts.append(f"<div class=card><h2>{n}. {esc(key)} <small>— main era: {esc(s['main_era'])}</small></h2>")
        if img:
            parts.append(f"<img src='{img}' style='max-width:900px'>")
        parts.append(f"<p><small>{len(s['tries'])} tries, {s['wall_seconds']} s, ${s['cost']:.3f}; final: {'yes' if s['final'] else 'NO'}</small></p><div class=v>")
        for t in s["tries"]:
            v = t.get("verdict") or {}
            parts.append(f"<p>Try {t['n']}: <b class={v.get('verdict','fail')}>{esc(v.get('verdict','no image'))}</b> {esc('; '.join(v.get('reasons', [])))}</p>")
        parts.append("</div></div>")
    parts.append("<h1>Stats</h1><pre>" + esc(json.dumps({k: r[k] for k in ("sheet_stats", "recurrence", "projection", "spend_by_phase")}, indent=1)) + "</pre>")
    with open(os.path.join(c.OUT, "review.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


if __name__ == "__main__":
    main()
