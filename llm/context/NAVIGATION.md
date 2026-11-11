# Reader and navigation

Verse URLs are `/{book}/{chapter}/{verse}`. [navigation.ts](../../src/lib/navigation.ts) validates locations and computes adjacent verses across chapter/book boundaries, stopping at the ends of the Bible. The root and `/verse/[number]` routes provide redirects.

[NavigationContext](../../src/context/navigation-context.tsx) owns the book menu, chat/feedback sidebar, header settings menu, fullscreen state, current image ID, and chat context. Route changes close the book and settings menus; chat and fullscreen state persist. Escape closes fullscreen before chat. Fullscreen locks body scrolling.

- [Book menu](../../src/components/book-menu.tsx): book → chapter → verse selection, with image availability indicators from Convex.
- [Verse strip](../../src/components/verse-strip.tsx): chapter navigation with scroll arrows; each verse tile shows its saved-image count inside the tile.
- [Hero image](../../src/components/hero-image.tsx) and [scripture reader](../../src/components/scripture-reader.tsx): verse controls and image-history browsing.
- [Mobile navigation](../../src/components/mobile-verse-nav.tsx) and [keyboard helper](../../src/lib/verse-keyboard-navigation.ts): responsive and keyboard behavior.
- [Chat sidebar](../../src/components/chat-sidebar.tsx): chat and feedback tabs.

## Verse modes and selected images

[VerseViewProvider](../../src/context/verse-view-context.tsx) reads `?view=gallery` and `?view=video`; other values default to the reader. The Images / Gallery / Video switcher updates the URL with `replaceState`, so refresh preserves the selected mode. It is not a localStorage preference. Video unmounts when another mode is selected, stopping playback. Its desktop and mobile adjacent-verse links preserve `?view=video`; see [Video generation](VIDEO-GENERATION.md).

[ChapterGallery](../../src/components/chapter-gallery.tsx) shows the saved images in the selected art style or groups them by verse, with placeholders where art is missing; existing images count as Classical. Chapter navigation preserves `?view=gallery`. Cards return to the reader; a saved-image card adds `?image=<id>` so the reader can select that image. A separate fullscreen action opens the gallery lightbox, which steps through the chapter's saved images with on-screen buttons or the arrow keys and links back to the reader. Reader fullscreen keeps verse navigation in its top bar and image navigation under the image.

[VersePageContent](../../src/components/verse-page-content.tsx) coordinates reader, gallery, and video rendering. On desktop the header keeps the same controls on every tab so nothing shifts: art style stays usable in Video mode (it applies to the next image) while image settings are read-only there, the image settings chip is read-only outside the Images tab, and Gallery and Video show Get Credits, where the Images tab shows the generate button, when the balance is below a typical image cost. The image model is chosen inside the image settings popover, beside ratio and resolution; the mobile settings menu keeps its own model row and drops image controls in Video mode. The book menu marks the current book, chapter and verse and can filter books by name. The mobile verse bar is hidden in the gallery, which has its own chapter navigation. Keep the generation callback registration intact when changing which surface is visible: header generation uses [GenerationContext](../../src/context/generation-context.tsx), with state supplied by HeroImage.

The reader's image dock shows the selected style's images of a verse. When the verse has images in other styles, an "N in other styles" control opens a deliberate other-styles view for that verse and style; changing the style or verse returns to the style's own images, and auto-generation never fires while that view is open.

## Prose works

`/read` is the library: the Bible, and each prose work in the [catalog](../../src/lib/works/catalog.ts) the viewer may open. `/read/{work}` lists the work's chapters or stories, and `/read/{work}/{moment}` shows one passage. A passage is one moment of the work's active analysis, the same run of paragraphs the image engine draws, and its address is the moment's first unit (`/read/alice-in-wonderland/the-pool-of-tears-1`). [prose-book.ts](../../src/lib/works/prose-book.ts) cuts the imported text (`works/{id}/work.json`) by the active generation's moments, cached per generation for up to a minute on each server instance, so an owner correction to a moment reaches the page within a minute. A work with no active analysis is not found.

