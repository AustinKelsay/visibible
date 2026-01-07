# Preferences Implementation Guide

This document describes how user preferences (translation, image model, chat model) are managed and persisted.

---

## Entry Points

- `src/context/preferences-context.tsx` - PreferencesProvider and usePreferences hook
- `src/lib/get-translation.ts` - Server-side translation reading from cookies
- `src/app/layout.tsx` - Provider mounting

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    PreferencesProvider                        │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │  │
│  │  │translation │ │ imageModel │ │ chatModel  │ │imageAspect │ │  │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ │ Ratio      │ │  │
│  │        │              │              │        └─────┬──────┘ │  │
│  │        │              │              │  ┌────────────┐       │  │
│  │        │              │              │  │imageResolu │       │  │
│  │        │              │              │  │tion        │       │  │
│  │        │              │              │  └─────┬──────┘       │  │
│  │        ▼              ▼              ▼        ▼              │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │              localStorage (visibible-preferences)       │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  │          │                   │                   │           │  │
│  │          ▼                   ▼                   ▼           │  │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐│  │
│  │  │Cookie:       │  │Cookie:           │  │Cookie:           ││  │
│  │  │visibible-    │  │visibible-image-  │  │visibible-chat-   ││  │
│  │  │translation   │  │model             │  │model             ││  │
│  │  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘│  │
│  └─────────┼───────────────────┼─────────────────────┼──────────┘  │
│            │                   │                     │             │
└────────────┼───────────────────┼─────────────────────┼─────────────┘
             │                   │                     │
             ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           Server (SSR)                              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  getTranslationFromCookies() reads cookie for verse pages      │ │
│  │  Image/chat model cookies available for future SSR needs       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Storage Strategy

Preferences are stored in two places for different use cases:

### localStorage

```typescript
const STORAGE_KEY = "visibible-preferences";
// Stored as JSON: { translation, imageModel, chatModel, imageAspectRatio, imageResolution }
```

- **Purpose:** Client-side persistence across sessions
- **Content:** All five preferences as JSON object
- **Lifetime:** Permanent until cleared

**Note:** `imageAspectRatio` and `imageResolution` are stored in localStorage only (no cookies) because they are client-side only settings that don't need server-side reading.

### Cookies

| Cookie Name | Purpose | Max Age |
|-------------|---------|---------|
| `visibible-translation` | SSR translation selection | 1 year |
| `visibible-image-model` | SSR image model (future) | 1 year |
| `visibible-chat-model` | SSR chat model (future) | 1 year |

- **Purpose:** Server-side reading for SSR
- **Configuration:** `path=/`, `SameSite=Lax`
- Model cookies are URL-encoded due to potential special characters

---

## Default Values

| Preference | Default | Source |
|------------|---------|--------|
| translation | `web` | `src/lib/bible-api.ts` |
| imageModel | `google/gemini-2.5-flash-image` | `src/lib/image-models.ts` |
| chatModel | `openai/gpt-oss-120b` | `src/lib/chat-models.ts` |
| imageAspectRatio | `16:9` | `src/lib/image-models.ts` |
| imageResolution | `1K` | `src/lib/image-models.ts` |

---

## PreferencesProvider

**File:** `src/context/preferences-context.tsx`

Wraps the app in `src/app/layout.tsx` to provide preferences state globally.

### Context Interface

```typescript
interface PreferencesContextType {
  translation: Translation;
  setTranslation: (translation: Translation) => void;
  translationInfo: typeof TRANSLATIONS[Translation];
  imageModel: string;
  setImageModel: (model: string) => void;
  imageAspectRatio: ImageAspectRatio;
  setImageAspectRatio: (ratio: ImageAspectRatio) => void;
  imageResolution: ImageResolution;
  setImageResolution: (resolution: ImageResolution) => void;
  chatModel: string;
  setChatModel: (model: string) => void;
}

// Image settings types (from src/lib/image-models.ts)
type ImageAspectRatio = "16:9" | "21:9" | "3:2";
type ImageResolution = "1K" | "2K" | "4K";
```

