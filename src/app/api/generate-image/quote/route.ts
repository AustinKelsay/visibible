import { handleImageRequest } from "../handler";

export const dynamic = "force-dynamic";

/**
 * The estimate and maximum charge for one image (#60): the same checks, admission and assembly as generation, with no
 * request record, reservation or model call. The answer is `{ quote }`, or the refusal generation would give.
 */
export async function POST(request: Request) {
  return handleImageRequest(request, "quote");
}
