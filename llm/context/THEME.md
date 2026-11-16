# Styling and layout

[globals.css](../../src/app/globals.css) is the source for semantic color, spacing, typography, radius, motion and shadow tokens. Tailwind v4 imports and `@theme inline` mappings live there; there is no separate Tailwind config. Motion variables contain durations, so easing belongs in the CSS/class using them.

[The root layout](../../src/app/layout.tsx) loads Geist Sans, Geist Mono and EB Garamond (`font-serif`, the words page's verse face). Dark colors follow `prefers-color-scheme`, except on the spread ([Navigation](NAVIGATION.md)), which is drawn in the reader's appearance: dark by default whatever the system setting is, or light, or following the system, as chosen in Advanced ([Advanced](ADVANCED.md)). The image stage has its own dark background token.

## The reader's token scopes

globals.css keeps the reader's colours as two parallel token scopes, in `@layer base` so a utility on the same element still wins:

- `.reader-dark`: always dark. The whole-picture view (the spread's `<main>` switches to it while the view is open) and the unpainted picture area use it.
- `.reader-light`: always light.
- `.reader-appearance`: the reader's chosen appearance. It is dark, and turns light under `<html data-reader-appearance="light">`, which [ReaderAppearance](../../src/components/spread/reader-appearance.tsx) sets. The spread's `<main>` and the credits dialog carry it, so the feedback form, Advanced and every layer inside the spread inherit it.

Each scope sets `color-scheme`, the reader's own tokens and the site's semantic tokens (for token-styled surfaces over the spread such as the credits dialog and feedback; `.reader-answer` maps them to the reader's ink for Ask's answers). Reader components draw with the reader's tokens, never literal white or black:

- `ink` (text, lines and tints, with Tailwind's opacity modifier: `text-ink/90`, `bg-ink/10`) and `paper` (text on an ink button: `bg-ink text-paper`).
- Quiet text uses the `--quiet-*` steps, `text-ink/(--quiet-55)`: the same percentage in dark, raised in light so quiet text keeps at least 4.5:1 over light glass whatever picture lies under it (the 25 step is only for disabled and decorative marks).
- Surfaces: `bg-reader-page` (the words page and Ask on a phone, Contents), `bg-reader-page-glass` (the words page on a computer, the other-style note), `bg-reader-sheet` (the corner menu sheet, Ask on a computer), `bg-reader-glass` (Look, the picture menu, the corner popover, the feedback prompt), `bg-reader-raised` (the chapter job bar); the dock and the picture chip's `.liquid-glass.spread-dock` read `--reader-dock*`.
- `text-reader-alert` and `text-reader-warning` for errors and warnings.

Text drawn straight on a picture (verse marks, the corner name, the whole-picture caption, a Contents tile's number and count) stays literal white over its dark scrim in every appearance.

## Conventions for changes

Use the existing semantic variables, restrained decoration and Lucide icons. Preserve visible keyboard focus, labeled icon controls, readable contrast, mobile touch targets and reduced-motion behavior. These are implementation criteria to verify, not an assertion that every current component meets every accessibility target.

Use existing components as references: [header](../../src/components/header.tsx), [book menu](../../src/components/book-menu.tsx), [buy-credits modal](../../src/components/buy-credits-modal.tsx), [image skeleton](../../src/components/image-loading-skeleton.tsx). Check the actual component breakpoints and safe-area rules instead of assuming one fixed desktop/mobile layout.

Reader, Contents, sidebar and fullscreen behavior are documented in [Navigation](NAVIGATION.md). Token values should change in CSS, without maintaining duplicate value tables here.
