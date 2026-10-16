# Preferences

[PreferencesProvider](../../src/context/preferences-context.tsx) stores translation, image model, chat model, image aspect ratio and resolution in `visibible-preferences` localStorage. Defaults come from the Bible and model libraries; validation and hydration behavior live in the provider.

Every save writes the image model, whether or not the visitor chose it, along with `defaultImageModel`, the default at save time. On load, a saved image model equal to that default is replaced by the current default, so visitors who never chose a model follow default changes. Preferences saved before `defaultImageModel` existed count as saved under Gemini 2.5 Flash Image.

Translation, image model and chat model setters also write cookies. Translation and image model changes refresh the route. Ratio and resolution changes apply to subsequent generation; chat model changes apply to subsequent messages. Selecting a model does not itself guarantee generation or catalog availability.

Model defaults, ratio/resolution options and resolution normalization are defined in [image-models.ts](../../src/lib/image-models.ts) and [chat-models.ts](../../src/lib/chat-models.ts); the per-model supported-resolution registry lives in [image-catalog.ts](../../src/lib/image-catalog.ts). Models without resolution support use the normalized 1K estimate bucket.

Reader/gallery state is separate from saved preferences; see [Navigation](NAVIGATION.md). Preference events use the source values defined in [analytics.ts](../../src/lib/analytics.ts).
