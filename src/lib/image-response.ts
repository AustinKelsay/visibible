/**
 * Reading OpenRouter image responses (the generic engine and the evaluation adapters, #175):
 * where the image lands in a chat completion, what the model said when it returned none, and
 * where the usage cost sits. Pure functions; the engine and the harness decide what to do with them.
 */

/** Collapse whitespace and cut to at most `maxChars`, ending with an ellipsis when cut. */
function clipText(value: string, maxChars: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildInlineImageDataUrl(part: unknown): string | null {
  if (!isRecord(part)) return null;

  const inlineData = isRecord(part.inline_data)
    ? part.inline_data
    : isRecord(part.inlineData)
      ? part.inlineData
      : null;

  if (!inlineData) return null;

  const data = getNonEmptyString(inlineData.data);
  if (!data) return null;

  const mimeType = getNonEmptyString(inlineData.mime_type)
    ?? getNonEmptyString(inlineData.mimeType)
    ?? "image/png";

  return `data:${mimeType};base64,${data}`;
}

export function extractImageUrlFromPart(part: unknown): string | null {
  if (typeof part === "string") {
    return part.startsWith("data:image/") ? part : null;
  }

  if (!isRecord(part)) return null;

  const directUrl = getNonEmptyString(part.url);
  if (directUrl) return directUrl;

  const directImageUrl = getNonEmptyString(part.image_url)
    ?? getNonEmptyString(part.imageUrl);
  if (directImageUrl) return directImageUrl;

  const nestedImageUrl = isRecord(part.image_url)
    ? part.image_url
    : isRecord(part.imageUrl)
      ? part.imageUrl
      : null;
  if (nestedImageUrl) {
    const nestedUrl = getNonEmptyString(nestedImageUrl.url);
    if (nestedUrl) return nestedUrl;
  }

  const inlineDataUrl = buildInlineImageDataUrl(part);
  if (inlineDataUrl) return inlineDataUrl;

  const b64Json = getNonEmptyString(part.b64_json);
  if (b64Json) {
    return `data:image/png;base64,${b64Json}`;
  }

  return null;
}

export function extractNoImageText(message: unknown): string | null {
  if (!isRecord(message)) return null;

  const messageContent = getNonEmptyString(message.content);
  if (messageContent) return clipText(messageContent, 180);

  const refusal = getNonEmptyString(message.refusal);
  if (refusal) return clipText(refusal, 180);

  if (!Array.isArray(message.content)) return null;

  for (const part of message.content) {
    if (!isRecord(part)) continue;

    const text = getNonEmptyString(part.text)
      ?? getNonEmptyString(part.refusal)
      ?? getNonEmptyString(part.content);

    if (text) return clipText(text, 180);
  }

  return null;
}

export function summarizeNoImageResponse(data: unknown): Record<string, unknown> {
  if (!isRecord(data)) {
    return { responseType: typeof data };
  }

  const choices = Array.isArray(data.choices) ? data.choices : [];

  return {
    id: getNonEmptyString(data.id),
    choiceCount: choices.length,
    choices: choices.slice(0, 2).map((choice) => {
      if (!isRecord(choice)) {
        return { choiceType: typeof choice };
      }

      const message = isRecord(choice.message) ? choice.message : null;
      const content = message?.content;

      return {
        finishReason: getNonEmptyString(choice.finish_reason),
        messageKeys: message ? Object.keys(message).slice(0, 8) : [],
        imagesCount: Array.isArray(message?.images) ? message.images.length : 0,
        contentType: Array.isArray(content) ? "array" : typeof content,
        contentPartTypes: Array.isArray(content)
          ? content.slice(0, 8).map((part) =>
              isRecord(part) ? getNonEmptyString(part.type) ?? "unknown" : typeof part
            )
          : [],
        textPreview: extractNoImageText(message),
      };
    }),
  };
}

/** The first image in a chat completion's message, from `images` first and content parts second. */
export function findResponseImageUrl(message: unknown): string | null {
  if (!isRecord(message)) return null;
  if (Array.isArray(message.images)) {
    for (const image of message.images) {
      const url = extractImageUrlFromPart(image);
      if (url) return url;
    }
  }
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      const url = extractImageUrlFromPart(part);
      if (url) return url;
    }
  }
  return null;
}

/**
 * The actual provider cost OpenRouter reports, checked in the known locations in priority order:
 * usage.cost, usage.total_cost, then the root-level cost and total_cost. Null when none is positive.
 */
export function extractOpenRouterUsageUsd(data: unknown): number | null {
  if (!isRecord(data)) return null;
  const usage = isRecord(data.usage) ? data.usage : null;
  for (const candidate of [usage?.cost, usage?.total_cost, data.cost, data.total_cost]) {
    if (typeof candidate === "number" && candidate > 0) return candidate;
  }
  return null;
}
