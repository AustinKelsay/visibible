"""Build results.json and the self-contained review.html from the run's analysis files.

Usage: python -I build_review.py <inputs dir> <output dir>
  inputs dir holds bible-web.json and holmes.json (the imported works); analysis, scores and
  the ledger are read from RP_DATA. The output dir gets results.json, review.html, scores.jsonl,
  spend.json and copies of every call's JSON (no source text, no key).
"""
import glob
import html
import json
import os
import shutil
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_brief  # noqa: E402
import orclient  # noqa: E402
import work_format as wf  # noqa: E402

DATA = orclient.DATA
AN = os.path.join(DATA, "analysis")
BIBLE_MAIN = {"EXO": "t24", "1SA": "t24", "LUK": "v1", "JHN": "v1"}
BIBLE_BOOKS = ["EXO", "1SA", "LUK", "JHN"]
HINTS = {"v1": "target 18 units/section", "t24": "target 24 units/section", "research": "research prompt (5-30 units)", "control": "target 18, repeat run"}

BAR = [("pk", "Pk", "≤ 0.30", "≤ 0.20"), ("windowdiff", "WindowDiff", "≤ 0.35", "≤ 0.25"), ("f1", "Boundary F1 ±2", "≥ 0.55", "≥ 0.70"),
       ("ratio", "Sections vs Clear.Bible", "0.5–1.5×", "0.75–1.25×"), ("precision", "Cast precision", "≥ 0.90", "≥ 0.95"),
       ("major", "Major cast listed", "≥ 90%", "100%"), ("no_wrong_merge_major", "Same-name, major cast", "no wrong merge", "all apart")]

RESEARCH_HAIKU = {  # from llm/research/2026-10-18-whole-work-reading.md, Claude Haiku 5.5 rows
    "1SA": {"sections": 35, "ref": 51, "pk": 0.161, "windowdiff": 0.196, "B": 0.575, "f1": 0.762, "precision": 0.948, "recall": 0.692, "major": "11/11"},
    "EXO": {"sections": 33, "ref": 80, "pk": 0.272, "windowdiff": 0.289, "B": 0.405, "f1": 0.577, "precision": 0.919, "recall": 0.545, "major": "4/4"},
    "JHN": {"sections": 38, "ref": 87, "pk": 0.270, "windowdiff": 0.294, "B": 0.386, "f1": 0.569, "precision": 0.967, "recall": 0.695, "major": "6/7"},
}


def load(path):
    return json.load(open(path, encoding="utf-8"))


def esc(s):
    return html.escape(str(s if s is not None else ""))


# ---------------------------------------------------------------- gather

def gather(inputs):
    bible = wf.load(os.path.join(inputs, "bible-web.json"))
    holmes = wf.load(os.path.join(inputs, "holmes.json"))
    scores = [json.loads(l) for l in open(os.path.join(DATA, "scores.jsonl"), encoding="utf-8")]
    hmerged = load(os.path.join(AN, "holmes-adventures__merged__v1.json"))
    bmerged = load(os.path.join(AN, "bible-web__merged__main.json"))
    bdrafts = {}
    for name in ("v1-first", "v1-second"):
        p = os.path.join(AN, f"bible-web__merged__{name}.json")
        if os.path.exists(p):
            bdrafts[name] = load(p)["brief"]
    moments = {}
    for d in holmes["divisions"]:
        moments[d["id"]] = load(os.path.join(AN, f"holmes-adventures__{d['id']}__moments__v1.json"))
    spend = load(os.path.join(DATA, "spend.json")) if os.path.exists(os.path.join(DATA, "spend.json")) else None
    return bible, holmes, scores, hmerged, bmerged, bdrafts, moments, spend


def division_brief_flags(work, merged, division_id, parts_by_div):
    part = parts_by_div[division_id]
    pseudo = {"cast": part["characters"], "locations": part["locations"], "sections": part["sections"],
              "brief": {"tone": part["brief"]["tone"], "depiction_rules": part["brief"]["depiction_rules"], "eras": [part["brief"]["era"]]}}
    return check_brief.flag_brief(work, pseudo)


