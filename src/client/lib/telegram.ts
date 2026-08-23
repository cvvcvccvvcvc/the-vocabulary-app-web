interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
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

export function initializeTelegram(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp ?? null;
  if (webApp !== null) {
    document.documentElement.dataset.telegram = "true";
    document.documentElement.dataset.colorScheme = webApp.colorScheme;
    webApp.ready();
    webApp.expand();
  }
  return webApp;
}

export function telegramImpact(style: "light" | "medium" | "heavy" = "light"): void {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function telegramNotification(type: "error" | "success" | "warning"): void {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
}

