"""Measure the size of the WEB Bible (66 books) and The Adventures of Sherlock Holmes.

Usage: python -I measure_tokens.py <eng-web_vpl.txt> <pg1661.txt> <bible-structure.ts> <out.json>

Tokenizer assumption: OpenAI o200k_base (GPT-4o / GPT-5 family) via tiktoken, with
cl100k_base for comparison. Other models' tokenizers differ; the live test reports
each model's own prompt_tokens for the same inputs.
"""
import json
import re
import sys
import statistics

import tiktoken

vpl_path, holmes_path, structure_path, out_path = sys.argv[1:5]

APP_IDS = re.findall(r'id: "([0-9A-Z]+)"', open(structure_path, encoding="utf-8").read())
assert len(APP_IDS) == 66
DEUTERO = {"TOB", "JDT", "ESG", "WIS", "SIR", "BAR", "1MA", "2MA", "1ES", "PRM", "PSX", "3MA", "4ES", "4MA", "DNG"}

enc = {name: tiktoken.get_encoding(name) for name in ("o200k_base", "cl100k_base")}


def count(text):
    return {name: len(e.encode(text)) for name, e in enc.items()}


# ---------- Bible ----------
verses = []  # (app_book, chapter, verse, text)
order = []
for line in open(vpl_path, encoding="utf-8"):
    line = line.rstrip("\n")
    if not line.strip():
        continue
    m = re.match(r"^(\S+) (\d+):(\d+) (.*)$", line)
    if not m:
        raise SystemExit(f"bad line: {line[:80]}")
    book, ch, vs, text = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    if book in DEUTERO:
        continue
    if not order or order[-1] != book:
        order.append(book)
    verses.append((book, ch, vs, text))
assert len(order) == 66, len(order)
VPL_TO_APP = {"SOL": "SNG", "EZE": "EZK", "JOE": "JOL", "NAH": "NAM", "MAR": "MRK", "JOH": "JHN",
              "PHI": "PHP", "JAM": "JAS", "1JO": "1JN", "2JO": "2JN", "3JO": "3JN"}
assert [VPL_TO_APP.get(b, b) for b in order] == APP_IDS, "WEB book order does not match the app's 66 books"
mapping = dict(zip(order, APP_IDS))
verses = [(mapping[b], c, v, t) for b, c, v, t in verses]

chapters = {}
for b, c, v, t in verses:
    chapters.setdefault((b, c), []).append((v, t))

plain = "\n".join(t for *_, t in verses)
full_ref = "\n".join(f"{b} {c}:{v} {t}" for b, c, v, t in verses)
# compact: one header per chapter, then "v text"
compact_parts = []
for (b, c), vs in chapters.items():
    compact_parts.append(f"## {b} {c}")
    compact_parts.extend(f"{v} {t}" for v, t in vs)
compact = "\n".join(compact_parts)

bible = {
    "verses": len(verses),
    "chapters": len(chapters),
    "words": sum(len(t.split()) for *_, t in verses),
    "chars_plain": len(plain),
    "tokens_plain": count(plain),
    "tokens_with_full_refs": count(full_ref),
    "tokens_compact_refs": count(compact),
}
# per-book and per-chapter (compact) token sizes, o200k
per_book = {}
per_chapter = []
for (b, c), vs in chapters.items():
    text = f"## {b} {c}\n" + "\n".join(f"{v} {t}" for v, t in vs)
    n = len(enc["o200k_base"].encode(text))
    per_chapter.append(n)
    per_book[b] = per_book.get(b, 0) + n
bible["per_chapter_o200k"] = {
    "median": statistics.median(per_chapter),
    "max": max(per_chapter),
    "min": min(per_chapter),
}
bible["largest_books_o200k"] = sorted(per_book.items(), key=lambda kv: -kv[1])[:8]
bible["testament_o200k"] = {
    "OT": sum(n for b, n in per_book.items() if APP_IDS.index(b) < 39),
    "NT": sum(n for b, n in per_book.items() if APP_IDS.index(b) >= 39),
}

# ---------- Holmes ----------
raw = open(holmes_path, encoding="utf-8-sig").read().replace("\r\n", "\n")
start = raw.index("*** START OF THE PROJECT GUTENBERG EBOOK")
end = raw.index("*** END OF THE PROJECT GUTENBERG EBOOK")
body = raw[raw.index("\n", start) + 1 : end]
titles = [
    "A SCANDAL IN BOHEMIA", "THE RED-HEADED LEAGUE", "A CASE OF IDENTITY", "THE BOSCOMBE VALLEY MYSTERY",
    "THE FIVE ORANGE PIPS", "THE MAN WITH THE TWISTED LIP", "THE ADVENTURE OF THE BLUE CARBUNCLE",
    "THE ADVENTURE OF THE SPECKLED BAND", "THE ADVENTURE OF THE ENGINEER’S THUMB",
    "THE ADVENTURE OF THE NOBLE BACHELOR", "THE ADVENTURE OF THE BERYL CORONET",
    "THE ADVENTURE OF THE COPPER BEECHES",
]
# story headings look like "I. A SCANDAL IN BOHEMIA" on their own line
heads = list(re.finditer(r"^(?:[IVX]+)\.\s+(.+)$", body, flags=re.M))
heads = [h for h in heads if h.group(1).strip().upper() in titles]
assert len(heads) == 12, [h.group(0) for h in heads]
stories = []
for i, h in enumerate(heads):
    # start after the title line, as prep_inputs.py does, so titles are not counted as paragraphs
    seg = body[h.end() : heads[i + 1].start() if i + 1 < len(heads) else len(body)]
    paras = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", seg) if p.strip()]
    text = "\n\n".join(paras)
    numbered = "\n".join(f"[{j}] {p}" for j, p in enumerate(paras, 1))
    stories.append({
        "title": h.group(1).strip(),
        "paragraphs": len(paras),
        "words": len(text.split()),
        "tokens_plain": count(text),
        "tokens_numbered_o200k": len(enc["o200k_base"].encode(numbered)),
    })
story_texts = []
for i, h in enumerate(heads):
    seg = body[h.end() : heads[i + 1].start() if i + 1 < len(heads) else len(body)]
    story_texts.append("\n\n".join(re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", seg) if p.strip()))
holmes_text = "\n\n".join(story_texts)
holmes = {
    "stories": len(stories),
    "paragraphs": sum(s["paragraphs"] for s in stories),
    "words": sum(s["words"] for s in stories),
    "chars": len(holmes_text),
    "tokens_plain": count(holmes_text),
    "tokens_numbered_o200k": sum(s["tokens_numbered_o200k"] for s in stories),
    "per_story": stories,
}

out = {"tokenizers": list(enc), "bible_web_66": bible, "holmes_1661": holmes}
json.dump(out, open(out_path, "w"), indent=2, ensure_ascii=False)
print(json.dumps(out, indent=2, ensure_ascii=False))
