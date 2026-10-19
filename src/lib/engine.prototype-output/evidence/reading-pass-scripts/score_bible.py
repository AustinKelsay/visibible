"""Score a Bible book's reading-pass sections and cast against Clear.Bible pericopes and STEPBible TIPNR.

Usage: python -I score_bible.py <bible-web.json> <pericopes_eng_BSB.tsv> <tipnr.txt> <analysis.json> [...]

Adapted from the research branch's score_bible.py (same metrics: section count, boundary
P/R/F1 exact and within 2 verses, Pk, WindowDiff, segeval's boundary similarity B, cast
precision/recall per section against TIPNR individuals, major-cast listing, same-name groups).
Differences: reads the prototype's normalised analysis files (full unit ids, `on_stage` with
a code-computed `named` flag) and any book of the 66.
"""
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import work_format as wf  # noqa: E402

work_path, peri_path, tipnr_path = sys.argv[1:4]
results = sys.argv[4:]
work = wf.load(work_path)
BOOKS = {d["id"]: (i + 1, d) for i, d in enumerate(work["divisions"])}

BAR = {"pk": 0.30, "windowdiff": 0.35, "f1": 0.55, "ratio": (0.5, 1.5), "precision": 0.90, "major": 0.90}
GOOD = {"pk": 0.20, "windowdiff": 0.25, "f1": 0.70, "ratio": (0.75, 1.25), "precision": 0.95, "major": 1.0}

# ---- TIPNR (parsed once for all books)
PERSON_SIGS = {"– Named", "– Spelled", "– Greek", "– Aramaic", "– Name combined",
               "– (same form with Variant)", "– (same ref[s] with Variant)",
               "– (same form with alt. meaning)", "– (same ref[s] with alt Tags)"}
people = {}  # uid -> {"forms": set, "refs": set((book, c, v)), "kind"}
kind, cur = None, None
for l in open(tipnr_path, encoding="utf-8").read().split("\n"):
    if l.startswith("$=========="):
        kind = l.split("\t")[0].replace("$==========", "").strip()
        cur = "HEADER"
        continue
    if cur == "HEADER":
        if not l.strip():
            continue
        f = l.split("\t")
        typ = f[8].strip() if len(f) > 8 else ""
        uid = f[0].strip()
        if (kind == "PERSON(s)" and typ in ("Male", "Female")) or (kind == "PLACE" and typ == "Place"):
            cur = uid
            people[uid] = {"forms": set(), "refs": set(), "kind": "person" if kind.startswith("PERSON") else "place"}
        else:
            cur = None
        continue
    if cur and cur != "HEADER" and l.startswith("– "):
        f = l.split("\t")
        if f[0] not in PERSON_SIGS:
            continue
        unique = f[1].split("@")[0]
        people[cur]["forms"].add(unique.split("|")[0].replace("_", " ").lower())
        if len(f) > 3:
            for chunk in f[3].split(";"):
                name = chunk.split("=")[0].strip()
                if name and name.lower() not in ("he", "him", "she", "her", "they", "his"):
                    people[cur]["forms"].add(name.lower())
        if len(f) > 4:
            for ref in f[4].split(";"):
                m = re.match(r"^(\w+)\.(\d+)\.(\d+)[a-z]?$", ref.strip())
                if m:
                    people[cur]["refs"].add((m.group(1), int(m.group(2)), max(1, int(m.group(3)))))
TRIBES = {"israel", "judah", "benjamin", "ephraim", "manasseh", "reuben", "simeon", "levi", "dan",
          "naphtali", "asher", "zebulun", "issachar"}
TRIBE_IDS = {u for u, q in people.items() if q["kind"] == "person" and u.split("@")[0].lower() in TRIBES and u.split("@")[1].startswith("Gen")}
TRIBE_IDS |= {u for u in people if u.startswith("Gad@Gen")}

TITLE = re.compile(r"^(the |king |queen |prophet |priest |mr\.? |mrs\.? |miss |dr\.? |lord )+", re.I)


def norm_forms(c):
    out = set()
    for s in [c["name"], c["id"].replace("_", " ")] + list(c.get("aliases", [])):
        s = s.strip().lower()
        out.add(s)
        out.add(TITLE.sub("", s))
        out.add(re.split(r"[,(]| son of | daughter of | wife of | of ", s)[0].strip())
    toks = c["name"].split()
    if len(toks) > 1 and toks[0][:1].isupper() and toks[0].isalpha():
        out.add(toks[0].lower())
    return {s for s in out if s}


def pk(ref, hyp, k, N):
    err = 0
    for i in range(N - k):
        err += (ref[i + 1 : i + k + 1].count("1") > 0) != (hyp[i + 1 : i + k + 1].count("1") > 0)
    return err / (N - k)


