import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initializeTelegram,
  openTelegramLink,
  requestTelegramWriteAccess,
  setTelegramVerticalSwipesEnabled,
  telegramImpact,
  telegramNotification,
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
  const impactOccurred = vi.fn();
  const notificationOccurred = vi.fn();
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
          HapticFeedback: { impactOccurred, notificationOccurred },
        },
      },
    },
  });
  return {
    enableVerticalSwipes,
    disableVerticalSwipes,
    impactOccurred,
    notificationOccurred,
    requestWriteAccess,
  };
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

describe("openTelegramLink", () => {
  const url = "https://t.me/thevocabularyapp?direct";

  it("opens a channel's private messages through the Mini App SDK", () => {
    installTelegram("ios");
    const webApp = window.Telegram!.WebApp!;
    webApp.initData = "telegram-launch-data";
    webApp.openTelegramLink = vi.fn();

    expect(openTelegramLink(url)).toBe(true);
    expect(webApp.openTelegramLink).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("leaves browser navigation alone even when the Telegram SDK is loaded", () => {
    installTelegram("unknown");
    const nativeOpen = vi.fn();
    window.Telegram!.WebApp!.openTelegramLink = nativeOpen;

    expect(openTelegramLink(url)).toBe(false);
    expect(nativeOpen).not.toHaveBeenCalled();
  });

  it("leaves a normal link available when the native method is unavailable", () => {
    installTelegram("ios");
    window.Telegram!.WebApp!.initData = "telegram-launch-data";
    expect(openTelegramLink(url)).toBe(false);

    installTelegram("ios", false);
    const webApp = window.Telegram!.WebApp!;
    webApp.initData = "telegram-launch-data";
    webApp.openTelegramLink = vi.fn();
    expect(openTelegramLink(url)).toBe(false);
    expect(webApp.openTelegramLink).not.toHaveBeenCalled();
  });
});

describe("Telegram haptic feedback", () => {
  it("uses haptic feedback when the Telegram client supports it", () => {
    const telegram = installTelegram("ios");

    telegramImpact("medium");
    telegramNotification("success");

    expect(telegram.impactOccurred).toHaveBeenCalledWith("medium");
    expect(telegram.notificationOccurred).toHaveBeenCalledWith("success");
  });

  it("does not call haptic feedback before Bot API 6.1", () => {
    const telegram = installTelegram("ios", false);

    telegramImpact();
    telegramNotification("warning");

    expect(telegram.impactOccurred).not.toHaveBeenCalled();
    expect(telegram.notificationOccurred).not.toHaveBeenCalled();
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
