import { runTelegramPolling } from "./telegramPolling.js";

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Telegram polling`);
  return value;
}

const botToken = requiredEnvironmentValue("TELEGRAM_BOT_TOKEN");
const appOrigin = requiredEnvironmentValue("APP_ORIGIN");
const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

try {
  await runTelegramPolling(botToken, appOrigin, controller.signal);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Telegram polling stopped unexpectedly");
  process.exitCode = 1;
}
