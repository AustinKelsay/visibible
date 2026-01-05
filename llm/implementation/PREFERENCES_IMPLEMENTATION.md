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
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │  │
│  │  │  translation   │  │   imageModel   │  │   chatModel    │  │  │
│  │  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  │  │
│  │          │                   │                   │           │  │
│  │          ▼                   ▼                   ▼           │  │
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
// Stored as JSON: { translation, imageModel, chatModel }
```

- **Purpose:** Client-side persistence across sessions
- **Content:** All three preferences as JSON object
- **Lifetime:** Permanent until cleared

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
  chatModel: string;
  setChatModel: (model: string) => void;
}
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
    translation,      // Current translation key
    setTranslation,   // Change translation (triggers page refresh)
    translationInfo,  // { name, abbreviation, textDirection, language }
    imageModel,       // Current image model ID
    setImageModel,    // Change image model (triggers page refresh)
    chatModel,        // Current chat model ID
    setChatModel,     // Change chat model (no refresh)
  } = usePreferences();
}
```

### Setter Behavior

| Setter | Side Effects |
|--------|--------------|
| `setTranslation()` | Updates state, localStorage, cookie, calls `router.refresh()` |
| `setImageModel()` | Updates state, localStorage, cookie, calls `router.refresh()` |
| `setChatModel()` | Updates state, localStorage, cookie (no refresh) |

Translation and image model changes trigger `router.refresh()` because they affect server-rendered content. Chat model changes take effect on the next message without needing a refresh.

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
| `TranslationSelector` | `translation`, `setTranslation` | Settings menu |
| `ImageModelSelector` | `imageModel`, `setImageModel` | Header, settings |
| `ChatModelSelector` | `chatModel`, `setChatModel` | Header, chat input |

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/context/preferences-context.tsx` | Provider and hook |
| `src/lib/get-translation.ts` | Server-side cookie reading |
| `src/lib/bible-api.ts` | `DEFAULT_TRANSLATION`, `TRANSLATIONS` |
| `src/lib/image-models.ts` | `DEFAULT_IMAGE_MODEL` |
| `src/lib/chat-models.ts` | `DEFAULT_CHAT_MODEL` |
| `src/app/layout.tsx` | Provider mounting |
