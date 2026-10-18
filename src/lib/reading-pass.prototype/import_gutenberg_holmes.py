"""Importer: Project Gutenberg #1661 -> work file (story -> paragraph).

Usage: python -I import_gutenberg_holmes.py <pg1661.txt> <out.json>
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import work_format as wf  # noqa: E402

src, out = sys.argv[1:3]
raw = open(src, encoding="utf-8-sig").read().replace("\r\n", "\n")
start = raw.index("*** START OF THE PROJECT GUTENBERG EBOOK")
end = raw.index("*** END OF THE PROJECT GUTENBERG EBOOK")
body = raw[raw.index("\n", start) + 1 : end]
heads = [h for h in re.finditer(r"^([IVX]+)\.\s+(.+)$", body, flags=re.M)]
heads = [h for h in heads if h.group(2).strip() == h.group(2).strip().upper()]  # the 12 story headings, not the contents list
assert len(heads) == 12, len(heads)

work = wf.new_work(
    id="holmes-adventures", title="The Adventures of Sherlock Holmes", author="Arthur Conan Doyle", language="en",
    ref_name="Project Gutenberg #1661", ref_source="https://www.gutenberg.org/ebooks/1661",
    ref_credit="The Adventures of Sherlock Holmes by Arthur Conan Doyle, Project Gutenberg eBook #1661, public domain in the USA",
    levels=["Story", "Paragraph"], reference_format="{Story} ¶{Paragraph}", moment_mode="pass",
)
for i, h in enumerate(heads, 1):
    seg = body[h.end() : heads[i].start() if i < len(heads) else len(body)]
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", seg) if p.strip()]
    title = re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), h.group(2).strip())
    s = wf.slug(title)
    node = {"id": s, "name": title, "slug": s,
            "units": [{"id": f"{s}-{j}", "n": j, "ref": f"{title} ¶{j}", "text": p} for j, p in enumerate(paras, 1)]}
    work["divisions"].append(node)
n = wf.save(work, out)
print(f"stories {len(work['divisions'])}; paragraphs {n}; " + ", ".join(f"{d['name']} {len(d['units'])}" for d in work["divisions"]))
