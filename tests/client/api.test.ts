import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../../src/client/lib/api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubResponse(body: string, status: number, contentType = "application/json") {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(body, {
        status,
        headers: { "content-type": contentType },
      }),
    ),
  );
}

describe("API errors", () => {
  it("preserves a valid server error", async () => {
    stubResponse(
      JSON.stringify({ error: { code: "operation_conflict", message: "Try again" } }),
      409,
    );

    await expect(api.configuration()).rejects.toEqual(
      new ApiError(409, "operation_conflict", "Try again"),
    );
  });

  it("uses a safe fallback for an invalid JSON error shape", async () => {
    stubResponse(JSON.stringify({ message: "Bad gateway" }), 502);

    await expect(api.configuration()).rejects.toEqual(
      new ApiError(502, "request_failed", "Request failed"),
    );
  });

  it("uses a safe fallback for a non-JSON error", async () => {
    stubResponse("Service unavailable", 503, "text/plain");

    await expect(api.configuration()).rejects.toEqual(
      new ApiError(503, "request_failed", "Request failed"),
    );
  });
});
