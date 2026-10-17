# Verse entity datasets

Investigated October 17, 2026, against commit `3ba118b`. Counts were computed that day from files downloaded at these dataset commits: Theographic `52e049e`, STEPBible-Data `ed476a8`, Clear.Bible Biblelib `c077fe6`, MACULA Greek `8423afe` and Hebrew `47db250`, OpenBible.info geocoding `7eb18a5`, and Glyssen `e912d20`. Licence terms are quoted from each repository. This note reads them; it is not legal advice.

**Recommendation**

Take the named people and places in each verse from [STEPBible TIPNR](https://github.com/STEPBible/STEPBible-Data/tree/master/Proper%20Nouns), and take story sections from Clear.Bible's [BSB pericope table](https://github.com/Clear-Bible/Biblelib/blob/main/biblelib/pericope/pericopes_eng_BSB.tsv). Both are CC BY 4.0, so a hosted commercial app may use, change and publish them with attribution and no share-alike. TIPNR's book codes, uppercased, are the app's book IDs, and every one of its 35,251 verse references falls inside the app's [KJV-based structure](../../src/data/bible-structure.ts) once Psalm titles (verse 0) are folded into verse 1. The pericope table splits the Bible into 2,436 sections with a median of 9 verses, and puts 31,087 of the app's 31,102 verses in exactly one section.

[Theographic Bible Metadata](https://github.com/robertrouse/theographic-bible-metadata) is the runner-up. It is the easiest to load: one JSON record per KJV verse, with that verse's people and places already resolved. Its chapter verse counts match the app's in all 1,189 chapters. Its people were built from TIPNR, and for 44 of TIPNR's top 50 individuals the two datasets' verse sets overlap with a Jaccard index of 0.9 or more. Its licence is the problem: it is CC BY-SA 4.0, so any verse-to-character table Visibible shows or publishes from it, in the UI, the public API or Nostr, must be offered under CC BY-SA. Also, 2,781 of its 3,067 person records are still marked `wip`.

No dataset records who appears in a verse, only who is named in it. None of the name datasets tags pronouns. Goliath is never named in "David Defeats Goliath" (1 Samuel 17:48–58), and the Red Sea is never named in Exodus 14. Data can propose canon entries for a verse, but it has to work at the level of the section, and it needs curation. Frequency suggests a major cast of about 50–75 characters and 25–40 locations; see **Sizing the major cast**.

**Comparison**

| | [Theographic](https://github.com/robertrouse/theographic-bible-metadata) | [STEPBible TIPNR](https://github.com/STEPBible/STEPBible-Data) | [OpenBible.info geocoding](https://github.com/openbibleinfo/Bible-Geocoding-Data) | [Clear.Bible MACULA](https://github.com/Clear-Bible/macula-greek) |
| --- | --- | --- | --- | --- |
| Licence | [CC BY-SA 4.0](https://github.com/robertrouse/theographic-bible-metadata/blob/master/LICENSE); also credit its [sources](https://github.com/robertrouse/theographic-bible-metadata/blob/master/docs/data-source-bibliography.md) | CC BY 4.0; credit "STEP Bible" linked to www.STEPBible.org | CC BY 4.0; OpenStreetMap-derived geometry is ODbL 1.0; image licences vary | CC BY 4.0 (© Biblica) with a set attribution string; the MARBLE and SDBH word-sense fields are "Used with permission" ([Greek](https://github.com/Clear-Bible/macula-greek/blob/main/LICENSE.md), [Hebrew](https://github.com/Clear-Bible/macula-hebrew/blob/main/LICENSE.md)) |
| Coverage | 66 books, 31,102 KJV verses. 16,513 verses (53%) link a person, 4,875 (16%) a place | OT and NT. 3,053 named individuals and 997 places. 11,175 verses name an individual and 5,034 a place | Places only: 1,342 places in 5,616 verses, a verse counting if any of ten English translations names the place | Word-level grammar for the Hebrew OT (WLC, 23,213 verses) and Greek NT (SBLGNT, 7,939 verses) |
| Implicit mentions | Names, titles (LORD, Lord, Christ) and a few epithets ("his mother" in John 19:25). No pronouns | Hebrew and Greek name forms only. No titles or pronouns | No: pronoun instances are typed `helper` and excluded | Yes, but only as links from a pronoun or verb to its antecedent word, not to a person |
| Disambiguation | One record per individual (`mary_1938`) with a display title. 1,613 records are flagged `ambiguous`, meaning the title has not been edited | One record per individual, with a disambiguated Strong's number (`G3137G`) that also tags each word in TAGNT and TAHOT. Uncertain decisions are marked `(?)` | Numbered place records ("Bethlehem 1", "Mizpah 3") | None. All five NT Marys are plain `G3137` |
| Frequency | `verseCount` on each person and place, equal to its verse links (checked for all 3,067 people) | An exhaustive reference list per name form; counts have to be computed | A verse list per place | Only through Strong's numbers, so unusable for people |
| Locations | 1,298 records, 1,272 with coordinates. `featureType` set on 744 (City, Region, Landmark, Mountain, Water, Valley, Island). Aliases (Salem → Jerusalem), `partOf`, `near` | Coordinates from OpenBible, tribal area or nation, founder, inhabitants. No feature types | About 40 types (settlement 922, region 187, mountain 47, river 41, valley 38, campsite 32, gate 26 and so on), a confidence score per candidate site, 1,335 places resolved to a point, GeoJSON geometry, photos | None |
| Story sections | 450 events with verse lists. Not a partition (see **Story sections**) | None | None | None |
| Versification fit | KJV 1769. Chapter verse counts match the app everywhere. OSIS book names (`Exod`, `1Sam`); its 8-digit `verseID` maps by book order | "Standard English versification". No reference outside the app's structure. 168 Psalm-title references at verse 0 | ESV-keyed, with USX references (`GEN 1:1`) in the app's book IDs. 6 verse links carry KJV or other `alternate_verses` | Hebrew and SBLGNT versification, which needs a mapping (Biblelib ships one) |
| Format and size | JSON exported from Airtable: verses 37 MB, people 5.1 MB, places 2.4 MB, events 1.7 MB. Also CSV, GeoJSON, Neo4j and a GraphQL API | One 8.2 MB tab-separated text file of multi-line records. The header links JSON exports on Google Drive (not checked) | JSON Lines (places 11.6 MB, modern sites 3.2 MB), per-place GeoJSON and KML, 180 MB of thumbnails | TSV (Greek 21 MB; Hebrew 84 MB through Git LFS) and XML syntax trees |

Sources: Theographic's [readme](https://github.com/robertrouse/theographic-bible-metadata/blob/master/readme.md), [field documentation](https://github.com/robertrouse/theographic-bible-metadata/blob/master/docs/json-fields-documentation.md) and [geospatial notes](https://github.com/robertrouse/theographic-bible-metadata/blob/master/docs/geospatial-data.md); the [STEPBible-Data readme](https://github.com/STEPBible/STEPBible-Data/blob/master/README.md) and the field notes at the top of the TIPNR file; the [OpenBible readme](https://github.com/openbibleinfo/Bible-Geocoding-Data/blob/main/readme.md); the [MACULA Greek readme](https://github.com/Clear-Bible/macula-greek/blob/main/README.md). Record and verse counts were computed from the files.

**Licences**

- **CC BY 4.0** (TIPNR, OpenBible, MACULA, Biblelib data). Commercial use, changes and redistribution are allowed. Attribution may be given "in any reasonable manner based on the medium, means, and context", so a credits page plus a line in the public API documentation would do. STEPBible asks for credit to "STEP Bible" linked to www.STEPBible.org. MACULA and the Clear speaker data give exact attribution strings. The TIPNR header also asks that changes be recorded and that copies not be reposted elsewhere. Those are requests, not licence terms. It explicitly allows sending the data "to AI servers without requesting permission".
- **CC BY-SA 4.0** (Theographic). Share-alike applies "if You Share Adapted Material You produce". "Share" includes making material available to the public. Under Section 4, putting "all or a substantial portion of the database contents" into a database of your own makes that database Adapted Material ([legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)). Using Theographic only on the server to choose canon entries arguably shares nothing. Showing a verse's characters, returning them from the [public API](../context/PUBLIC-IMAGE-API.md) or publishing them to Nostr would share the contents, so that derived table would have to be offered under CC BY-SA. Canon prose that Visibible writes and the images it generates do not copy the dataset's contents. Whether they count as Adapted Material is not settled by the licence text.
- **Public domain.** "The Berean Bible and Majority Bible texts are officially placed into the public domain as of April 30, 2023" ([licensing](https://berean.bible/licensing.htm)). The World English Bible is also public domain.
- **MIT** ([Glyssen](https://github.com/sillsdev/Glyssen/blob/master/LICENSE)). Keep its copyright and permission notice with any copy.

**Implicit mentions**

Every name dataset lists the verses in which a name occurs. In Theographic, Exodus 2:3 ("she could not longer hide him") links no one. John 11:36 ("Behold how he loved him!") and the pronouns in John 19:26 are not linked either. 1 Samuel 17:49 links David but not "the Philistine". In TIPNR, by design, each reference is one occurrence of a Hebrew or Greek name. OpenBible types pronoun instances as `helper` and leaves them out.

Two sources reach past names, but neither resolves to a person by itself:

- **MACULA referents.** `subjref` and `referent` (Greek), and `subjref` and `participantref` (Hebrew), point from a pronoun or verb to the ID of its antecedent word. At least one is set in 7,515 of 7,939 NT verses and 21,041 of 23,213 OT verses. The antecedent carries a plain Strong's number, so turning it into an individual would mean joining it to TAGNT or TAHOT's disambiguated numbers by position (TAGNT tags John 19:25's two Marys as `G3137K` and `G3137I`) and mapping the versification. That join was not tested.
- **Speakers.** Glyssen's [CharacterVerse.txt](https://github.com/sillsdev/Glyssen/blob/master/GlyssenCharacters/Resources/CharacterVerse.txt) (MIT, 1 MB, from SIL and Faith Comes By Hearing) lists who speaks in each verse, including speakers who are never named there. Examples are "Goliath, Philistine champion" at 1 Samuel 17:43–44 and "Jews who had been with Mary and Martha" at John 11:36. About 16,000 verses list a speaker, leaving out narrator, indirect and hypothetical entries. There are 1,066 character IDs, and they are descriptive strings, not linked to TIPNR. It uses the app's book IDs, and all its references fall inside the app's structure. Clear.Bible's [speaker-quotations](https://github.com/Clear-Bible/speaker-quotations) (CC BY 4.0) maps these speakers to original-language words for the ESV, NIV84 and NASB95.

Theographic also links some names that are not the person. "The children of Israel" links Jacob (`israel_682`): 343 of its 1,009 verses use the word "Jacob" and 680 use "Israel". "The country of Moab" (Ruth 1:1) links a person record, Moab. TIPNR keeps the person Moab (Genesis 19:37) apart from the place, but it too files every "Israel" under Jacob. It does mark gentilic forms ("Levites", "Philistines") as `Group` lines, which the counts below leave out.

**Disambiguation**

Both datasets separate people who share a name, and they agree closely. Verse counts:

| Name | TIPNR | Theographic |
| --- | --- | --- |
| Mary | Mother of Jesus 20, Magdalene 14, of Bethany 11, wife of Clopas 7, mother of John Mark 1, of Rome 1 | 21, 14, 11, 8, 1, 1 |
| Joseph | Son of Jacob 197, husband of Mary 16, of Arimathea 6, seven others with 1–2 | 199, 15, 6, seven others with 1–2 |
| Pharaoh | 8 kings: Exodus 111, Joseph's 70, Solomon's father-in-law 12, the oppression 11, others with 1–5 | 9 records: 138, 63 and others |
| Herod | Antipas 24, the Great 11, Agrippa I 6 | 23, 10, 6 |
| John, James, Judas | John 4 people (the Baptist 89, the apostle 35), James 4, Judas 5 (Iscariot 23) | John 4, James 3, Judas 4 |
| Zechariah | 29 people | 26 records, many still titled plain "Zechariah" |

Contested identities are decisions, not facts. Both datasets give "Mary the mother of James the less and of Joses" (Mark 15:40) to the wife of Clopas. TIPNR documents its genealogy decisions at the links in its header. Jerusalem and Zion are one TIPNR place; Theographic keeps Mount Zion separate (161 verses).

**Story sections**

| Source | Licence | What it marks | Fit |
| --- | --- | --- | --- |
| Clear.Bible [Biblelib](https://github.com/Clear-Bible/Biblelib) `pericopes_eng_BSB.tsv` | CC BY 4.0 ("all of our own data"; the loader's own example labels this set CC BY 4.0) | 2,436 titled ranges (1,512 OT, 924 NT) in a 120 KB TSV of `startid`, `endid`, `title` | 31,087 of 31,102 app verses, no overlaps |
| Theographic events | CC BY-SA 4.0 | 450 events with verse lists, covering 15,619 verses. 1,935 verses are in more than one event. Median 8 verses, longest 1,364. Includes lifespans such as "Lifetime of Adam" | Not a partition |
| World English Bible ([eBible.org USFM](https://ebible.org/Scriptures/eng-web_usfm.zip)) | Public domain | Paragraph marks. Only 5 `\s1` headings in the whole Bible | Paragraphs, not stories |
| TIPNR, OpenBible, MACULA | | Nothing | |

Biblelib's [pericope model](https://github.com/Clear-Bible/Biblelib/blob/main/docs/pericopes.md) says each verse belongs to exactly one pericope, that gaps are not allowed, and that versification follows the edition. The BSB set was added on 2026-02-24 with the commit message "BSB pericopes". Its titles and boundaries are not the BSB's printed headings: it runs "The Creation" through Genesis 2:3, where the BSB starts "The Seventh Day" at 2:1 and "Man and Woman in the Garden" at 2:4 ([BSB Genesis 2](https://biblehub.com/bsb/genesis/2.htm)). Some titles say "Yahweh" where the BSB text says "LORD". No source for the divisions is documented.

Against the app's structure:

- **Uncovered verses (15).** Joel 1:1, Zechariah 1:1–6, Malachi 1:1, Matthew 17:21, Mark 11:26, Acts 19:41, Romans 16:25–27 and 2 Corinthians 13:14. Each can join the neighbouring section.
- **Numbering beyond KJV.** Two sections end at 3 John 1:15 and Revelation 12:18, verses the KJV structure lacks. Psalm sections start at verse 0, the title.
- **Lengths.** Median 9 verses, mean 12.8, 90th percentile 24. In the narrative books the median is 10 and the 90th percentile 26. 58 sections run past 40 verses and hold 4,029 verses. The longest are Proverbs 10:1–22:16 (375 verses) and two in Deuteronomy, 12:1–26:19 and 6:1–11:32.
- **Boundaries.** 59 sections cross a chapter boundary. None crosses a book.
- **Named cast.** Excluding God and the Holy Spirit, a section names a median of 2 people in Theographic, and 8 at the 90th percentile. 555 sections name no one.

Section tags still miss figures who are on stage:

- **Exodus 14:1–31,** "Yahweh Rescues Israel at the Red Sea", names Moses, Pharaoh, Israel, Egypt and three campsites, but not the Red Sea. The Red Sea is named in 26 verses (Exodus 13:18 and 15:4 among them), none in Exodus 14.
- **1 Samuel 17:48–58,** "David Defeats Goliath", names David, Saul, Abner and Jesse. Goliath is named only at 17:4 and 17:23, which fall in other sections of the chapter.
- **John 11:28–37,** "Jesus Weeps", names Jesus, Mary and Martha, but not Lazarus or Bethany.

**Versification**

Image generation resolves a reference through the provider and then validates it against the static KJV structure ([`resolveGenerationPassage`](../../src/lib/generation-passage.ts)): 66 books, 23,145 OT and 7,957 NT verses, with book IDs such as `GEN`, `1SA` and `JHN`. Every translation is addressed with those numbers, and differing versification is not remapped ([Bible API](../context/BIBLE-API.md)). An entity map keyed by verse reference therefore needs no per-translation data. It does follow the reference, not the words shown, wherever a translation numbers verses differently; whether any of the 16 translations does was not checked.

- **TIPNR.** Its book codes uppercase to the app's IDs (all 66 checked). Fold verse 0 into verse 1. Drop the `a`/`b` suffixes, which count repeated names within one verse, and drop `LXX`-prefixed references.
- **Theographic.** Uses OSIS names; map by the book order in `verseID`.
- **OpenBible and Glyssen.** Use the app's book IDs.
- **BSB pericopes.** Need the three fixes above.
- **MACULA.** Needs a WLC-to-English and SBLGNT-to-English verse map.

**Sizing the major cast**

How the people were counted:

- **Individuals.** Each TIPNR `PERSON` record of type Male or Female is one individual.
- **Verses.** An individual's verses are the distinct (book, chapter, verse) references across all its name-form lines: Named, Spelled, Aramaic, Greek and the variant lines. The `– Total` summary line, `LXX`-only references and `Group` (gentilic) lines are excluded. Suffixes are collapsed and verse 0 is folded into verse 1.
- **Sections.** The number of distinct BSB pericopes containing at least one of those verses.
- **Theographic column.** The verse count of the Theographic person whose verse set overlaps most, with the Jaccard index J.
- **Deities.** TIPNR files God, Satan and other deities under `OTHER`, so they are not ranked. Its LORD record is not exhaustive (its reference list reads "Gen.2.4; etc"). In Theographic, God is linked in 8,587 verses (28% of the Bible), the Holy Spirit in 246 and Satan in 55. Whether God is depicted at all is a canon decision.

"Tribe" in the Note column means the name mostly refers to the tribe or territory rather than the man, so his own presence is overstated.

| # | Individual | Verses (OT / NT) | Sections | Theographic | Note |
| --- | --- | --- | --- | --- | --- |
| 1 | Israel (Jacob) `H3478` | 2,567 (2,477 / 90) | 832 | 1,009 (J 0.39) | Also the nation; 342 verses use "Jacob" |
| 2 | Jesus `G2424G` | 1,157 (2 / 1,155) | 541 | 1,831 (J 0.62) | Theographic also links Lord, Christ, Lamb |
| 3 | David `H1732` | 964 (910 / 54) | 337 | 896 (J 0.92) | |
| 4 | Moses `H4872` | 785 (706 / 79) | 277 | 774 (J 0.99) | |
| 5 | Judah `H3063G` | 772 (757 / 15) | 356 | 245 (J 0.32) | Tribe and kingdom |
| 6 | Aaron `H0175` | 333 (328 / 5) | 128 | 331 (J 0.99) | |
| 7 | Saul, king `H7586G` | 327 (326 / 1) | 67 | 265 (J 0.81) | |
| 8 | Abraham `H0085` | 275 (206 / 69) | 98 | 277 (J 0.99) | |
| 9 | Solomon `H8010` | 272 (264 / 8) | 98 | 273 (J 0.98) | |
| 10 | Joseph, son of Jacob `H3130G` | 197 (189 / 8) | 61 | 199 (J 0.99) | |
| 11 | Joshua `H3091G` | 190 (188 / 2) | 55 | 189 (J 0.99) | |
| 12 | Paul `G3972G` | 182 (0 / 182) | 83 | 179 (J 0.98) | |
| 13 | Peter `G4074G` | 179 (0 / 179) | 87 | 175 (J 0.98) | |
| 14 | Benjamin `H1144G` | 158 (154 / 4) | 81 | 157 (J 0.94) | Tribe |
| 15 | Ephraim `H0669G` | 158 (158 / 0) | 87 | 160 (J 0.92) | Tribe |
| 16 | Jeremiah `H3414L` | 124 (121 / 3) | 51 | 124 (J 1.00) | |
| 17 | Isaac `H3327` | 123 (105 / 18) | 55 | 123 (J 1.00) | |
| 18 | Samuel `H8050G` | 121 (118 / 3) | 31 | 122 (J 0.99) | |
| 19 | Joab `H3097G` | 120 (120 / 0) | 36 | 119 (J 0.99) | |
| 20 | Hezekiah `H2396G` | 116 (114 / 2) | 34 | 116 (J 1.00) | |
| 21 | Pharaoh of the Exodus `H6547J` | 111 (110 / 1) | 34 | 138 (J 0.80) | |
| 22 | Manasseh, son of Joseph `H4519G` | 108 (107 / 1) | 56 | 109 (J 0.97) | Tribe |
| 23 | Absalom `H0053` | 92 (92 / 0) | 25 | 91 (J 0.99) | |
| 24 | Elijah `H0452G` | 92 (62 / 30) | 31 | 92 (J 1.00) | |
| 25 | John the Baptist `G2491G` | 89 (0 / 89) | 42 | 89 (J 1.00) | |
| 26 | Nebuchadnezzar `H5019` | 88 (88 / 0) | 49 | 88 (J 1.00) | |
| 27 | Jonathan, son of Saul `H3083H` | 82 (82 / 0) | 18 | 83 (J 0.99) | |
| 28 | Jeroboam I `H3379G` | 81 (81 / 0) | 35 | 81 (J 1.00) | |
| 29 | Ahab `H0256G` | 79 (79 / 0) | 26 | 80 (J 0.99) | |
| 30 | Daniel `H1840G` | 72 (70 / 2) | 25 | 72 (J 1.00) | |
| 31 | Levi `H3878` | 71 (68 / 3) | 49 | 64 (J 0.90) | Tribe; 258 more verses say "Levites" |
| 32 | Esau `H6215G` | 70 (67 / 3) | 14 | 151 (J 0.46) | Theographic adds "Edom" |
| 33 | Pharaoh of Joseph `H6547H` | 70 (68 / 2) | 13 | 63 (J 0.90) | |
| 34 | Reuben `H7205` | 69 (68 / 1) | 37 | 70 (J 0.99) | Tribe |
| 35 | Jehoshaphat `H3092I` | 67 (66 / 1) | 19 | 69 (J 0.97) | |
| 36 | Eleazar, son of Aaron `H0499G` | 61 (61 / 0) | 31 | 61 (J 1.00) | |
| 37 | Balaam `H1109A` | 59 (56 / 3) | 13 | 59 (J 1.00) | |
| 38 | Gad, son of Jacob `H1410G` | 55 (54 / 1) | 29 | 55 (J 0.96) | Tribe |
| 39 | Isaiah `H3470A` | 54 (32 / 22) | 33 | 53 (J 0.98) | |
| 40 | Zedekiah `H6667H` | 54 (54 / 0) | 22 | 52 (J 0.96) | |
| 41 | Abner `H0074` | 53 (53 / 0) | 14 | 53 (J 1.00) | |
| 42 | Asa `H0609G` | 53 (51 / 2) | 18 | 53 (J 1.00) | |
| 43 | Elisha `H0477` | 53 (52 / 1) | 18 | 53 (J 1.00) | |
| 44 | Job `H0347` | 53 (52 / 1) | 28 | 53 (J 1.00) | |
| 45 | Pilate `G4091` | 53 (0 / 53) | 24 | 54 (J 0.98) | |
| 46 | Gideon `H1439` | 50 (49 / 1) | 11 | 49 (J 0.98) | |
| 47 | Mordecai `H4782H` | 50 (50 / 0) | 11 | 50 (J 1.00) | |
| 48 | Naphtali `H5321G` | 50 (47 / 3) | 39 | 49 (J 0.98) | Tribe |
| 49 | Josiah `H2977G` | 49 (47 / 2) | 26 | 49 (J 1.00) | |
| 50 | Sarah `H8283` | 48 (44 / 4) | 18 | 48 (J 1.00) | |

The next ten are Noah 47, Jehu 46, Laban 46, Zebulun 46 (tribe), Esther 45, Haman 45, Rachel 45, Asher 44 (tribe), Jesse 44 and Simeon 43 (tribe). Many figures who matter to the story are named rarely: Mary the mother of Jesus (20 verses), Adam (27), Mary Magdalene (14), Ruth (13), Martha (12), Lazarus (11), Rahab (8), Goliath (6) and Eve (4).

Places were counted the same way from TIPNR `PLACE` records. `Group` lines are again excluded; Egypt has 55 more verses that say only "Egyptians", Canaan 67 and Philistia 250. The Theographic column merges each place with its aliases through `canonicalPlace`. The OpenBible column counts verses in which any of its ten translations names the place.

| # | Place | Verses | Sections | Theographic | OpenBible (type) |
| --- | --- | --- | --- | --- | --- |
| 1 | Jerusalem, including Zion | 888 | 470 | 765 (J 0.86) | 955 (settlement) |
| 2 | Egypt | 594 | 241 | 567 (J 0.91) | 658 (region) |
| 3 | Babylon | 274 | 103 | 259 (J 0.95) | 296 (settlement) |
| 4 | Jordan | 179 | 99 | 177 (J 0.99) | 202 (river) |
| 5 | Moab | 160 | 65 | 148 (J 0.79) | 162 (region) |
| 6 | Assyria | 136 | 73 | 120 (J 0.88) | 141 (region) |
| 7 | Samaria | 115 | 68 | 114 (J 0.99) | 113 (settlement) |
| 8 | Syria (Aram) | 113 | 50 | 64 (J 0.57) | 89 (region) |
| 9 | Ammon | 103 | 46 | no match | 106 (region) |
| 10 | Edom | 90 | 53 | 82 (J 0.79) | 111 (region) |
| 11 | Chaldea | 83 | 43 | no match | 85 (region) |
| 12 | Gilead | 80 | 50 | 80 (J 0.98) | 86 (region) |
| 13 | Canaan | 79 | 52 | 76 (J 0.94) | 101 (region) |
| 14 | Bethel | 69 | 43 | 73 (J 0.89) | 69 (settlement) |
| 15 | Dan, city and territory | 64 | 41 | 23 (J 0.36) | 25 (settlement) |
| 16 | Galilee | 64 | 55 | 63 (J 0.95) | 78 (region) |
| 17 | Euphrates | 61 | 45 | 41 (J 0.67) | 44 (river) |
| 18 | Jericho | 61 | 48 | 58 (J 0.95) | 63 (settlement) |
| 19 | Hebron | 57 | 35 | 57 (J 1.00) | 62 (settlement) |
| 20 | Lebanon | 56 | 42 | 56 (J 1.00) | 57 (region) |
| 21 | Damascus | 55 | 37 | 55 (J 1.00) | 58 (settlement) |
| 22 | Bashan | 53 | 36 | 52 (J 0.98) | 53 (region) |
| 23 | Midian | 53 | 24 | 44 (J 0.83) | 51 (region) |
| 24 | Judea | 52 | 47 | 44 (J 0.81) | 52 (region) |
| 25 | Tyre | 51 | 32 | 52 (J 0.94) | 64 (settlement) |

The next five are Mizpah 50, Bethlehem 49, Sodom 48, Gibeah 44 and Sinai 43. "No match" means no Theographic place overlaps with J of 0.3 or more.

Thresholds behind the suggested size:

| | 200+ verses | 100+ | 50+ | 30+ | 20+ | 10+ |
| --- | --- | --- | --- | --- | --- | --- |
| TIPNR individuals | 9 | 22 | 48 | 82 | 130 | 260 |
| TIPNR places | 3 | 9 | 26 | 45 | 62 | 124 |

| | 50+ sections | 20+ | 10+ |
| --- | --- | --- | --- |
| TIPNR individuals | 18 | 55 | 129 |

The suggested size of 50–75 characters is a judgement drawn from these figures:

- **Characters.** 42 of the top 50 are people whose counts mostly reflect their own presence, though Jacob's is inflated by the nation. The other eight are tribe names. A cast of 50–75 is those people plus curated figures such as Adam, Eve, Mary, Mary Magdalene, Lazarus and Goliath.
- **Locations.** OpenBible types 14 of the top 25 places as regions, and a verse often names a region without being set there. Settings that are often depicted are seldom named: Theographic has the Sea of Galilee in 5 verses, Gethsemane in 2 and Golgotha in 3. The Temple and the tabernacle are common nouns, so they have no place record at all; only named wildernesses such as Sin, Zin and Paran do. That points to 25–40 curated locations, not the top of a frequency list.

**Method**

Counts came from Python scripts run outside the repository on the downloaded files. Git blob hashes of the TIPNR file and of Theographic's `people.json` and `verses.json` matched the repositories' current blobs. The app's chapter verse counts were parsed from `bible-structure.ts`.

To repeat the checks, download the files listed above and recompute the following:

- verse references outside the app's chapter and verse counts
- section coverage, gaps and overlaps
- the per-individual verse sets

STEPBible-Data changes often (eight commits between October 10 and 17), so recompute before importing.
