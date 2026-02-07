"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMenuOpened, trackChatOpened } from "@/lib/analytics";
import { useSession } from "@/context/session-context";

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

export type SidebarTab = "chat" | "feedback";

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

  // Sidebar tab control
  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;
  openFeedback: () => void;

  // Chat context (verse data)
  chatContext: PageContext | null;
  setChatContext: (context: PageContext | null) => void;

  // Current displayed image (for syncing hero image with details)
  currentImageId: string | null;
  setCurrentImageId: (id: string | null) => void;

  // Mobile image controls sheet
  isImageControlsOpen: boolean;
  openImageControls: () => void;
  closeImageControls: () => void;

  // Mobile header settings menu
  isHeaderMenuOpen: boolean;
  openHeaderMenu: () => void;
  closeHeaderMenu: () => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { tier, credits, isLoading } = useSession();
  const previousPathnameRef = useRef(pathname);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("chat");
  const [chatContext, setChatContext] = useState<PageContext | null>(null);
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [isImageControlsOpen, setIsImageControlsOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  // Track previous states for analytics
  const prevMenuOpenRef = useRef(false);
  const prevChatOpenRef = useRef(false);

  // Track menu_opened event
  useEffect(() => {
    if (isLoading) return;
    if (isMenuOpen && !prevMenuOpenRef.current) {
      trackMenuOpened({ tier, hasCredits: credits > 0 });
    }
    prevMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen, tier, credits, isLoading]);

  // Track chat_opened event
  useEffect(() => {
    if (isLoading) return;
    if (isChatOpen && !prevChatOpenRef.current) {
      trackChatOpened({
        variant: "sidebar",
        hasContext: chatContext !== null,
        tier,
        hasCredits: credits > 0,
      });
    }
    prevChatOpenRef.current = isChatOpen;
  }, [isChatOpen, chatContext, tier, credits, isLoading]);

  // Close overlays on route change (except chat - users may want to continue conversations)
  // This is a legitimate use of useEffect for UI synchronization with router state
  useEffect(() => {
    // Skip initial mount by checking if pathname actually changed
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      /* eslint-disable react-hooks/set-state-in-effect -- closing UI on route change is valid */
      setIsMenuOpen(false);
      setIsImageControlsOpen(false);
      setIsHeaderMenuOpen(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [pathname]);

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

  const openChat = useCallback(() => {
    setSidebarTab("chat");
    setIsChatOpen(true);
    setIsMenuOpen(false);
    setIsImageControlsOpen(false);
    setIsHeaderMenuOpen(false);
  }, []);

  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const toggleChat = useCallback(() => {
    setIsChatOpen((prev) => {
      if (!prev) {
        // Opening chat - close other overlays
        setIsMenuOpen(false);
        setIsImageControlsOpen(false);
        setIsHeaderMenuOpen(false);
      }
      return !prev;
    });
  }, []);

  const openFeedback = useCallback(() => {
    setSidebarTab("feedback");
    setIsChatOpen(true);
    setIsMenuOpen(false);
    setIsImageControlsOpen(false);
    setIsHeaderMenuOpen(false);
  }, []);

  const updateChatContext = useCallback((context: PageContext | null) => {
    setChatContext(context);
  }, []);

  const openImageControls = useCallback(() => {
    setIsImageControlsOpen(true);
    setIsHeaderMenuOpen(false);
    // Note: Don't close chat/menu - image controls is a quick action
  }, []);
  const closeImageControls = useCallback(() => setIsImageControlsOpen(false), []);

  const openHeaderMenu = useCallback(() => {
    setIsHeaderMenuOpen(true);
    setIsImageControlsOpen(false);
    // Note: Don't close chat/menu - header menu is for settings
  }, []);
  const closeHeaderMenu = useCallback(() => setIsHeaderMenuOpen(false), []);

  return (
    <NavigationContext.Provider
      value={{
        // Book menu
        isMenuOpen,
        openMenu: () => {
          setIsMenuOpen(true);
          setIsChatOpen(false);
          setIsImageControlsOpen(false);
          setIsHeaderMenuOpen(false);
        },
        closeMenu: () => setIsMenuOpen(false),
        toggleMenu: () => {
          setIsMenuOpen((prev) => {
            if (!prev) {
              // Opening menu - close other overlays
              setIsChatOpen(false);
              setIsImageControlsOpen(false);
              setIsHeaderMenuOpen(false);
            }
            return !prev;
          });
        },

        // Chat sidebar
        isChatOpen,
        openChat,
        closeChat,
        toggleChat,

        // Sidebar tab control
        sidebarTab,
        setSidebarTab,
        openFeedback,

        // Chat context
        chatContext,
        setChatContext: updateChatContext,

        // Current image
        currentImageId,
        setCurrentImageId,

        // Mobile image controls sheet
        isImageControlsOpen,
        openImageControls,
        closeImageControls,

        // Mobile header settings menu
        isHeaderMenuOpen,
        openHeaderMenu,
        closeHeaderMenu,
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
