# Theme Implementation Guide

This document describes how the Vibible design system (defined in `/llm/context/THEME.md`) is implemented in code. Use this as a reference when building or modifying UI components.

---

## Token Architecture

### CSS Custom Properties

All design tokens are defined as CSS custom properties in `src/app/globals.css` under `:root`. This provides a single source of truth that works with both Tailwind and vanilla CSS.

```css
:root {
  /* Colors */
  --background: #ffffff;
  --foreground: #171717;
  --surface: #f5f5f5;
  --muted: #737373;
  --divider: #e5e5e5;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-text: #ffffff;
  --error: #dc2626;
  --success: #16a34a;

  /* Spacing, Typography, Radius, Shadows, Motion... */
}
```

### Dark Mode

Dark mode values are set via `@media (prefers-color-scheme: dark)` override on `:root`. Only color tokens change; spacing, radius, and motion remain constant.

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
    --surface: #171717;
    --muted: #a3a3a3;
    --divider: #262626;
  }
}
```

### Tailwind Integration

Tokens are bridged to Tailwind via `@theme inline` block, enabling both utility classes and direct `var()` references:

```css
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  /* ... */
}
```

---

## Referencing Tokens in Components

### Primary Method: Direct CSS Variables

We reference tokens directly in Tailwind classes using the `var()` syntax. This is explicit and self-documenting:

```tsx
// Colors
className="bg-[var(--background)]"
className="text-[var(--foreground)]"
className="border-[var(--divider)]"
className="text-[var(--muted)]"

// Radius
className="rounded-[var(--radius-md)]"
className="rounded-[var(--radius-full)]"

// Motion
className="duration-[var(--motion-fast)]"
className="transition-all duration-[var(--motion-base)]"
```

### Why This Approach

1. **Explicit**: Anyone reading the code immediately sees it's a design token
2. **Portable**: Works identically if we move to React Native or another framework
3. **Debuggable**: CSS variables visible in DevTools
4. **Themeable**: Easy to override for different contexts (future: per-section themes)

---

## Component Patterns

### Expandable Sections

For collapsible content, we use `max-h-0` / `max-h-[value]` with `overflow-hidden` and transition:

```tsx
<div
  className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
    isExpanded ? "max-h-[500px]" : "max-h-0"
  }`}
>
  {/* Content */}
</div>
```

The toggle button rotates a chevron icon:

```tsx
<svg
  className={`transition-transform duration-[var(--motion-fast)] ${
    isExpanded ? "rotate-180" : ""
  }`}
>
```

### Grouped Lists (iOS Settings Style)

Structure for grouped list sections:

```tsx
<div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
  {/* Section Header */}
  <div className="px-4 py-2 border-b border-[var(--divider)]">
    <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
      Section Title
    </p>
  </div>

  {/* Rows */}
  <div className="divide-y divide-[var(--divider)]">
    <div className="flex items-center justify-between px-4 py-3 min-h-[44px]">
      <span className="text-sm text-[var(--muted)]">Label</span>
      <span className="text-sm font-medium">Value</span>
    </div>
  </div>
</div>
```

### Buttons

**Primary Button:**
```tsx
className="min-h-[44px] px-5 bg-[var(--accent)] text-[var(--accent-text)]
  rounded-[var(--radius-full)] hover:bg-[var(--accent-hover)]
  disabled:opacity-50 disabled:cursor-not-allowed
  transition-all duration-[var(--motion-fast)] active:scale-[0.98]"
```

**Icon Button (Tertiary):**
```tsx
className="min-h-[44px] min-w-[44px] flex items-center justify-center
  text-[var(--muted)] hover:text-[var(--foreground)]
  transition-colors duration-[var(--motion-fast)]"
```

### Form Inputs

```tsx
className="min-h-[44px] px-4 py-2 bg-[var(--surface)]
  border border-[var(--divider)] rounded-[var(--radius-full)]
  text-[var(--foreground)] placeholder:text-[var(--muted)]
  focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
  focus:border-transparent transition-shadow duration-[var(--motion-fast)]"
```

---

## Layout Patterns

### Page Structure

```tsx
<div className="flex min-h-screen flex-col bg-[var(--background)]">
  {/* Sticky Header */}
  <header className="sticky top-0 z-50 backdrop-blur-md
    bg-[var(--background)]/80 border-b border-[var(--divider)]">
    <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
      {/* Logo left, actions right */}
    </div>
  </header>

  {/* Scrollable Content */}
  <main className="flex-1 flex flex-col">
    {/* Content sections */}
  </main>

  {/* Sticky Bottom (if needed) */}
  <div className="sticky bottom-0 z-40">
    {/* Bottom bar / chat */}
  </div>
</div>
```

