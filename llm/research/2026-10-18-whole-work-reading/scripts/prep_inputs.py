"""Build model inputs for the live test.

Usage: python -I prep_inputs.py <eng-web_vpl.txt> <pg1661.txt> <bible-structure.ts> <pericopes.tsv> <outdir>

Writes:
  bible_<BOOK>.txt      one book, "## BOOK c" headers and "c:v text" lines
  holmes_story<N>.txt   one story, "[N] paragraph" lines
  holmes_all.txt        all 12 stories, "## Story N: title" headers and "[N.p] paragraph" lines
  versification.json    WEB vs app chapter verse counts that differ
"""
import json
import re
import sys

vpl, holmes_path, structure_path, peri_path, outdir = sys.argv[1:6]

src = open(structure_path, encoding="utf-8").read()
app = {}
for m in re.finditer(r'id: "([0-9A-Z]+)".*?chapters: \[([0-9, ]+)\]', src, flags=re.S):
    app[m.group(1)] = [int(x) for x in m.group(2).split(",")]
APP_IDS = list(app)
assert len(APP_IDS) == 66
DEUTERO = {"TOB", "JDT", "ESG", "WIS", "SIR", "BAR", "1MA", "2MA", "1ES", "PRM", "PSX", "3MA", "4ES", "4MA", "DNG"}

order, verses = [], []
for line in open(vpl, encoding="utf-8"):
    m = re.match(r"^(\S+) (\d+):(\d+) (.*)$", line.rstrip("\n"))
    if not m or m.group(1) in DEUTERO:
        continue
    if not order or order[-1] != m.group(1):
        order.append(m.group(1))
    verses.append((m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)))
VPL_TO_APP = {"SOL": "SNG", "EZE": "EZK", "JOE": "JOL", "NAH": "NAM", "MAR": "MRK", "JOH": "JHN",
              "PHI": "PHP", "JAM": "JAS", "1JO": "1JN", "2JO": "2JN", "3JO": "3JN"}
assert [VPL_TO_APP.get(b, b) for b in order] == APP_IDS, "WEB book order does not match the app's 66 books"
mapping = dict(zip(order, APP_IDS))
verses = [(mapping[b], c, v, t) for b, c, v, t in verses]

counts = {}
for b, c, v, t in verses:
    counts.setdefault(b, {}).setdefault(c, 0)
    counts[b][c] += 1
diff = []
for b in APP_IDS:
    for i, n in enumerate(app[b], 1):
        w = counts.get(b, {}).get(i, 0)
        if w != n:
            diff.append({"book": b, "chapter": i, "app": n, "web": w})
json.dump(diff, open(f"{outdir}/versification.json", "w"), indent=1)
print("chapters with differing verse counts:", len(diff))

for book in ("1SA", "EXO", "JHN"):
    lines, last = [], None
    for b, c, v, t in verses:
        if b != book:
            continue
        if c != last:
            lines.append(f"## {book} {c}")
            last = c
        lines.append(f"{c}:{v} {t}")
    open(f"{outdir}/bible_{book}.txt", "w", encoding="utf-8").write("\n".join(lines) + "\n")

raw = open(holmes_path, encoding="utf-8-sig").read().replace("\r\n", "\n")
start = raw.index("*** START OF THE PROJECT GUTENBERG EBOOK")
end = raw.index("*** END OF THE PROJECT GUTENBERG EBOOK")
body = raw[raw.index("\n", start) + 1 : end]
heads = [h for h in re.finditer(r"^([IVX]+)\.\s+(.+)$", body, flags=re.M)]
# keep the 12 story headings (the contents list uses "I.     A Scandal..." in mixed case)
heads = [h for h in heads if h.group(2).strip() == h.group(2).strip().upper()]
assert len(heads) == 12, len(heads)
all_lines = []
for i, h in enumerate(heads, 1):
    seg = body[h.end() : heads[i].start() if i < len(heads) else len(body)]
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", seg) if p.strip()]
    title = h.group(2).strip().title()
    story_lines = [f"[{j}] {p}" for j, p in enumerate(paras, 1)]
    open(f"{outdir}/holmes_story{i}.txt", "w", encoding="utf-8").write(
        f"## Story {i}: {title}\n" + "\n".join(story_lines) + "\n"
    )
    all_lines.append(f"## Story {i}: {title}")
    all_lines.extend(f"[{i}.{j}] {p}" for j, p in enumerate(paras, 1))
open(f"{outdir}/holmes_all.txt", "w", encoding="utf-8").write("\n".join(all_lines) + "\n")

peri = [ln.rstrip("\n").split("\t") for ln in open(peri_path, encoding="utf-8") if ln.strip()][1:]
n1sa = sum(1 for row in peri if row[0].startswith("09"))
print("Clear.Bible sections in 1 Samuel:", n1sa)
