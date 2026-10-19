"""Merge step: one cast per work, then the work brief with every section assigned to an era.

Usage: python -I merge.py <work.json> <tag> <merge mode> <division id> [...]
  merge mode: "one-call" (small works: one call joins all division entries) or
              "groups" (code groups entries that share a proper-name form; the model rules on each group)

Reads <RP_DATA>/analysis/<work>__<division>__<tag>.json for each division and writes
<RP_DATA>/analysis/<work>__merged__<tag>.json.
"""
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import llm  # noqa: E402
import orclient  # noqa: E402
import prompt  # noqa: E402
import read_divisions as rd  # noqa: E402
import work_format as wf  # noqa: E402

ANALYSIS = rd.ANALYSIS


def load_parts(work, tag, want):
    parts = []
    for div in work["divisions"]:
        if want != ["all"] and div["id"] not in want:
            continue
        path = os.path.join(ANALYSIS, f"{work['id']}__{div['id']}__{tag}.json")
        parts.append(json.load(open(path, encoding="utf-8")))
    return parts


def entry_lines(part, pool):
    """One line per entry, with the titles of the sections it appears in."""
    where = defaultdict(list)
    for s in part["sections"]:
        for o in s["on_stage"]:
            where[o["id"]].append(s["title"])
        for x in s["mentioned_only"]:
            where[x].append(s["title"])
        for x in s["setting"]:
            where[x].append(s["title"])
    lines = []
    for e in part[pool]:
        key = f"{part['division']}:{e['id']}"
        extra = f" | kind: {e['kind']}" if "kind" in e else ""
        same = f" | same_person_as: {e['same_person_as']}" if e.get("same_person_as") else ""
        secs = where.get(e["id"], [])
        secs_s = "; ".join(secs[:6]) + (f" (+{len(secs) - 6} more)" if len(secs) > 6 else "")
        lines.append(f"- {key} | {e['name']}{extra} | aliases: {', '.join(e['aliases']) or '-'} | {e['note']}{same} | in: {secs_s or '-'}")
    return lines


def slug_id(name, used):
    base = wf.slug(name).replace("-", "_") or "entry"
    cand, n = base, 2
    while cand in used:
        cand, n = f"{base}_{n}", n + 1
    used.add(cand)
    return cand


# ---------------------------------------------------------------- one-call merge (Holmes)

def merge_one_call(work, parts, tag):
    lines = []
    for p in parts:
        lines.append(f"## Division {p['division']}: {p['division_name']}")
        lines.append("Characters:")
        lines.extend(entry_lines(p, "characters"))
        lines.append("Locations:")
        lines.extend(entry_lines(p, "locations"))
    user = f"Work: {work['title']} ({work['author']})\n\n" + "\n".join(lines)
    n_entries = sum(len(p["characters"]) + len(p["locations"]) for p in parts)
    rec, parsed, _ = llm.call(f"{work['id']}__merge__{tag}", prompt.MERGE_ALL_SYSTEM, user, "merge", prompt.MERGE_ALL_SCHEMA,
                              max_tokens=60000, out_estimate=90 * n_entries)
    if parsed is None:
        raise SystemExit("merge call failed: " + str(rec["parse_error"]))
    return finish_merge(work, parts, parsed["characters"], parsed["locations"], {"mode": "one-call", "calls": 1, "entries": n_entries})


# ---------------------------------------------------------------- grouped merge (Bible)

def group_entries(parts, pool):
    """Union-find over entries that share a proper-name form (titles stripped, case-folded)."""
    keys, forms = [], {}
    for p in parts:
        for e in p[pool]:
            k = f"{p['division']}:{e['id']}"
            keys.append(k)
            fs = {f.lower() for f in rd.proper_forms(e)}
            fs.add(e["name"].lower())
            forms[k] = fs
    parent = {k: k for k in keys}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    by_form = defaultdict(list)
    for k, fs in forms.items():
        for f in fs:
            by_form[f].append(k)
    for f, ks in by_form.items():
        for k in ks[1:]:
            parent[find(k)] = find(ks[0])
    # a same_person_as link is also a grouping edge, so the ruling sees both entries together
    for p in parts:
        for e in p[pool]:
            target = f"{p['division']}:{e.get('same_person_as') or ''}"
            if e.get("same_person_as") and target in parent:
                parent[find(f"{p['division']}:{e['id']}")] = find(target)
    groups = defaultdict(list)
    for k in keys:
        groups[find(k)].append(k)
    return [g for g in groups.values() if len(g) > 1], [g[0] for g in groups.values() if len(g) == 1]