### Content Width Constraints

- **Max content width**: `max-w-2xl` (672px) for reading content
- **Max layout width**: `max-w-4xl` (896px) for page containers
- **Always center**: `mx-auto`

### Responsive Hero/Media

```tsx
className="w-full aspect-[16/9] md:aspect-[21/9]"
```

---

## Icon Conventions

### Inline SVG Approach

We use inline SVGs for icons, not an icon library. This keeps the bundle small and allows full styling control.

```tsx
<svg
  width="20"
  height="20"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.5"
  strokeLinecap="round"
  strokeLinejoin="round"
>
  <path d="..." />
</svg>
```

### Standard Properties

| Property | Value |
|----------|-------|
| Size | `20x20` (inline), `24x24` (standalone) |
| viewBox | Always `0 0 24 24` |
| fill | `none` |
| stroke | `currentColor` |
| strokeWidth | `1.5` (default), `2` (emphasis) |
| strokeLinecap | `round` |
| strokeLinejoin | `round` |

### Color Inheritance

Icons inherit color from parent via `currentColor`. Set parent's text color:

```tsx
<button className="text-[var(--muted)] hover:text-[var(--foreground)]">
  <svg stroke="currentColor">...</svg>
</button>
```

---

## Accessibility Patterns

### Touch Targets

All interactive elements have minimum 44x44px hit area:

```tsx
className="min-h-[44px] min-w-[44px]"
```

### ARIA Labels

Icon-only buttons always have `aria-label`:

```tsx
<button aria-label="Search">
  <svg>...</svg>
</button>
```

### Expandable Regions

```tsx
<button
  aria-expanded={isExpanded}
  aria-controls="content-id"
>
<div id="content-id">
```

### Form Inputs

```tsx
<input
  aria-label="Descriptive label"
  placeholder="Visible hint..."
/>
```

---

## State Patterns

### Loading States

**Inline spinner** for buttons:
```tsx
{isLoading ? (
  <svg className="w-5 h-5 animate-spin">...</svg>
) : (
  <span>Submit</span>
)}
```

**Bouncing dots** for chat/typing indicator:
```tsx
<div className="flex space-x-1.5">
  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" />
  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.15s]" />
  <div className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce [animation-delay:0.3s]" />
</div>
```

### Disabled States

```tsx
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

### Hover States

Always pair with transition for smoothness:
```tsx
className="hover:text-[var(--foreground)] transition-colors duration-[var(--motion-fast)]"
```

### Pressed/Active States

```tsx
className="active:scale-[0.98]"
```

---

## Utility Classes in globals.css

### Focus Ring

```tsx
className="focus-ring"
```

Defined as:
```css
.focus-ring:focus-visible {
  box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--accent);
}
```

### Skeleton Loading

```tsx
className="skeleton"
```

Provides pulsing animation with surface background.

---

## File Organization

```
src/
├── app/
│   ├── globals.css          # Token definitions + utilities
│   ├── layout.tsx           # Font loading (Geist)
│   └── page.tsx              # Page composition
└── components/
    ├── chat.tsx              # Expandable chat interface
    ├── hero-image.tsx        # Responsive hero media
    ├── scripture-reader.tsx  # Typography-first reading
    └── scripture-details.tsx # Grouped list metadata
```

---

## Quick Reference

| What | How |
|------|-----|
| Background color | `bg-[var(--background)]` |
| Text color | `text-[var(--foreground)]` |
| Muted text | `text-[var(--muted)]` |
| Border/divider | `border-[var(--divider)]` |
| Surface (cards) | `bg-[var(--surface)]` |
| Accent (buttons) | `bg-[var(--accent)]` |
| Rounded small | `rounded-[var(--radius-sm)]` |
| Rounded medium | `rounded-[var(--radius-md)]` |
| Rounded pill | `rounded-[var(--radius-full)]` |
| Fast transition | `duration-[var(--motion-fast)]` |
| Base transition | `duration-[var(--motion-base)]` |
| Touch target | `min-h-[44px] min-w-[44px]` |

---

## Adding New Components

When creating new components:

1. **Use tokens** - Never hardcode colors, spacing, or timing
2. **44px touch targets** - All interactive elements
3. **ARIA labels** - For icon buttons and form inputs
4. **Transitions** - Use motion tokens, animate opacity/transform only
5. **Dark mode** - Tokens handle it; avoid hardcoded colors
6. **Max widths** - Constrain content with `max-w-2xl mx-auto`
7. **Grouped lists** - Use the established pattern for metadata/settings
