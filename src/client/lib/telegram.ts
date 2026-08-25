interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  platform?: string;
  isFullscreen?: boolean;
  ready(): void;
  expand(): void;
  isVersionAtLeast?(version: string): boolean;
  requestFullscreen?(): void;
  requestWriteAccess?(callback: (granted: boolean) => void): void;
  enableVerticalSwipes?(): void;
  disableVerticalSwipes?(): void;
  setBackgroundColor?(color: string): void;
  setHeaderColor?(color: string): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const telegramColors = {
  light: "#fdfcf9",
  dark: "#1e1e1e",
} as const;

function isMobileTelegramPlatform(webApp: TelegramWebApp): boolean {
  return webApp.platform === "ios" || webApp.platform?.startsWith("android") === true;
}

export function setTelegramAppearance(theme: "light" | "dark"): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp === undefined || webApp.isVersionAtLeast?.("6.1") === false) return;
  const color = telegramColors[theme];
  webApp.setHeaderColor?.(color);
  webApp.setBackgroundColor?.(color);
}

export function initializeTelegram(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp ?? null;
  if (webApp !== null) {
    document.documentElement.dataset.telegram = "true";
    document.documentElement.dataset.telegramPlatform = isMobileTelegramPlatform(webApp) ? "mobile" : "desktop";
    document.documentElement.dataset.colorScheme = webApp.colorScheme;
    webApp.ready();
    webApp.expand();
    setTelegramAppearance(webApp.colorScheme);
    if (isMobileTelegramPlatform(webApp)
      && webApp.requestFullscreen !== undefined
      && (webApp.isVersionAtLeast?.("8.0") ?? true)
      && !webApp.isFullscreen) {
      webApp.requestFullscreen();
    }
  }
  return webApp;
}

export function setTelegramVerticalSwipesEnabled(enabled: boolean): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp === undefined
    || !isMobileTelegramPlatform(webApp)
    || webApp.isVersionAtLeast?.("7.7") === false) return;
  if (enabled) {
    webApp.enableVerticalSwipes?.();
  } else {
    webApp.disableVerticalSwipes?.();
  }
}

export function telegramImpact(style: "light" | "medium" | "heavy" = "light"): void {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function telegramNotification(type: "error" | "success" | "warning"): void {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}

export function requestTelegramWriteAccess(): Promise<boolean> {
  const webApp = window.Telegram?.WebApp;
  if (
    webApp?.requestWriteAccess === undefined
    || webApp.isVersionAtLeast?.("6.9") === false
  ) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => webApp.requestWriteAccess?.(resolve));
}
