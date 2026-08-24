import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import type { ServerConfig } from "./config.js";
import { VocabularyDatabase } from "./database.js";
import { clearSessionCookie, requireUser, SESSION_COOKIE, setSessionCookie } from "./http.js";
import {
  hasValidTelegramWebhookSecret,
  telegramMenuReply,
  telegramWebhookSecret,
} from "./telegramBot.js";
import {
  createTelegramOidcAuthorization,
  exchangeTelegramOidcCode,
  InvalidTelegramDataError,
  validateTelegramInitData,
} from "./auth/telegram.js";
import {
  DuplicateWordError,
  VocabularyRepository,
  WordNotFoundError,
  WordVersionConflictError,
} from "./repository.js";
import {
  answerWordSchema,
  settingsSchema,
  showWordSchema,
  updateWordSchema,
  wordContentSchema,
} from "./validation.js";
import { AnalyticsRepository } from "./analytics.js";

export interface BuiltServer {
  app: FastifyInstance;
  database: VocabularyDatabase;
}

export async function buildServer(config: ServerConfig): Promise<BuiltServer> {
  const app = Fastify({
    logger: config.environment !== "test",
    trustProxy: config.environment === "production",
  });
  const database = new VocabularyDatabase(config.databasePath);
  const repository = new VocabularyRepository(database.sqlite);
  const analyticsRepository = new AnalyticsRepository(database.sqlite);

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.addHook("onClose", async () => {
    database.close();
  });

  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/config", async () => ({
    developmentLoginEnabled: config.developmentTelegramUserId !== null,
  }));

  app.post("/api/telegram/webhook", async (request, reply) => {
    if (config.telegramBotToken === null) {
      return reply.status(404).send();
    }

    const secret = request.headers["x-telegram-bot-api-secret-token"];
    if (!hasValidTelegramWebhookSecret(secret, telegramWebhookSecret(config.telegramBotToken))) {
      return reply.status(401).send();
    }

    const response = telegramMenuReply(request.body, config.appOrigin);
    return response === null ? reply.status(204).send() : response;
  });

  app.post("/api/auth/development", async (_request, reply) => {
    if (config.developmentTelegramUserId === null || config.environment === "production") {
      return reply.status(404).send({
        error: { code: "not_found", message: "Route not found" },
      });
    }

    const user = repository.ensureUser({
      telegramUserId: config.developmentTelegramUserId,
      displayName: "Local developer",
      username: "local",
      photoUrl: null,
    });
    setSessionCookie(reply, repository.createSession(user.id), config);
    return { user };
  });

  app.post("/api/auth/telegram/mini-app", async (request, reply) => {
    if (config.telegramBotToken === null) {
      return reply.status(503).send({
        error: { code: "telegram_not_configured", message: "Telegram login is not configured" },
      });
    }

    const body = z.object({ initData: z.string().min(1).max(20_000) }).parse(request.body);
    const identity = validateTelegramInitData(body.initData, config.telegramBotToken);
    const user = repository.ensureUser(identity);
    setSessionCookie(reply, repository.createSession(user.id), config);
    return { user };
  });

  app.get("/api/auth/telegram/start", async (_request, reply) => {
    if (config.telegramBotId === null || config.telegramClientSecret === null) {
      return reply.status(503).send("Telegram login is not configured");
    }

    const authorization = createTelegramOidcAuthorization(config);
    repository.createAuthFlow(authorization.state, authorization.codeVerifier);
    return reply.redirect(authorization.authorizationUrl);
  });

  app.get("/api/auth/telegram/callback", async (request, reply) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);
    const codeVerifier = repository.consumeAuthFlow(query.state);
    if (codeVerifier === null) {
      throw new InvalidTelegramDataError("Login state is invalid or expired");
    }

    const identity = await exchangeTelegramOidcCode(query.code, codeVerifier, config);
    const user = repository.ensureUser(identity);
    setSessionCookie(reply, repository.createSession(user.id), config);
    return reply.redirect(config.appOrigin);
  });

  app.post("/api/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token !== undefined) {
      repository.deleteSession(token);
    }
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get("/api/session", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    return user === null ? undefined : { user };
  });

  app.get("/api/bootstrap", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    return {
      user,
      settings: repository.settings(user.id),
      words: repository.listWords(user.id),
    };
  });

  app.get("/api/admin/analytics", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    if (
      config.analyticsOwnerTelegramUserId === null
      || !analyticsRepository.canAccess(user.id, config.analyticsOwnerTelegramUserId)
    ) {
      return reply.status(404).send({
        error: { code: "not_found", message: "Route not found" },
      });
    }
    return analyticsRepository.report();
  });

  app.post("/api/words", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    const input = wordContentSchema.parse(request.body);
    const word = repository.createWord(user.id, input);
    return reply.status(201).send(word);
  });

  app.put("/api/words/:wordId", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    const { wordId } = z.object({ wordId: z.uuid() }).parse(request.params);
    const input = updateWordSchema.parse(request.body);
    return repository.updateWord(user.id, wordId, input.version, input);
  });

  app.delete("/api/words/:wordId", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    const { wordId } = z.object({ wordId: z.uuid() }).parse(request.params);
    repository.deleteWord(user.id, wordId);
    return reply.status(204).send();
  });

  app.post("/api/words/:wordId/shown", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    const { wordId } = z.object({ wordId: z.uuid() }).parse(request.params);
    const input = showWordSchema.parse(request.body);
    return repository.markShown(user.id, wordId, input.direction);
  });

  app.post("/api/words/:wordId/answer", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    const { wordId } = z.object({ wordId: z.uuid() }).parse(request.params);
    const input = answerWordSchema.parse(request.body);
    return repository.answerWord(
      user.id,
      wordId,
      input.operationId,
      input.correct,
      input.mode,
    );
  });

  app.put("/api/settings", async (request, reply) => {
    const user = requireUser(request, reply, repository);
    if (user === null) return;
    return repository.updateSettings(user.id, settingsSchema.parse(request.body));
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "invalid_request", message: error.issues[0]?.message ?? "Invalid request" },
      });
    }
    if (error instanceof DuplicateWordError) {
      return reply.status(409).send({
        error: { code: "duplicate_word", message: error.message },
      });
    }
    if (error instanceof WordVersionConflictError) {
      return reply.status(409).send({
        error: { code: "version_conflict", message: error.message },
      });
    }
    if (error instanceof WordNotFoundError) {
      return reply.status(404).send({
        error: { code: "not_found", message: error.message },
      });
    }
    if (error instanceof InvalidTelegramDataError) {
      return reply.status(401).send({
        error: { code: "invalid_telegram_data", message: error.message },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: { code: "internal_error", message: "Unexpected server error" },
    });
  });

  if (config.environment === "production") {
    const clientDirectory = fileURLToPath(new URL("../../dist", import.meta.url));
    if (!fs.existsSync(clientDirectory)) {
      throw new Error("Client build is missing");
    }
    await app.register(staticFiles, { root: clientDirectory, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({
          error: { code: "not_found", message: "Route not found" },
        });
      }
      return reply.sendFile("index.html");
    });
  }

  return { app, database };
}
