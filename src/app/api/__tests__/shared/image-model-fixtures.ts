import { normalizeImageBilling } from "@/lib/image-catalog";
import type { ImageModel } from "@/lib/image-models";

// Synthetic per-token rates: these exercise the production adapter, not a second calculator.
export function imageModelFixture(id = "google/gemini-3.1-flash-lite-image", imageOutput = "0.00001"): ImageModel {
  return { id, name: id, provider: "Google", availability: "available",
    billing: normalizeImageBilling(id, { prompt: "0", completion: "0", image_output: imageOutput }, 1),
  };
}