def holmes_identity(hmerged):
    def find(pred):
        return [c for c in hmerged["cast"] if pred(" ".join([c["id"], c["name"], *c["aliases"], c["note"]]).lower())]
    links = {(l["from"].split(":")[1]): l for l in hmerged["merge"]["same_person_links"]}
    irene = find(lambda h: "irene" in h)
    youth = find(lambda h: "ulster" in h or "slim youth" in h)
    cases = [
        ("Hosmer Angel = James Windibank (disguise)", links.get("hosmer_angel", {}).get("joined", False),
         "same_person_as link from the story call; merge " + ("joined them" if links.get("hosmer_angel", {}).get("joined") else "kept them apart"), "research: kept apart"),
        ("Hugh Boone = Neville St. Clair (disguise)", links.get("hugh_boone", {}).get("joined", False),
         "same_person_as link; merge " + ("joined them" if links.get("hugh_boone", {}).get("joined") else "kept them apart"), "research: joined"),
        ("Slim youth in an ulster = Irene Adler", any(c in irene for c in youth) and bool(youth),
         f"{len(youth)} youth entries, {len(irene)} Irene entries; " + ("one entry" if any(c in irene for c in youth) else "separate entries"), "research: 2 of 8 models linked"),
        ("Holmes one entry across 12 stories", any(len(c["divisions"]) == 12 for c in find(lambda h: "sherlock" in h)), f"{len(find(lambda h: 'sherlock' in h))} entries", "research: yes"),
        ("Watson one entry across 12 stories", any(len(c["divisions"]) == 12 and "watson" in c["id"] for c in hmerged["cast"]), "", "research: yes"),
        ("Lestrade joined across stories 4 and 10", any(len(c["divisions"]) >= 2 for c in find(lambda h: "lestrade" in h)), f"divisions {[c['divisions'] for c in find(lambda h: 'lestrade' in h)]}", "research: yes"),
        ("Mary Sutherland joined across stories 2 and 3", any(len(c["divisions"]) >= 2 for c in find(lambda h: "sutherland" in h and "mary" in h)), "", "research: yes"),
        ("Mrs. Turner (story 1 landlady) kept apart from Mrs. Hudson",
         not any(any("turner" in n.lower() for n in [c["name"], *c["aliases"]]) and any("hudson" in n.lower() for n in [c["name"], *c["aliases"]]) for c in hmerged["cast"]),
         f"entries naming Hudson: {[c['id'] for c in hmerged['cast'] if any('hudson' in n.lower() for n in [c['name'], *c['aliases']])]}", "research: yes"),
        ("Vincent Spaulding = John Clay (assumed name)", any(any("spaulding" in n.lower() for n in [c["name"], *c["aliases"]]) and any("clay" in n.lower() for n in [c["name"], *c["aliases"]]) for c in hmerged["cast"]),
         f"entries: {[c['id'] for c in hmerged['cast'] if any('spaulding' in n.lower() or 'john clay' in n.lower() for n in [c['name'], *c['aliases']])]}", "research: not checked"),
        ("Watson's consulting room kept apart from Baker Street", any("consult" in l["name"].lower() for l in hmerged["locations"]), f"{[l['id'] for l in hmerged['locations'] if 'consult' in l['name'].lower() or 'baker' in l['name'].lower()]}", "research: folded into Baker Street"),
    ]
    return [{"case": c, "ok": bool(ok), "detail": d, "research": r} for c, ok, d, r in cases]


def bible_identity(scores):
    by = {(s["book"], s["label"].split("__")[-1]): s for s in scores}
    rows = []
    for book, name, research in (("EXO", "pharaoh", "merged (1 entry)"), ("1SA", "abinadab", "merged (0 of 7 models kept 3 apart)"),
                                 ("1SA", "ahinoam", "merged (0 of 7)"), ("1SA", "ahimelech", "3 of 7 kept apart"),
                                 ("LUK", "mary", "n/a"), ("LUK", "judas", "n/a"), ("LUK", "simon", "n/a"), ("LUK", "james", "n/a"), ("LUK", "herod", "n/a"),
                                 ("JHN", "mary", "3 of 4 kept apart; Haiku missed Mary of Clopas"), ("JHN", "judas", "2 of 4 kept apart")):
        runs = {}
        for (b, tag), s in by.items():
            if b == book and name in s["same_name_groups"]:
                g = s["same_name_groups"][name]
                runs[tag] = f"{g['entries']} entries for {g['individuals']} individuals" + (f", {g['entries_spanning_two']} spanning two" if g["entries_spanning_two"] else "")
        rows.append({"book": book, "name": name, "runs": runs, "research": research})
    return rows


# ---------------------------------------------------------------- html

CSS = """
body{font:14px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:0;color:#1a1a1a;background:#fafafa}
header{background:#1f2937;color:#fff;padding:12px 20px}header h1{margin:0;font-size:18px}
nav{display:flex;gap:4px;padding:8px 20px;background:#e5e7eb;position:sticky;top:0}
nav button{border:0;background:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:14px}nav button.on{background:#1f2937;color:#fff}
main{padding:16px 20px;max-width:1400px}section.tab{display:none}section.tab.on{display:block}
table{border-collapse:collapse;margin:8px 0 16px;font-size:13px}th,td{border:1px solid #d1d5db;padding:4px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6}
.pass{background:#dcfce7}.fail{background:#fee2e2}.good{background:#bbf7d0}.flag{background:#fef3c7}
details{margin:4px 0}summary{cursor:pointer;font-weight:600}.sec{border-left:3px solid #9ca3af;padding:4px 10px;margin:8px 0;background:#fff}
.mom{margin:3px 0 3px 16px;padding:3px 8px;border-left:2px solid #c7d2fe;background:#f8fafc;font-size:13px}
.muted{color:#6b7280}.small{font-size:12px}.cast span.named{font-weight:600}ul.rules li{margin:3px 0}.era{background:#fff;border:1px solid #d1d5db;padding:6px 10px;margin:6px 0}
code{background:#f3f4f6;padding:0 3px}h2{margin-top:24px}h3{margin:16px 0 4px}h4{margin:12px 0 2px}
"""
JS = """
function show(id){document.querySelectorAll('section.tab').forEach(s=>s.classList.toggle('on',s.id===id));
document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===id));location.hash=id;}
window.onload=()=>show((location.hash||'#summary').slice(1));
"""


