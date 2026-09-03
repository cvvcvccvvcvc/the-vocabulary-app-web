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
  openTelegramLink?(url: string): void;
  showPopup?(
    params: {
      title?: string;
      message: string;
      buttons?: Array<{
        id?: string;
        type?: "ok" | "close" | "cancel" | "default" | "destructive";
        text?: string;
      }>;
    },
    callback?: (buttonId: string) => void,
  ): void;
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

export function openTelegramLink(url: string): boolean {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData
    || webApp.openTelegramLink === undefined
    || webApp.isVersionAtLeast?.("6.1") === false) {
    return false;
  }
  webApp.openTelegramLink(url);
  return true;
}

export function requestTelegramDeleteConfirmation(): Promise<boolean | null> {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData
    || webApp.showPopup === undefined
    || webApp.isVersionAtLeast?.("6.2") === false) {
    return Promise.resolve(null);
  }

  const showPopup = webApp.showPopup.bind(webApp);
  return new Promise((resolve) => showPopup(
    {
      title: "Delete card?",
      message: "It will be removed from Words and future reviews.",
      buttons: [
        { id: "cancel", type: "cancel", text: "Cancel" },
        { id: "delete", type: "destructive", text: "Delete" },
      ],
    },
    (buttonId) => resolve(buttonId === "delete"),
  ));
}

export function telegramImpact(style: "light" | "medium" | "heavy" = "light"): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.isVersionAtLeast?.("6.1") === false) return;
  webApp?.HapticFeedback?.impactOccurred(style);
}

export function telegramNotification(type: "error" | "success" | "warning"): void {
  const webApp = window.Telegram?.WebApp;
  if (webApp?.isVersionAtLeast?.("6.1") === false) return;
  webApp?.HapticFeedback?.notificationOccurred(type);
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
