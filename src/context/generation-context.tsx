"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import type {
  GenerationTriggerSource,
  PreferenceChangeSource,
} from "@/lib/analytics";
import type { ImageAspectRatio, ImageResolution } from "@/lib/image-models";

export interface GenerationState {
  canGenerate: boolean;
  isGenerating: boolean;
  pricingPending: boolean;
  effectiveCost: number;
  effectiveEta: number;
  showCreditsCost: boolean;
  generationPhaseLabel: string;
  // Settings state
  aspectRatio: ImageAspectRatio;
  resolution: ImageResolution;
  baseCost: number;
  displayBaseCost: number;
  displayCostByResolution?: Partial<Record<ImageResolution, number>>;
  scenePlannerCreditsCost: number;
  modelId: string;
}

const DEFAULT_STATE: GenerationState = {
  canGenerate: false,
  isGenerating: false,
  pricingPending: true,
  effectiveCost: 0,
  effectiveEta: 12,
  showCreditsCost: false,
  generationPhaseLabel: "Generating...",
  aspectRatio: "16:9",
  resolution: "1K",
  baseCost: 20,
  displayBaseCost: 20,
  displayCostByResolution: undefined,
  scenePlannerCreditsCost: 0,
  modelId: "",
};

interface GenerationContextType {
  /** Current generation state pushed by HeroImage */
  state: GenerationState;
  /** Whether a generate callback is registered (i.e. on a verse page) */
  isRegistered: boolean;
  /** Trigger generation from the header */
  generate: (source?: GenerationTriggerSource) => void;
  /** Buy credits callback */
  buyCredits: () => void;
  /** Settings change callbacks */
  setAspectRatio: (value: ImageAspectRatio, source?: PreferenceChangeSource) => void;
  setResolution: (value: ImageResolution, source?: PreferenceChangeSource) => void;
  /** Called by HeroImage to register its generate callback */
  registerGenerate: (cb: (source?: GenerationTriggerSource) => void) => void;
  /** Called by HeroImage to unregister on unmount */
  unregisterGenerate: () => void;
  /** Called by HeroImage to push state updates */
  updateState: (state: GenerationState) => void;
  /** Called by HeroImage to register buyCredits */
  registerBuyCredits: (cb: () => void) => void;
  /** Called by HeroImage to register settings callbacks */
  registerSettings: (cbs: {
    setAspectRatio: (value: ImageAspectRatio, source?: PreferenceChangeSource) => void;
    setResolution: (value: ImageResolution, source?: PreferenceChangeSource) => void;
  }) => void;
}

const GenerationContext = createContext<GenerationContextType | null>(null);

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GenerationState>(DEFAULT_STATE);
  const [isRegistered, setIsRegistered] = useState(false);

  const generateRef = useRef<((source?: GenerationTriggerSource) => void) | null>(null);
  const buyCreditsRef = useRef<(() => void) | null>(null);
  const settingsRef = useRef<{
    setAspectRatio: (value: ImageAspectRatio, source?: PreferenceChangeSource) => void;
    setResolution: (value: ImageResolution, source?: PreferenceChangeSource) => void;
  } | null>(null);

  const registerGenerate = useCallback((cb: (source?: GenerationTriggerSource) => void) => {
    generateRef.current = cb;
    setIsRegistered(true);
  }, []);

  const unregisterGenerate = useCallback(() => {
    generateRef.current = null;
    buyCreditsRef.current = null;
    settingsRef.current = null;
    setIsRegistered(false);
    setState(DEFAULT_STATE);
  }, []);

  const updateState = useCallback((newState: GenerationState) => {
    setState(newState);
  }, []);

  const generate = useCallback((source?: GenerationTriggerSource) => {
    generateRef.current?.(source);
  }, []);

  const buyCredits = useCallback(() => {
    buyCreditsRef.current?.();
  }, []);

  const registerBuyCredits = useCallback((cb: () => void) => {
    buyCreditsRef.current = cb;
  }, []);

  const registerSettings = useCallback((cbs: {
    setAspectRatio: (value: ImageAspectRatio, source?: PreferenceChangeSource) => void;
    setResolution: (value: ImageResolution, source?: PreferenceChangeSource) => void;
  }) => {
    settingsRef.current = cbs;
  }, []);

  const setAspectRatio = useCallback((value: ImageAspectRatio, source?: PreferenceChangeSource) => {
    settingsRef.current?.setAspectRatio(value, source);
  }, []);

  const setResolution = useCallback((value: ImageResolution, source?: PreferenceChangeSource) => {
    settingsRef.current?.setResolution(value, source);
  }, []);

  return (
    <GenerationContext.Provider
      value={{
        state,
        isRegistered,
        generate,
        buyCredits,
        setAspectRatio,
        setResolution,
        registerGenerate,
        unregisterGenerate,
        updateState,
        registerBuyCredits,
        registerSettings,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) {
    throw new Error("useGeneration must be used within GenerationProvider");
  }
  return context;
}
