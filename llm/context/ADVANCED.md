# Advanced

Advanced holds the reader choices kept out of Look because few readers need them. It is the last row of the corner menu ([Navigation](NAVIGATION.md)), collapsed until opened. The module is [src/components/spread/advanced/](../../src/components/spread/advanced/): `index.tsx` (the row and the list of items), `item.tsx` (an item's frame) and one file per item. It is mounted in one place, the `<Advanced …/>` line in [corner-menu.tsx](../../src/components/spread/corner-menu.tsx).

## Items

- **Image settings** ([image-settings.tsx](../../src/components/spread/advanced/image-settings.tsx)): the model, aspect ratio and resolution new pictures are painted with. It reads the catalog (`/api/image-models`) when opened. A model the server offers unpriced or unavailable, and a resolution the model cannot make or the server will not price, show as unavailable and cannot be chosen (`isImageModelSelectable`, `resolutionChoice` in [image-models.ts](../../src/lib/image-models.ts), shared with the old settings popover). With one usable model it is named, with nothing to choose. Prices show to guests, not to the owner. The settings apply to the paint button and automatic painting ([useVerseGeneration](../../src/lib/use-verse-generation.ts)), "paint another" (which uses the same hook) and bulk painting ([BulkGenerationProvider](../../src/context/bulk-generation-context.tsx) uses them when its caller names none). The pack estimate in the credits dialog uses the resolution. The model lasts for the visit only: generation runs on one model ([ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md)), as it did in the old settings.
- **Answering model** ([answering-model.tsx](../../src/components/spread/advanced/answering-model.tsx)): the model that answers Ask. It reuses the chat model list ([ChatModelSelector](../../src/components/chat-model-selector.tsx), `variant="inline"`). Ask's next quote and question use it ([Chat](CHAT.md)).
- **Passage details** ([passage-details.tsx](../../src/components/spread/advanced/passage-details.tsx)): the old details panel ([ScriptureDetails](../../src/components/scripture-details.tsx)): translation, location, passage size, word count, reading time, image statistics, and the model, dimensions, aspect ratio, size, time and cost of the picture on screen (the version chosen in the picture menu, else the newest). The translation picker it used to hold is left out; Look has it.
- **Welcome** ([welcome.tsx](../../src/components/spread/advanced/welcome.tsx)): "Show the welcome" closes the menu and opens the credits dialog at its welcome step (`showWelcome` in [GuestSessionProvider](../../src/context/guest-session-context.tsx)). The welcome opens no other way ([Onboarding](ONBOARDING.md)).
- **Feedback prompts** ([feedback-prompts.tsx](../../src/components/spread/advanced/feedback-prompts.tsx)): a switch, off by default, that brings back the occasional "Have feedback?" prompt on the spread ([Feedback](FEEDBACK.md)).

## Stored settings

[advanced-settings.ts](../../src/lib/advanced-settings.ts) keeps Advanced's settings as their own group, apart from the Look record: `visibible-advanced` in localStorage holds `aspectRatio`, `resolution`, `answeringModel` and `feedbackPrompts`; the image model is kept in memory for the visit. `ADVANCED_DEFAULTS` are 16:9, 1K, the default image model (`DEFAULT_IMAGE_MODEL`), the default answering model (`DEFAULT_CHAT_MODEL`) and no prompts. Invalid stored values are ignored.

The reader reads the settings through `useAdvancedSettings()`, never from the module. A setting counts only while an item offers it: each item file calls `offerAdvancedSettings(...)` when it loads, and a setting no loaded item offers reads as its default whatever is stored. So with the module, or one item, cut, the reader behaves exactly as if that item were at its default, even for a visitor who changed it earlier. Pages that do not load the spread (the owner's prose reader on `/read`) keep the old header's image settings, which [HeroImage](../../src/components/hero-image.tsx) passes to the hook itself, until that reader moves to the spread.

Setting changes emit `preference_changed` with source `advanced` (`imageModel`, `imageAspectRatio`, `imageResolution`, `chatModel`, `feedbackPrompts`).

## Removing an item or the module

Each cut is a deletion in one place; nothing else in the reader changes.

- **One item:** delete its import and its line in the list in [index.tsx](../../src/components/spread/advanced/index.tsx), and its file. Its settings stop being offered and read as their defaults (image settings: 16:9, 1K, the default model; answering model: the default; feedback prompts: off). Passage details and Welcome store nothing.
- **The whole module:** delete the `<Advanced …/>` line (and its import) in [corner-menu.tsx](../../src/components/spread/corner-menu.tsx), then the folder. Every setting reads as its default. `advanced-settings.ts` stays: it is where the reader reads the defaults. The verse text and verse count that the corner menu passes on may then be dropped from its props, but nothing requires it.

[advanced-removed.test.tsx](../../src/app/__tests__/advanced-removed.test.tsx) renders the reader with the module cut and a visitor's non-default settings stored, and checks reading, painting (16:9, 1K, default model), Ask (default model), Contents and that no prompt appears. [advanced.test.tsx](../../src/app/__tests__/advanced.test.tsx) covers each item through the whole page.
