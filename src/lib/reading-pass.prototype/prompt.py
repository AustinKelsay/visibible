"""Prompts and JSON schemas for the reading-pass prototype.

Every instruction is generic: none names a character, place, era or episode from any
particular work. (Ticket 155: nothing may nudge the draft brief.)
"""

# ---------------------------------------------------------------- reading pass (one call per large division)

READ_SYSTEM = """You are the reading pass of an illustration engine. You read one large division of a work (a whole text such as a scripture, a novel or a story collection) and return its skeleton as JSON. The engine later draws pictures of the text's moments, so for every stretch of text it needs to know who is on stage and where, and it needs a draft brief for illustrators.

The text comes as numbered units. Each unit line starts with its id (for example `17:4` or `[12]`). Lines starting with `##` are headings, not units.

Return:

1. characters: one entry per individual (a person, a being, or an animal that acts) who appears in or is named in the text.
   - One individual is one entry, even when the text uses different names, titles or descriptions for them. List every form in `aliases`: other names, nicknames, titles, descriptions, and disguises or assumed names.
   - Different individuals who share a name or a title get separate entries, one each. Never fold two people into one entry because they share a name. When a title passes from one holder to another (a ruler dies or is succeeded, an office changes hands), the new holder is a new entry. The `note` must say in one line who this is and how to tell them apart from anyone else with the same name: whose child, spouse or servant they are, their role, and where in the text they appear.
   - A disguised, renamed or unnamed person who the text later identifies is the same entry as their named self, with the disguise or description in `aliases`. If you suspect two entries are one individual but the text does not settle it, keep both and set `same_person_as` on the less certain one to the other's id; otherwise set it to "".
   - Skip people who occur only inside a list of names (a genealogy or roster) and never act.
   - Add a group (an army, a crowd, a household) only when it acts as one on stage, with kind "group".
2. locations: one entry per place where action happens, with aliases and a one-line note. Include places the text refers to only by description ("the sea", "the valley", "the house") when the context shows which place it is, under the place's proper name if the work gives one anywhere.
3. sections: split the text into story sections, runs of consecutive units that tell one episode, the way a study edition's headings or a novel's scenes do. Start a new section when the time, the place or the main action changes. Every unit belongs to exactly one section; sections are in order, with no gaps and no overlaps. {granularity} Give the ids of each section's first and last unit and a short title. For each section:
   - setting: ids of the locations where its action happens.
   - on_stage: ids of every character present in the section's action, whether the section names them or only refers to them by a pronoun, a title or a description, or does not mention them but they are clearly there.
   - mentioned_only: ids of characters the section names or refers to who are not present.
4. brief: a draft brief for illustrators, for this division only. It holds only what is true across the whole division or a whole stretch of its world: one person or place is described in the cast, not here, and one episode's look belongs to its section, not here.
   - tone: one line on the mood the pictures should carry.
   - depiction_rules: a short list of how certain things in this text may or may not be shown, drawn from the text and from what you know about the work.
   - era: the stretch of the world this division is set in: a name, its people (who lives there and what they look like), dress, buildings and objects, and technology (what exists and what does not yet exist).
   Keep the brief under 200 words.

Use short, stable snake_case ids (for example `david`, `the_queen`, `main_street`). Section entries may only use ids from your own characters and locations lists. Do not quote the text."""

GRANULARITY_RESEARCH = ("A section usually spans 5 to 30 units; prefer fewer, longer sections to many short ones, "
                        "and never split one continuous scene, conversation or battle.")


def granularity_target(n_units, per_section):
    n = max(1, round(n_units / per_section))
    lo, hi = max(1, round(n * 0.8)), round(n * 1.2)
    return (f"This division has {n_units} units. Aim for roughly {n} sections ({lo} to {hi}), averaging about {per_section} units each; "
            "some sections will be much shorter and some longer. Never split one continuous scene, conversation or battle, "
            "but do split long speeches, lists, sets of instructions and law codes wherever the topic changes.")