### Hydration Handling

The provider tracks hydration state to prevent SSR/client mismatch:

```typescript
const [isHydrated, setIsHydrated] = useState(false);

// On mount, load from localStorage
useEffect(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const prefs = JSON.parse(stored);
    // Apply stored preferences...
  }
  setIsHydrated(true);
}, []);

// Return defaults until hydrated
return {
  translation: isHydrated ? translation : DEFAULT_TRANSLATION,
  // ...
};
```

---

## usePreferences Hook

```typescript
import { usePreferences } from "@/context/preferences-context";

function MyComponent() {
  const {
    translation,         // Current translation key
    setTranslation,      // Change translation (triggers page refresh)
    translationInfo,     // { name, abbreviation, textDirection, language }
    imageModel,          // Current image model ID
    setImageModel,       // Change image model (triggers page refresh)
    imageAspectRatio,    // Current aspect ratio ("16:9" | "21:9" | "3:2")
    setImageAspectRatio, // Change aspect ratio (no refresh)
    imageResolution,     // Current resolution ("1K" | "2K" | "4K")
    setImageResolution,  // Change resolution (no refresh)
    chatModel,           // Current chat model ID
    setChatModel,        // Change chat model (no refresh)
  } = usePreferences();
}
```

### Setter Behavior

| Setter | Side Effects |
|--------|--------------|
| `setTranslation()` | Updates state, localStorage, cookie, calls `router.refresh()` |
| `setImageModel()` | Updates state, localStorage, cookie, calls `router.refresh()` |
| `setImageAspectRatio()` | Updates state, localStorage only (no refresh) |
| `setImageResolution()` | Updates state, localStorage only (no refresh) |
| `setChatModel()` | Updates state, localStorage, cookie (no refresh) |

Translation and image model changes trigger `router.refresh()` because they affect server-rendered content. Chat model, aspect ratio, and resolution changes take effect on the next action without needing a refresh.

---

## Server-Side Translation Reading

**File:** `src/lib/get-translation.ts`

```typescript
export async function getTranslationFromCookies(): Promise<Translation> {
  const cookieStore = await cookies();
  const translationCookie = cookieStore.get("visibible-translation");

  if (translationCookie?.value &&
      Object.prototype.hasOwnProperty.call(TRANSLATIONS, translationCookie.value)) {
    return translationCookie.value as Translation;
  }

  return DEFAULT_TRANSLATION;
}
```

Used by verse pages to fetch content in the user's preferred translation:

```typescript
// In [book]/[chapter]/[verse]/page.tsx
const translation = await getTranslationFromCookies();
const verseData = await getVerse(book, chapter, verse, translation);
```

---

## UI Components Using Preferences

| Component | Preference Used | Location |
|-----------|----------------|----------|
| `TranslationSelector` | `translation`, `setTranslation` | Header, settings |
| `ImageModelSelector` | `imageModel`, `setImageModel` | Header |
| `ChatModelSelector` | `chatModel`, `setChatModel` | Chat input area |
| `AspectRatioSelector` | `imageAspectRatio`, `setImageAspectRatio` | HeroImage control dock |
| `ResolutionSelector` | `imageResolution`, `setImageResolution` | HeroImage control dock |

**Note:** `AspectRatioSelector` and `ResolutionSelector` are defined inline in `src/components/hero-image.tsx` rather than as separate component files.

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/context/preferences-context.tsx` | Provider and hook |
| `src/lib/get-translation.ts` | Server-side cookie reading |
| `src/lib/bible-api.ts` | `DEFAULT_TRANSLATION`, `TRANSLATIONS` |
| `src/lib/image-models.ts` | `DEFAULT_IMAGE_MODEL`, `DEFAULT_ASPECT_RATIO`, `DEFAULT_RESOLUTION`, types, validators |
| `src/lib/chat-models.ts` | `DEFAULT_CHAT_MODEL` |
| `src/app/layout.tsx` | Provider mounting |
| `src/components/hero-image.tsx` | `AspectRatioSelector`, `ResolutionSelector` components |
