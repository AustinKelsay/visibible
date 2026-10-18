"""Run score_bible.py over every whole-book result and write score-<BOOK>.jsonl files."""
import glob
import json
import os
import subprocess
import sys

DATA = os.environ.get("WWR_DATA", "/tmp/wwr-data")
PY = sys.executable
for book in ("1SA", "EXO", "JHN"):
    files = sorted(glob.glob(f"{DATA}/runs/book-{book}__*.json") + glob.glob(f"{DATA}/runs/target14-{book}__*.json"))
    files = [f for f in files if "nemotron" not in f]
    out = subprocess.run(
        [PY, "-I", os.path.join(os.path.dirname(os.path.abspath(__file__)), "score_bible.py"), book, f"{DATA}/inputs/bible_{book}.txt",
         f"{DATA}/clear/pericopes_eng_BSB.tsv", f"{DATA}/tipnr/tipnr.txt", *files],
        capture_output=True, text=True, check=True,
    ).stdout
    open(f"{DATA}/runs/score-{book}.jsonl", "w").write(out)
    for line in out.splitlines():
        r = json.loads(line)
        if "error" in r:
            print(book, r["model"], "ERROR", r["error"])
            continue
        label = "target14 " if r["label"].startswith("target14") else ""
        print(book, label + r["model"], "secs", r["sections"], "/", r["ref_sections"], "cov", r["coverage"],
              "Pk", r["pk"], "WD", r["windowdiff"], "B", r["B"], "F1", r["boundary_tol2"]["f1"],
              "P", r["cast"]["precision"], "R", r["cast"]["recall"], "major", r["major_listed"],
              f"of {r['major_tipnr']}", r["major_missing"], "chars", r["characters"], "$", r["cost"], "s", r["seconds"])
