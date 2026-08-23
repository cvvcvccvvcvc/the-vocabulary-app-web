export type ReviewDirection = "learning-to-known" | "known-to-learning";
export type ReviewMode = "scheduled" | "free";

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
  lastSeenAt: string | null;
  lastReviewedAt: string | null;
  lastDirection: ReviewDirection | null;
  correctCount: number;
  wrongCount: number;
  lastAnswerWasWrong: boolean;
  version: number;
}

export interface LanguageSettings {
  learningLanguage: string;
  knownLanguage: string;
}