def merge_groups(work, parts, tag):
    lookup = {}
    lines_by_key = {}
    for p in parts:
        for pool in ("characters", "locations"):
            for e, line in zip(p[pool], entry_lines(p, pool)):
                k = f"{p['division']}:{e['id']}"
                lookup[k] = (pool, e)
                lines_by_key[k] = line
    char_groups, char_single = group_entries(parts, "characters")
    loc_groups, loc_single = group_entries(parts, "locations")
    all_groups = [("characters", g) for g in char_groups] + [("locations", g) for g in loc_groups]
    # batch groups into calls of about 25 groups
    batches = [all_groups[i : i + 25] for i in range(0, len(all_groups), 25)]
    jobs = []
    for bi, batch in enumerate(batches):
        lines = [f"Work: {work['title']} ({work['author']})", ""]
        for gi, (pool, g) in enumerate(batch):
            lines.append(f"## Group {bi * 25 + gi} ({'places' if pool == 'locations' else 'characters'})")
            lines.extend(lines_by_key[k] for k in g)
        n_entries = sum(len(g) for _, g in batch)
        jobs.append(dict(label=f"{work['id']}__merge-groups-{bi}__{tag}", system=prompt.MERGE_GROUPS_SYSTEM, user="\n".join(lines),
                         schema_name="merge_groups", schema=prompt.MERGE_GROUPS_SCHEMA, max_tokens=30000, out_estimate=60 * n_entries + 200))
    results = llm.call_all(jobs) if jobs else []
    rulings = {}
    for res in results:
        rec, parsed, _ = res
        if parsed is None:
            raise SystemExit("group ruling call failed: " + str(rec["parse_error"]))
        for g in parsed["groups"]:
            rulings[g["group"]] = g["clusters"]
    chars, locs, diag = [], [], {"mode": "groups", "calls": len(jobs), "groups": len(all_groups), "clusters": 0,
                                 "groups_split": 0, "groups_joined": 0, "fixes": [], "group_rulings": []}
    for gi, (pool, g) in enumerate(all_groups):
        clusters = rulings.get(gi, [])
        placed = set()
        out = []
        for c in clusters:
            members = [m for m in c["members"] if m in g and m not in placed]
            if not members:
                continue
            placed.update(members)
            out.append({"name": c["name"], "kind": c["kind"], "note": c["note"], "members": members})
        for m in g:
            if m not in placed:
                e = lookup[m][1]
                out.append({"name": e["name"], "kind": e.get("kind", "place"), "note": e["note"], "members": [m]})
                diag["fixes"].append(f"{m} not placed by the ruling; kept as its own entry")
        diag["clusters"] += len(out)
        diag["groups_split" if len(out) > 1 else "groups_joined"] += 1
        diag["group_rulings"].append({"group": gi, "pool": pool, "members": g, "clusters": [{"name": c["name"], "members": c["members"], "note": c["note"]} for c in out]})
        (chars if pool == "characters" else locs).extend(out)
    for k in char_single:
        e = lookup[k][1]
        chars.append({"name": e["name"], "kind": e["kind"], "note": e["note"], "members": [k]})
    for k in loc_single:
        e = lookup[k][1]
        locs.append({"name": e["name"], "kind": "place", "note": e["note"], "members": [k]})
    return finish_merge(work, parts, chars, locs, diag)


# ---------------------------------------------------------------- shared tail: build the merged cast, rewrite sections

def finish_merge(work, parts, chars, locs, diag):
    lookup = {}
    for p in parts:
        for pool in ("characters", "locations"):
            for e in p[pool]:
                lookup[f"{p['division']}:{e['id']}"] = (pool, e)
    used, member_of, cast, places = set(), {}, [], []
    fixes = diag.setdefault("fixes", [])
    for pool, items, dest in (("characters", chars, cast), ("locations", locs, places)):
        for c in items:
            members = [m for m in c["members"] if m in lookup and lookup[m][0] == pool and m not in member_of]
            if not members:
                fixes.append(f"merged entry '{c['name']}' had no valid unplaced members; dropped")
                continue
            if len(members) != len(c["members"]):
                fixes.append(f"merged entry '{c['name']}': {len(c['members']) - len(members)} member keys invalid or already placed")
            aliases = []
            for m in members:
                e = lookup[m][1]
                for a in [e["name"], *e["aliases"]]:
                    if a != c["name"] and a not in aliases:
                        aliases.append(a)
            mid = slug_id(c["name"], used)
            entry = {"id": mid, "name": c["name"], "aliases": aliases, "note": c["note"], "members": members,
                     "divisions": sorted({m.split(":")[0] for m in members})}
            if pool == "characters":
                entry["kind"] = c.get("kind") or lookup[members[0]][1].get("kind", "person")
                entry["same_person_as"] = sorted({lookup[m][1].get("same_person_as") for m in members if lookup[m][1].get("same_person_as")})
            for m in members:
                member_of[m] = mid
            dest.append(entry)
    unplaced = [k for k in lookup if k not in member_of]
    for k in unplaced:
        pool, e = lookup[k]
        mid = slug_id(e["name"], used)
        entry = {"id": mid, "name": e["name"], "aliases": list(e["aliases"]), "note": e["note"], "members": [k], "divisions": [k.split(":")[0]]}
        if pool == "characters":
            entry["kind"] = e.get("kind", "person")
            entry["same_person_as"] = [e["same_person_as"]] if e.get("same_person_as") else []
        member_of[k] = mid
        (cast if pool == "characters" else places).append(entry)
        fixes.append(f"{k} was not placed by the merge; kept as its own entry")
    diag["unplaced_by_model"] = len(unplaced)
    # resolve same_person_as links to merged ids and note whether the merge joined them
    links = []
    for p in parts:
        for e in p["characters"]:
            if e.get("same_person_as"):
                a, b = f"{p['division']}:{e['id']}", f"{p['division']}:{e['same_person_as']}"
                links.append({"from": a, "to": b, "joined": member_of.get(a) == member_of.get(b), "from_merged": member_of.get(a), "to_merged": member_of.get(b)})
    diag["same_person_links"] = links
    sections = []
    for p in parts:
        for s in p["sections"]:
            d = p["division"]
            sections.append({**s, "division": d, "division_name": p["division_name"],
                             "setting": [member_of[f"{d}:{x}"] for x in s["setting"] if f"{d}:{x}" in member_of],
                             "on_stage": [{"id": member_of[f"{d}:{o['id']}"], "named": o["named"]} for o in s["on_stage"] if f"{d}:{o['id']}" in member_of],
                             "mentioned_only": [member_of[f"{d}:{x}"] for x in s["mentioned_only"] if f"{d}:{x}" in member_of]})
    return {"work": work["id"], "title": work["title"], "cast": cast, "locations": places, "sections": sections,
            "division_briefs": {p["division"]: p["brief"] for p in parts}, "merge": diag,
            "divisions": [{"id": p["division"], "name": p["division_name"], "units": p["units"], "checks": p["checks"], "record": p["record"]} for p in parts]}


