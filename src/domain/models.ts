export type ReviewDirection = "learning-to-known" | "known-to-learning";
export type ReviewMode = "scheduled" | "free";
export type ThemePreference = "system" | "light" | "dark";
export type TranslationMethod = "google" | "yandex";

export interface VocabularyWord {
  id: string;
  learningText: string;
  meanings: string[];
  comment: string;
  level: number;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string;
  progressUpdatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  nextReviewAt: string | null;
  scheduledIntervalHours: number | null;
  lastSeenAt: string | null;
  lastReviewedAt: string | null;
  lastDirection: ReviewDirection | null;
  correctCount: number;
  wrongCount: number;
  lastAnswerWasWrong: boolean;
  recentAnswers: boolean[];
  version: number;
}

export interface LanguageSettings {
  learningLanguage: string;
  knownLanguage: string;
  theme: ThemePreference;
  translationMethod: TranslationMethod;
  translationMaxMeanings: number;
}