def cls(ok, good=None):
    return "good" if good else ("pass" if ok else "fail")


def score_table(scores, main_tags, research=None):
    out = ["<table><tr><th>Book</th><th>Run (hint)</th><th>Sections</th><th>Ratio</th><th>Pk</th><th>WD</th><th>B</th><th>F1 ±2</th><th>Cast P (all listed)</th><th>Cast P (named only)</th><th>Cast R</th><th>Major</th><th>Same-name major, heuristic</th><th>Cost</th><th>s</th></tr>"]
    for s in scores:
        tag = s["label"].split("__")[-1]
        main = main_tags.get(s["book"]) == tag
        b, g = s["bar"], s["good"]
        out.append(f"<tr{' style=font-weight:600' if main else ''}><td>{s['book']}{' (main)' if main else ''}</td><td>{esc(HINTS.get(tag, tag))}</td>"
                   f"<td>{s['sections']} / {s['ref_sections']}</td><td class='{cls(b['ratio'], g['ratio'])}'>{s['ratio']}×</td>"
                   f"<td class='{cls(b['pk'], g['pk'])}'>{s['pk']}</td><td class='{cls(b['windowdiff'], g['windowdiff'])}'>{s['windowdiff']}</td><td>{s['B']}</td>"
                   f"<td class='{cls(b['f1'], g['f1'])}'>{s['boundary_tol2']['f1']}</td><td class='{cls(b['precision'], g['precision'])}'>{s['cast']['precision']}</td>"
                   f"<td class='{cls(s['cast']['precision_named_only'] >= 0.9, s['cast']['precision_named_only'] >= 0.95)}'>{s['cast']['precision_named_only']}</td><td>{s['cast']['recall']}</td>"
                   f"<td class='{cls(b['major'], g['major'])}'>{round(s['major_listed'] * s['major_tipnr'])}/{s['major_tipnr']}{(' missing ' + ', '.join(s['major_missing'])) if s['major_missing'] else ''}</td>"
                   f"<td class='{cls(b['no_wrong_merge_major'])}'>{'none' if b['no_wrong_merge_major'] else 'flagged'}</td><td>${s['cost']:.4f}</td><td>{s['seconds']}</td></tr>")
        if research and s["book"] in research and main:
            r = research[s["book"]]
            out.append(f"<tr class='muted'><td></td><td>research, Haiku 5.5</td><td>{r['sections']} / {r['ref']}</td><td>{round(r['sections'] / r['ref'], 2)}×</td><td>{r['pk']}</td><td>{r['windowdiff']}</td><td>{r['B']}</td><td>{r['f1']}</td><td>{r['precision']}</td><td>–</td><td>{r['recall']}</td><td>{r['major']}</td><td>–</td><td></td><td></td></tr>")
    out.append("</table>")
    return "\n".join(out)


def cast_line(ids, cast_by_id, named=None):
    parts = []
    for x in ids:
        cid, nm = (x["id"], x["named"]) if isinstance(x, dict) else (x, None)
        c = cast_by_id.get(cid)
        label = esc(c["name"]) if c else esc(cid)
        parts.append(f"<span class='{'named' if nm else ''}' title='{esc(c['note']) if c else ''}'>{label}{'' if nm is None else ('' if nm else ' <i class=muted>(unnamed)</i>')}</span>")
    return ", ".join(parts)


def brief_html(brief, flags, title):
    fl = {f["where"]: f for f in flags}

    def line(where, text):
        f = fl.get(where)
        hits = "" if not f else " <span class='small muted'>flag: " + "; ".join(
            (h["kind"] + " " + esc(h.get("entity", h["matched"])) + (f" [{h['entity_kind']}]" if h.get("entity_kind") else "")) for h in f["hits"]) + "</span>"
        return f"<li class='{'flag' if f else ''}'>{esc(text)}{hits}</li>"
    out = [f"<h3>{esc(title)}</h3>", f"<p><b>Tone:</b> {esc(brief['tone'])}</p>", "<b>Depiction rules</b><ul class='rules'>"]
    out += [line(f"depiction_rules[{i}]", r) for i, r in enumerate(brief["depiction_rules"])]
    out.append("</ul><b>Eras</b>")
    for e in brief["eras"]:
        out.append(f"<div class='era'><b>{esc(e['name'])}</b><ul class='rules'>")
        for k in ("people", "dress", "buildings_and_objects", "technology"):
            out.append(line(f"era '{e['name']}'.{k}", f"{k.replace('_', ' ')}: {e[k]}"))
        out.append("</ul></div>")
    out.append(f"<p class='small muted'>{len(flags)} flagged line(s) of {1 + len(brief['depiction_rules']) + 4 * len(brief['eras'])}.</p>")
    return "\n".join(out)


