"""Moments: split each story section of a prose work into moments of roughly 100-400 words.

Usage: python -I moments.py <work.json> <tag> <division id> [...]

Reads <RP_DATA>/analysis/<work>__<division>__<tag>.json for the sections and writes
<RP_DATA>/analysis/<work>__<division>__moments__<tag>.json with the moments and tiling checks.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402
import orclient  # noqa: E402
import prompt  # noqa: E402
import read_divisions as rd  # noqa: E402
import work_format as wf  # noqa: E402


def main():
    work_path, tag = sys.argv[1:3]
    want = sys.argv[3:]
    work = wf.load(work_path)
    assert work["moment_mode"] == "pass", "this work's units are its moments"
    divs = work["divisions"] if want == ["all"] else [d for d in work["divisions"] if d["id"] in want]
    jobs, meta = [], []
    for div in divs:
        part = json.load(open(os.path.join(rd.ANALYSIS, f"{work['id']}__{div['id']}__{tag}.json"), encoding="utf-8"))
        units = wf.units_of(div)
        lines = [f"[{u['n']}] ({len(u['text'].split())}w) {u['text']}" for u in units]
        secs = [f"- section {s['id']}: [{units[s['start_idx']]['n']}] to [{units[s['end_idx']]['n']}]: {s['title']}" for s in part["sections"]]
        user = (f"Work: {work['title']} ({work['author']})\nDivision: {div['name']}\n\n" + "\n".join(lines)
                + "\n\n## Story sections\n" + "\n".join(secs))
        label = f"{work['id']}__{div['id']}__moments__{tag}"
        jobs.append(dict(label=label, system=prompt.MOMENTS_SYSTEM, user=user, schema_name="moments", schema=prompt.MOMENTS_SCHEMA,
                         max_tokens=30000, out_estimate=60 * (len(units) // 3) + 500))
        meta.append((div, part, units, label))
    print(f"{len(jobs)} calls, estimated ${sum(llm.estimate(j['system'], j['user'], j['out_estimate']) for j in jobs):.3f}; spent so far ${orclient.spent():.4f}")
    results = llm.call_all(jobs)
    for (div, part, units, label), (rec, parsed, _) in zip(meta, results):
        if parsed is None:
            print(f"FAILED {label}: {rec['parse_error']}")
            continue
        by_n = {u["n"]: i for i, u in enumerate(units)}
        sec_of = {}
        for s in part["sections"]:
            for i in range(s["start_idx"], s["end_idx"] + 1):
                sec_of[i] = s["id"]
        moments, bad, cross, covered, overlaps = [], [], 0, {}, 0
        for k, m in enumerate(parsed["moments"], 1):
            a, b = rd.unit_index({f"[{n}]": i for n, i in by_n.items()}, m["start"]), rd.unit_index({f"[{n}]": i for n, i in by_n.items()}, m["end"])
            if a is None or b is None or b < a:
                bad.append(m)
                continue
            secs = {sec_of.get(i) for i in range(a, b + 1)}
            if len(secs) > 1:
                cross += 1
            for i in range(a, b + 1):
                if i in covered:
                    overlaps += 1
                covered[i] = k
            words = sum(len(u["text"].split()) for u in units[a : b + 1])
            moments.append({"id": f"{div['id']}-m{k}", "section": sec_of.get(a), "start": units[a]["id"], "end": units[b]["id"],
                            "start_n": units[a]["n"], "end_n": units[b]["n"], "n_units": b - a + 1, "words": words, "summary": m["summary"],
                            "crosses_section": len(secs) > 1})
        outside = [units[i]["id"] for i in range(len(units)) if i not in covered]
        out = {"work": work["id"], "division": div["id"], "division_name": div["name"], "units": len(units), "record": rec, "moments": moments,
               "checks": {"bad_ids": bad, "crossing_sections": cross, "overlapping_units": overlaps, "units_outside_moments": len(outside),
                          "outside_sample": outside[:10]}}
        with open(os.path.join(rd.ANALYSIS, label + ".json"), "w", encoding="utf-8") as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        ws = sorted(m["words"] for m in moments)
        print(f"{label}: {len(moments)} moments over {len(part['sections'])} sections; words min {ws[0] if ws else 0} median {ws[len(ws) // 2] if ws else 0} max {ws[-1] if ws else 0}; "
              f"outside {len(outside)}, overlaps {overlaps}, crossing {cross}, bad {len(bad)}")
    print(f"spent so far ${orclient.spent():.4f}")


if __name__ == "__main__":
    main()
