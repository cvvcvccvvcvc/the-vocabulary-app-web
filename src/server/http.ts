import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserProfile } from "../shared/contracts.js";
import type { ServerConfig } from "./config.js";
import type { VocabularyRepository } from "./repository.js";

export const SESSION_COOKIE = "vocabulary_session";
export const AUTH_FLOW_COOKIE = "vocabulary_auth_flow";

const AUTH_FLOW_COOKIE_PATH = "/api/auth/telegram/callback";

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  config: ServerConfig,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: config.environment === "production",
    sameSite: "lax",
    maxAge: 30 * 86_400,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function setAuthFlowCookie(
  reply: FastifyReply,
  state: string,
  config: ServerConfig,
): void {
  reply.setCookie(AUTH_FLOW_COOKIE, state, {
    path: AUTH_FLOW_COOKIE_PATH,
    httpOnly: true,
    secure: config.environment === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    signed: true,
  });
}

export function authFlowState(request: FastifyRequest): string | null {
  const cookie = request.cookies[AUTH_FLOW_COOKIE];
  if (cookie === undefined) return null;

  const result = request.unsignCookie(cookie);
  return result.valid ? result.value : null;
}

export function clearAuthFlowCookie(reply: FastifyReply): void {
  reply.clearCookie(AUTH_FLOW_COOKIE, { path: AUTH_FLOW_COOKIE_PATH });
}

export function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: VocabularyRepository,
): UserProfile | null {
  const token = request.cookies[SESSION_COOKIE];
  const user = token === undefined ? null : repository.sessionUser(token);

  if (user === null) {
    void reply.status(401).send({
      error: { code: "unauthorized", message: "Sign in to continue" },
    });
  }

  return user;
}
