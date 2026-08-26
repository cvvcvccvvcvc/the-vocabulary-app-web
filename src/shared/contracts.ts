import type {
  LanguageSettings,
  ReviewDirection,
  ReviewMode,
  VocabularyWord,
} from "../domain/models.js";

export interface UserProfile {
  id: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
}

export interface AppConfiguration {
  developmentLoginEnabled: boolean;
  telegramRemindersAvailable: boolean;
}

export interface SessionResponse {
  user: UserProfile;
}

export interface BootstrapResponse {
  user: UserProfile;
  settings: LanguageSettings;
  telegramReminders: TelegramReminderSettings;
  words: VocabularyWord[];
}

export interface TelegramReminderSettings {
  enabled: boolean;
}

export interface CreateWordRequest {
  learningText: string;
  meanings: string[];
  comment: string;
}

export interface UpdateWordRequest extends CreateWordRequest {
  version: number;
}

export interface ReviewTransitionRequest {
  operationId: string;
  answer: {
    wordId: string;
    correct: boolean;
    mode: ReviewMode;
  };
  shown: {
    wordId: string;
    direction: ReviewDirection;
  };
}

export interface ReviewTransitionResponse {
  answeredWord: VocabularyWord;
  shownWord: VocabularyWord;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface AnalyticsRegistrationDay {
  date: string;
  newUsers: number;
  totalUsers: number;
}

export interface AnalyticsActivityPeriod {
  periodStart: string;
  activeUsers: number;
}

export interface AnalyticsUsageDay {
  date: string;
  answers: number;
  wordsAdded: number;
}

export interface AnalyticsUser {
  id: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
  registeredAt: string;
  lastStudiedAt: string | null;
  activeCardCount: number;
  wordsAddedCount: number;
  answerCount: number;
}

export interface AnalyticsResponse {
  generatedAt: string;
  timeZone: "Asia/Yekaterinburg";
  summary: {
    totalUsers: number;
    activeToday: number;
    activeThisWeek: number;
    activeThisMonth: number;
    answersToday: number;
    wordsAddedToday: number;
  };
  registrations: AnalyticsRegistrationDay[];
  activity: {
    days: AnalyticsActivityPeriod[];
    weeks: AnalyticsActivityPeriod[];
    months: AnalyticsActivityPeriod[];
  };
  usage: AnalyticsUsageDay[];
  users: AnalyticsUser[];
}