def windowdiff(ref, hyp, k, N):
    err = 0
    for i in range(N - k):
        err += ref[i + 1 : i + k + 1].count("1") != hyp[i + 1 : i + k + 1].count("1")
    return err / (N - k)


def boundary_prf(ref_b, hyp_b, tol):
    ref_b, hyp_b = sorted(ref_b), sorted(hyp_b)
    tp, j = 0, 0
    for h in hyp_b:
        while j < len(ref_b) and ref_b[j] < h - tol:
            j += 1
        if j < len(ref_b) and ref_b[j] <= h + tol:
            tp += 1
            j += 1
    p = tp / len(hyp_b) if hyp_b else 0
    r = tp / len(ref_b) if ref_b else 0
    return p, r, (2 * p * r / (p + r) if p + r else 0)


def to_masses(starts, N):
    starts = sorted(set(starts))
    return [b - a for a, b in zip(starts, starts[1:] + [N])]


def boundary_string(starts, N):
    s = ["0"] * N
    for i in starts:
        if i > 0:
            s[i] = "1"
    return "".join(s)


def score(path):
    d = json.load(open(path, encoding="utf-8"))
    book = d["division"]
    book_num, div = BOOKS[book]
    tipnr_book = book[0] + book[1].upper() + book[2:].lower() if book[0].isdigit() else book[0] + book[1:].lower()  # 1SA -> 1Sa, JHN -> Jhn
    units = wf.units_of(div)
    N = len(units)
    index = {u["id"]: i for i, u in enumerate(units)}
    cv_index = {}
    for i, u in enumerate(units):
        c, v = u["id"].rsplit("-", 2)[1:]
        cv_index[(int(c), int(v))] = i
    ref_starts = {0}
    for line in list(open(peri_path, encoding="utf-8"))[1:]:
        s, e, t = line.rstrip("\n").split("\t")
        if int(s[:2]) == book_num and (int(s[2:5]), int(s[5:8])) in cv_index:
            ref_starts.add(cv_index[(int(s[2:5]), int(s[5:8]))])
    ref_starts = sorted(ref_starts)
    out = {"book": book, "label": d["record"]["label"], "seconds": d["record"]["seconds"], "cost": d["record"]["cost"],
           "prompt_tokens": d["record"]["prompt_tokens"], "completion_tokens": d["record"]["completion_tokens"], "units": N}
    spans = [(s["start_idx"], s["end_idx"], s) for s in d["sections"]]
    covered = set()
    for a, b, _ in spans:
        covered |= set(range(a, b + 1))
    hyp_starts = sorted({a for a, _, _ in spans} | {0})
    out["sections"] = len(d["sections"])
    out["ref_sections"] = len(ref_starts)
    out["ratio"] = round(len(d["sections"]) / len(ref_starts), 2)
    out["coverage"] = round(len(covered) / N, 3)
    out["checks"] = d["checks"]
    ref_s, hyp_s = boundary_string(ref_starts, N), boundary_string(hyp_starts, N)
    k = max(2, round(N / len(ref_starts) / 2))
    out["k"] = k
    out["pk"] = round(pk(ref_s, hyp_s, k, N), 3)
    out["windowdiff"] = round(windowdiff(ref_s, hyp_s, k, N), 3)
    rb, hb = [i for i in ref_starts if i], [i for i in hyp_starts if i]
    for tol in (0, 2):
        pr, rc, f1 = boundary_prf(rb, hb, tol)
        out[f"boundary_tol{tol}"] = {"p": round(pr, 3), "r": round(rc, 3), "f1": round(f1, 3)}
    try:
        import segeval
        out["B"] = round(float(segeval.boundary_similarity(to_masses(ref_starts, N), to_masses(hyp_starts, N), n_t=2)), 3)
    except Exception as e:  # noqa: BLE001
        out["B"] = f"n/a ({e})"
    # ---- cast against TIPNR
    book_people = {}
    for u, p in people.items():
        if u in TRIBE_IDS:
            continue
        vs = {cv_index[(c, v)] for (b, c, v) in p["refs"] if b == tipnr_book and (c, v) in cv_index}
        if vs:
            book_people[u] = {"forms": p["forms"], "verses": vs, "kind": p["kind"]}
    form_index = defaultdict(set)
    for u, p in book_people.items():
        for f in p["forms"]:
            form_index[f].add(u)
    chars = {c["id"]: c for c in d["characters"]}
    char_secs = defaultdict(set)
    for a, b, s in spans:
        for o in s["on_stage"]:
            char_secs[o["id"]].update(range(a, b + 1))
        for cid in s["mentioned_only"]:
            char_secs[cid].update(range(a, b + 1))
    mapping, unmapped = {}, []
    for cid, c in chars.items():
        if c.get("kind") not in ("person", None):
            continue
        cands = set()
        for f in norm_forms(c):
            cands |= form_index.get(f, set())
        cands = {u for u in cands if book_people[u]["kind"] == "person"}
        if not cands:
            unmapped.append(cid)
            continue
        mapping[cid] = max(cands, key=lambda u: (len(book_people[u]["verses"] & char_secs[cid]), len(book_people[u]["verses"])))
    book_individuals = {u for u, q in book_people.items() if q["kind"] == "person"}
    mapped_ids = set(mapping.values())
    tp = fp = fn = 0
    tp_n = fp_n = 0  # named-only: on-stage entries the code flagged `named`, plus mentioned_only
    named_ok = named_bad = 0
    for a, b, s in spans:
        here = set(range(a, b + 1))
        gold = {u for u in book_individuals if book_people[u]["verses"] & here}
        listed = {mapping[o["id"]] for o in s["on_stage"] if o["id"] in mapping} | {mapping[c] for c in s["mentioned_only"] if c in mapping}
        tp += len(gold & listed)
        fp += len(listed - gold)
        fn += len(gold - listed)
        listed_named = {mapping[o["id"]] for o in s["on_stage"] if o["id"] in mapping and o["named"]} | {mapping[c] for c in s["mentioned_only"] if c in mapping}
        tp_n += len(gold & listed_named)
        fp_n += len(listed_named - gold)
        # the code-computed `named` flag against TIPNR: an on-stage person TIPNR names in these verses should be flagged named
        for o in s["on_stage"]:
            if o["id"] in mapping:
                if (mapping[o["id"]] in gold) == o["named"]:
                    named_ok += 1
                else:
                    named_bad += 1
    uncovered = set(range(N)) - covered
    if uncovered:
        fn += len({u for u in book_individuals if book_people[u]["verses"] & uncovered})
    prec = tp / (tp + fp) if tp + fp else 0
    rec_ = tp / (tp + fn) if tp + fn else 0
    out["cast"] = {"precision": round(prec, 3), "recall": round(rec_, 3), "tp": tp, "fp": fp, "fn": fn,
                   "precision_named_only": round(tp_n / (tp_n + fp_n), 3) if tp_n + fp_n else 0}
    out["named_flag_agreement"] = round(named_ok / (named_ok + named_bad), 3) if named_ok + named_bad else None
    out["characters"] = len(chars)
    out["persons_mapped"] = len(mapping)
    out["persons_unmapped"] = len(unmapped)
    out["unmapped_sample"] = unmapped[:12]
    splits = defaultdict(list)
    for c, u in mapping.items():
        splits[u].append(c)
    out["split_individuals"] = {u.split("@")[0]: cs for u, cs in splits.items() if len(cs) > 1}
    major = {u for u in book_individuals if len(book_people[u]["verses"]) >= 10}
    out["major_tipnr"] = len(major)
    out["major_listed"] = round(len(major & mapped_ids) / len(major), 3) if major else None
    out["major_missing"] = sorted(u.split("@")[0] for u in major - mapped_ids)
    out["major_names"] = sorted(u.split("@")[0] for u in major)
    groups = defaultdict(set)
    for u in book_individuals:
        groups[u.split("@")[0].lower()].add(u)
    same = {}
    for n, us in groups.items():
        if len(us) < 2:
            continue
        entries = [cid for cid, c in chars.items() if c.get("kind") in ("person", None) and n in norm_forms(c)]
        # a wrong merge: one entry whose sections cover verses of two different TIPNR bearers of the name
        merged_wrong = 0
        for cid in entries:
            hit = {u for u in us if book_people[u]["verses"] & char_secs[cid]}
            if len(hit) > 1:
                merged_wrong += 1
        same[n] = {"individuals": len(us), "entries": len(entries), "entry_ids": entries, "entries_spanning_two": merged_wrong,
                   "major": any(u in major for u in us)}
    out["same_name_groups"] = same
    out["bar"] = {
        "pk": out["pk"] <= BAR["pk"], "windowdiff": out["windowdiff"] <= BAR["windowdiff"], "f1": out["boundary_tol2"]["f1"] >= BAR["f1"],
        "ratio": BAR["ratio"][0] <= out["ratio"] <= BAR["ratio"][1], "precision": prec >= BAR["precision"],
        "major": (out["major_listed"] or 0) >= BAR["major"],
        "no_wrong_merge_major": not any(g["entries_spanning_two"] for g in same.values() if g["major"]),
    }
    out["good"] = {
        "pk": out["pk"] <= GOOD["pk"], "windowdiff": out["windowdiff"] <= GOOD["windowdiff"], "f1": out["boundary_tol2"]["f1"] >= GOOD["f1"],
        "ratio": GOOD["ratio"][0] <= out["ratio"] <= GOOD["ratio"][1], "precision": prec >= GOOD["precision"], "major": (out["major_listed"] or 0) >= GOOD["major"],
    }
    return out


for r in results:
    print(json.dumps(score(r), ensure_ascii=False))