- **Who can open a work.** A work is the owner's preview until it is listed in `PUBLIC_PROSE_WORK_IDS` ([proseWorks.ts](../../convex/lib/proseWorks.ts)); the catalog reads that list. The owner here is an admin session ([viewer.ts](../../src/lib/works/viewer.ts)); the configured owner-check session is not enough.
  - For anyone else, an unopened work answers exactly like a work that does not exist: its pages are not found, the library leaves it out, image requests get the same 404, and `/api/image-models?work=` gives the Bible's answer.
  - Convex's image reads by verse id (`getImageHistory`, `getLatestImage`, `getChapterGallery`, `getChapterImageStatus`, `getChaptersWithImages`) leave out an unopened work's saved images unless the caller's guest token belongs to an admin session.
  - visibible.com serves only the Bible to readers. Holmes and Alice stay the owner's preview: they verify that the engine and reader work for any work. Other books launch on a separate site built from this codebase. Nothing in public navigation links to `/read`.
- **The passage page** ([prose-reader.tsx](../../src/components/prose-reader.tsx)) shows the image, the passage's paragraphs (Gutenberg's `_underscores_` as italics), and Previous, Contents and Next. The arrow keys and image swipes move between passages across chapters, as they move between verses.
- **Work scope.** The page provides a [work scope](../../src/context/work-scope-context.tsx), and the shared controls read it:
  - The header leads with the passage, its book button opens the contents, and it offers neither translation nor chat.
  - The hero image keeps images under the moment and requests them with the work and unit.
  - The art style controls offer only the work's brief styles. A saved preference the work lacks falls back to the work's first style without being overwritten.
  - Generation is single only, with no bulk.
- **The library and contents pages** have no passage, so their header is the Bible's, and its book button opens the Bible's book menu.
- **Not on prose pages:** the chapter gallery, video, chat context, the book menu and the public image API.

### Serving a work on another site

The generic check closed on 10 November 2026: in production, Holmes and Alice imported, prepared, read and generated through the same engine, image route and reader as the Bible, and stayed hidden from everyone but an admin session. A site built from this codebase to serve other books needs these changes. None of them belongs on visibible.com.

- **Add the work to the build.** Commit its source snapshot under `works/sources/` (listed in `manifest.json`), add an importer to [import.mts](../../scripts/works/import.mts) and commit its approved `works/{id}/brief.json`. `works/*/work.json` is ignored by git and rebuilt by `npm run build`, which runs the importer first, so a work without an importer has no text in a clean deployment. Its unit ids must not collide with another work's, the Bible's included: saved images are keyed by unit id alone.
- **Register and open it.** Add the work and its brief to `PROSE_WORKS` in [catalog.ts](../../src/lib/works/catalog.ts); the reader and image route reject any id that is not there. Then add its id to `PUBLIC_PROSE_WORK_IDS` ([proseWorks.ts](../../convex/lib/proseWorks.ts)). That list lives in Convex, so the change needs a Convex deploy as well as a site deploy; the catalog, image route and Convex image reads all follow it.
- **Link it.** Add a `/read` link to public navigation and sitemap entries for `/read` and each open work, and set the sitemap's `BASE_URL` to the new site's origin. Commit `582872f` (#408, later reverted here by #409) added the link and entries, in [footer.tsx](../../src/components/footer.tsx) and [sitemap.ts](../../src/app/sitemap.ts).
- **Prepare it in that site's Convex.** Each work needs an active analysis, canon and reference sheets there ([work input](WORK-INPUT.md), [work preparation](WORK-PREPARATION.md)). A work with no active analysis is not found.
- **Styles.** A work offers the styles its brief lists that are also in `PUBLIC_GENERIC_STYLE_IDS` ([admission.ts](../../src/lib/engine/admission.ts)).
- **Nostr.** The scheduler skips every image whose work is not the Bible, because a post links to a verse page ([NOSTR.md](NOSTR.md)). A site that posts its images changes that check and the post's link.
- **Known limits.** Alice's court and croquet scenes reached 0–1 of 9 at the launch bar from image-model habits ([record](../releases/2026-11-10-alice-court-fix/README.md)). Holmes reaches 19–24 of 30.
