import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer, type BuiltServer } from "../../src/server/app.js";
import type { ServerConfig } from "../../src/server/config.js";
import { VocabularyRepository } from "../../src/server/repository.js";
import type { VocabularyWord } from "../../src/domain/index.js";

const config: ServerConfig = {
  environment: "test",
  host: "127.0.0.1",
  port: 0,
  appOrigin: "http://127.0.0.1:5173",
  databasePath: ":memory:",
  sessionSecret: "test-session-secret-with-enough-entropy",
  telegramBotId: null,
  telegramBotToken: null,
  telegramClientSecret: null,
  developmentTelegramUserId: "1001",
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
