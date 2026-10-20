# Visibible

Visibible supports reading Scripture, generating verse images, discussing passages, and browsing a shared image library.

The image-engine terms below describe the accepted design in [A generic image engine with shared canon and art styles](https://github.com/AustinKelsay/visibible/issues/165), with the Bible as its first work. They do not imply that the engine migration has shipped.

## Language

**Work**: The whole text being read and illustrated, such as the Bible or The Adventures of Sherlock Holmes. A work may divide into books, chapters, stories, verses or paragraphs.
_Avoid_: Book (when meaning the whole text)

**Division**: A named part of a work that holds units or smaller divisions, such as a book, chapter, story or part.

**Unit**: The smallest numbered piece of a work's text, such as a verse, paragraph or line.

**Reference text**: The one text of a work that its images are planned from, such as the World English Bible. Other translations of the work share those images.

**Moment**: A run of one or more consecutive units, inside one story section, that one image illustrates. In the Bible, each verse is its own moment.
_Avoid_: Passage, scene (when meaning this span)

**Work brief**: The one page describing a work's tone, depiction rules, eras and style set, approved by the owner before the work's first image.
_Avoid_: World bible, style guide, theme

**Era**: A stretch of a work's world whose people, dress, buildings and technology stay the same, such as Roman Judea or late Victorian London. Each story section belongs to one era. A work's main era is the era with the most story sections.

**Depiction rule**: A rule in a work brief about how something in the work may or may not be shown, such as drawing a disguised character as the disguise.

**Passage**: Scripture text identified by its reference and translation. A passage can contain one or more verses.

**Verse reference**: The book, chapter, and verse that identify one verse independently of its translation.

**Translation**: A named rendering of Scripture in a particular language.

**Verse image**: The Bible app's name for an illustration of one moment, associated with a verse reference and the reference text and generation that produced it.

**Shared image library**: Saved verse images available for public browsing and reuse.

**Scene plan**: A description of a moment's subject, action, setting, and composition, shared across art styles and reader translations.

**Art style**: The shared look of images (rendering, palette, lighting, texture), independent of any work and of what any one image depicts.
_Avoid_: Theme, style profile

**Style set**: The ordered list of art styles a work offers, named in its work brief. The first is the work's default.

**Character**: A person, being, animal or group that stands on stage in a work's story sections, such as Moses or the crowd.

**Location**: A place that stands on stage in a work's story sections, such as the Red Sea or 221B Baker Street.

**Object**: A thing with a fixed look that stands on stage in a work's story sections, such as the ark of the covenant.

**Canon**: The description of a character's, location's or object's identity, shared by every art style, so each style depicts the same figure, place or thing.

**Stage**: A period of a character's life or a location's history with its own canon appearance, such as the shepherd boy David or Herod's temple.
_Avoid_: Life stage, era (when meaning one figure's period)

**Story section**: A run of consecutive units that tells one episode, such as the crossing of the Red Sea.
_Avoid_: Pericope, chapter (when meaning the episode)

**Section cast**: The characters, locations and objects present in a story section, including those the text does not name in every unit.

**Section look**: What is particular to one story section, such as its time of day, weather, light, and situational clothing, shared by images of that section's moments across translations and art styles. Canon describes how its characters and locations normally appear.

**Reference sheet**: An engine-made, vision-checked picture of a canon entry in fixed views on a plain background: a character or location at one stage, or an object. It is an optional visual reference for images depicting that entry.

**Style reference**: A picture with no people, made for one art style and one work, that shows the style's rendering in that work's world. It is an optional visual reference for images in that style.

**Analysis**: Everything the engine makes for a work from its reading pass onward: story sections, moments, cast, canon, section casts, section looks, scene plans, reference sheets and style references. The owner corrects it after the fact; only the work brief is approved beforehand.

**Pin**: An owner's choice of one reference sheet or style reference that the engine keeps, ignoring staleness, until unpinned.

**Analysis generation**: One complete result of reading a work, staged as a candidate and activated whole, after which the engine serves it until the next one activates. Not a generation in the image sense.

**Image report**: A reader's feedback about one saved image, linked to the available context of how it was generated.

**Attention list**: The owner's collection of concerns about a work's analysis and saved images, including image reports and problems found while preparing the work.

**Passage continuity**: Consistent setting, costume, lighting, and props across images of one story section's moments.

**Generation**: The work requested to produce one image of a moment. A repeated delivery of the same request is still the same generation.
_Avoid_: Image request when referring to each network delivery as separate paid work.

**Generation attempt**: One attempt to obtain output from a model provider for a generation.

**Bulk job**: A request to generate images for an ordered selection of verses.

**Bulk item**: One verse selected for a bulk job, with its own generation outcome.

**Guest session**: Anonymous access associated with a browser. It is not a named user account.

**Credit balance**: The credits available to a guest for paid work.

**Credit reservation**: Credits held for accepted work before its final charge is known.

**Quote**: The estimated charge and maximum authorized charge for specified work.
_Avoid_: Actual cost when referring to a quote.

**Provider spend**: The amount charged by an external model provider, including work the guest is not charged for.

**Credit charge**: The final credits debited for accepted work under its billing policy.

**Settlement receipt**: The record explaining a reservation, final charge or release, provider spend, and any difference absorbed by Visibible.

**Credit bundle**: A fixed number of credits offered for a fixed USD price.

**Invoice**: A Lightning payment request for a credit bundle.

**Credit purchase**: The credits added to a credit balance, exactly once, when its invoice is paid.
_Avoid_: Settlement when referring to a paid invoice; settlement belongs to credit reservations.

**Publication**: A verse image and Scripture text shared through Nostr, together with the record of that sharing.
