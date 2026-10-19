"""The shared work format decided in ticket 154, plus helpers to walk it.

A work is a tree of divisions over numbered units. Leaves hold `units`; inner
nodes hold `children`. Reading order is depth-first.
"""
import json
import re


def slug(s):
    s = re.sub(r"[’'\"]", "", s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def new_work(id, title, author, language, ref_name, ref_source, ref_credit, levels, reference_format, moment_mode):
    assert moment_mode in ("unit", "pass")
    return {
        "id": id,
        "title": title,
        "author": author,
        "language": language,
        "reference_text": {"name": ref_name, "source": ref_source, "credit": ref_credit},
        "levels": levels,
        "reference_format": reference_format,
        "moment_mode": moment_mode,
        "divisions": [],
    }


def leaves(node):
    """Yield every unit under a division node, in reading order."""
    for u in node.get("units", []):
        yield u
    for ch in node.get("children", []):
        yield from leaves(ch)


def units_of(node):
    return list(leaves(node))


def load(path):
    return json.load(open(path, encoding="utf-8"))


def save(work, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(work, f, ensure_ascii=False, indent=0)
    return sum(1 for d in work["divisions"] for _ in leaves(d))
