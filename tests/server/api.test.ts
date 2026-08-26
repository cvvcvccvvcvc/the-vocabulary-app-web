import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer, type BuiltServer } from "../../src/server/app.js";
import type { ServerConfig } from "../../src/server/config.js";
import { VocabularyRepository } from "../../src/server/repository.js";
import {
  telegramMenuReply,
  telegramReminderMessage,
  telegramWebhookSecret,
} from "../../src/server/telegramBot.js";
import type { VocabularyWord } from "../../src/domain/index.js";

const config: ServerConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  appOrigin: "http://127.0.0.1:5173",
  databasePath: ":memory:",
  sessionSecret: "test-session-secret-with-enough-entropy",
  telegramBotId: null,
  telegramBotToken: "123456:test-token",
  telegramStartPhotoFileId: "telegram-start-photo-file-id",
  telegramClientSecret: null,
  telegramReminderDispatchSecret: "test-reminder-dispatch-secret",
  developmentTelegramUserId: "1001",
  analyticsOwnerTelegramUserId: "1001",
};

describe("Vocabulary API", () => {
  let server: BuiltServer;
  let cookie: string;

  beforeEach(async () => {
    server = await buildServer(config);
    const login = await server.app.inject({ method: "POST", url: "/api/auth/development" });
    cookie = login.headers["set-cookie"]?.split(";")[0] ?? "";
  });

  afterEach(async () => {
    await server.app.close();
  });

  it("requires a session for user data", async () => {
    const response = await server.app.inject({ method: "GET", url: "/api/bootstrap" });
    expect(response.statusCode).toBe(401);
  });

  it("accepts an OIDC callback only from the browser that started the login", async () => {
    const authServer = await buildServer({
      ...config,
      telegramBotId: "123456",
      telegramClientSecret: "telegram-client-secret",
    });

    try {
      const start = await authServer.app.inject({
        method: "GET",
        url: "/api/auth/telegram/start",
      });
      const authorizationUrl = new URL(start.headers.location ?? "");
      const state = authorizationUrl.searchParams.get("state");
      const authFlowCookie = start.headers["set-cookie"]?.split(";")[0] ?? "";
      const callbackUrl = `/api/auth/telegram/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`;

      expect(start.statusCode).toBe(302);
      expect(state).not.toBeNull();
      expect(authFlowCookie).toContain("vocabulary_auth_flow=");

      const foreignBrowser = await authServer.app.inject({
        method: "GET",
        url: callbackUrl,
      });
      expect(foreignBrowser.statusCode).toBe(401);
      expect(foreignBrowser.json()).toMatchObject({
        error: { code: "invalid_telegram_data", message: "Login state is invalid or expired" },
      });

      const telegramFetch = vi.fn(async () => new Response(null, { status: 400 }));
      vi.stubGlobal("fetch", telegramFetch);
      const originalBrowser = await authServer.app.inject({
        method: "GET",
        url: callbackUrl,
        headers: { cookie: authFlowCookie },
      });

      expect(originalBrowser.statusCode).toBe(401);
      expect(originalBrowser.json()).toMatchObject({
        error: { code: "invalid_telegram_data", message: "Telegram login failed" },
      });
      expect(telegramFetch).toHaveBeenCalledOnce();

      const replay = await authServer.app.inject({
        method: "GET",
        url: callbackUrl,
        headers: { cookie: authFlowCookie },
      });
      expect(replay.statusCode).toBe(401);
      expect(telegramFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      await authServer.app.close();
    }
  });

  it("returns analytics only to the configured owner", async () => {
    const unauthorized = await server.app.inject({
      method: "GET",
      url: "/api/admin/analytics",
    });
    expect(unauthorized.statusCode).toBe(401);

    const repository = new VocabularyRepository(server.database.sqlite);
    const other = repository.ensureUser({
      telegramUserId: "2002",
      displayName: "Other",
      username: null,
      photoUrl: null,
    });
    const otherCookie = `vocabulary_session=${repository.createSession(other.id)}`;
    const forbidden = await server.app.inject({
      method: "GET",
      url: "/api/admin/analytics",
      headers: { cookie: otherCookie },
    });
    expect(forbidden.statusCode).toBe(404);

    const owner = await server.app.inject({
      method: "GET",
      url: "/api/admin/analytics",
      headers: { cookie },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json<{ summary: { totalUsers: number } }>().summary.totalUsers).toBe(2);
  });

  it("returns the Mini App navigation menu for Telegram start and help commands", async () => {
    const secret = telegramWebhookSecret(config.telegramBotToken ?? "");
    const headers = { "x-telegram-bot-api-secret-token": secret };

    const unauthorized = await server.app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      payload: { message: { text: "/start", chat: { id: 42, type: "private" } } },
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await server.app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers,
      payload: { message: { text: "/start", chat: { id: 42, type: "private" } } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      method: "sendPhoto",
      chat_id: 42,
      photo: "telegram-start-photo-file-id",
      caption: "Save words, review them, and build your vocabulary.\n\nChoose where to start:",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Learn", web_app: { url: "http://127.0.0.1:5173/?tab=learn" } }],
          [
            { text: "Add Word", web_app: { url: "http://127.0.0.1:5173/?tab=add" } },
            { text: "Words", web_app: { url: "http://127.0.0.1:5173/?tab=words" } },
          ],
        ],
      },
    });

    const help = await server.app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers,
      payload: {
        message: { text: "/help@thevocabularyappbot", chat: { id: 42, type: "private" } },
      },
    });
    expect(help.statusCode).toBe(200);

    const ignored = await server.app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers,
      payload: { message: { text: "hello", chat: { id: 42, type: "private" } } },
    });
    expect(ignored.statusCode).toBe(204);
  });

  it("falls back to a text Telegram menu when no start photo is configured", () => {
    const response = telegramMenuReply(
      { message: { text: "/start", chat: { id: 42, type: "private" } } },
      config.appOrigin,
      null,
    );

    expect(response).toMatchObject({
      method: "sendMessage",
      chat_id: 42,
      text: "Save words, review them, and build your vocabulary.\n\nChoose where to start:",
    });
  });

  it("uses neutral reminder copy with correct Russian card forms", () => {
    expect(telegramReminderMessage("42", 1, config.appOrigin).text)
      .toBe("К повторению готова 1 карточка.");
    expect(telegramReminderMessage("42", 2, config.appOrigin).text)
      .toBe("К повторению готовы 2 карточки.");
    expect(telegramReminderMessage("42", 5, config.appOrigin).text)
      .toBe("К повторению готовы 5 карточек.");
    expect(telegramReminderMessage("42", 21, config.appOrigin).text)
      .toBe("К повторению готова 21 карточка.");
  });

  it("hides reminder dispatch when the server secret is absent", async () => {
    const inactive = await buildServer({
      ...config,
      telegramReminderDispatchSecret: null,
    });
    try {
      const configuration = await inactive.app.inject({ method: "GET", url: "/api/config" });
      expect(configuration.json()).toMatchObject({ telegramRemindersAvailable: false });

      const dispatch = await inactive.app.inject({
        method: "POST",
        url: "/api/internal/telegram-reminders/claim",
        headers: { authorization: "Bearer test-reminder-dispatch-secret" },
      });
      expect(dispatch.statusCode).toBe(404);
    } finally {
      await inactive.app.close();
    }
  });

  it("dispatches opted-in Telegram reminders through the protected internal API", async () => {
    const repository = new VocabularyRepository(server.database.sqlite);
    const user = repository.ensureUser({
      telegramUserId: "1001",
      displayName: "Local developer",
      username: "local",
      photoUrl: null,
    });
    const lastStudiedAt = new Date(Date.now() - 2 * 86_400_000);
    const word = repository.createWord(
      user.id,
      { learningText: "memory", meanings: ["память"], comment: "" },
      lastStudiedAt,
    );
    repository.answerWord(
      user.id,
      word.id,
      randomUUID(),
      true,
      "scheduled",
      lastStudiedAt,
    );

    const enabled = await server.app.inject({
      method: "PUT",
      url: "/api/settings/telegram-reminders",
      headers: { cookie },
      payload: { enabled: true },
    });
    expect(enabled.json()).toEqual({ enabled: true });

    const unauthorized = await server.app.inject({
      method: "POST",
      url: "/api/internal/telegram-reminders/claim",
    });
    expect(unauthorized.statusCode).toBe(401);

    const claimed = await server.app.inject({
      method: "POST",
      url: "/api/internal/telegram-reminders/claim",
      headers: { authorization: "Bearer test-reminder-dispatch-secret" },
    });
    expect(claimed.statusCode).toBe(200);
    const payload = claimed.json<{
      reminders: Array<{ eventId: string; request: Record<string, unknown> }>;
    }>();
    expect(payload.reminders).toHaveLength(1);
    expect(payload.reminders[0]?.request).toMatchObject({
      method: "sendMessage",
      chat_id: "1001",
      text: "К повторению готова 1 карточка.",
      reply_markup: {
        inline_keyboard: [[{
          text: "Повторить",
          web_app: { url: "http://127.0.0.1:5173/?tab=learn" },
        }]],
      },
    });

    const completed = await server.app.inject({
      method: "POST",
      url: "/api/internal/telegram-reminders/complete",
      headers: { authorization: "Bearer test-reminder-dispatch-secret" },
      payload: {
        results: [{
          eventId: payload.reminders[0]?.eventId,
          ok: false,
          errorCode: 403,
        }],
      },
    });
    expect(completed.statusCode).toBe(204);

    const bootstrap = await server.app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: { cookie },
    });
    expect(bootstrap.json<{ telegramReminders: unknown }>().telegramReminders).toEqual({
      enabled: false,
    });
  });

  it("creates, updates, lists, and deletes a word", async () => {
    const createdResponse = await server.app.inject({
      method: "POST",
      url: "/api/words",
      headers: { cookie },
      payload: { learningText: "apple", meanings: ["яблоко"], comment: "fruit" },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<VocabularyWord>();
    expect(created.level).toBe(0);

    const duplicate = await server.app.inject({
      method: "POST",
      url: "/api/words",
      headers: { cookie },
      payload: { learningText: " APPLE ", meanings: ["другое"], comment: "" },
    });
    expect(duplicate.statusCode).toBe(409);

    const updatedResponse = await server.app.inject({
      method: "PUT",
      url: `/api/words/${created.id}`,
      headers: { cookie },
      payload: {
        learningText: "apple",
        meanings: ["яблоко", "яблоня"],
        comment: "updated",
        version: created.version,
      },
    });
    expect(updatedResponse.json<VocabularyWord>().meanings).toEqual(["яблоко", "яблоня"]);

    const bootstrap = await server.app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: { cookie },
    });
    expect(bootstrap.json<{ words: VocabularyWord[] }>().words).toHaveLength(1);

    const deleted = await server.app.inject({
      method: "DELETE",
      url: `/api/words/${created.id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(204);
  });

  it("applies review answers exactly once", async () => {
    const created = (
      await server.app.inject({
        method: "POST",
        url: "/api/words",
        headers: { cookie },
        payload: { learningText: "memory", meanings: ["память"], comment: "" },
      })
    ).json<VocabularyWord>();
    const operationId = randomUUID();
    const payload = { correct: true, mode: "scheduled", operationId };

    const first = await server.app.inject({
      method: "POST",
      url: `/api/words/${created.id}/answer`,
      headers: { cookie },
      payload,
    });
    const second = await server.app.inject({
      method: "POST",
      url: `/api/words/${created.id}/answer`,
      headers: { cookie },
      payload,
    });

    expect(first.json<VocabularyWord>().level).toBe(1);
    expect(second.json<VocabularyWord>().level).toBe(1);
    expect(second.json<VocabularyWord>().correctCount).toBe(1);

    const otherWord = (
      await server.app.inject({
        method: "POST",
        url: "/api/words",
        headers: { cookie },
        payload: { learningText: "other", meanings: ["другой"], comment: "" },
      })
    ).json<VocabularyWord>();
    const conflicting = await server.app.inject({
      method: "POST",
      url: `/api/words/${otherWord.id}/answer`,
      headers: { cookie },
      payload,
    });

    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json()).toMatchObject({
      error: { code: "operation_conflict" },
    });
  });

  it("persists language and theme settings in the user profile", async () => {
    const response = await server.app.inject({
      method: "PUT",
      url: "/api/settings",
      headers: { cookie },
      payload: {
        learningLanguage: "de",
        knownLanguage: "en",
        theme: "dark",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      learningLanguage: "de",
      knownLanguage: "en",
      theme: "dark",
    });

    const bootstrap = await server.app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: { cookie },
    });
    expect(bootstrap.json<{ settings: unknown }>().settings).toEqual({
      learningLanguage: "de",
      knownLanguage: "en",
      theme: "dark",
    });
  });

  it("isolates users at the repository and API boundary", async () => {
    await server.app.inject({
      method: "POST",
      url: "/api/words",
      headers: { cookie },
      payload: { learningText: "private", meanings: ["личный"], comment: "" },
    });

    const repository = new VocabularyRepository(server.database.sqlite);
    const other = repository.ensureUser({
      telegramUserId: "2002",
      displayName: "Other",
      username: null,
      photoUrl: null,
    });
    const otherCookie = `vocabulary_session=${repository.createSession(other.id)}`;
    const response = await server.app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: { cookie: otherCookie },
    });

    expect(response.json<{ words: VocabularyWord[] }>().words).toEqual([]);
  });
});
