import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initializeTelegram,
  requestTelegramWriteAccess,
  setTelegramVerticalSwipesEnabled,
} from "../../src/client/lib/telegram.js";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

function installTelegram(platform: string, supportsVersion = true) {
  const enableVerticalSwipes = vi.fn();
  const disableVerticalSwipes = vi.fn();
  const requestWriteAccess = vi.fn((callback: (granted: boolean) => void) => callback(true));
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      Telegram: {
        WebApp: {
          initData: "",
          colorScheme: "light",
          platform,
          ready: vi.fn(),
          expand: vi.fn(),
          isVersionAtLeast: vi.fn(() => supportsVersion),
          enableVerticalSwipes,
          disableVerticalSwipes,
          requestWriteAccess,
        },
      },
    },
  });
  return { enableVerticalSwipes, disableVerticalSwipes, requestWriteAccess };
}

describe("setTelegramVerticalSwipesEnabled", () => {
  it("disables and restores the host gesture on mobile Telegram", () => {
    const telegram = installTelegram("ios");

    setTelegramVerticalSwipesEnabled(false);
    setTelegramVerticalSwipesEnabled(true);

    expect(telegram.disableVerticalSwipes).toHaveBeenCalledOnce();
    expect(telegram.enableVerticalSwipes).toHaveBeenCalledOnce();
  });

  it("does not change the host gesture on desktop Telegram", () => {
    const telegram = installTelegram("macos");

    setTelegramVerticalSwipesEnabled(false);

    expect(telegram.disableVerticalSwipes).not.toHaveBeenCalled();
  });

  it("does not call an API older than Bot API 7.7", () => {
    const telegram = installTelegram("android", false);

    setTelegramVerticalSwipesEnabled(false);

    expect(telegram.disableVerticalSwipes).not.toHaveBeenCalled();
  });
});

describe("requestTelegramWriteAccess", () => {
  it("resolves the native Telegram permission result", async () => {
    const telegram = installTelegram("ios");

    await expect(requestTelegramWriteAccess()).resolves.toBe(true);
    expect(telegram.requestWriteAccess).toHaveBeenCalledOnce();
  });

  it("fails closed outside a supported Telegram client", async () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

    await expect(requestTelegramWriteAccess()).resolves.toBe(false);
  });
});

describe("initializeTelegram", () => {
  it("marks mobile Telegram so its overlay clearance can be applied", () => {
    installTelegram("ios");
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { documentElement: { dataset } },
    });

    initializeTelegram();

    expect(dataset.telegram).toBe("true");
    expect(dataset.telegramPlatform).toBe("mobile");
  });
});
