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
  method: "sendMessage" | "sendPhoto";
}

function sectionUrl(appOrigin: string, section: "learn" | "add" | "words"): string {
  const url = new URL(appOrigin);
  url.searchParams.set("tab", section);
  return url.toString();
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
  startPhotoFileId: string | null,
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

  const menuText = "Save words, review them, and build your vocabulary.\n\nChoose where to start:";
  const content = startPhotoFileId === null
    ? { method: "sendMessage" as const, text: menuText }
    : { method: "sendPhoto" as const, photo: startPhotoFileId, caption: menuText };

  return {
    ...content,
    chat_id: chatId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Learn", web_app: { url: sectionUrl(appOrigin, "learn") } }],
        [
          { text: "Add Word", web_app: { url: sectionUrl(appOrigin, "add") } },
          { text: "Words", web_app: { url: sectionUrl(appOrigin, "words") } },
        ],
      ],
    },
  };
}

export function telegramReminderMessage(
  chatId: string,
  dueCardCount: number,
  appOrigin: string,
): TelegramBotMethodRequest {
  return {
    method: "sendMessage",
    chat_id: chatId,
    text: reminderText(dueCardCount),
    reply_markup: {
      inline_keyboard: [[
        { text: "Повторить", web_app: { url: sectionUrl(appOrigin, "learn") } },
      ]],
    },
  };
}

function reminderText(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun = remainder10 === 1 && remainder100 !== 11
    ? "карточка"
    : remainder10 >= 2 && remainder10 <= 4 && !(remainder100 >= 12 && remainder100 <= 14)
      ? "карточки"
      : "карточек";
  const adjective = noun === "карточка" ? "готова" : "готовы";
  return `К повторению ${adjective} ${count} ${noun}.`;
}