# ---------------------------------------------------------------- work brief and era assignment

def draft_brief(work, merged, tag):
    lines = [f"Work: {work['title']} ({work['author']})", "", "## Division drafts"]
    for d in merged["divisions"]:
        b = merged["division_briefs"][d["id"]]
        lines.append(f"### {d['name']}")
        lines.append(json.dumps(b, ensure_ascii=False))
    lines.append("")
    lines.append("## Story sections, in order (id | division | title)")
    for s in merged["sections"]:
        lines.append(f"{s['id']} | {s['division_name']} | {s['title']}")
    user = "\n".join(lines)
    rec, parsed, _ = llm.call(f"{work['id']}__brief__{tag}", prompt.BRIEF_SYSTEM, user, "work_brief", prompt.BRIEF_SCHEMA,
                              max_tokens=20000, out_estimate=3000 + 20 * len(merged["sections"]))
    if parsed is None:
        raise SystemExit("brief call failed: " + str(rec["parse_error"]))
    order = [s["id"] for s in merged["sections"]]
    pos = {sid: i for i, sid in enumerate(order)}
    era_names = {e["name"] for e in parsed["eras"]}
    assigned, problems = {}, []
    for a in parsed["assignments"]:
        if a["first_section"] not in pos or a["last_section"] not in pos:
            problems.append(f"unknown section id in run {a}")
            continue
        if a["era"] not in era_names:
            problems.append(f"unknown era '{a['era']}' in run {a['first_section']}..{a['last_section']}")
        lo, hi = pos[a["first_section"]], pos[a["last_section"]]
        if hi < lo:
            problems.append(f"run out of order {a}")
            continue
        for i in range(lo, hi + 1):
            if order[i] in assigned and assigned[order[i]] != a["era"]:
                problems.append(f"{order[i]} assigned twice")
            assigned[order[i]] = a["era"]
    unassigned = [sid for sid in order if sid not in assigned]
    for s in merged["sections"]:
        s["era"] = assigned.get(s["id"])
    merged["brief"] = {"tone": parsed["tone"], "depiction_rules": parsed["depiction_rules"], "eras": parsed["eras"]}
    merged["brief_checks"] = {"assignment_runs": len(parsed["assignments"]), "unassigned_sections": unassigned, "problems": problems,
                              "sections_per_era": {e: sum(1 for v in assigned.values() if v == e) for e in era_names}}
    return merged


def main():
    work_path, tag, mode = sys.argv[1:4]
    want = sys.argv[4:]
    work = wf.load(work_path)
    parts = load_parts(work, tag, want)
    print(f"{len(parts)} divisions, {sum(len(p['characters']) for p in parts)} character entries, {sum(len(p['locations']) for p in parts)} location entries; spent so far ${orclient.spent():.4f}")
    merged = merge_one_call(work, parts, tag) if mode == "one-call" else merge_groups(work, parts, tag)
    print(f"merged: {len(merged['cast'])} characters, {len(merged['locations'])} locations; {json.dumps({k: v for k, v in merged['merge'].items() if k not in ('group_rulings', 'same_person_links', 'fixes')})}; fixes {len(merged['merge']['fixes'])}")
    for l in merged["merge"]["same_person_links"]:
        print("  same_person_as", l)
    merged = draft_brief(work, merged, tag)
    print("brief checks:", json.dumps(merged["brief_checks"]))
    out = os.path.join(ANALYSIS, f"{work['id']}__merged__{tag}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=1, ensure_ascii=False)
    print(f"wrote {out}; spent so far ${orclient.spent():.4f}")


if __name__ == "__main__":
    main()
