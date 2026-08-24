import { describe, expect, it, vi } from "vitest";
import { relayTelegramWebhook } from "../../deploy/telegram-webhook-relay/worker.js";

const environment = {
  ORIGIN_WEBHOOK_URL: "https://vocabulary.example/api/telegram/webhook",
  TELEGRAM_WEBHOOK_SECRET: "expected-secret",
};

function telegramRequest(path = "/telegram", secret = "expected-secret"): Request {
  return new Request(`https://relay.example${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer must-not-be-forwarded",
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({ update_id: 42 }),
  });
}

describe("Telegram webhook relay", () => {
  it("accepts only the configured path and a matching Telegram secret", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    const wrongPath = await relayTelegramWebhook(
      telegramRequest("/other"),
      environment,
      fetchImplementation,
    );
    const wrongSecret = await relayTelegramWebhook(
      telegramRequest("/telegram", "wrong-secret"),
      environment,
      fetchImplementation,
    );
    const wrongMethod = await relayTelegramWebhook(
      new Request("https://relay.example/telegram"),
      environment,
      fetchImplementation,
    );

    expect(wrongPath.status).toBe(404);
    expect(wrongSecret.status).toBe(401);
    expect(wrongMethod.status).toBe(404);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("forwards only the Telegram payload and secret to the fixed HTTPS origin", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(environment.ORIGIN_WEBHOOK_URL);
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");

      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-telegram-bot-api-secret-token")).toBe("expected-secret");
      expect(headers.has("authorization")).toBe(false);
      await expect(new Response(init?.body).json()).resolves.toEqual({ update_id: 42 });

      return new Response(JSON.stringify({ method: "sendMessage" }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": "must-not-be-forwarded=true",
          "x-origin-header": "must-not-be-forwarded",
        },
      });
    });

    const response = await relayTelegramWebhook(
      telegramRequest(),
      environment,
      fetchImplementation,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.has("x-origin-header")).toBe(false);
    await expect(response.json()).resolves.toEqual({ method: "sendMessage" });
  });

  it("fails closed for invalid origin configuration and origin network errors", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      throw new Error("origin unavailable");
    });

    const invalidOrigin = await relayTelegramWebhook(
      telegramRequest(),
      { ...environment, ORIGIN_WEBHOOK_URL: "http://vocabulary.example/webhook" },
      fetchImplementation,
    );
    const unavailableOrigin = await relayTelegramWebhook(
      telegramRequest(),
      environment,
      fetchImplementation,
    );

    expect(invalidOrigin.status).toBe(500);
    expect(unavailableOrigin.status).toBe(502);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
