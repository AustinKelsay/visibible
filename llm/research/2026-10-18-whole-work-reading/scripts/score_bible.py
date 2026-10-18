"""Score a reading-pass result for one Bible book against Clear.Bible pericopes and STEPBible TIPNR.

Usage: python score_bible.py <BOOK> <bible_BOOK.txt> <pericopes_eng_BSB.tsv> <tipnr.txt> <result.json> [...]

Segmentation: section count, boundary precision/recall/F1 (exact and within 2 verses,
one-to-one matching), Pk and WindowDiff (k = half the mean reference section length,
as in NLTK), and Fournier's boundary similarity B (segeval, n_t = 2).

Cast: TIPNR individuals (Male/Female persons) named in each predicted section's verses
are the gold set. A predicted character is mapped to a TIPNR individual when one of
its name forms equals one of the individual's English name forms (ESV/KJV/NIV); among
several candidates the one whose TIPNR verses overlap the character's sections most
wins. Predicted = mapped ids listed on stage or mentioned in that section.
"""
import json
import re
import sys
from collections import Counter, defaultdict

book, text_path, peri_path, tipnr_path = sys.argv[1:5]
results = sys.argv[5:]

BOOK_NUM = {"GEN": 1, "EXO": 2, "1SA": 9, "JHN": 43}[book]
TIPNR_BOOK = {"GEN": "Gen", "EXO": "Exo", "1SA": "1Sa", "JHN": "Jhn"}[book]

# ---- verses of the book, in order
verses = []
for line in open(text_path, encoding="utf-8"):
    m = re.match(r"^(\d+):(\d+) ", line)
    if m:
        verses.append((int(m.group(1)), int(m.group(2))))
index = {cv: i for i, cv in enumerate(verses)}
N = len(verses)

# ---- reference sections
ref_starts = []
for line in list(open(peri_path, encoding="utf-8"))[1:]:
    s, e, t = line.rstrip("\n").split("\t")
    if int(s[:2]) != BOOK_NUM:
        continue
    cv = (int(s[2:5]), int(s[5:8]))
    if cv in index:
        ref_starts.append(index[cv])
ref_starts = sorted(set(ref_starts) | {0})


def to_masses(starts):
    starts = sorted(set(starts))
    bounds = starts[1:] + [N]
    return [b - a for a, b in zip(starts, bounds)]


def boundary_string(starts):
    s = ["0"] * N
    for i in starts:
        if i > 0:
            s[i] = "1"
    return "".join(s)


def pk(ref, hyp, k):
    err = 0
    for i in range(N - k):
        r = ref[i + 1 : i + k + 1].count("1") > 0
        h = hyp[i + 1 : i + k + 1].count("1") > 0
        err += r != h
    return err / (N - k)


def windowdiff(ref, hyp, k):
    err = 0
    for i in range(N - k):
        err += ref[i + 1 : i + k + 1].count("1") != hyp[i + 1 : i + k + 1].count("1")
    return err / (N - k)


def boundary_prf(ref_b, hyp_b, tol):
    """Boundary P/R/F1 with a maximum one-to-one matching within +/- tol units.

    Each predicted boundary h can match a reference boundary in [h - tol, h + tol]. All windows
    have the same width, so taking predictions in order and giving each the earliest unused
    reference boundary in its window yields a maximum matching.
    """
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


# ---- TIPNR
PERSON_SIGS = {"– Named", "– Spelled", "– Greek", "– Aramaic", "– Name combined",
               "– (same form with Variant)", "– (same ref[s] with Variant)",
               "– (same form with alt. meaning)", "– (same ref[s] with alt Tags)"}
people = {}  # uid -> {"forms": set, "verses": set(index), "label": str, "kind": person|place}
lines = open(tipnr_path, encoding="utf-8").read().split("\n")
kind, cur = None, None
for l in lines:
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
            people[uid] = {"forms": set(), "verses": set(), "kind": "person" if kind.startswith("PERSON") else "place",
                           "label": f[1].strip() if kind == "PLACE" else f[1].strip()}
        else:
            cur = None
        continue
    if cur and cur != "HEADER" and l.startswith("– "):
        f = l.split("\t")
        if f[0] not in PERSON_SIGS:
            continue
        unique = f[1].split("@")[0]
        for part in unique.split("|")[:1]:
            people[cur]["forms"].add(part.replace("_", " ").lower())
        if len(f) > 3:
            for chunk in f[3].split(";"):
                name = chunk.split("=")[0].strip()
                if name and name.lower() not in ("he", "him", "she", "her", "they", "his"):
                    people[cur]["forms"].add(name.lower())
        if len(f) > 4:
            for ref in f[4].split(";"):
                ref = ref.strip()
                m = re.match(r"^(\w+)\.(\d+)\.(\d+)[a-z]?$", ref)
                if not m or m.group(1) != TIPNR_BOOK:
                    continue
                cv = (int(m.group(2)), max(1, int(m.group(3))))
                if cv in index:
                    people[cur]["verses"].add(index[cv])
