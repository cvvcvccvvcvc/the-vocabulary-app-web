import { createHash, randomBytes, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  applyReviewAnswer,
  markWordShown,
  type LanguageSettings,
  type ReviewDirection,
  type ReviewMode,
  type VocabularyWord,
} from "../domain/index.js";
import type { UserProfile } from "../shared/contracts.js";

export interface TelegramIdentity {
  telegramUserId: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
}

export interface WordContentInput {
  learningText: string;
  meanings: string[];
  comment: string;
}

interface WordRow {
  id: string;
  learning_text: string;
  meanings_json: string;
  comment: string;
  level: number;
  created_at: string;
  updated_at: string;
  content_updated_at: string;
  progress_updated_at: string;
  is_deleted: number;
  deleted_at: string | null;
  next_review_at: string | null;
  last_seen_at: string | null;
  last_reviewed_at: string | null;
  last_direction: ReviewDirection | null;
  correct_count: number;
  wrong_count: number;
  last_answer_was_wrong: number;
  version: number;
}

interface UserRow {
  id: string;
  display_name: string;
  username: string | null;
  photo_url: string | null;
}

export class DuplicateWordError extends Error {}
export class ReviewOperationConflictError extends Error {}
export class WordNotFoundError extends Error {}
export class WordVersionConflictError extends Error {}

function mapWord(row: WordRow): VocabularyWord {
  return {
    id: row.id,
    learningText: row.learning_text,
    meanings: JSON.parse(row.meanings_json) as string[],
    comment: row.comment,
    level: row.level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contentUpdatedAt: row.content_updated_at,
    progressUpdatedAt: row.progress_updated_at,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
    nextReviewAt: row.next_review_at,
    lastSeenAt: row.last_seen_at,
    lastReviewedAt: row.last_reviewed_at,
    lastDirection: row.last_direction,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    lastAnswerWasWrong: row.last_answer_was_wrong === 1,
    version: row.version,
  };
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    photoUrl: row.photo_url,
  };
}

