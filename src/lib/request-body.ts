/**
 * Secure request body utilities with size limits.
 *
 * These utilities protect against memory exhaustion attacks by enforcing
 * actual byte limits during body reading, not just trusting Content-Length.
 * This handles both Content-Length and chunked transfer encoding.
 */

/**
 * Error thrown when request body exceeds size limit.
 */
export class PayloadTooLargeError extends Error {
  public readonly maxSize: number;

  constructor(maxSize: number) {
    super(`Request body exceeds maximum size of ${maxSize} bytes`);
    this.name = "PayloadTooLargeError";
    this.maxSize = maxSize;
  }
}

/**
 * Error thrown when request body is not valid JSON.
 */
export class InvalidJsonError extends Error {
  constructor(message: string = "Invalid JSON in request body") {
    super(message);
    this.name = "InvalidJsonError";
  }
}

/**
 * Safely read request body as JSON with an enforced size limit.
 *
 * Unlike req.json(), this function:
 * - Enforces actual byte limits during streaming (not just Content-Length)
 * - Handles chunked transfer encoding safely
 * - Aborts reading as soon as limit is exceeded (doesn't buffer entire body first)
 *
 * @param req - The Request object
 * @param maxSize - Maximum body size in bytes (default 100KB)
 * @returns Parsed JSON body
 * @throws PayloadTooLargeError if body exceeds maxSize
 * @throws InvalidJsonError if body is not valid JSON
 * @throws Error if body is missing or unreadable
 *
 * @example
 * ```typescript
 * try {
 *   const body = await readJsonBodyWithLimit(req, 100_000);
 *   // Use body...
 * } catch (error) {
 *   if (error instanceof PayloadTooLargeError) {
 *     return Response.json({ error: "Payload too large" }, { status: 413 });
 *   }
 *   if (error instanceof InvalidJsonError) {
 *     return Response.json({ error: "Invalid JSON" }, { status: 400 });
 *   }
 *   throw error;
 * }
 * ```
 */
export async function readJsonBodyWithLimit<T = unknown>(
  req: Request,
  maxSize: number = 100_000
): Promise<T> {
  const reader = req.body?.getReader();
  if (!reader) {
    throw new Error("Request body is missing or not readable");
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;

      // SECURITY: Abort immediately when limit exceeded
      // Don't buffer more data than necessary
      if (totalSize > maxSize) {
        // Cancel the stream to stop reading
        await reader.cancel("Body too large");
        throw new PayloadTooLargeError(maxSize);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Handle empty body
  if (totalSize === 0) {
    throw new InvalidJsonError("Request body is empty");
  }

  // Combine chunks into single buffer
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode and parse JSON
  const text = new TextDecoder().decode(combined);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new InvalidJsonError("Request body is not valid JSON");
  }
}

/**
 * Default maximum body size for API routes (100KB).
 * This is generous for JSON payloads while protecting against abuse.
 */
export const DEFAULT_MAX_BODY_SIZE = 100_000;