# patriarchs whose names in the narrative books mostly mean the tribe or nation (TIPNR files
# "Israel" under Jacob); they are left out of the cast scores
TRIBES = {"israel", "judah", "benjamin", "ephraim", "manasseh", "reuben", "simeon", "levi", "dan",
          "naphtali", "asher", "zebulun", "issachar"}
TRIBE_IDS = {u for u, q in people.items() if q["kind"] == "person" and u.split("@")[0].lower() in TRIBES
             and u.split("@")[1].startswith("Gen")}
TRIBE_IDS |= {u for u in people if u.startswith("Gad@Gen")}
book_people = {u: p for u, p in people.items() if p["verses"] and u not in TRIBE_IDS}
form_index = defaultdict(set)
for u, p in book_people.items():
    for f in p["forms"]:
        form_index[f].add(u)

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


def parse_unit(u):
    m = re.search(r"(\d+)\s*:\s*(\d+)", str(u))
    return (int(m.group(1)), int(m.group(2))) if m else None


def score(path):
    d = json.load(open(path))
    p = d["parsed"]
    rec = d["record"]
    out = {"label": rec["label"], "model": rec["model_key"], "seconds": rec["seconds"], "cost": rec["cost"],
           "prompt_tokens": rec["prompt_tokens"], "completion_tokens": rec["completion_tokens"]}
    if not p:
        out["error"] = rec["parse_error"]
        return out
    # ---- sections -> verse spans
    spans, bad = [], 0
    for s in p["sections"]:
        a, b = parse_unit(s["start"]), parse_unit(s["end"])
        if a not in index or b not in index or index[b] < index[a]:
            bad += 1
            continue
        spans.append((index[a], index[b], s))
    spans.sort(key=lambda x: x[0])
    covered = set()
    overlaps = 0
    for a, b, _ in spans:
        rng = set(range(a, b + 1))
        overlaps += len(covered & rng)
        covered |= rng
    hyp_starts = sorted({a for a, _, _ in spans} | {0})
    out["sections"] = len(p["sections"])
    out["ref_sections"] = len(ref_starts)
    out["bad_section_ids"] = bad
    out["coverage"] = round(len(covered) / N, 3)
    out["overlap_verses"] = overlaps
    ref_s, hyp_s = boundary_string(ref_starts), boundary_string(hyp_starts)
    k = max(2, round(N / len(ref_starts) / 2))
    out["k"] = k
    out["pk"] = round(pk(ref_s, hyp_s, k), 3)
    out["windowdiff"] = round(windowdiff(ref_s, hyp_s, k), 3)
    rb, hb = [i for i in ref_starts if i], [i for i in hyp_starts if i]
    for tol in (0, 2):
        pr, rc, f1 = boundary_prf(rb, hb, tol)
        out[f"boundary_tol{tol}"] = {"p": round(pr, 3), "r": round(rc, 3), "f1": round(f1, 3)}
    try:
        import segeval

        out["B"] = round(float(segeval.boundary_similarity(to_masses(ref_starts), to_masses(hyp_starts), n_t=2)), 3)
    except Exception as e:  # noqa: BLE001
        out["B"] = f"n/a ({e})"
    # ---- map characters to TIPNR
    chars = {c["id"]: c for c in p["characters"]}
    char_secs = defaultdict(set)
    for a, b, s in spans:
        for key in ("on_stage_named", "on_stage_unnamed", "mentioned_only"):
            for cid in s[key]:
                char_secs[cid].update(range(a, b + 1))
    mapping, unmapped, ambiguous = {}, [], 0
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
        if len(cands) > 1:
            ambiguous += 1
        best = max(cands, key=lambda u: (len(book_people[u]["verses"] & char_secs[cid]), len(book_people[u]["verses"])))
        mapping[cid] = best
    splits = {u: [c for c, v in mapping.items() if v == u] for u in set(mapping.values())}
    splits = {u: cs for u, cs in splits.items() if len(cs) > 1}
    # gold individuals named in the book that the model never listed at all
    book_individuals = {u for u, q in book_people.items() if q["kind"] == "person"}
    mapped_ids = set(mapping.values())
    # ---- per-section cast P/R
    tp = fp = fn = 0
    unnamed_present = []
    for a, b, s in spans:
        verses_here = set(range(a, b + 1))
        gold = {u for u in book_individuals if book_people[u]["verses"] & verses_here}
        listed = set()
        for key in ("on_stage_named", "on_stage_unnamed", "mentioned_only"):
            for cid in s[key]:
                if cid in mapping:
                    listed.add(mapping[cid])
        tp += len(gold & listed)
        fp += len(listed - gold)
        fn += len(gold - listed)
        for key in ("on_stage_named", "on_stage_unnamed"):
            for cid in s[key]:
                if cid in mapping and mapping[cid] not in gold:
                    unnamed_present.append(f"{verses[a][0]}:{verses[a][1]}-{verses[b][0]}:{verses[b][1]} {cid}")
    # people named only in verses that no predicted section covers are misses too
    uncovered = set(range(N)) - covered
    if uncovered:
        fn += len({u for u in book_individuals if book_people[u]["verses"] & uncovered})
    prec = tp / (tp + fp) if tp + fp else 0
    rec_ = tp / (tp + fn) if tp + fn else 0
    out["cast"] = {"precision": round(prec, 3), "recall": round(rec_, 3),
                   "f1": round(2 * prec * rec_ / (prec + rec_), 3) if prec + rec_ else 0,
                   "tp": tp, "fp": fp, "fn": fn}
    out["characters"] = len(chars)
    out["persons_mapped"] = len(mapping)
    out["persons_unmapped"] = len(unmapped)
    out["unmapped_sample"] = unmapped[:12]
    out["ambiguous_name_matches"] = ambiguous
    out["split_individuals"] = {u: cs for u, cs in list(splits.items())[:8]}
    out["tipnr_individuals_in_book"] = len(book_individuals)
    out["tipnr_individuals_listed"] = len(mapped_ids & book_individuals)
    out["present_but_not_named_in_section"] = len(unnamed_present)
    out["present_not_named_sample"] = unnamed_present[:10]
    # recurring individuals (3+ verses in the book) that the model lists at all
    recurring = {u for u in book_individuals if len(book_people[u]["verses"]) >= 3}
    out["recurring_tipnr"] = len(recurring)
    out["recurring_listed"] = round(len(recurring & mapped_ids) / len(recurring), 3) if recurring else None
    out["recurring_missing"] = sorted(u.split("@")[0] for u in recurring - mapped_ids)[:15]
    major = {u for u in book_individuals if len(book_people[u]["verses"]) >= 10}
    out["major_tipnr"] = len(major)
    out["major_listed"] = round(len(major & mapped_ids) / len(major), 3) if major else None
    out["major_missing"] = sorted(u.split("@")[0] for u in major - mapped_ids)
    # per-section recall restricted to individuals the model listed somewhere
    tp2 = fn2 = 0
    for a, b, s in spans:
        verses_here = set(range(a, b + 1))
        gold = {u for u in mapped_ids if u in book_individuals and book_people[u]["verses"] & verses_here}
        listed = {mapping[c] for k in ("on_stage_named", "on_stage_unnamed", "mentioned_only") for c in s[k] if c in mapping}
        tp2 += len(gold & listed)
        fn2 += len(gold - listed)
    out["section_recall_listed_only"] = round(tp2 / (tp2 + fn2), 3) if tp2 + fn2 else None
    # same-name groups: TIPNR forms shared by 2+ individuals of this book
    groups = defaultdict(set)
    for u in book_individuals:
        groups[u.split("@")[0].lower()].add(u)
    groups = {n: us for n, us in groups.items() if len(us) > 1}
    sep = {}
    for n, us in groups.items():
        entries = [cid for cid, c in chars.items() if c.get("kind") in ("person", None) and n in norm_forms(c)]
        sep[n] = f"{len(entries)} entries for {len(us)} individuals"
    out["same_name_groups"] = sep
    return out


for r in results:
    print(json.dumps(score(r), ensure_ascii=False))
