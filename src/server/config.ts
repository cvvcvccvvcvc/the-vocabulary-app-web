import path from "node:path";

export interface ServerConfig {
  environment: "development" | "test" | "production";
  host: string;
  port: number;
  appOrigin: string;
  databasePath: string;
  sessionSecret: string;
  telegramBotId: string | null;
  telegramBotToken: string | null;
  telegramStartPhotoFileId: string | null;
  telegramClientSecret: string | null;
  telegramReminderDispatchSecret: string | null;
  developmentTelegramUserId: string | null;
  analyticsOwnerTelegramUserId: string | null;
}

function optionalValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serverEnvironment(value: string | undefined): ServerConfig["environment"] {
  const mode = value ?? "development";
  if (mode !== "development" && mode !== "test" && mode !== "production") {
    throw new Error(`Unsupported NODE_ENV: ${mode}`);
  }
  return mode;
}

function serverPort(value: string | undefined): number {
  const rawPort = value?.trim() || "3000";
  if (!/^\d+$/.test(rawPort)) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function applicationOrigin(value: string | undefined, production: boolean): string {
  const rawOrigin = value?.trim() || "http://127.0.0.1:5173";
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error("APP_ORIGIN must be a valid HTTP or HTTPS origin");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    throw new Error("APP_ORIGIN must be a valid HTTP or HTTPS origin");
  }
  if (production && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }
  return url.origin;
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const mode = serverEnvironment(environment.NODE_ENV);
  const production = mode === "production";
  const appOrigin = applicationOrigin(environment.APP_ORIGIN, production);
  const port = serverPort(environment.PORT);
  const sessionSecret =
    environment.SESSION_SECRET?.trim() || "development-only-session-secret-change-me";
  const telegramBotId = optionalValue(environment.TELEGRAM_BOT_ID);
  const telegramBotToken = optionalValue(environment.TELEGRAM_BOT_TOKEN);
  const telegramClientSecret = optionalValue(environment.TELEGRAM_CLIENT_SECRET);
  const telegramReminderDispatchSecret = optionalValue(
    environment.TELEGRAM_REMINDER_DISPATCH_SECRET,
  );

  if (production) {
    if (sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must contain at least 32 characters in production");
    }
    if (telegramBotId === null || telegramBotToken === null || telegramClientSecret === null) {
      throw new Error("Telegram credentials are required in production");
    }
    if (
      telegramReminderDispatchSecret !== null
      && telegramReminderDispatchSecret.length < 32
    ) {
      throw new Error("TELEGRAM_REMINDER_DISPATCH_SECRET must contain at least 32 characters");
    }
  }

  return {
    environment: mode,
    host: environment.HOST?.trim() || "127.0.0.1",
    port,
    appOrigin,
    databasePath:
      environment.DATABASE_PATH?.trim() || path.resolve(process.cwd(), "data/vocabulary.sqlite"),
    sessionSecret,
    telegramBotId,
    telegramBotToken,
    telegramStartPhotoFileId: optionalValue(environment.TELEGRAM_START_PHOTO_FILE_ID),
    telegramClientSecret,
    telegramReminderDispatchSecret,
    developmentTelegramUserId:
      production ? null : optionalValue(environment.DEV_TELEGRAM_USER_ID),
    analyticsOwnerTelegramUserId: optionalValue(
      environment.ANALYTICS_OWNER_TELEGRAM_USER_ID,
    ),
  };
}
