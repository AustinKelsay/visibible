"""Run the reading pass on each Holmes story with one model, in parallel.

Usage: python -I run_stories.py <model_key> <outdir> <story numbers...>
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import prompt  # noqa: E402
import run_extract  # noqa: E402

key, outdir = sys.argv[1:3]
nums = [int(x) for x in sys.argv[3:]]
jobs = []
for n in nums:
    text = open(f"{os.environ.get('WWR_DATA', '/tmp/wwr-data')}/inputs/holmes_story{n}.txt", encoding="utf-8").read()
    title = re.match(r"## Story \d+: (.*)", text).group(1)
    user = prompt.user_message("The Adventures of Sherlock Holmes (Arthur Conan Doyle, 1892)", f"Story {n}: {title}", "paragraph", text)
    jobs.append((f"story{n}", key, prompt.SYSTEM, user, "reading_pass", prompt.SCHEMA, outdir, 60000))
run_extract.run_all(jobs)
