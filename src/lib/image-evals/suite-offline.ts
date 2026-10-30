/**
 * A scripted OpenRouter for rehearsing the suite runner without spending: every look, plan, review, check and image
 * reply is synthetic. Rehearsals prove the mechanics (assembly, ledger, check and retry, files); their outputs are
 * never evidence.
 */
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export type OfflineOptions = {
  /** Moments whose plan request contains this text get two malformed plans, which stops their preparation. */
  malformedPlanFor?: string;
  /** The nth image call (from 1) fails with HTTP 503. */
  failImage?: number;
  /** Every nth checked image reports lettering, so it is retried. */
  letteringEvery?: number;
};

export function createOfflineOpenRouter(options: OfflineOptions = {}) {
  const counts = { text: 0, image: 0, check: 0 };
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    if (url !== "https://openrouter.ai/api/v1/chat/completions") throw new Error(`Offline rehearsal blocked unexpected network: ${url}`);
    const request = JSON.parse(String(init.body));
    const kind = request.response_format?.json_schema?.name as string | undefined;
    const user = JSON.stringify(request.messages ?? []);
    let payload: Record<string, unknown>;
    let status = 200;
    if (kind === "reference_check") {
      counts.check++;
      const image = Math.ceil(counts.check / 2);
      const lettering = Boolean(options.letteringEvery) && image % options.letteringEvery! === 0;
      // Answer exactly the fields the work's question asks for: its schema differs by depiction profile.
      const properties = (request.response_format.json_schema.schema?.properties ?? {}) as Record<string, { type?: string }>;
      const content = JSON.stringify(Object.fromEntries(Object.entries(properties).map(([field, spec]) =>
        [field, spec.type === "boolean" ? field === "lettering" && lettering : spec.type === "array" ? [] : "none"])));
      payload = { id: `k${counts.check}`, model: request.model, choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0003 } };
    } else if (kind) {
      counts.text++;
      const content = kind === "section_look"
        ? { place: "an open space", timeOfDay: "day", weather: "clear", light: "daylight", clothing: "plain clothing" }
        : kind === "plan_review"
          ? { problems: [] }
          : options.malformedPlanFor && user.includes(options.malformedPlanFor) ? { malformed: true }
          : { focusQuote: "a few words", instant: "A subject remains still.", selectedCast: [], primarySubject: "A subject", action: "remains still", setting: "an open space",
            secondaryElements: "", mood: "quiet", timeOfDay: "day", composition: "one view" };
      payload = { id: `t${counts.text}`, model: request.model, choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0004 } };
    } else {
      counts.image++;
      if (options.failImage === counts.image) status = 503;
      payload = { id: `i${counts.image}`, choices: [{ message: { content: "", images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG}` } }] } }], usage: { cost: 0.0342 } };
    }
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, counts };
}
