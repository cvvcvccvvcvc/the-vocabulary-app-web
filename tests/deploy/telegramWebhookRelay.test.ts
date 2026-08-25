import { describe, expect, it, vi } from "vitest";
import {
  dispatchTelegramReminders,
  relayTelegramWebhook,
} from "../../deploy/telegram-webhook-relay/worker.js";

const environment = {
  ORIGIN_WEBHOOK_URL: "https://vocabulary.example/api/telegram/webhook",
  ORIGIN_REMINDER_API_URL: "https://vocabulary.example/api/internal/telegram-reminders/",
  TELEGRAM_BOT_TOKEN: "123456:test-token",
  TELEGRAM_REMINDER_DISPATCH_SECRET: "reminder-secret",
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

describe("Telegram reminder dispatch", () => {
  it("claims reminders, sends them through Telegram, and reports success", async () => {
    const request = {
      method: "sendMessage",
      chat_id: "1001",
      text: "К повторению готовы 6 карточек.",
    };
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/claim")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer reminder-secret");
        return Response.json({ reminders: [{ eventId: "event-1", request }] });
      }
      if (url.includes("api.telegram.org")) {
        expect(url).toBe("https://api.telegram.org/bot123456:test-token/sendMessage");
        await expect(new Response(init?.body).json()).resolves.toEqual({
          chat_id: "1001",
          text: "К повторению готовы 6 карточек.",
        });
        return Response.json({ ok: true, result: { message_id: 42 } });
      }
      if (url.endsWith("/complete")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer reminder-secret");
        await expect(new Response(init?.body).json()).resolves.toEqual({
          results: [{ eventId: "event-1", ok: true, errorCode: null }],
        });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(dispatchTelegramReminders(environment, fetchImplementation)).resolves.toEqual({
      claimed: 1,
      sent: 1,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("reports Telegram rejection without retrying the reminder", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/claim")) {
        return Response.json({
          reminders: [{
            eventId: "event-2",
            request: { method: "sendMessage", chat_id: "1001", text: "Reminder" },
          }],
        });
      }
      if (url.includes("api.telegram.org")) {
        return Response.json({ ok: false, error_code: 403 }, { status: 403 });
      }
      await expect(new Response(init?.body).json()).resolves.toEqual({
        results: [{ eventId: "event-2", ok: false, errorCode: 403 }],
      });
      return new Response(null, { status: 204 });
    });

    await expect(dispatchTelegramReminders(environment, fetchImplementation)).resolves.toEqual({
      claimed: 1,
      sent: 0,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("does nothing when reminder secrets are not configured", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(dispatchTelegramReminders(
      { ...environment, TELEGRAM_BOT_TOKEN: "" },
      fetchImplementation,
    )).resolves.toEqual({ claimed: 0, sent: 0 });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
