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
import type {
  ReviewTransitionRequest,
  ReviewTransitionResponse,
  UserProfile,
} from "../shared/contracts.js";

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

interface ReviewOperationReceiptRow {
  word_id: string;
  request_json: string | null;
  response_json: string;
}

interface PersistedAnswer {
  before: VocabularyWord;
  after: VocabularyWord;
}

export class DuplicateWordError extends Error {}
export class ReviewOperationConflictError extends Error {}
export class WordNotFoundError extends Error {}
export class WordVersionConflictError extends Error {}

const reviewOperationReceiptTtlMs = 7 * 86_400_000;

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
    this.persistShown(userId, wordId, direction, now);
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
    const requestJson = JSON.stringify({
      operationId,
      answer: { wordId, correct, mode },
    });

    return this.database.transaction(() => {
      const stored = this.reviewOperationReceipt(userId, operationId, now);
      if (stored !== undefined) {
        if (
          stored.word_id !== wordId
          || (stored.request_json !== null && stored.request_json !== requestJson)
        ) {
          throw new ReviewOperationConflictError("The operation payload does not match");
        }
        return JSON.parse(stored.response_json) as VocabularyWord;
      }
      this.assertReviewEventNotCompleted(userId, operationId);

      const answer = this.persistAnswer(userId, wordId, correct, mode, now);
      const persisted = this.word(userId, wordId);
      this.persistReviewEvent(userId, operationId, wordId, correct, mode, answer, now);
      this.persistReviewOperationReceipt(
        userId,
        operationId,
        wordId,
        requestJson,
        persisted,
        now,
      );
      return persisted;
    })();
  }

  reviewTransition(
    userId: string,
    input: ReviewTransitionRequest,
    now = new Date(),
  ): ReviewTransitionResponse {
    const requestJson = JSON.stringify(input);

    return this.database.transaction(() => {
      const stored = this.reviewOperationReceipt(userId, input.operationId, now);
      if (stored !== undefined) {
        if (
          stored.word_id !== input.answer.wordId
          || stored.request_json !== requestJson
        ) {
          throw new ReviewOperationConflictError("The operation payload does not match");
        }
        return JSON.parse(stored.response_json) as ReviewTransitionResponse;
      }
      this.assertReviewEventNotCompleted(userId, input.operationId);

      const answer = this.persistAnswer(
        userId,
        input.answer.wordId,
        input.answer.correct,
        input.answer.mode,
        now,
      );
      this.persistShown(
        userId,
        input.shown.wordId,
        input.shown.direction,
        now,
      );

      const response: ReviewTransitionResponse = {
        answeredWord: this.word(userId, input.answer.wordId),
        shownWord: this.word(userId, input.shown.wordId),
      };
      this.persistReviewEvent(
        userId,
        input.operationId,
        input.answer.wordId,
        input.answer.correct,
        input.answer.mode,
        answer,
        now,
      );
      this.persistReviewOperationReceipt(
        userId,
        input.operationId,
        input.answer.wordId,
        requestJson,
        response,
        now,
      );
      return response;
    })();
  }

  private reviewOperationReceipt(
    userId: string,
    operationId: string,
    now: Date,
  ): ReviewOperationReceiptRow | undefined {
    this.database
      .prepare("DELETE FROM review_operation_receipts WHERE expires_at <= ?")
      .run(now.toISOString());
    return this.database
      .prepare(`
        SELECT word_id, request_json, response_json
        FROM review_operation_receipts
        WHERE id = ? AND user_id = ?
      `)
      .get(operationId, userId) as ReviewOperationReceiptRow | undefined;
  }

  private assertReviewEventNotCompleted(userId: string, operationId: string): void {
    const completed = this.database
      .prepare("SELECT 1 FROM review_events WHERE id = ? AND user_id = ?")
      .get(operationId, userId);
    if (completed !== undefined) {
      throw new ReviewOperationConflictError(
        "The operation was already completed and its cached response expired",
      );
    }
  }

  private persistReviewEvent(
    userId: string,
    operationId: string,
    wordId: string,
    correct: boolean,
    mode: ReviewMode,
    answer: PersistedAnswer,
    now: Date,
  ): void {
    try {
      this.database
        .prepare(`
          INSERT INTO review_events (
            id, user_id, word_id, correct, mode, direction, level_before,
            level_after, next_review_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          operationId,
          userId,
          wordId,
          correct ? 1 : 0,
          mode,
          answer.before.lastDirection,
          answer.before.level,
          answer.after.level,
          answer.after.nextReviewAt,
          now.toISOString(),
        );
    } catch (error) {
      if (isPrimaryKeyConstraintError(error)) {
        throw new ReviewOperationConflictError("The operation ID is already in use");
      }
      throw error;
    }
  }

  private persistReviewOperationReceipt(
    userId: string,
    operationId: string,
    wordId: string,
    requestJson: string,
    response: VocabularyWord | ReviewTransitionResponse,
    now: Date,
  ): void {
    this.database
      .prepare(`
        INSERT INTO review_operation_receipts (
          id, user_id, word_id, request_json, response_json, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        operationId,
        userId,
        wordId,
        requestJson,
        JSON.stringify(response),
        now.toISOString(),
        new Date(now.getTime() + reviewOperationReceiptTtlMs).toISOString(),
      );
  }

  private persistShown(
    userId: string,
    wordId: string,
    direction: ReviewDirection,
    now: Date,
  ): void {
    const shown = markWordShown(this.word(userId, wordId), direction, now);
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
  }

  private persistAnswer(
    userId: string,
    wordId: string,
    correct: boolean,
    mode: ReviewMode,
    now: Date,
  ): PersistedAnswer {
    const before = this.word(userId, wordId);
    const after = applyReviewAnswer(before, correct, mode, now);
    this.database
      .prepare(`
        UPDATE words SET
          level = ?, next_review_at = ?, correct_count = ?, wrong_count = ?,
          last_answer_was_wrong = ?, last_reviewed_at = ?, progress_updated_at = ?,
          updated_at = ?
        WHERE id = ? AND user_id = ? AND is_deleted = 0
      `)
      .run(
        after.level,
        after.nextReviewAt,
        after.correctCount,
        after.wrongCount,
        after.lastAnswerWasWrong ? 1 : 0,
        after.lastReviewedAt,
        after.progressUpdatedAt,
        after.updatedAt,
        wordId,
        userId,
      );
    return { before, after };
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

function isPrimaryKeyConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  );
}
