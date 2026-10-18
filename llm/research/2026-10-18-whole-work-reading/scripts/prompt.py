"""Reading-pass prompt and JSON schema used in the live test (generic for any work)."""

SYSTEM = """You are the reading pass of an illustration engine. You read a work (a whole text such as a scripture, a novel or a story collection), or one part of it, and return its skeleton as JSON. The engine later draws one picture per unit (a verse or a paragraph), so for every stretch of text it needs to know who is on stage and where.

The text comes as numbered units. Each unit line starts with its id (for example `17:4` or `[12]` or `[3.12]`). Lines starting with `##` are headings, not units.

Return:

1. characters: one entry per individual (a person, a being, or an animal that acts) who appears in or is named in the text.
   - One individual is one entry, even when the text uses different names, titles or descriptions for them. List every form in `aliases`: other names, nicknames, titles ("the king"), descriptions ("the stranger", "the Philistine"), and disguises.
   - Different individuals who share a name get separate entries. Use `note` to tell them apart (for example "Mary, mother of Jesus" and "Mary Magdalene").
   - A disguised or unnamed person who is later identified is the same entry as their named self.
   - Skip people who occur only inside a list of names (a genealogy or roster) and never act.
   - Add a group (an army, a crowd) only when it acts as one on stage, with kind "group".
2. locations: one entry per place where action happens, with aliases. Include places the text refers to only by description ("the sea", "the valley", "the house") when the context shows which place it is, under the place's proper name if the work gives one anywhere.
3. sections: split the text into story sections, runs of consecutive units that tell one episode, the way a study Bible's headings or a novel's scenes do. Start a new section when the time, the place or the main action changes. Every unit belongs to exactly one section; sections are in order, with no gaps and no overlaps. A section usually spans 5 to 30 units; prefer fewer, longer sections to many short ones, and never split one continuous scene, conversation or battle. Give the ids of each section's first and last unit and a short title. For each section:
   - setting: ids of the locations where its action happens.
   - on_stage_named: ids of characters on stage whose proper name (such as "Goliath") is written somewhere in this section's own units. A title or description ("the king", "the Philistine") is not a proper name.
   - on_stage_unnamed: ids of characters on stage whose proper name is not written in this section's units: they are only "he", "the man", "the Philistine", or not mentioned but clearly there.
   - mentioned_only: ids of characters named in the section who are not on stage.
4. brief: a draft brief for illustrators: era, place, dress, buildings and objects, and depiction rules the work implies (for example, a being who should never be shown as a human figure). Keep it under 250 words in total.

Use short, stable snake_case ids (for example `david`, `mary_magdalene`, `baker_street`). Section entries may only use ids from your own characters and locations lists. Do not quote the text."""

UNIT_NOTES = {
    "verse": "Units are verses; ids are chapter:verse.",
    "paragraph": "Units are paragraphs; ids are in square brackets.",
    "story_paragraph": "Units are paragraphs; an id [s.p] is story s, paragraph p. A section never crosses from one story into the next.",
}


def user_message(work, part, unit_kind, text):
    return f"Work: {work}\nPart: {part}\n{UNIT_NOTES[unit_kind]}\n\n{text}"


def _entity(kinds=None):
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
    return {"type": "object", "properties": props, "required": req, "additionalProperties": False}


IDS = {"type": "array", "items": {"type": "string"}}

SCHEMA = {
    "type": "object",
    "properties": {
        "characters": {"type": "array", "items": _entity(["person", "group", "divine", "animal", "other"])},
        "locations": {"type": "array", "items": _entity()},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "string"},
                    "end": {"type": "string"},
                    "title": {"type": "string"},
                    "setting": IDS,
                    "on_stage_named": IDS,
                    "on_stage_unnamed": IDS,
                    "mentioned_only": IDS,
                },
                "required": ["start", "end", "title", "setting", "on_stage_named", "on_stage_unnamed", "mentioned_only"],
                "additionalProperties": False,
            },
        },
        "brief": {
            "type": "object",
            "properties": {
                "era": {"type": "string"},
                "place": {"type": "string"},
                "dress": {"type": "string"},
                "buildings_and_objects": {"type": "string"},
                "depiction_rules": IDS,
            },
            "required": ["era", "place", "dress", "buildings_and_objects", "depiction_rules"],
            "additionalProperties": False,
        },
    },
    "required": ["characters", "locations", "sections", "brief"],
    "additionalProperties": False,
}

MERGE_SYSTEM = """You merge the reading-pass results for the parts of one work into one cast. You get, for each part, its characters and locations (id, name, aliases, note) and its draft brief.

Return:
1. characters: one entry per individual across the whole work. Merge part entries that are the same individual, even when the parts used different ids or names. Keep entries apart when they are different individuals who share a name; use `note` to tell them apart. `members` lists every merged part entry as "part_label:id".
2. locations: the same, for places.
3. brief: one draft brief for the whole work, under 300 words, combining the parts' briefs.

Every part entry must appear in exactly one merged entry's members. Use short, stable snake_case ids."""


def merge_schema():
    ent = _entity()
    ent = {**ent, "properties": {**ent["properties"], "members": IDS}, "required": ent["required"] + ["members"]}
    return {
        "type": "object",
        "properties": {
            "characters": {"type": "array", "items": ent},
            "locations": {"type": "array", "items": ent},
            "brief": SCHEMA["properties"]["brief"],
        },
        "required": ["characters", "locations", "brief"],
        "additionalProperties": False,
    }


OLD_GRANULARITY = "A section usually spans 5 to 30 units; prefer fewer, longer sections to many short ones, and never split one continuous scene, conversation or battle."


def system_with_target(n_units, target):
    new = (f"This part has {n_units} units. Aim for sections of about {target} units on average, so roughly "
           f"{max(1, round(n_units / target))} sections. Never split one continuous scene, conversation or battle, "
           "but do split long speeches, lists and law codes where the topic changes.")
    assert OLD_GRANULARITY in SYSTEM
    return SYSTEM.replace(OLD_GRANULARITY, new)
