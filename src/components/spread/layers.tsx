"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Everything that opens over a spread: Look, Contents, the corner menu, the picture menu, the turned-over
 * words page (Ask) and the whole-picture view. One is open at a time; opening another replaces it. None is
 * a browser history entry. Escape closes the open one and focus returns to the control that opened it.
 */
export type LayerId = "look" | "contents" | "corner" | "picture" | "ask" | "whole-picture" | (string & {});

interface LayerState {
  /** The open layer, or null when the spread shows only the page. */
  openLayer: LayerId | null;
  /** Open a layer. Focus returns to `opener` (default: the focused element) when it closes. */
  openLayerById: (id: LayerId, opener?: HTMLElement | null) => void;
  /** Close the open layer (or only `id`, when given and open) and return focus to its opener. */
  closeLayer: (id?: LayerId) => void;
}

const LayerContext = createContext<LayerState | null>(null);

export function LayerProvider({ children }: { children: ReactNode }) {
  const [openLayer, setOpenLayer] = useState<LayerId | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const openLayerById = useCallback((id: LayerId, from?: HTMLElement | null) => {
    const active = typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null);
    opener.current = from ?? active;
    setOpenLayer(id);
  }, []);

  const closeLayer = useCallback((id?: LayerId) => {
    setOpenLayer((current) => {
      if (current === null || (id !== undefined && id !== current)) return current;
      const target = opener.current;
      opener.current = null;
      if (target) queueMicrotask(() => target.isConnected && target.focus());
      return null;
    });
  }, []);

  useEffect(() => {
    if (openLayer === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeLayer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openLayer, closeLayer]);

  const value = useMemo(() => ({ openLayer, openLayerById, closeLayer }), [openLayer, openLayerById, closeLayer]);
  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>;
}

/** The spread's layer state. Outside a LayerProvider every layer is closed and opening does nothing. */
export function useLayers(): LayerState {
  return useContext(LayerContext) ?? CLOSED;
}

/** Whether `id` is open, and functions to open, close or toggle it. */
export function useLayer(id: LayerId) {
  const { openLayer, openLayerById, closeLayer } = useLayers();
  const isOpen = openLayer === id;
  const open = useCallback((opener?: HTMLElement | null) => openLayerById(id, opener), [id, openLayerById]);
  const close = useCallback(() => closeLayer(id), [id, closeLayer]);
  const toggle = useCallback((opener?: HTMLElement | null) => (isOpen ? close() : open(opener)), [isOpen, open, close]);
  return { isOpen, open, close, toggle };
}

const CLOSED: LayerState = { openLayer: null, openLayerById: () => {}, closeLayer: () => {} };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A panel for a layer: a labelled dialog that renders only while its layer is open, moves focus inside on
 * open and keeps Tab inside while open. Position and look come from `className`.
 */
export function LayerPanel({ id, label, className, children }: { id: LayerId; label: string; className?: string; children: ReactNode }) {
  const { isOpen } = useLayer(id);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const node = panel.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node;
    first.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
