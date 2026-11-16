"use client";

import { ChatModelSelector } from "@/components/chat-model-selector";
import { AdvancedItem } from "@/components/spread/advanced/item";
import { useSession } from "@/context/session-context";
import { offerAdvancedSettings, setAdvancedSetting, useAdvancedSettings } from "@/lib/advanced-settings";
import { trackPreferenceChanged } from "@/lib/analytics";

// This item lets the reader change it; without it Ask uses the default model.
offerAdvancedSettings("answeringModel");

/** The model that answers Ask. The next question is quoted and answered with it. */
export function AnsweringModelItem() {
  const { answeringModel } = useAdvancedSettings();
  const { tier, credits } = useSession();

  return (
    <AdvancedItem title="Answering model">
      <ChatModelSelector
        variant="inline"
        value={answeringModel}
        onChange={(model) => {
          setAdvancedSetting("answeringModel", model);
          trackPreferenceChanged({ preference: "chatModel", value: model, source: "advanced", tier, hasCredits: credits > 0 });
        }}
      />
    </AdvancedItem>
  );
}