def build_html(R):
    H = [f"<!doctype html><html><head><meta charset='utf-8'><title>Reading pass prototype review</title><style>{CSS}</style></head><body>",
         "<header><h1>Reading pass prototype: review</h1><div class='small'>Ticket 157. Model anthropic/claude-haiku-5.5 (Anthropic endpoint, reasoning off, strict JSON schema). "
         f"Run {R['run_date']}. Spend ${R['spend']['usage_cost_total']:.4f} of the $1.50 cap.</div></header>",
         "<nav><button data-t='summary' onclick=\"show('summary')\">Summary</button><button data-t='holmes' onclick=\"show('holmes')\">Holmes</button>"
         "<button data-t='bible' onclick=\"show('bible')\">Bible</button><button data-t='briefs' onclick=\"show('briefs')\">Briefs</button></nav><main>"]
    # ---- summary
    S = R["summary"]
    H.append("<section class='tab' id='summary'><h2>Summary</h2>")
    H.append("<h3>Bible: main runs against the research bar</h3><p class='small muted'>Green = pass, dark green = good, red = fail. Bold rows are the runs used for the merge and brief: "
             "target 24 units/section for Exodus and 1 Samuel, target 18 for Luke and John (Clear.Bible cuts the gospels about twice as finely as the narrative books). "
             "'Cast P (all listed)' counts every on-stage entry; 'named only' counts on-stage entries the code flagged as named in the section plus mentioned-only entries, which is what TIPNR can see. "
             "The same-name column is a heuristic (an entry whose sections cover verses of two TIPNR bearers of the name); the hand-checked cases are below.</p>")
    H.append(score_table([s for s in R["scores"] if BIBLE_MAIN.get(s["book"]) == s["label"].split("__")[-1]], BIBLE_MAIN, RESEARCH_HAIKU))
    H.append("<h3>Bible: every run (granularity experiment)</h3>")
    H.append(score_table(R["scores"], BIBLE_MAIN))
    H.append("<h3>Bible: same-name people, by run</h3><table><tr><th>Book</th><th>Name</th>" + "".join(f"<th>{esc(HINTS.get(t, t))}</th>" for t in S["bible_run_tags"]) + "<th>Research</th></tr>")
    for r in S["bible_identity"]:
        H.append(f"<tr><td>{r['book']}</td><td>{r['name']}</td>" + "".join(f"<td>{esc(r['runs'].get(t, '–'))}</td>" for t in S["bible_run_tags"]) + f"<td class='muted'>{esc(r['research'])}</td></tr>")
    H.append("</table>")
    H.append("<h3>Holmes: identity cases</h3><table><tr><th>Case</th><th>Result</th><th>Detail</th><th>Research</th></tr>")
    for c in S["holmes_identity"]:
        H.append(f"<tr><td>{esc(c['case'])}</td><td class='{cls(c['ok'])}'>{'yes' if c['ok'] else 'no'}</td><td class='small'>{esc(c['detail'])}</td><td class='small muted'>{esc(c['research'])}</td></tr>")
    H.append("</table>")
    hs = S["holmes_stats"]
    H.append(f"<h3>Holmes: sections and moments</h3><p>{hs['stories']} stories, {hs['paragraphs']} paragraphs, {hs['sections']} sections (research: 148), {hs['moments']} moments. "
             f"Cast: {hs['cast']} characters from {hs['cast_entries']} story entries (research: 116 from 144), {hs['locations']} locations. "
             f"Moment words: min {hs['words']['min']}, median {hs['words']['median']}, mean {hs['words']['mean']}, max {hs['words']['max']}; "
             f"{hs['in_range']} of {hs['moments']} moments ({hs['in_range_pct']}%) are 100–400 words. Paragraphs in no moment: {hs['outside']}; in two moments: {hs['overlap_units']}; moments crossing a section: {hs['crossing']}; bad ids: {hs['bad_ids']}.</p>")
    H.append("<table><tr><th>Words</th>" + "".join(f"<th>{b}</th>" for b in hs["histogram"]) + "</tr><tr><td>Moments</td>" + "".join(f"<td>{n}</td>" for n in hs["histogram"].values()) + "</tr></table>")
    H.append("<h3>Briefs: what the drafts proposed and what the check flagged</h3>")
    for w in ("holmes", "bible"):
        b = R["briefs"][w]
        H.append(f"<p><b>{esc(b['title'])}</b>: {len(b['brief']['depiction_rules'])} rules, {len(b['brief']['eras'])} era(s), {len(b['flags'])} flagged line(s). "
                 f"Sections per era: {esc(json.dumps(b['sections_per_era']))}. Unassigned sections: {len(b['unassigned'])}.</p>")
    H.append(f"<p>Rules about divine beings proposed unprompted in the Bible drafts (all drafts): <ul>{''.join('<li>' + esc(x) + '</li>' for x in S['divine_rules'])}</ul></p>")
    H.append("<h3>What improved on the research, and what did not</h3><ul>" + "".join(f"<li>{esc(x)}</li>" for x in S["improvements"]) + "</ul>")
    H.append("<h3>Failures seen in this run</h3><ul>" + "".join(f"<li>{esc(x)}</li>" for x in S["failures"]) + "</ul>")
    sp = R["spend"]
    H.append(f"<h3>Spend</h3><p>usage.cost total <b>${sp['usage_cost_total']:.4f}</b>; OpenRouter generation records total ${sp['generation_total']}; calls without a record: {sp['calls_without_record']}; {len(sp['calls'])} calls, cap ${sp['cap']:.2f}.</p><table><tr><th>Kind</th><th>Calls</th><th>Invalid</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th></tr>")
    for k, v in sorted(sp["by_kind"].items()):
        H.append(f"<tr><td>{esc(k)}</td><td>{v['calls']}</td><td>{v['invalid']}</td><td>{v['prompt_tokens']}</td><td>{v['completion_tokens']}</td><td>${v['cost']:.4f}</td></tr>")
    H.append("</table></section>")
    # ---- holmes
    H.append("<section class='tab' id='holmes'><h2>The Adventures of Sherlock Holmes</h2><p class='small muted'>Per story: sections with their era, cast (bold = named in the section's own paragraphs, worked out in code), moments with summary and word count, and the story draft brief's flagged lines. Hover a name for its note.</p>")
    cast_by = {c["id"]: c for c in R["holmes"]["cast"]}
    for st in R["holmes"]["stories"]:
        H.append(f"<details><summary>{esc(st['name'])} — {st['paragraphs']} paragraphs, {len(st['sections'])} sections, {st['moment_count']} moments, cast {len(st['cast'])}</summary>")
        H.append("<h4>Cast in this story</h4><ul class='small'>")
        for c in st["cast"]:
            H.append(f"<li><b>{esc(c['name'])}</b> ({c['kind']}){(' — aliases: ' + esc(', '.join(c['aliases']))) if c['aliases'] else ''} <span class='muted'>{esc(c['note'])}</span></li>")
        H.append("</ul><h4>Sections and moments</h4>")
        for s in st["sections"]:
            H.append(f"<div class='sec'><b>{esc(s['title'])}</b> <span class='muted small'>¶{s['start_n']}–¶{s['end_n']}, {s['n_units']} paragraphs, {s['words']} words · era: {esc(s['era'])} · setting: {esc(', '.join(s['setting_names']))}</span>"
                     f"<div class='cast small'>On stage: {cast_line(s['on_stage'], cast_by)}{(' · mentioned: ' + cast_line(s['mentioned_only'], cast_by)) if s['mentioned_only'] else ''}</div>")
            for m in s["moments"]:
                H.append(f"<div class='mom'><span class='muted'>¶{m['start_n']}–¶{m['end_n']} · {m['words']} w{' · crosses section' if m['crosses_section'] else ''}</span> {esc(m['summary'])}</div>")
            H.append("</div>")
        if st["brief_flags"]:
            H.append("<h4>Story draft brief: flagged lines</h4><ul class='small'>" + "".join(f"<li class='flag'>{esc(f['where'])}: {esc(f['text'])} <span class='muted'>— " + "; ".join(h["kind"] + " " + esc(h.get("entity", h["matched"])) for h in f["hits"]) + "</span></li>" for f in st["brief_flags"]) + "</ul>")
        H.append("</details>")
    H.append("</section>")
    # ---- bible
    H.append("<section class='tab' id='bible'><h2>Bible (WEB): Exodus, 1 Samuel, Luke, John</h2>")
    cast_by = {c["id"]: c for c in R["bible"]["cast"]}
    for bk in R["bible"]["books"]:
        H.append(f"<details><summary>{esc(bk['name'])} — {bk['units']} verses, {len(bk['sections'])} sections, cast {len(bk['cast'])}</summary>")
        H.append("<h4>Scores against the bar (this book, all runs)</h4>" + score_table([s for s in R["scores"] if s["book"] == bk["id"]], BIBLE_MAIN, RESEARCH_HAIKU))
        H.append("<h4>Cast in this book</h4><ul class='small'>")
        for c in bk["cast"]:
            H.append(f"<li><b>{esc(c['name'])}</b> ({c['kind']}){(' — aliases: ' + esc(', '.join(c['aliases']))) if c['aliases'] else ''} <span class='muted'>{esc(c['note'])}</span></li>")
        H.append("</ul><h4>Sections</h4>")
        for s in bk["sections"]:
            H.append(f"<div class='sec'><b>{esc(s['title'])}</b> <span class='muted small'>{esc(s['start_ref'])} – {esc(s['end_ref'].split(' ', 1)[1] if ' ' in s['end_ref'] else s['end_ref'])}, {s['n_units']} verses · era: {esc(s['era'])} · setting: {esc(', '.join(s['setting_names']))}</span>"
                     f"<div class='cast small'>On stage: {cast_line(s['on_stage'], cast_by)}{(' · mentioned: ' + cast_line(s['mentioned_only'], cast_by)) if s['mentioned_only'] else ''}</div></div>")
        if bk["brief_flags"]:
            H.append("<h4>Book draft brief: flagged lines</h4><ul class='small'>" + "".join(f"<li class='flag'>{esc(f['where'])}: {esc(f['text'])} <span class='muted'>— " + "; ".join(h["kind"] + " " + esc(h.get("entity", h["matched"])) for h in f["hits"]) + "</span></li>" for f in bk["brief_flags"]) + "</ul>")
        H.append("</details>")
    H.append("</section>")
    # ---- briefs
    H.append("<section class='tab' id='briefs'><h2>Draft work briefs</h2><p class='small muted'>Verbatim from the merge step. Yellow lines are what the check flagged (a single character, location, chapter/section reference or title); the flag names the entity and its kind so a rule about a divine being can be told from one about a person.</p>")
    for w in ("holmes", "bible"):
        b = R["briefs"][w]
        H.append(brief_html(b["brief"], b["flags"], b["title"]))
    H.append("<h3>Earlier Bible drafts (same prompt, earlier merge attempts; kept for the record of what was proposed unprompted)</h3>")
    for name, b in R["briefs"]["bible_earlier_drafts"].items():
        H.append(brief_html(b["brief"], b["flags"], f"Bible draft {name}"))
    H.append("</section></main><script>" + JS + "</script></body></html>")
    return "\n".join(H)


