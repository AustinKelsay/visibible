# Styling and layout

[globals.css](../../src/app/globals.css) is the source for semantic color, spacing, typography, radius, motion and shadow tokens. Tailwind v4 imports and `@theme inline` mappings live there; there is no separate Tailwind config. Motion variables contain durations, so easing belongs in the CSS/class using them.

[The root layout](../../src/app/layout.tsx) loads Geist Sans and Geist Mono. Dark colors follow `prefers-color-scheme`. The image stage has its own dark background token.

## Conventions for changes

Use the existing semantic variables, restrained decoration and Lucide icons. Preserve visible keyboard focus, labeled icon controls, readable contrast, mobile touch targets and reduced-motion behavior. These are implementation criteria to verify, not an assertion that every current component meets every accessibility target.

Use existing components as references: [header](../../src/components/header.tsx), [book menu](../../src/components/book-menu.tsx), [buy-credits modal](../../src/components/buy-credits-modal.tsx), [image skeleton](../../src/components/image-loading-skeleton.tsx). Check the actual component breakpoints and safe-area rules instead of assuming one fixed desktop/mobile layout.

Reader, gallery, sidebar and fullscreen behavior are documented in [Navigation](NAVIGATION.md). Token values should change in CSS, without maintaining duplicate value tables here.
