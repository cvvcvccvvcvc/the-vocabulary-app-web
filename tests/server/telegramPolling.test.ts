import { describe, expect, it, vi } from "vitest";
import {
  createTelegramApiRequest,
  pollTelegramUpdatesOnce,
  type TelegramApiRequest,
} from "../../src/server/telegramPolling.js";

describe("Telegram long polling", () => {
  it("turns start updates into Bot API sendMessage requests and advances the offset", async () => {
    const calls: Array<{ method: string; parameters: Record<string, unknown> }> = [];
    const request: TelegramApiRequest = vi.fn(async (method, parameters) => {
      calls.push({ method, parameters });
      if (method === "getUpdates") {
        return [
          { update_id: 10, message: { text: "hello", chat: { id: 42, type: "private" } } },
          { update_id: 11, message: { text: "/start", chat: { id: 42, type: "private" } } },
        ];
      }
      return { message_id: 1 };
    });

    const nextOffset = await pollTelegramUpdatesOnce(
      request,
      "https://vocabulary.example",
      undefined,
      new AbortController().signal,
    );

    expect(nextOffset).toBe(12);
    expect(calls[0]).toEqual({
      method: "getUpdates",
      parameters: { timeout: 30, offset: undefined, allowed_updates: ["message"] },
    });
    expect(calls[1]).toMatchObject({
      method: "sendMessage",
      parameters: {
        chat_id: 42,
        reply_markup: {
          inline_keyboard: [
            [{ text: "Learn", web_app: { url: "https://vocabulary.example/?tab=learn" } }],
            [
              { text: "Add Word", web_app: { url: "https://vocabulary.example/?tab=add" } },
              { text: "Words", web_app: { url: "https://vocabulary.example/?tab=words" } },
            ],
          ],
        },
      },
    });
    expect(calls[1]?.parameters).not.toHaveProperty("method");
  });

  it("rejects unsuccessful or malformed Bot API responses without exposing the token", async () => {
    const failedFetch = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ ok: false, description: "Conflict: webhook is active" }),
      { status: 409, headers: { "content-type": "application/json" } },
    ));
    const request = createTelegramApiRequest("secret-token", failedFetch);

    await expect(request("getUpdates", {})).rejects.toThrow("Conflict: webhook is active");

    const invalidFetch = vi.fn<typeof fetch>(async () => new Response("not-json", { status: 502 }));
    const invalidRequest = createTelegramApiRequest("secret-token", invalidFetch);
    await expect(invalidRequest("getUpdates", {})).rejects.toThrow("HTTP 502");

    const leakingFetch = vi.fn<typeof fetch>(async () => {
      throw new Error("request to https://api.telegram.org/botsecret-token/getUpdates failed");
    });
    const safeRequest = createTelegramApiRequest("secret-token", leakingFetch);
    await expect(safeRequest("getUpdates", {})).rejects.toThrow("Bot API request failed");
    await expect(safeRequest("getUpdates", {})).rejects.not.toThrow("secret-token");
  });
});
