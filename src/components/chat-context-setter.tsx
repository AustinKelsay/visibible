"use client";

import { useEffect } from "react";
import { useNavigation, PageContext } from "@/context/navigation-context";

interface ChatContextSetterProps {
  context: PageContext;
}

/**
 * Client component that sets the chat context when mounted.
 * Use this in pages to provide verse/passage context to the chat sidebar.
 * Clears the context on unmount.
 */
export function ChatContextSetter({ context }: ChatContextSetterProps) {
  const { setChatContext } = useNavigation();

  useEffect(() => {
    setChatContext(context);
    return () => setChatContext(null);
  }, [context, setChatContext]);

  return null;
}
