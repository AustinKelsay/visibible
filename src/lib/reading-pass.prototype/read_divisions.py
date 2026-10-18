"""Reading pass: one call per large division, in parallel, then normalise the answers.

Usage: python -I read_divisions.py <work.json> <tag> <granularity> <division id> [...]
  granularity: "research" (the research prompt's 5-30 units) or "target:<units per section>"
  division id "all" reads every top-level division.

Writes <RP_DATA>/runs/<work>__<division>__<tag>.json (raw call) and
<RP_DATA>/analysis/<work>__<division>__<tag>.json (normalised: full unit ids, coverage
checks, and `named` worked out in code for every on-stage character).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402
import orclient  # noqa: E402
import prompt  # noqa: E402
import work_format as wf  # noqa: E402

ANALYSIS = os.path.join(orclient.DATA, "analysis")
os.makedirs(ANALYSIS, exist_ok=True)

TITLE_WORDS = {"the", "a", "an", "king", "queen", "prophet", "priest", "mr", "mr.", "mrs", "mrs.", "miss", "dr", "dr.", "lord", "lady",
               "sir", "count", "captain", "inspector", "saint", "st", "st.", "judge", "prince", "princess", "doctor", "general",
               "colonel", "major", "sergeant", "constable", "madame", "monsieur", "reverend"}


def proper_forms(entry):
    """Name forms that count as a proper name: not a bare description, with a capitalised word that is not a title."""
    out = set()
    for form in [entry["name"], *entry.get("aliases", [])]:
        words = form.replace("’", "'").split()
        if not words or words[0].lower() in ("the", "a", "an"):
            continue
        core = words[:]
        while core and core[0].lower().rstrip(".") in TITLE_WORDS:
            core = core[1:]
        if any(w[:1].isupper() and w.lower().rstrip(".,") not in TITLE_WORDS for w in core):
            out.add(" ".join(core))
    return out


def named_in(text, forms):
    for f in forms:
        if re.search(r"(?<![A-Za-z])" + re.escape(f) + r"(?![A-Za-z])", text):
            return True
    return False


def division_text(work, div):
    """Numbered-unit text for one division, plus a map from prompt id to unit index."""
    units = wf.units_of(div)
    lines, ids = [], {}
    if work["levels"][-1] == "Verse":
        last = None
        for i, u in enumerate(units):
            c, v = u["id"].rsplit("-", 2)[1:]
            if c != last:
                lines.append(f"## {div['name']} {c}")
                last = c
            lines.append(f"{c}:{v} {u['text']}")
            ids[f"{c}:{v}"] = i
        kind = "verse"
    else:
        for i, u in enumerate(units):
            lines.append(f"[{u['n']}] {u['text']}")
            ids[f"[{u['n']}]"] = i
            ids[str(u["n"])] = i
        kind = "paragraph"
    return "\n".join(lines) + "\n", ids, kind, units


def unit_index(ids, ref):
    ref = str(ref).strip()
    if ref in ids:
        return ids[ref]
    m = re.search(r"(\d+)\s*:\s*(\d+)", ref)
    if m and f"{m.group(1)}:{m.group(2)}" in ids:
        return ids[f"{m.group(1)}:{m.group(2)}"]
    m = re.search(r"\[?(\d+)\]?", ref)
    if m and f"[{m.group(1)}]" in ids:
        return ids[f"[{m.group(1)}]"]
    return None


def normalise(work, div, parsed, ids, units, rec):
    chars = {c["id"]: c for c in parsed["characters"]}
    locs = {c["id"]: c for c in parsed["locations"]}
    forms = {cid: proper_forms(c) for cid, c in chars.items()}
    sections, bad, covered, overlaps = [], [], set(), 0
    for n, s in enumerate(parsed["sections"], 1):
        a, b = unit_index(ids, s["start"]), unit_index(ids, s["end"])
        if a is None or b is None or b < a:
            bad.append({"start": s["start"], "end": s["end"], "title": s["title"]})
            continue
        rng = set(range(a, b + 1))
        overlaps += len(covered & rng)
        covered |= rng
        text = "\n".join(u["text"] for u in units[a : b + 1])
        words = sum(len(u["text"].split()) for u in units[a : b + 1])
        sections.append({
            "id": f"{div['id']}-s{n}",
            "start": units[a]["id"], "end": units[b]["id"], "start_idx": a, "end_idx": b, "n_units": b - a + 1, "words": words,
            "start_ref": units[a]["ref"], "end_ref": units[b]["ref"],
            "title": s["title"],
            "setting": [x for x in s["setting"] if x in locs],
            "on_stage": [{"id": x, "named": named_in(text, forms[x])} for x in s["on_stage"] if x in chars],
            "mentioned_only": [x for x in s["mentioned_only"] if x in chars],
            "unknown_ids": [x for x in s["setting"] + s["on_stage"] + s["mentioned_only"] if x not in chars and x not in locs],
        })
    sections.sort(key=lambda s: s["start_idx"])
    gaps = sorted(set(range(len(units))) - covered)
    return {
        "work": work["id"], "division": div["id"], "division_name": div["name"], "units": len(units),
        "record": rec,
        "characters": parsed["characters"], "locations": parsed["locations"],
        "sections": sections, "brief": parsed["brief"],
        "checks": {"bad_section_ids": bad, "uncovered_units": len(gaps), "uncovered_sample": [units[i]["id"] for i in gaps[:10]],
                   "overlap_units": overlaps, "sections_with_unknown_ids": sum(1 for s in sections if s["unknown_ids"])},
    }


def main():
    work_path, tag, gran = sys.argv[1:4]
    want = sys.argv[4:]
    work = wf.load(work_path)
    divs = work["divisions"] if want == ["all"] else [d for d in work["divisions"] if d["id"] in want]
    assert len(divs) == (len(work["divisions"]) if want == ["all"] else len(want)), "unknown division id"
    jobs, meta = [], []
    for div in divs:
        text, ids, kind, units = division_text(work, div)
        if gran == "research":
            g = prompt.GRANULARITY_RESEARCH
        else:
            g = prompt.granularity_target(len(units), int(gran.split(":")[1]))
        label = f"{work['id']}__{div['id']}__{tag}"
        jobs.append(dict(label=label, system=prompt.read_system(g),
                         user=prompt.read_user(work["title"], work["author"], div["name"], kind, text),
                         schema_name="reading_pass", schema=prompt.READ_SCHEMA, max_tokens=60000, out_estimate=12 * len(units) + 2000))
        meta.append((div, ids, units, label))
    est = sum(llm.estimate(j["system"], j["user"], j["out_estimate"]) for j in jobs)
    print(f"{len(jobs)} calls, estimated ${est:.3f}; spent so far ${orclient.spent():.4f}", flush=True)
    results = llm.call_all(jobs)
    for (div, ids, units, label), (rec, parsed, _) in zip(meta, results):
        if parsed is None:
            print(f"FAILED {label}: {rec['parse_error']}")
            continue
        out = normalise(work, div, parsed, ids, units, rec)
        with open(os.path.join(ANALYSIS, label + ".json"), "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        c = out["checks"]
        print(f"{label}: {len(out['sections'])} sections, {len(out['characters'])} characters, {len(out['locations'])} locations; "
              f"uncovered {c['uncovered_units']}, overlaps {c['overlap_units']}, bad ids {len(c['bad_section_ids'])}, unknown-id sections {c['sections_with_unknown_ids']}")
    print(f"spent so far ${orclient.spent():.4f}")


if __name__ == "__main__":
    main()
