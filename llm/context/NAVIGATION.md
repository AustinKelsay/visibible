# Reader and navigation

Verse URLs are `/{book}/{chapter}/{verse}`. [navigation.ts](../../src/lib/navigation.ts) validates locations and computes adjacent verses across chapter/book boundaries, stopping at the ends of the Bible. The root and `/verse/[number]` routes provide redirects.

[NavigationContext](../../src/context/navigation-context.tsx) owns the book menu, chat/feedback sidebar, header settings menu, fullscreen state, current image ID, and chat context. Route changes close the book and settings menus; chat and fullscreen state persist. Escape closes fullscreen before chat. Fullscreen locks body scrolling.

- [Book menu](../../src/components/book-menu.tsx): book → chapter → verse selection, with image availability indicators from Convex.
- [Verse strip](../../src/components/verse-strip.tsx): chapter navigation and saved-image indicators.
- [Hero image](../../src/components/hero-image.tsx) and [scripture reader](../../src/components/scripture-reader.tsx): verse controls and image-history browsing.
- [Mobile navigation](../../src/components/mobile-verse-nav.tsx) and [keyboard helper](../../src/lib/verse-keyboard-navigation.ts): responsive and keyboard behavior.
- [Chat sidebar](../../src/components/chat-sidebar.tsx): chat and feedback tabs.

## Gallery and selected images

[VerseViewProvider](../../src/context/verse-view-context.tsx) reads `?view=gallery`; other values default to the reader. The header can override that view in memory. The override is tied to the route's base view, not stored as a localStorage preference.

[ChapterGallery](../../src/components/chapter-gallery.tsx) shows the saved images in the selected art style or groups them by verse, with placeholders where art is missing; existing images count as Classical. Chapter navigation preserves `?view=gallery`. Cards return to the reader; a saved-image card adds `?image=<id>` so the reader can select that image. A separate fullscreen action opens the gallery lightbox.

[VersePageContent](../../src/components/verse-page-content.tsx) coordinates reader/gallery rendering. Keep the generation callback registration intact when changing which surface is visible: header generation uses [GenerationContext](../../src/context/generation-context.tsx), with state supplied by HeroImage.

The reader's image dock shows the selected style's images of a verse. When the verse has images in other styles, an "N in other styles" control opens a deliberate other-styles view for that verse and style; changing the style or verse returns to the style's own images, and auto-generation never fires while that view is open.
