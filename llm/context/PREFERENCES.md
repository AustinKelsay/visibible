# Preferences

[PreferencesProvider](../../src/context/preferences-context.tsx) keeps the reader's settings on this device in one localStorage record, `visibible-reader-settings` (spec [#434](https://github.com/AustinKelsay/visibible/issues/434), "Stored settings"):

```json
{ "version": 1,
  "look": { "artStyle": "classical", "textSize": "medium" },
  "autoGenerate": false,
  "advanced": { "imageAspectRatio": "16:9", "imageResolution": "1K", "chatModel": "…" } }
```

- Only values the reader changed are written; everything else reads as its default, so the reader behaves the same with an empty record, or with no Advanced module at all (the `advanced` group's defaults are pictures at 16:9, 1K and the default chat model).
- Each value is checked on its own. An unknown value (a style id the library does not know, a fourth text size, `autoGenerate` other than exactly `true`) reads as its default and is left in storage untouched.
- **The old record is ignored and removed.** On load the provider deletes `visibible-preferences`, the old reader's record, without reading it: nothing is migrated, so a device that held it starts from the defaults.
- **Translation lives only in its cookie** (`visibible-translation`), because the server reads it to render the verse ([get-translation.ts](../../src/lib/get-translation.ts)). The provider reads the cookie on load, `setTranslation` writes it and refreshes the route, and nothing about translation is stored in the record.
- `autoGenerate` is on only when the stored value is exactly `true`: a guest is charged for an automatic picture without seeing its price, so nothing but their own choice turns it on (the switch "Paint verses automatically as I read" under an unpainted verse's paint button on the spread, [Image generation](IMAGE-GENERATION.md#painting-on-the-spread), or the checkbox in the old image settings).
- The image model is never stored. Since [ADR 0012](../../docs/adr/0012-one-image-call-from-the-text.md) generation runs on one model, so a model picked during a visit lasts only for that visit, and the stored resolution normalizes to what the default model supports. While the catalog offers one usable model, the old header menu and generate modal name it (with its price) instead of offering a choice ([soleImageModel](../../src/lib/image-models.ts)).
- Image model and chat model setters also write their cookies. Translation and image model changes refresh the route; aspect ratio and resolution apply to the next painting, the chat model to the next message, and art style and text size apply at once without a refresh.

**Look** ([look.tsx](../../src/components/spread/look.tsx), [Navigation](NAVIGATION.md)) sets the art style, translation and text size; its changes report `preference_changed` with source `look` (preferences `artStyle`, `translation`, `textSize`). Text size (`small` | `medium` | `large`, default `medium`) sets only the words page's verse size.

The art style ([art-styles.ts](../../src/lib/art-styles.ts)) is one of the styles the reader may see: the Bible's style set in its brief's order (Byzantine Icon, Classical, Ink & Watercolor, Fresco, Storybook), public styles only for readers and every style for an admin ([picture-rule.ts](../../src/lib/picture-rule.ts), [admission](../../src/lib/engine/admission.ts)). A stored style the reader may not see, or one a work does not offer, reads as the first visible style without being overwritten (`useEffectiveArtStyle` in [work-scope-context.tsx](../../src/context/work-scope-context.tsx)); a style the server is not admitting right now (rollback) stays selected and is reported unavailable for painting rather than swapped. Changing the style does not refresh the route: painting, the picture rule's reads and automatic painting follow it reactively ([Image persistence](IMAGE-PERSISTENCE.md#art-style-at-read-time)), and bulk jobs record it at creation.

Model defaults, ratio/resolution options and resolution normalization are defined in [image-models.ts](../../src/lib/image-models.ts) and [chat-models.ts](../../src/lib/chat-models.ts); the per-model supported-resolution registry lives in [image-catalog.ts](../../src/lib/image-catalog.ts). Reader and layer state is separate from saved preferences; see [Navigation](NAVIGATION.md).
