"""Importer: World English Bible (eBible.org eng-web_vpl.txt) -> work file.

Usage: python -I import_web.py <eng-web_vpl.txt> <bible-structure.ts> <out.json>

Folds WEB's Romans 14:24-26 doxology into Romans 16:25-27 so the units match the
app's 31,102-verse KJV structure; WEB's empty Romans 16:25 is dropped.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import work_format as wf  # noqa: E402

vpl, structure_path, out = sys.argv[1:4]
src = open(structure_path, encoding="utf-8").read()
books = []
for m in re.finditer(
    r'id: "([0-9A-Z]+)",\s*name: "([^"]+)",\s*slug: "([^"]+)",\s*testament: "(\w+)",\s*chapters: \[([0-9, ]+)\]',
    src, flags=re.S,
):
    books.append({"id": m.group(1), "name": m.group(2), "slug": m.group(3), "testament": m.group(4),
                  "chapters": [int(x) for x in m.group(5).split(",")]})
assert len(books) == 66, len(books)
APP_IDS = [b["id"] for b in books]
DEUTERO = {"TOB", "JDT", "ESG", "WIS", "SIR", "BAR", "1MA", "2MA", "1ES", "PRM", "PSX", "3MA", "4ES", "4MA", "DNG"}
VPL_TO_APP = {"SOL": "SNG", "EZE": "EZK", "JOE": "JOL", "NAH": "NAM", "MAR": "MRK", "JOH": "JHN",
              "PHI": "PHP", "JAM": "JAS", "1JO": "1JN", "2JO": "2JN", "3JO": "3JN"}

text = {}  # (book, chapter, verse) -> text
order = []
for line in open(vpl, encoding="utf-8"):
    m = re.match(r"^(\S+) (\d+):(\d+) ?(.*)$", line.rstrip("\n"))
    if not m or m.group(1) in DEUTERO:
        continue
    b = VPL_TO_APP.get(m.group(1), m.group(1))
    if not order or order[-1] != b:
        order.append(b)
    text[(b, int(m.group(2)), int(m.group(3)))] = m.group(4).strip()
assert order == APP_IDS, "WEB book order does not match the app's 66 books"

# fold the doxology: drop WEB's empty ROM 16:25, then move WEB ROM 14:24-26 to app ROM 16:25-27
assert text.pop(("ROM", 16, 25)) == ""
for i, v in enumerate((24, 25, 26)):
    text[("ROM", 16, 25 + i)] = text.pop(("ROM", 14, v))
assert text[("ROM", 16, 25)].startswith("Now to him"), text[("ROM", 16, 25)]

work = wf.new_work(
    id="bible-web", title="The Holy Bible", author="Various", language="en",
    ref_name="World English Bible", ref_source="https://ebible.org/Scriptures/eng-web_vpl.zip",
    ref_credit="World English Bible (WEB), public domain, eBible.org",
    levels=["Book", "Chapter", "Verse"], reference_format="{Book} {Chapter}:{Verse}", moment_mode="unit",
)
missing = []
for b in books:
    node = {"id": b["id"], "name": b["name"], "slug": b["slug"], "children": []}
    for c, n in enumerate(b["chapters"], 1):
        ch = {"id": f"{b['id']}-{c}", "name": str(c), "units": []}
        for v in range(1, n + 1):
            t = text.get((b["id"], c, v))
            if t is None:
                missing.append((b["id"], c, v))
                t = ""
            ch["units"].append({"id": f"{b['slug']}-{c}-{v}", "n": v, "ref": f"{b['name']} {c}:{v}", "text": t})
        node["children"].append(ch)
    work["divisions"].append(node)
n = wf.save(work, out)
extra = [k for k in text if k[2] > books[APP_IDS.index(k[0])]["chapters"][k[1] - 1]]
print(f"units {n}; app verses with no WEB text {len(missing)} {missing[:5]}; WEB verses outside the app structure {len(extra)} {extra[:5]}")
