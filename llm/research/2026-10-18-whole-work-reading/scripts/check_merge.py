"""Check a Holmes merge result: member coverage, and known identity cases across stories."""
import json
import re
import sys

merge_path = sys.argv[1]
parts = dict(a.split("=", 1) for a in sys.argv[2:])
m = json.load(open(merge_path))["parsed"]
part_chars = {}
for lab, path in parts.items():
    p = json.load(open(path))["parsed"]
    for c in p["characters"]:
        part_chars[f"{lab}:{c['id']}"] = c
members = {}
dupes = 0
for c in m["characters"]:
    for mem in c["members"]:
        if mem in members:
            dupes += 1
        members[mem] = c["id"]
missing = [k for k in part_chars if k not in members]
invented = [k for k in members if k not in part_chars]
print(f"merged characters: {len(m['characters'])} from {len(part_chars)} part entries; part entries not placed: {len(missing)}; placed twice: {dupes}")
print("  not placed sample:", missing[:10])
print(f"  members that match no part entry: {len(invented)}", invented[:10])


def find(pred):
    return [c for c in m["characters"] if pred(" ".join([c["id"], c["name"], *c["aliases"], c["note"]]).lower())]


cases = {
    "Sherlock Holmes": lambda h: "sherlock" in h,
    "Dr. Watson": lambda h: "watson" in h and "sherlock" not in h,
    "Lestrade": lambda h: "lestrade" in h,
    "Irene Adler": lambda h: "irene" in h,
    "King of Bohemia": lambda h: "bohemia" in h and "king" in h,
    "Mrs. Hudson": lambda h: "hudson" in h,
    "Peter Jones (police)": lambda h: "jones" in h,
}
for name, pred in cases.items():
    hits = find(pred)
    print(f"  {name}: {len(hits)} merged entries ->", [(c["id"], sorted({x.split(':')[0] for x in c['members']})) for c in hits][:4])
# same-name people who must stay apart: anyone whose name starts with John / Mary / or surname Turner
for first in ("john", "mary", "turner", "james"):
    entries = [c for c in m["characters"] if re.search(rf"\b{first}\b", (c["name"] + " " + " ".join(c["aliases"])).lower())]
    print(f"  '{first}' entries: {len(entries)}:", [c["name"] for c in entries])
    for c in entries:
        stories = sorted({x.split(':')[0] for x in c['members']})
        if len(stories) > 1:
            print(f"     spans stories {stories}: {c['name']} <- {c['members']}")
print("brief:", json.dumps(m["brief"], ensure_ascii=False)[:700])
