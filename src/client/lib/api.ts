import type { LanguageSettings, ReviewDirection, ReviewMode, VocabularyWord } from "../../domain/index.js";
import type {
  AnalyticsResponse,
  AppConfiguration,
  BootstrapResponse,
  CreateWordRequest,
  ErrorResponse,
  SessionResponse,
  TelegramReminderSettings,
  UpdateWordRequest,
} from "../../shared/contracts.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function parseErrorResponse(value: unknown): ErrorResponse | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }

  const error = value.error;
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    !("message" in error) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string"
  ) {
    return null;
  }

  return { error: { code: error.code, message: error.message } };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let payload: ErrorResponse | null = null;
    try {
      payload = parseErrorResponse(await response.json());
    } catch {
      // A proxy or upstream service may return a non-JSON failure.
    }
    throw new ApiError(
      response.status,
      payload?.error.code ?? "request_failed",
      payload?.error.message ?? "Request failed",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  analytics: () => request<AnalyticsResponse>("/api/admin/analytics"),
  configuration: () => request<AppConfiguration>("/api/config"),
  session: () => request<SessionResponse>("/api/session"),
  developmentLogin: () =>
    request<SessionResponse>("/api/auth/development", { method: "POST" }),
  telegramMiniAppLogin: (initData: string) =>
    request<SessionResponse>("/api/auth/telegram/mini-app", {
      method: "POST",
      body: JSON.stringify({ initData }),
    }),
  logout: () => request<void>("/api/logout", { method: "POST" }),
  bootstrap: () => request<BootstrapResponse>("/api/bootstrap"),
  createWord: (input: CreateWordRequest) =>
    request<VocabularyWord>("/api/words", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateWord: (wordId: string, input: UpdateWordRequest) =>
    request<VocabularyWord>(`/api/words/${wordId}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteWord: (wordId: string) =>
    request<void>(`/api/words/${wordId}`, { method: "DELETE" }),
  markShown: (wordId: string, direction: ReviewDirection) =>
    request<VocabularyWord>(`/api/words/${wordId}/shown`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    }),
  answerWord: (
    wordId: string,
    correct: boolean,
    mode: ReviewMode,
    operationId: string,
  ) =>
    request<VocabularyWord>(`/api/words/${wordId}/answer`, {
      method: "POST",
      body: JSON.stringify({ correct, mode, operationId }),
    }),
  updateSettings: (settings: LanguageSettings) =>
    request<LanguageSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  updateTelegramReminders: (enabled: boolean) =>
    request<TelegramReminderSettings>("/api/settings/telegram-reminders", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
};
