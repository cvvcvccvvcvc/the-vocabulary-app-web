import type {
  LanguageSettings,
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
}

export interface SessionResponse {
  user: UserProfile;
}

export interface BootstrapResponse {
  user: UserProfile;
  settings: LanguageSettings;
  words: VocabularyWord[];
}

export interface CreateWordRequest {
  learningText: string;
  meanings: string[];
  comment: string;
}

export interface UpdateWordRequest extends CreateWordRequest {
  version: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
