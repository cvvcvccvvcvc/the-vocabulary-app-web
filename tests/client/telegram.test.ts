import { afterEach, describe, expect, it, vi } from "vitest";
import { setTelegramVerticalSwipesEnabled } from "../../src/client/lib/telegram.js";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

function installTelegram(platform: string, supportsVersion = true) {
  const enableVerticalSwipes = vi.fn();
  const disableVerticalSwipes = vi.fn();
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
        },
      },
    },
  });
  return { enableVerticalSwipes, disableVerticalSwipes };
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
