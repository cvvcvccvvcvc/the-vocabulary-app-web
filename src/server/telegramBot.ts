import { createHash, timingSafeEqual } from "node:crypto";

const botCommandPattern = /^\/(start|help)(?:@[A-Za-z0-9_]+)?(?:\s|$)/;

interface TelegramMessageUpdate {
  message?: {
    text?: string;
    chat?: {
      id?: number;
      type?: string;
    };
  };
}

export interface TelegramBotMethodRequest extends Record<string, unknown> {
  method: "sendMessage";
}

export function telegramWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`vocabulary-webhook:${botToken}`).digest("hex");
}

export function hasValidTelegramWebhookSecret(
  received: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof received !== "string") return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length
    && timingSafeEqual(receivedBytes, expectedBytes);
}

export function telegramMenuReply(
  update: unknown,
  appOrigin: string,
): TelegramBotMethodRequest | null {
  if (typeof update !== "object" || update === null) return null;
  const message = (update as TelegramMessageUpdate).message;
  const chatId = message?.chat?.id;
  const text = message?.text;
  if (
    message?.chat?.type !== "private"
    || !Number.isSafeInteger(chatId)
    || typeof text !== "string"
    || !botCommandPattern.test(text)
  ) {
    return null;
  }

  function sectionUrl(section: "learn" | "add" | "words"): string {
    const url = new URL(appOrigin);
    url.searchParams.set("tab", section);
    return url.toString();
  }

  return {
    method: "sendMessage",
    chat_id: chatId,
    text: "Save words, review them, and build your vocabulary.\n\nChoose where to start:",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Learn", web_app: { url: sectionUrl("learn") } }],
        [
          { text: "Add Word", web_app: { url: sectionUrl("add") } },
          { text: "Words", web_app: { url: sectionUrl("words") } },
        ],
      ],
    },
  };
}
