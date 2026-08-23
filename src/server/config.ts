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
  telegramClientSecret: string | null;
  developmentTelegramUserId: string | null;
}

function optionalValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const mode = environment.NODE_ENV ?? "development";
  if (!(["development", "test", "production"] as const).includes(mode as never)) {
    throw new Error(`Unsupported NODE_ENV: ${mode}`);
  }

  const production = mode === "production";
  const appOrigin = environment.APP_ORIGIN?.trim() || "http://127.0.0.1:5173";
  const sessionSecret =
    environment.SESSION_SECRET?.trim() || "development-only-session-secret-change-me";
  const telegramBotId = optionalValue(environment.TELEGRAM_BOT_ID);
  const telegramBotToken = optionalValue(environment.TELEGRAM_BOT_TOKEN);
  const telegramClientSecret = optionalValue(environment.TELEGRAM_CLIENT_SECRET);

  if (production) {
    if (!appOrigin.startsWith("https://")) {
      throw new Error("APP_ORIGIN must use HTTPS in production");
    }
    if (sessionSecret.length < 32) {
      throw new Error("SESSION_SECRET must contain at least 32 characters in production");
    }
    if (telegramBotId === null || telegramBotToken === null || telegramClientSecret === null) {
      throw new Error("Telegram credentials are required in production");
    }
  }

  return {
    environment: mode as ServerConfig["environment"],
    host: environment.HOST?.trim() || "127.0.0.1",
    port: Number.parseInt(environment.PORT ?? "3000", 10),
    appOrigin,
    databasePath:
      environment.DATABASE_PATH?.trim() || path.resolve(process.cwd(), "data/vocabulary.sqlite"),
    sessionSecret,
    telegramBotId,
    telegramBotToken,
    telegramClientSecret,
    developmentTelegramUserId:
      production ? null : optionalValue(environment.DEV_TELEGRAM_USER_ID),
  };
}
