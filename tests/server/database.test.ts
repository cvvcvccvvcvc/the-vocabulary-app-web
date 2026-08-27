import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));

describe("database migrations", () => {
  it("separates existing review history from recent retry receipts", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    try {
      for (const migration of [
        "001_initial.sql",
        "002_theme_preference.sql",
        "003_telegram_reminders.sql",
        "004_review_operation_requests.sql",
        "005_user_statistics_indexes.sql",
      ]) {
        database.exec(fs.readFileSync(`${migrationsDirectory}/${migration}`, "utf8"));
      }

      const createdAt = new Date().toISOString();
      const oldCreatedAt = new Date(Date.now() - 8 * 86_400_000).toISOString();
      const nextReviewAt = new Date(Date.now() + 86_400_000).toISOString();
      const request = {
        operationId: "operation-1",
        answer: { wordId: "word-1", correct: true, mode: "scheduled" },
      };
      const response = {
        id: "word-1",
        level: 1,
        nextReviewAt,
        lastDirection: "learning-to-known",
      };
      database.exec(`
        INSERT INTO users (
          id, telegram_user_id, display_name, created_at, updated_at
        ) VALUES ('user-1', '1001', 'Learner', '${createdAt}', '${createdAt}');
        INSERT INTO user_settings (
          user_id, learning_language, known_language, updated_at
        ) VALUES ('user-1', 'en', 'ru', '${createdAt}');
        INSERT INTO words (
          id, user_id, learning_text, normalized_learning_text, meanings_json,
          created_at, updated_at, content_updated_at, progress_updated_at
        ) VALUES (
          'word-1', 'user-1', 'memory', 'memory', '["память"]',
          '${createdAt}', '${createdAt}', '${createdAt}', '${createdAt}'
        );
      `);
      const insertOperation = database.prepare(`
          INSERT INTO review_operations (
            id, user_id, word_id, response_json, created_at, request_json
          ) VALUES (?, 'user-1', 'word-1', ?, ?, ?)
        `);
      insertOperation.run(
        "operation-1",
        JSON.stringify(response),
        createdAt,
        JSON.stringify(request),
      );
      insertOperation.run(
        "operation-old",
        JSON.stringify(response),
        oldCreatedAt,
        JSON.stringify({ ...request, operationId: "operation-old" }),
      );
      database.exec(`
        INSERT INTO telegram_reminder_settings (
          user_id, enabled, created_at, updated_at
        ) VALUES ('user-1', 1, '${createdAt}', '${createdAt}');
        INSERT INTO telegram_reminder_events (
          id, user_id, review_operation_id, milestone_days, due_card_count,
          status, created_at, completed_at
        ) VALUES (
          'reminder-1', 'user-1', 'operation-1', 1, 1,
          'sent', '${createdAt}', '${createdAt}'
        );
      `);

      database.exec(
        fs.readFileSync(`${migrationsDirectory}/006_compact_review_events.sql`, "utf8"),
      );

      expect(database.prepare(`
        SELECT correct, mode, direction, level_before, level_after, next_review_at
        FROM review_events
        WHERE id = 'operation-1' AND user_id = 'user-1'
      `).get()).toEqual({
        correct: 1,
        mode: "scheduled",
        direction: "learning-to-known",
        level_before: null,
        level_after: 1,
        next_review_at: nextReviewAt,
      });
      expect(database.prepare(`
        SELECT COUNT(*) AS count
        FROM review_events
        WHERE user_id = 'user-1'
      `).get()).toEqual({ count: 2 });
      expect(database.prepare(`
        SELECT COUNT(*) AS count
        FROM review_operation_receipts
        WHERE user_id = 'user-1'
      `).get()).toEqual({ count: 1 });
      expect(database.prepare(`
        SELECT review_event_id
        FROM telegram_reminder_events
        WHERE id = 'reminder-1' AND user_id = 'user-1'
      `).get()).toEqual({ review_event_id: "operation-1" });
      expect(database.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_schema
        WHERE type = 'table' AND name = 'review_operations'
      `).get()).toEqual({ count: 0 });
      expect(database.pragma("foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  });
});
