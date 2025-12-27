"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";

// Chat context type for verse data
type VerseContext = {
  number: number;
  text: string;
  reference?: string;
};

export type PageContext = {
  book?: string;
  chapter?: number;
  verseRange?: string;
  heroCaption?: string;
  imageTitle?: string;
  verses?: Array<{ number?: number; text?: string }>;
  prevVerse?: VerseContext;
  nextVerse?: VerseContext;
};

interface NavigationContextType {
  // Book menu
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;

  // Chat sidebar
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;

  // Chat context (verse data)
  chatContext: PageContext | null;
  setChatContext: (context: PageContext | null) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<PageContext | null>(null);

  // Close chat on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isChatOpen) {
        setIsChatOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isChatOpen]);

  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);

  const updateChatContext = useCallback((context: PageContext | null) => {
    setChatContext(context);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        // Book menu
        isMenuOpen,
        openMenu: () => setIsMenuOpen(true),
        closeMenu: () => setIsMenuOpen(false),
        toggleMenu: () => setIsMenuOpen((prev) => !prev),

        // Chat sidebar
        isChatOpen,
        openChat,
        closeChat,
        toggleChat,

        // Chat context
        chatContext,
        setChatContext: updateChatContext,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}