def read_system(granularity):
    return READ_SYSTEM.replace("{granularity}", granularity)


UNIT_NOTES = {
    "verse": "Units are verses; ids are chapter:verse.",
    "paragraph": "Units are paragraphs; ids are in square brackets.",
}


def read_user(work_title, author, part, unit_kind, text):
    return f"Work: {work_title} ({author})\nDivision: {part}\n{UNIT_NOTES[unit_kind]}\n\n{text}"


def _entity(kinds=None, extra=None):
    props = {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "aliases": {"type": "array", "items": {"type": "string"}},
        "note": {"type": "string"},
    }
    req = ["id", "name", "aliases", "note"]
    if kinds:
        props["kind"] = {"type": "string", "enum": kinds}
        req.insert(3, "kind")
    for k, v in (extra or {}).items():
        props[k] = v
        req.append(k)
    return {"type": "object", "properties": props, "required": req, "additionalProperties": False}


IDS = {"type": "array", "items": {"type": "string"}}
STR = {"type": "string"}
KINDS = ["person", "group", "divine", "animal", "other"]

ERA = {
    "type": "object",
    "properties": {"name": STR, "people": STR, "dress": STR, "buildings_and_objects": STR, "technology": STR},
    "required": ["name", "people", "dress", "buildings_and_objects", "technology"],
    "additionalProperties": False,
}

READ_SCHEMA = {
    "type": "object",
    "properties": {
        "characters": {"type": "array", "items": _entity(KINDS, {"same_person_as": STR})},
        "locations": {"type": "array", "items": _entity()},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"start": STR, "end": STR, "title": STR, "setting": IDS, "on_stage": IDS, "mentioned_only": IDS},
                "required": ["start", "end", "title", "setting", "on_stage", "mentioned_only"],
                "additionalProperties": False,
            },
        },
        "brief": {
            "type": "object",
            "properties": {"tone": STR, "depiction_rules": IDS, "era": ERA},
            "required": ["tone", "depiction_rules", "era"],
            "additionalProperties": False,
        },
    },
    "required": ["characters", "locations", "sections", "brief"],
    "additionalProperties": False,
}

# ---------------------------------------------------------------- merge: one call for a small work (Holmes)

MERGE_ALL_SYSTEM = """You merge the reading-pass results for the divisions of one work into one cast. You get, for each division, its characters and locations (id, name, aliases, note, and for characters a possible same_person_as link) and the titles of the sections each one appears in.

Return:
1. characters: one entry per individual across the whole work. Merge division entries that are the same individual, even when the divisions used different ids or names. Entries that name each other (one's same_person_as points at the other, or one's aliases include the other's name) are candidates to be one individual: merge them when the notes and the story support it, and otherwise keep them apart and say why in the note. Keep entries apart when they are different individuals who share a name; never join entries on a shared name alone. The note is one line saying who this is and how to tell them apart. `members` lists every merged division entry as "division:id".
2. locations: the same, for places. Two places are one entry only when they are the same place, not when one is inside the other.

Every division entry must appear in exactly one merged entry's members. Use short, stable snake_case ids."""

MERGE_ENTITY = _entity(KINDS, {"members": IDS})
MERGE_LOCATION = _entity(None, {"members": IDS})
MERGE_ALL_SCHEMA = {
    "type": "object",
    "properties": {"characters": {"type": "array", "items": MERGE_ENTITY}, "locations": {"type": "array", "items": MERGE_LOCATION}},
    "required": ["characters", "locations"],
    "additionalProperties": False,
}

# ---------------------------------------------------------------- merge: rule on groups (Bible)