function normalizeLearningText(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class VocabularyRepository {
  constructor(private readonly database: Database.Database) {}

  ensureUser(identity: TelegramIdentity, now = new Date()): UserProfile {
    return this.database.transaction(() => {
      const existing = this.database
        .prepare("SELECT id, display_name, username, photo_url FROM users WHERE telegram_user_id = ?")
        .get(identity.telegramUserId) as UserRow | undefined;
      const timestamp = now.toISOString();

      if (existing !== undefined) {
        this.database
          .prepare(`
            UPDATE users
            SET display_name = ?, username = ?, photo_url = ?, updated_at = ?
            WHERE id = ?
          `)
          .run(
            identity.displayName,
            identity.username,
            identity.photoUrl,
            timestamp,
            existing.id,
          );
        return { ...mapUser(existing), ...identityToProfile(identity, existing.id) };
      }

      const id = randomUUID();
      this.database
        .prepare(`
          INSERT INTO users (
            id, telegram_user_id, display_name, username, photo_url, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          identity.telegramUserId,
          identity.displayName,
          identity.username,
          identity.photoUrl,
          timestamp,
          timestamp,
        );
      this.database
        .prepare(`
          INSERT INTO user_settings (user_id, learning_language, known_language, updated_at)
          VALUES (?, 'en', 'ru', ?)
        `)
        .run(id, timestamp);
      return identityToProfile(identity, id);
    })();
  }

  createSession(userId: string, now = new Date()): string {
    const token = randomBytes(32).toString("base64url");
    const timestamp = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 86_400_000).toISOString();
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(timestamp);
      this.database
        .prepare(`
          INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
          VALUES (?, ?, ?, ?)
        `)
        .run(tokenHash(token), userId, expiresAt, timestamp);
    })();
    return token;
  }

  sessionUser(token: string, now = new Date()): UserProfile | null {
    const row = this.database
      .prepare(`
        SELECT users.id, users.display_name, users.username, users.photo_url
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `)
      .get(tokenHash(token), now.toISOString()) as UserRow | undefined;
    return row === undefined ? null : mapUser(row);
  }

  deleteSession(token: string): void {
    this.database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  createAuthFlow(state: string, codeVerifier: string, now = new Date()): void {
    this.database.prepare("DELETE FROM auth_flows WHERE expires_at <= ?").run(now.toISOString());
    this.database
      .prepare(`
        INSERT INTO auth_flows (state_hash, code_verifier, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(
        tokenHash(state),
        codeVerifier,
        new Date(now.getTime() + 10 * 60_000).toISOString(),
        now.toISOString(),
      );
  }

  consumeAuthFlow(state: string, now = new Date()): string | null {
    return this.database.transaction(() => {
      const stateHash = tokenHash(state);
      const row = this.database
        .prepare("SELECT code_verifier, expires_at FROM auth_flows WHERE state_hash = ?")
        .get(stateHash) as { code_verifier: string; expires_at: string } | undefined;
      this.database.prepare("DELETE FROM auth_flows WHERE state_hash = ?").run(stateHash);

      if (row === undefined || row.expires_at <= now.toISOString()) {
        return null;
      }
      return row.code_verifier;
    })();
  }

  settings(userId: string): LanguageSettings {
    const row = this.database
      .prepare(`
        SELECT learning_language, known_language, theme
        FROM user_settings WHERE user_id = ?
      `)
      .get(userId) as
      | { learning_language: string; known_language: string; theme: LanguageSettings["theme"] }
      | undefined;

    return {
      learningLanguage: row?.learning_language ?? "en",
      knownLanguage: row?.known_language ?? "ru",
      theme: row?.theme ?? "system",
    };
  }

  updateSettings(
    userId: string,
    settings: LanguageSettings,
    now = new Date(),
  ): LanguageSettings {
    this.database
      .prepare(`
        INSERT INTO user_settings (user_id, learning_language, known_language, theme, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          learning_language = excluded.learning_language,
          known_language = excluded.known_language,
          theme = excluded.theme,
          updated_at = excluded.updated_at
      `)
      .run(
        userId,
        settings.learningLanguage,
        settings.knownLanguage,
        settings.theme,
        now.toISOString(),
      );
    return settings;
  }

  listWords(userId: string): VocabularyWord[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM words
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY created_at ASC
      `)
      .all(userId) as WordRow[];
    return rows.map(mapWord);
  }

  findWordByLearningText(userId: string, learningText: string): VocabularyWord | null {
    const row = this.database
      .prepare(`
        SELECT * FROM words
        WHERE user_id = ? AND normalized_learning_text = ? AND is_deleted = 0
      `)
      .get(userId, normalizeLearningText(learningText)) as WordRow | undefined;
    return row === undefined ? null : mapWord(row);
  }

  createWord(userId: string, input: WordContentInput, now = new Date()): VocabularyWord {
    const id = randomUUID();
    const timestamp = now.toISOString();

    try {
      this.database
        .prepare(`
          INSERT INTO words (
            id, user_id, learning_text, normalized_learning_text, meanings_json, comment,
            created_at, updated_at, content_updated_at, progress_updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          userId,
          input.learningText,
          normalizeLearningText(input.learningText),
          JSON.stringify(input.meanings),
          input.comment,
          timestamp,
          timestamp,
          timestamp,
          timestamp,
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateWordError("This word already exists");
      }
      throw error;
    }

    return this.word(userId, id);
  }

  updateWord(
    userId: string,
    wordId: string,
    expectedVersion: number,
    input: WordContentInput,
    now = new Date(),
  ): VocabularyWord {
    const timestamp = now.toISOString();

    try {
      const result = this.database
        .prepare(`
          UPDATE words SET
            learning_text = ?, normalized_learning_text = ?, meanings_json = ?, comment = ?,
            updated_at = ?, content_updated_at = ?, version = version + 1
          WHERE id = ? AND user_id = ? AND is_deleted = 0 AND version = ?
        `)
        .run(
          input.learningText,
          normalizeLearningText(input.learningText),
          JSON.stringify(input.meanings),
          input.comment,
          timestamp,
          timestamp,
          wordId,
          userId,
          expectedVersion,
        );

      if (result.changes === 0) {
        this.assertWordExists(userId, wordId);
        throw new WordVersionConflictError("The word changed on another device");
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new DuplicateWordError("This word already exists");
      }
      throw error;
    }

    return this.word(userId, wordId);
  }

  deleteWord(userId: string, wordId: string, now = new Date()): void {
    const timestamp = now.toISOString();
    const result = this.database
      .prepare(`
        UPDATE words SET
          is_deleted = 1, deleted_at = ?, updated_at = ?, content_updated_at = ?,
          version = version + 1
        WHERE id = ? AND user_id = ? AND is_deleted = 0
      `)
      .run(timestamp, timestamp, timestamp, wordId, userId);

    if (result.changes === 0) {
      throw new WordNotFoundError("Word not found");
    }
  }

  markShown(
    userId: string,
    wordId: string,
    direction: ReviewDirection,
    now = new Date(),
  ): VocabularyWord {
    const current = this.word(userId, wordId);
    const shown = markWordShown(current, direction, now);
    this.database
      .prepare(`
        UPDATE words SET
          last_direction = ?, last_seen_at = ?, progress_updated_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND is_deleted = 0
      `)
      .run(
        shown.lastDirection,
        shown.lastSeenAt,
        shown.progressUpdatedAt,
        shown.updatedAt,
        wordId,
        userId,
      );
    return this.word(userId, wordId);
  }

  answerWord(
    userId: string,
    wordId: string,
    operationId: string,
    correct: boolean,
    mode: ReviewMode,
    now = new Date(),
  ): VocabularyWord {
    return this.database.transaction(() => {
      const stored = this.database
        .prepare(`
          SELECT word_id, response_json FROM review_operations WHERE id = ? AND user_id = ?
        `)
        .get(operationId, userId) as { word_id: string; response_json: string } | undefined;
      if (stored !== undefined) {
        if (stored.word_id !== wordId) {
          throw new ReviewOperationConflictError("The operation belongs to another word");
        }
        return JSON.parse(stored.response_json) as VocabularyWord;
      }

      const current = this.word(userId, wordId);
      const answered = applyReviewAnswer(current, correct, mode, now);
      this.database
        .prepare(`
          UPDATE words SET
            level = ?, next_review_at = ?, correct_count = ?, wrong_count = ?,
            last_answer_was_wrong = ?, last_reviewed_at = ?, progress_updated_at = ?,
            updated_at = ?
          WHERE id = ? AND user_id = ? AND is_deleted = 0
        `)
        .run(
          answered.level,
          answered.nextReviewAt,
          answered.correctCount,
          answered.wrongCount,
          answered.lastAnswerWasWrong ? 1 : 0,
          answered.lastReviewedAt,
          answered.progressUpdatedAt,
          answered.updatedAt,
          wordId,
          userId,
        );

      const persisted = this.word(userId, wordId);
      this.database
        .prepare(`
          INSERT INTO review_operations (id, user_id, word_id, response_json, created_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(operationId, userId, wordId, JSON.stringify(persisted), now.toISOString());
      return persisted;
    })();
  }

  private word(userId: string, wordId: string): VocabularyWord {
    const row = this.database
      .prepare("SELECT * FROM words WHERE id = ? AND user_id = ? AND is_deleted = 0")
      .get(wordId, userId) as WordRow | undefined;
    if (row === undefined) {
      throw new WordNotFoundError("Word not found");
    }
    return mapWord(row);
  }

  private assertWordExists(userId: string, wordId: string): void {
    const row = this.database
      .prepare("SELECT 1 FROM words WHERE id = ? AND user_id = ? AND is_deleted = 0")
      .get(wordId, userId);
    if (row === undefined) {
      throw new WordNotFoundError("Word not found");
    }
  }
}

function identityToProfile(identity: TelegramIdentity, id: string): UserProfile {
  return {
    id,
    displayName: identity.displayName,
    username: identity.username,
    photoUrl: identity.photoUrl,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("SQLITE_CONSTRAINT_UNIQUE")
  );
}
