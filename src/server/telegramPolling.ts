import { telegramMenuReply, type TelegramBotMethodRequest } from "./telegramBot.js";

const telegramApiOrigin = "https://api.telegram.org";
const longPollTimeoutSeconds = 30;
const initialRetryDelayMs = 1_000;
const maximumRetryDelayMs = 30_000;

interface TelegramUpdate {
  update_id: number;
  [key: string]: unknown;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export type TelegramApiRequest = (
  method: string,
  parameters: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>;

export interface TelegramPollingLogger {
  info(message: string): void;
  error(message: string): void;
}

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  return typeof value === "object"
    && value !== null
    && Number.isSafeInteger((value as { update_id?: unknown }).update_id);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Telegram polling error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function createTelegramApiRequest(
  botToken: string,
  fetchImplementation: typeof fetch = fetch,
): TelegramApiRequest {
  return async (method, parameters, signal) => {
    let response: Response;
    try {
      response = await fetchImplementation(
        `${telegramApiOrigin}/bot${botToken}/${method}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parameters),
          ...(signal === undefined ? {} : { signal }),
        },
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new Error("Telegram Bot API request failed");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Telegram Bot API returned HTTP ${response.status}`);
    }

    if (typeof payload !== "object" || payload === null) {
      throw new Error("Telegram Bot API returned an invalid response");
    }

    const apiResponse = payload as TelegramApiResponse<unknown>;
    if (!response.ok || apiResponse.ok !== true) {
      throw new Error(
        apiResponse.description || `Telegram Bot API returned HTTP ${response.status}`,
      );
    }

    return apiResponse.result;
  };
}

async function sendTelegramMethod(
  request: TelegramApiRequest,
  response: TelegramBotMethodRequest,
  signal: AbortSignal,
): Promise<void> {
  const { method, ...parameters } = response;
  await request(method, parameters, signal);
}

export async function pollTelegramUpdatesOnce(
  request: TelegramApiRequest,
  appOrigin: string,
  offset: number | undefined,
  signal: AbortSignal,
): Promise<number | undefined> {
  const result = await request("getUpdates", {
    timeout: longPollTimeoutSeconds,
    offset,
    allowed_updates: ["message"],
  }, signal);

  if (!Array.isArray(result)) {
    throw new Error("Telegram Bot API returned an invalid updates payload");
  }

  let nextOffset = offset;
  for (const candidate of result) {
    if (!isTelegramUpdate(candidate)) {
      throw new Error("Telegram Bot API returned an invalid update");
    }

    const reply = telegramMenuReply(candidate, appOrigin);
    if (reply !== null) {
      await sendTelegramMethod(request, reply, signal);
    }
    nextOffset = candidate.update_id + 1;
  }

  return nextOffset;
}

export async function runTelegramPolling(
  botToken: string,
  appOrigin: string,
  signal: AbortSignal,
  logger: TelegramPollingLogger = console,
  request: TelegramApiRequest = createTelegramApiRequest(botToken),
): Promise<void> {
  let offset: number | undefined;
  let retryDelayMs = initialRetryDelayMs;

  logger.info("Telegram long polling started");
  while (!signal.aborted) {
    try {
      offset = await pollTelegramUpdatesOnce(request, appOrigin, offset, signal);
      retryDelayMs = initialRetryDelayMs;
    } catch (error) {
      if (signal.aborted || isAbortError(error)) break;
      logger.error(`Telegram polling failed: ${errorMessage(error)}; retrying in ${retryDelayMs}ms`);
      await delay(retryDelayMs, signal);
      retryDelayMs = Math.min(retryDelayMs * 2, maximumRetryDelayMs);
    }
  }
  logger.info("Telegram long polling stopped");
}
