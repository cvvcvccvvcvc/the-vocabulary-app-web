import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InvalidTelegramDataError,
  validateTelegramInitData,
} from "../../src/server/auth/telegram.js";

function signedInitData(botToken: string, authDate: number): string {
  const parameters = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "query-1",
    user: JSON.stringify({ id: 42, first_name: "Test", username: "tester" }),
  });
  const dataCheckString = [...parameters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  parameters.set("hash", hash);
  return parameters.toString();
}

describe("Telegram Mini App validation", () => {
  const botToken = "123456:test-token";
  const now = new Date("2026-08-23T12:00:00.000Z");
  const authDate = Math.floor(now.getTime() / 1_000);

  it("accepts signed fresh init data", () => {
    expect(validateTelegramInitData(signedInitData(botToken, authDate), botToken, now)).toEqual({
      telegramUserId: "42",
      displayName: "Test",
      username: "tester",
      photoUrl: null,
    });
  });

  it("rejects tampering and expired data", () => {
    const tampered = signedInitData(botToken, authDate).replace("Test", "Other");
    expect(() => validateTelegramInitData(tampered, botToken, now)).toThrow(
      InvalidTelegramDataError,
    );

    const expired = signedInitData(botToken, authDate - 7_200);
    expect(() => validateTelegramInitData(expired, botToken, now)).toThrow(
      "expired",
    );
  });
});

