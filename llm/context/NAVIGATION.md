# Reader and navigation

Verse URLs are `/{book}/{chapter}/{verse}`. [navigation.ts](../../src/lib/navigation.ts) validates locations and computes adjacent verses across chapter/book boundaries, stopping at the ends of the Bible. The root and `/verse/[number]` routes provide redirects.

## The spread

A verse page is the **spread** ([spread.tsx](../../src/components/spread/spread.tsx)), the reader's one screen for one verse, built for the redesign in [#434](https://github.com/AustinKelsay/visibible/issues/434). It is dark whatever the system setting is.

- **Computer (768 px and wider).** The [picture](../../src/components/spread/spread-picture.tsx) covers the window, cropped from its centre. The [words page](../../src/components/spread/words-page.tsx) lies over the right side as dark glass: a line naming the book and chapter, the verse number large, the verse in a serif face, and a foot line with the translation name and the position ("5 / 51"). A floating dock on the picture holds previous, the passage name and next.
- **Verse marks** ([verse-marks.tsx](../../src/components/spread/verse-marks.tsx)): a thin row along the top of the picture, one mark per verse of the chapter. A verse with a picture in the stored art style is brighter (`getChapterImageStatus` with the style, the same read the old book menu used), the current verse is white, thicker and `aria-current="page"`, and each mark is a link named "Verse 7, painted" or "Verse 8, unpainted". Marks are not prefetched (the whole chapter is on screen).
- **Phone.** The picture sits above in a square frame (at most about half the screen) and the words page fills the rest. Previous and next sit beside the position line; there is no dock yet.
- **The picture** is the newest saved picture of the verse in the stored art style (`getImageHistory` with the style). Loading a picture records one impression for it. While the verse's pictures load the frame is plain dark.
- **An unpainted verse** (no picture in the stored style) shows [the unpainted picture area](../../src/components/spread/unpainted-picture.tsx): a blurred glow of the nearest earlier picture of the chapter in that style (`getNearestEarlierPicture`, its thumbnail when it has one), or plain dark when no earlier verse has one, then "No picture for John 1:6 yet", one paint button and the switch "Paint verses automatically as I read". [Image generation](IMAGE-GENERATION.md#painting-on-the-spread) describes the button, painting and the switch.
- **A long verse** scrolls inside the words page; the picture and the foot line stay put.
- **Turning pages** ([page-turn.tsx](../../src/components/spread/page-turn.tsx)): previous and next move one verse across chapter and book boundaries ([navigation.ts](../../src/lib/navigation.ts)). The left and right arrow keys do the same unless the reader is typing in a field ([keyboard helper](../../src/lib/verse-keyboard-navigation.ts)). Each turn reports `verse_navigation` with source `keyboard`, `dock`, `swipe` or `mark`.
- **Swipe** ([swipe-turn.ts](../../src/components/spread/swipe-turn.ts)): a one-finger horizontal swipe anywhere on the spread turns the page (leftward = next). The first 10 px of movement decide: a touch that starts up or down is a scroll and never turns, so a long verse still scrolls; a turn also needs 56 px sideways and more sideways than vertical travel. Two fingers, a touch that starts in a text field, or an open layer other than the whole-picture view turn nothing. Swipe no longer changes picture versions.
- **The next spread is fetched ahead** ([prefetch-next.tsx](../../src/components/spread/prefetch-next.tsx)): `router.prefetch` of the next address, a subscription to the next verse's `getImageHistory` with the same arguments the picture reads (so the next spread finds it already loaded), and `preload` of the picture it will show.
- **Arriving.** A turned page's words slide in from the side it was turned towards and its picture fades up (`data-arrival` on the spread, `data-turn-in` on the animated parts, CSS in globals.css). Arriving any other way (a link, reload, back button) does not animate.
- **Fading controls** ([idle-fade.ts](../../src/components/spread/idle-fade.ts)): on a computer the dock and the marks fade after 3 seconds without pointer, wheel, touch, focus or keyboard activity and come back on any. Nothing fades while a layer is open or while focus is inside one of the fading controls. The spread carries `data-idle`; any element marked `data-fades` inside it fades (CSS in globals.css, 768 px and wider only, so nothing fades on a phone). Faded controls stay in the accessibility tree and keep their pointer events.
- **Reduced motion** makes the slides and fades instant.
- **Not on a verse page:** the old header, tabs, verse strip, details panel, footer, phone navigation bar, chat sidebar and feedback prompt. No dialog opens by itself. `?view=` and `?image=` are ignored.
- **The server-rendered page** keeps the verse text, title and description. A passage the translation lacks, or an outage, still renders the old header and book menu with [PassageUnavailable](../../src/components/passage-unavailable.tsx).

Contents, Look, Ask, the picture menu and the whole-picture view arrive with the later tickets of #434.

## The old shell

About, API documentation, the not-found page, the library and the prose reader keep the old [header](../../src/components/header.tsx), [footer](../../src/components/footer.tsx) and [LayoutWrapper](../../src/components/layout-wrapper.tsx), which now also carries the [chat sidebar](../../src/components/chat-sidebar.tsx) and the feedback prompt. The recovery page has neither.

[NavigationContext](../../src/context/navigation-context.tsx) owns the book menu, chat/feedback sidebar, header settings menu, fullscreen state, current image ID, and chat context for those pages. Route changes close the book and settings menus; chat and fullscreen state persist. Escape closes fullscreen before chat. Fullscreen locks body scrolling. The [book menu](../../src/components/book-menu.tsx) offers book → chapter → verse selection with image availability indicators.

The [hero image](../../src/components/hero-image.tsx), now used only by the prose reader, shows the selected style's images of a moment. When the moment has images in other styles, an "N in other styles" control opens a deliberate other-styles view for that moment and style; changing the style or moment returns to the style's own images, and auto-generation never fires while that view is open. Header generation uses [GenerationContext](../../src/context/generation-context.tsx), with state supplied by HeroImage.

[VideoMode](../../src/components/video-mode.tsx) and [ScriptureDetails](../../src/components/scripture-details.tsx) are not shown anywhere until their tickets (video from the picture menu, passage details in Advanced) bring them back.

## Prose works

`/read` is the library: the Bible, and each prose work in the [catalog](../../src/lib/works/catalog.ts) the viewer may open. `/read/{work}` lists the work's chapters or stories, and `/read/{work}/{moment}` shows one passage. A passage is one moment of the work's active analysis, the same run of paragraphs the image engine draws, and its address is the moment's first unit (`/read/alice-in-wonderland/the-pool-of-tears-1`). [prose-book.ts](../../src/lib/works/prose-book.ts) cuts the imported text (`works/{id}/work.json`) by the active generation's moments, cached per generation for up to a minute on each server instance, so an owner correction to a moment reaches the page within a minute. A work with no active analysis is not found.

- **Who can open a work.** A work is the owner's preview until it is listed in `PUBLIC_PROSE_WORK_IDS` ([proseWorks.ts](../../convex/lib/proseWorks.ts)); the catalog reads that list. The owner here is an admin session ([viewer.ts](../../src/lib/works/viewer.ts)); the configured owner-check session is not enough.
  - For anyone else, an unopened work answers exactly like a work that does not exist: its pages are not found, the library leaves it out, image requests get the same 404, and `/api/image-models?work=` gives the Bible's answer.
  - Convex's image reads by verse id (`getImageHistory`, `getChapterGallery`, `getChapterImageStatus`, `getChaptersWithImages`) leave out an unopened work's saved images unless the caller's guest token belongs to an admin session.
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
