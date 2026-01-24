/**
 * Unit tests for request body utilities with size limits.
 * Tests streaming body reader, size enforcement, and error handling.
 */

import { describe, it, expect } from "vitest";
import {
  readJsonBodyWithLimit,
  PayloadTooLargeError,
  InvalidJsonError,
  DEFAULT_MAX_BODY_SIZE,
} from "../request-body";

// Helper to create a mock Request with a ReadableStream body
function createMockRequest(body: string | Uint8Array[]): Request {
  let chunks: Uint8Array[];

  if (typeof body === "string") {
    chunks = [new TextEncoder().encode(body)];
  } else {
    chunks = body;
  }

  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index++;
      } else {
        controller.close();
      }
    },
  });

  return { body: stream } as Request;
}

// Helper to create a Request with no body
function createNoBodyRequest(): Request {
  return { body: null } as Request;
}

describe("PayloadTooLargeError", () => {
  it("should have correct name and message", () => {
    const error = new PayloadTooLargeError(1000);
    expect(error.name).toBe("PayloadTooLargeError");
    expect(error.message).toBe("Request body exceeds maximum size of 1000 bytes");
    expect(error.maxSize).toBe(1000);
  });

  it("should be instanceof Error", () => {
    const error = new PayloadTooLargeError(100);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof PayloadTooLargeError).toBe(true);
  });
});

describe("InvalidJsonError", () => {
  it("should have correct name and default message", () => {
    const error = new InvalidJsonError();
    expect(error.name).toBe("InvalidJsonError");
    expect(error.message).toBe("Invalid JSON in request body");
  });

  it("should accept custom message", () => {
    const error = new InvalidJsonError("Custom error message");
    expect(error.message).toBe("Custom error message");
  });

  it("should be instanceof Error", () => {
    const error = new InvalidJsonError();
    expect(error instanceof Error).toBe(true);
    expect(error instanceof InvalidJsonError).toBe(true);
  });
});

describe("readJsonBodyWithLimit", () => {
  it("should parse valid JSON within limit", async () => {
    const data = { hello: "world", number: 42 };
    const request = createMockRequest(JSON.stringify(data));
    const result = await readJsonBodyWithLimit(request, 1000);
    expect(result).toEqual(data);
  });

  it("should parse JSON exactly at limit", async () => {
    const body = JSON.stringify({ data: "x" });
    const request = createMockRequest(body);
    const result = await readJsonBodyWithLimit(request, body.length);
    expect(result).toEqual({ data: "x" });
  });

  it("should throw PayloadTooLargeError when exceeding limit", async () => {
    const body = JSON.stringify({ data: "x".repeat(1000) });
    const request = createMockRequest(body);

    await expect(readJsonBodyWithLimit(request, 100)).rejects.toThrow(PayloadTooLargeError);
  });

  it("should throw PayloadTooLargeError at maxSize + 1 bytes", async () => {
    const maxSize = 50;
    const body = "x".repeat(maxSize + 1);
    const request = createMockRequest(body);

    try {
      await readJsonBodyWithLimit(request, maxSize);
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadTooLargeError);
      expect((error as PayloadTooLargeError).maxSize).toBe(maxSize);
    }
  });

  it("should throw InvalidJsonError for empty body", async () => {
    const request = createMockRequest("");

    await expect(readJsonBodyWithLimit(request, 1000)).rejects.toThrow(InvalidJsonError);
  });

  it("should throw InvalidJsonError for non-JSON body", async () => {
    const request = createMockRequest("not valid json {{{");

    await expect(readJsonBodyWithLimit(request, 1000)).rejects.toThrow(InvalidJsonError);
  });

  it("should throw Error for missing body", async () => {
    const request = createNoBodyRequest();

    await expect(readJsonBodyWithLimit(request, 1000)).rejects.toThrow("Request body is missing or not readable");
  });

  it("should handle chunked body under limit", async () => {
    const chunk1 = new TextEncoder().encode('{"a":');
    const chunk2 = new TextEncoder().encode("1}");
    const request = createMockRequest([chunk1, chunk2]);

    const result = await readJsonBodyWithLimit(request, 100);
    expect(result).toEqual({ a: 1 });
  });

  it("should throw early for chunked body exceeding limit", async () => {
    // Create chunks that together exceed limit
    const chunk1 = new TextEncoder().encode("x".repeat(60));
    const chunk2 = new TextEncoder().encode("y".repeat(60));
    const request = createMockRequest([chunk1, chunk2]);

    await expect(readJsonBodyWithLimit(request, 100)).rejects.toThrow(PayloadTooLargeError);
  });

  it("should use default max body size", () => {
    expect(DEFAULT_MAX_BODY_SIZE).toBe(100_000);
  });

  it("should handle arrays", async () => {
    const data = [1, 2, 3, "test"];
    const request = createMockRequest(JSON.stringify(data));
    const result = await readJsonBodyWithLimit(request, 1000);
    expect(result).toEqual(data);
  });

  it("should handle nested objects", async () => {
    const data = {
      level1: {
        level2: {
          value: "deep",
        },
      },
    };
    const request = createMockRequest(JSON.stringify(data));
    const result = await readJsonBodyWithLimit(request, 1000);
    expect(result).toEqual(data);
  });

  it("should handle unicode content", async () => {
    const data = { emoji: "🎉", chinese: "中文", arabic: "العربية" };
    const request = createMockRequest(JSON.stringify(data));
    const result = await readJsonBodyWithLimit(request, 1000);
    expect(result).toEqual(data);
  });
});
