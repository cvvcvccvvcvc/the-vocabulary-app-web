import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import type { TelegramIdentity } from "../repository.js";

const telegramUserSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  first_name: z.string().default(""),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
});

const telegramJwks = createRemoteJWKSet(
  new URL("https://oauth.telegram.org/.well-known/jwks.json"),
);

export class InvalidTelegramDataError extends Error {}

export function validateTelegramInitData(
  rawInitData: string,
  botToken: string,
  now = new Date(),
  maximumAgeSeconds = 3_600,
): TelegramIdentity {
  const parameters = new URLSearchParams(rawInitData);
  const receivedHash = parameters.get("hash");
  const authDate = Number.parseInt(parameters.get("auth_date") ?? "", 10);
  const rawUser = parameters.get("user");

  if (receivedHash === null || !/^[a-f\d]{64}$/i.test(receivedHash)) {
    throw new InvalidTelegramDataError("Telegram hash is missing or malformed");
  }
  if (!Number.isFinite(authDate)) {
    throw new InvalidTelegramDataError("Telegram auth date is missing");
  }

  const ageSeconds = Math.floor(now.getTime() / 1_000) - authDate;
  if (ageSeconds < -30 || ageSeconds > maximumAgeSeconds) {
    throw new InvalidTelegramDataError("Telegram authorization has expired");
  }
  if (rawUser === null) {
    throw new InvalidTelegramDataError("Telegram user is missing");
  }

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const candidates = [dataCheckString(parameters, false), dataCheckString(parameters, true)];
  const received = Buffer.from(receivedHash, "hex");
  const valid = candidates.some((value) => {
    const expected = createHmac("sha256", secretKey).update(value).digest();
    return expected.length === received.length && timingSafeEqual(expected, received);
  });

  if (!valid) {
    throw new InvalidTelegramDataError("Telegram signature is invalid");
  }

  const user = telegramUserSchema.parse(JSON.parse(rawUser) as unknown);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

  return {
    telegramUserId: String(user.id),
    displayName: displayName || user.username || "Telegram user",
    username: user.username ?? null,
    photoUrl: user.photo_url ?? null,
  };
}

export interface OidcAuthorizationRequest {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
}

export function createTelegramOidcAuthorization(
  config: ServerConfig,
): OidcAuthorizationRequest {
  if (config.telegramBotId === null) {
    throw new Error("Telegram OIDC is not configured");
  }

  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const redirectUri = new URL("/api/auth/telegram/callback", config.appOrigin).toString();
  const authorizationUrl = new URL("https://oauth.telegram.org/auth");

  authorizationUrl.search = new URLSearchParams({
    client_id: config.telegramBotId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();

  return { authorizationUrl: authorizationUrl.toString(), state, codeVerifier };
}

export async function exchangeTelegramOidcCode(
  code: string,
  codeVerifier: string,
  config: ServerConfig,
): Promise<TelegramIdentity> {
  if (config.telegramBotId === null || config.telegramClientSecret === null) {
    throw new Error("Telegram OIDC is not configured");
  }

  const redirectUri = new URL("/api/auth/telegram/callback", config.appOrigin).toString();
  const authorization = Buffer.from(
    `${config.telegramBotId}:${config.telegramClientSecret}`,
  ).toString("base64");
  const response = await fetch("https://oauth.telegram.org/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.telegramBotId,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new InvalidTelegramDataError("Telegram login failed");
  }

  const tokenResponse = z
    .object({ id_token: z.string().min(1) })
    .parse(await response.json());
  const verified = await jwtVerify(tokenResponse.id_token, telegramJwks, {
    issuer: "https://oauth.telegram.org",
    audience: config.telegramBotId,
  });
  const claims = verified.payload;
  const telegramUserIdCandidate =
    typeof claims.id === "string" || typeof claims.id === "number"
      ? String(claims.id)
      : claims.sub;

  if (
    typeof telegramUserIdCandidate !== "string" ||
    !/^\d+$/.test(telegramUserIdCandidate)
  ) {
    throw new InvalidTelegramDataError("Telegram user ID is invalid");
  }

  return {
    telegramUserId: telegramUserIdCandidate,
    displayName: typeof claims.name === "string" ? claims.name : "Telegram user",
    username:
      typeof claims.preferred_username === "string" ? claims.preferred_username : null,
    photoUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}

function dataCheckString(parameters: URLSearchParams, excludeSignature: boolean): string {
  return [...parameters.entries()]
    .filter(([key]) => key !== "hash" && (!excludeSignature || key !== "signature"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