MERGE_GROUPS_SYSTEM = """You rule on candidate groups of cast entries from the reading pass of one work. Code has grouped entries from the work's divisions that share a name, a title or an alias. For each group you get its entries: a member key ("division:id"), name, kind, aliases, note, and the sections where each appears.

For each group, split its entries into clusters, one cluster per individual (or per place). The divisions are parts of one work, so the same individual or place appearing in several divisions is one cluster: join entries from different divisions whenever their notes, roles, relations and places agree. Keep entries apart only when they are different individuals: never join entries on a shared name alone when their notes describe different people, and two holders of the same title in different times are different individuals. A disguise, an assumed name or a description that the notes say belongs to a named individual joins that individual's cluster. Give each cluster a name, a kind, and a one-line note saying who this is and how to tell them apart from the others in the group. Every member key of the group must appear in exactly one of its clusters."""

MERGE_GROUPS_SCHEMA = {
    "type": "object",
    "properties": {
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "group": {"type": "integer"},
                    "clusters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"name": STR, "kind": {"type": "string", "enum": KINDS + ["place"]}, "note": STR, "members": IDS},
                            "required": ["name", "kind", "note", "members"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["group", "clusters"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["groups"],
    "additionalProperties": False,
}

# ---------------------------------------------------------------- work brief

BRIEF_SYSTEM = """You draft the work brief for an illustration engine: one page that tells every illustrator how this whole work looks and feels. You get the work's title and author, the draft briefs the reading pass wrote for each of its divisions, and the ordered list of the work's story sections (id, division, title).

Return:
1. tone: one line on the mood every picture of this work should carry.
2. depiction_rules: a short list of how certain things in the work may or may not be shown, drawn from the divisions' drafts, the text and what you know about the work. Each rule is one line.
3. eras: one or more stretches of the work's world. Each has a short name and four lines: people (who lives in it and what they look like), dress, buildings and objects, and technology (what exists and what does not yet exist). Use as few eras as the work needs: one when the whole work shares a setting, several when its people, dress or technology change from one stretch of the story to the next.
4. assignments: every story section belongs to exactly one era. Give runs of consecutive sections in the order listed: each run names its first and last section id and its era. The runs must cover every section in order, with no gaps and no overlaps.

The brief holds only what is true for the whole work or a whole era. One person or place is described in the cast, not here. One episode's look belongs to its section, not here. Do not write rules or era lines about a single character, place or episode.

Keep the tone, rules and eras under 400 words in total."""

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "tone": STR,
        "depiction_rules": IDS,
        "eras": {"type": "array", "items": ERA},
        "assignments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"first_section": STR, "last_section": STR, "era": STR},
                "required": ["first_section", "last_section", "era"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["tone", "depiction_rules", "eras", "assignments"],
    "additionalProperties": False,
}

# ---------------------------------------------------------------- moments (prose works only)

MOMENTS_SYSTEM = """You split the story sections of one division of a prose work into moments for an illustration engine, which draws one picture per moment.

The text comes as numbered paragraphs: each line starts with its id in square brackets and its word count in parentheses, for example `[12] (34w)`. After the text you get the division's story sections, each with its first and last paragraph id.

Return moments, in order. A moment is a run of consecutive paragraphs that is one beat you can picture: one place, one continuous action or exchange, seen at one instant. Aim for roughly 100 to 400 words per moment, using the word counts given; a moment may be shorter when the beat is a single striking paragraph, and may run past 400 only when one unbroken exchange cannot be cut. Very short paragraphs (lines of dialogue) join their neighbours. Moments tile every section: each paragraph belongs to exactly one moment, moments never cross a section boundary, and together they cover every paragraph of every section with no gaps and no overlaps. Give each moment its first and last paragraph id, the section it lies in (by its first paragraph id), and a one-line summary of what you would see in the picture: who is there, where, doing what. Do not quote the text."""

MOMENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "moments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"section_start": STR, "start": STR, "end": STR, "summary": STR},
                "required": ["section_start", "start", "end", "summary"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["moments"],
    "additionalProperties": False,
}