# ---------------------------------------------------------------- main

def main():
    inputs, outdir = sys.argv[1:3]
    os.makedirs(outdir, exist_ok=True)
    bible, holmes, scores, hmerged, bmerged, bdrafts, moments, spend = gather(inputs)
    assert spend, "run spend.py --verify spend.json first"
    # holmes
    hparts = {d["id"]: load(os.path.join(AN, f"holmes-adventures__{d['id']}__v1.json")) for d in holmes["divisions"]}
    hloc = {l["id"]: l for l in hmerged["locations"]}
    stories = []
    all_moments = []
    for d in holmes["divisions"]:
        secs = [s for s in hmerged["sections"] if s["division"] == d["id"]]
        mom = moments[d["id"]]
        for s in secs:
            s["setting_names"] = [hloc[x]["name"] for x in s["setting"] if x in hloc]
            s["start_n"], s["end_n"] = int(s["start"].rsplit("-", 1)[1]), int(s["end"].rsplit("-", 1)[1])
            s["moments"] = [m for m in mom["moments"] if s["start_n"] <= m["start_n"] <= s["end_n"]]
        all_moments += mom["moments"]
        cast = [c for c in hmerged["cast"] if d["id"] in c["divisions"]]
        stories.append({"id": d["id"], "name": d["name"], "paragraphs": len(d["units"]), "sections": secs, "moment_count": len(mom["moments"]),
                        "moment_checks": mom["checks"], "cast": cast, "brief": hparts[d["id"]]["brief"],
                        "brief_flags": division_brief_flags(holmes, hmerged, d["id"], hparts), "record": hparts[d["id"]]["record"]})
    words = sorted(m["words"] for m in all_moments)
    hist = Counter()
    for w in words:
        hist["<100" if w < 100 else "100–200" if w < 200 else "200–300" if w < 300 else "300–400" if w <= 400 else "401–600" if w <= 600 else ">600"] += 1
    hist = {k: hist.get(k, 0) for k in ("<100", "100–200", "200–300", "300–400", "401–600", ">600")}
    holmes_stats = {"stories": len(stories), "paragraphs": sum(len(d["units"]) for d in holmes["divisions"]), "sections": len(hmerged["sections"]),
                    "moments": len(all_moments), "cast": len(hmerged["cast"]), "cast_entries": hmerged["merge"]["entries"] - sum(len(p["locations"]) for p in hparts.values()),
                    "locations": len(hmerged["locations"]),
                    "words": {"min": words[0], "median": words[len(words) // 2], "mean": round(sum(words) / len(words)), "max": words[-1]},
                    "in_range": sum(1 for w in words if 100 <= w <= 400), "in_range_pct": round(100 * sum(1 for w in words if 100 <= w <= 400) / len(words)),
                    "outside": sum(m["checks"]["units_outside_moments"] for m in moments.values()), "overlap_units": sum(m["checks"]["overlapping_units"] for m in moments.values()),
                    "crossing": sum(m["checks"]["crossing_sections"] for m in moments.values()), "bad_ids": sum(len(m["checks"]["bad_ids"]) for m in moments.values()),
                    "histogram": hist}
    hflags = check_brief.flag_brief(holmes, hmerged)
    # bible
    bparts = {b: load(os.path.join(AN, f"bible-web__{b}__main.json")) for b in BIBLE_BOOKS}
    bloc = {l["id"]: l for l in bmerged["locations"]}
    books = []
    for b in BIBLE_BOOKS:
        d = next(x for x in bible["divisions"] if x["id"] == b)
        secs = [s for s in bmerged["sections"] if s["division"] == b]
        for s in secs:
            s["setting_names"] = [bloc[x]["name"] for x in s["setting"] if x in bloc]
        books.append({"id": b, "name": d["name"], "units": bparts[b]["units"], "sections": secs, "cast": [c for c in bmerged["cast"] if b in c["divisions"]],
                      "brief": bparts[b]["brief"], "brief_flags": division_brief_flags(bible, bmerged, b, bparts), "record": bparts[b]["record"], "checks": bparts[b]["checks"]})
    bflags = check_brief.flag_brief(bible, bmerged)
    earlier = {}
    for name, br in bdrafts.items():
        earlier[name] = {"brief": br, "flags": check_brief.flag_brief(bible, {**bmerged, "brief": br})}
    divine = []
    for br in [bmerged["brief"]] + list(bdrafts.values()) + [bparts[b]["brief"] for b in BIBLE_BOOKS]:
        for r in br["depiction_rules"]:
            if any(k in r.lower() for k in ("god", "yahweh", "divine", "angel", "spirit", "satan", "demon", "lord")) and r not in divine:
                divine.append(r)
    scores_sorted = sorted(scores, key=lambda s: (BIBLE_BOOKS.index(s["book"]), s["label"]))
    tags = sorted({s["label"].split("__")[-1] for s in scores})
    main_scores = {s["book"]: s for s in scores if BIBLE_MAIN[s["book"]] == s["label"].split("__")[-1]}
    improvements = [
        f"Exodus section count: research 33/80 (0.41×, F1 0.577). Target-18 hint: 105/80 (1.31×, F1 0.699); target-24: 76/80 (0.95×, F1 0.675, Pk 0.271). The hint fixed the count; Pk stays near 0.27 either way.",
        f"1 Samuel: target-18 over-split (69/51, Pk 0.332, fails); target-24 gives 46/51, Pk 0.196, F1 0.737 (good level, all pass); the research prompt gives 31/51, Pk 0.181. The gospels need the finer hint: Luke 96/150 and John 57/87 at target 18 (research John: 38/87).",
        "Two Pharaohs: kept apart in 2 of 4 Exodus runs (target 18 and its repeat); merged in the research-prompt run and the target-24 (main) run. Not stable.",
        "Ahinoam (2) and Ahimelech (2): kept apart in all three 1 Samuel runs (research: 0 of 7 and 3 of 7).",
        "Abinadab (3): target-24 run lists 2 entries with no wrong merge; target-18 run merged two; research-prompt run listed none (the other two are roster names). Partly improved.",
        "Hosmer Angel = James Windibank and Hugh Boone = Neville St. Clair: both carried a same_person_as link from the story call and both were joined in the merge (research: Hosmer Angel stayed apart).",
        "The slim youth in an ulster is still not linked to Irene Adler (same as most research models).",
        "Watson's consulting room stayed apart from Baker Street (research folded it), but Watson's house in story 6 was folded into 221B.",
        "Named-in-section is now computed in code; it agrees with TIPNR's naming for 90–99% of on-stage person entries per book, and the named-only precision is 0.925–0.982 on the main runs.",
        "Cross-book merge: the first ruling prompt kept Jesus, Peter, Pilate, Jerusalem and Bethlehem as separate Luke/John entries (over-split); a one-sentence fix ('the same individual in several divisions is one cluster') joined them on the rerun.",
        "God missing from casts: this run's casts list Yahweh/God in Exodus and 1 Samuel; Luke and John list Jesus but the Father only in some runs (see the Bible tab).",
    ]
    read_calls = sum(v["calls"] for k, v in spend["by_kind"].items() if k.endswith(" read"))
    crossing_stories = [st["name"] for st in stories if st["moment_checks"]["crossing_sections"]]
    bethlehem = [l for l in bmerged["locations"] if "bethlehem" in l["name"].lower()]
    alias_errors = []
    for c in bmerged["cast"] + hmerged["cast"]:
        for other in bmerged["cast"] + hmerged["cast"]:
            if other is not c and other["name"] in c["aliases"]:
                alias_errors.append(f"'{c['name']}' lists '{other['name']}' as an alias although it is a separate entry")
    failures = [
        f"1 of {read_calls} reading calls (1 Samuel, first try) returned schema-valid JSON with 64 characters, 0 sections and an empty brief after a note ending in '-' (same failure shape as the research's Azure miss, here on the Anthropic endpoint). A rerun worked. The engine needs an empty-sections check and retry.",
        "Vincent Spaulding (The Red-Headed League) is John Clay's assumed name; the story call gave them separate entries with no same_person_as link and the merge did not join them. Watson's house (The Man with the Twisted Lip) was folded into 221B Baker Street.",
        f"Bethlehem: {len(bethlehem)} location entries in the main Bible merge ({[l['divisions'] for l in bethlehem]}); the ruling kept 1 Samuel's and Luke's Bethlehem apart.",
        f"Aliases that name a separate entry ({len(alias_errors)}): " + "; ".join(alias_errors[:6]) + ". Section ids and alias lists need validation in the engine; this run only filtered unknown ids and recorded them.",
        "1 Samuel target-18 run: one section id '13:24' does not exist (chapter 13 has 23 verses), leaving 15 verses uncovered. Section ids need validation against the work file.",
        f"Luke: major cast lists {main_scores['LUK']['major_missing']} as missing (named in 10+ verses but only as references; the prompt skips people who never act). John misses Moses the same way.",
        f"Moments: {holmes_stats['overlap_units']} paragraphs fell into two moments and {holmes_stats['crossing']} moments crossed a section boundary (in {', '.join(crossing_stories)}); {holmes_stats['bad_ids']} moment ranges were inverted (in The Noble Bachelor). No paragraph was left out. The engine should reject or retry a moments answer that fails tiling.",
        "Division draft briefs still describe single characters (Holmes's dressing-gown, Windibank's whiskers): the per-story drafts are where the research failure lives; the work-level draft is much cleaner but still names Holmes in one rule. The check catches both.",
        "Scorer name matching is simple: it maps Simon the Zealot to Peter and Caesar Augustus to Tiberius in Luke, so the 'splits' list has false alarms (as the research noted).",
    ]
    R = {
        "run_date": "2026-10-18", "model": "anthropic/claude-haiku-5.5", "datasets": {"clear_bible_pericopes": "Clear-Bible/Biblelib pericopes_eng_BSB.tsv, last file commit fcfca01 (2026-03-03)",
                                                                                   "tipnr": "STEPBible/STEPBible-Data Proper Nouns TIPNR, blob 216f7dd, last commit ed476a8 (2026-10-17)",
                                                                                   "web": "eBible.org eng-web_vpl.zip", "holmes": "Project Gutenberg #1661"},
        "bible_main_tags": BIBLE_MAIN, "hints": HINTS,
        "summary": {"holmes_stats": holmes_stats, "holmes_identity": holmes_identity(hmerged), "bible_identity": bible_identity(scores), "bible_run_tags": tags,
                    "divine_rules": divine, "improvements": improvements, "failures": failures, "main_scores": main_scores},
        "scores": scores_sorted,
        "holmes": {"work": {k: v for k, v in holmes.items() if k != "divisions"}, "stories": stories, "cast": hmerged["cast"], "locations": hmerged["locations"],
                   "merge": hmerged["merge"], "brief_checks": hmerged["brief_checks"]},
        "bible": {"work": {k: v for k, v in bible.items() if k != "divisions"}, "books": books, "cast": bmerged["cast"], "locations": bmerged["locations"],
                  "merge": bmerged["merge"], "brief_checks": bmerged["brief_checks"]},
        "briefs": {"holmes": {"title": holmes["title"], "brief": hmerged["brief"], "flags": hflags, "sections_per_era": hmerged["brief_checks"]["sections_per_era"], "unassigned": hmerged["brief_checks"]["unassigned_sections"]},
                   "bible": {"title": bible["title"], "brief": bmerged["brief"], "flags": bflags, "sections_per_era": bmerged["brief_checks"]["sections_per_era"], "unassigned": bmerged["brief_checks"]["unassigned_sections"]},
                   "bible_earlier_drafts": earlier},
        "spend": spend,
    }
    with open(os.path.join(outdir, "results.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, indent=1, ensure_ascii=False)
    with open(os.path.join(outdir, "review.html"), "w", encoding="utf-8") as f:
        f.write(build_html(R))
    shutil.copy(os.path.join(DATA, "scores.jsonl"), os.path.join(outdir, "scores.jsonl"))
    shutil.copy(os.path.join(DATA, "spend.json"), os.path.join(outdir, "spend.json"))
    calls_dir = os.path.join(outdir, "calls")
    os.makedirs(calls_dir, exist_ok=True)
    for p in glob.glob(os.path.join(DATA, "runs", "*.json")):
        shutil.copy(p, calls_dir)
    print(f"wrote {outdir}: results.json, review.html, scores.jsonl, spend.json, {len(os.listdir(calls_dir))} call files")


if __name__ == "__main__":
    main()
