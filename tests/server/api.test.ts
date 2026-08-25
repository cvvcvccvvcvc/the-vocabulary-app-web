import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer, type BuiltServer } from "../../src/server/app.js";
import type { ServerConfig } from "../../src/server/config.js";
import { VocabularyRepository } from "../../src/server/repository.js";
import { telegramMenuReply, telegramWebhookSecret } from "../../src/server/telegramBot.js";
import type { VocabularyWord } from "../../src/domain/index.js";
import type { UserStatisticsResponse } from "../../src/shared/contracts.js";

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
  });

  it("returns validated, authenticated user statistics", async () => {
    const unauthorized = await server.app.inject({
      method: "GET",
      url: "/api/statistics?timeZone=UTC",
    });
    expect(unauthorized.statusCode).toBe(401);

    const invalid = await server.app.inject({
      method: "GET",
      url: "/api/statistics?timeZone=Not%2FA%2FZone",
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const created = (
      await server.app.inject({
        method: "POST",
        url: "/api/words",
        headers: { cookie },
        payload: { learningText: "progress", meanings: ["прогресс"], comment: "" },
      })
    ).json<VocabularyWord>();
    await server.app.inject({
      method: "POST",
      url: `/api/words/${created.id}/answer`,
      headers: { cookie },
      payload: { correct: false, mode: "free", operationId: randomUUID() },
    });

    const response = await server.app.inject({
      method: "GET",
      url: "/api/statistics?timeZone=UTC",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const statistics = response.json<UserStatisticsResponse>();
    expect(statistics.timeZone).toBe("UTC");
    expect(statistics.streak).toEqual({ current: 1, studiedToday: true });
    expect(statistics.activity).toHaveLength(28);
    expect(statistics.activity.at(-1)?.answers).toBe(1);
    expect(statistics.vocabulary.totalWords).toBe(1);
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
