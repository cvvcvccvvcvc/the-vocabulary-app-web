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

  it("backfills recent answers from both review modes without changing progress", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    try {
      for (const migration of [
        "001_initial.sql",
        "002_theme_preference.sql",
        "003_telegram_reminders.sql",
        "004_review_operation_requests.sql",
        "005_user_statistics_indexes.sql",
        "006_compact_review_events.sql",
      ]) {
        database.exec(fs.readFileSync(`${migrationsDirectory}/${migration}`, "utf8"));
      }
      database.exec(`
        INSERT INTO users (id, telegram_user_id, created_at, updated_at)
        VALUES ('user-1', '1001', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
        INSERT INTO words (
          id, user_id, learning_text, normalized_learning_text, meanings_json,
          level, next_review_at, last_reviewed_at, last_answer_was_wrong,
          created_at, updated_at, content_updated_at, progress_updated_at
        ) VALUES (
          'word-1', 'user-1', 'memory', 'memory', '["память"]',
          5, '2026-08-30T00:00:00.000Z', '2026-08-20T00:00:00.000Z', 1,
          '2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        ), (
          'word-2', 'user-1', 'fallback', 'fallback', '["запас"]',
          2, NULL, '2026-08-20T00:00:00.000Z', 1,
          '2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        );
      `);
      const insert = database.prepare(`
        INSERT INTO review_events (id, user_id, word_id, correct, mode, created_at)
        VALUES (?, 'user-1', 'word-1', ?, ?, ?)
      `);
      for (let index = 1; index <= 8; index += 1) {
        insert.run(`event-${index}`, index % 2, index % 2 ? "free" : "scheduled",
          `2026-08-${String(index).padStart(2, "0")}T00:00:00.000Z`);
      }
      insert.run("event-null", null, null, "2026-08-09T00:00:00.000Z");

      database.exec(fs.readFileSync(`${migrationsDirectory}/007_recent_review_answers.sql`, "utf8"));
      expect(database.prepare(`
        SELECT level, next_review_at, version, recent_answers_json
        FROM words WHERE id = 'word-1'
      `).get()).toEqual({
        level: 5,
        next_review_at: "2026-08-30T00:00:00.000Z",
        version: 1,
        recent_answers_json: "[0,1,0,1,0,1,0]",
      });
      expect(database.prepare("SELECT recent_answers_json FROM words WHERE id = 'word-2'")
        .get()).toEqual({ recent_answers_json: "[0]" });
    } finally {
      database.close();
    }
  });

  it("extends existing dates from Scheduled history without using Free Review activity", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    try {
      for (const migration of [
        "001_initial.sql",
        "002_theme_preference.sql",
        "003_telegram_reminders.sql",
        "004_review_operation_requests.sql",
        "005_user_statistics_indexes.sql",
        "006_compact_review_events.sql",
        "007_recent_review_answers.sql",
      ]) {
        database.exec(fs.readFileSync(`${migrationsDirectory}/${migration}`, "utf8"));
      }
      database.exec(`
        INSERT INTO users (id, telegram_user_id, created_at, updated_at)
        VALUES ('user-1', '1001', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
      `);
      const insertWord = database.prepare(`
        INSERT INTO words (
          id, user_id, learning_text, normalized_learning_text, meanings_json,
          level, next_review_at, last_reviewed_at,
          created_at, updated_at, content_updated_at, progress_updated_at
        ) VALUES (?, 'user-1', ?, ?, '["значение"]', ?, ?, ?,
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z',
          '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
      `);
      insertWord.run("mature", "mature", "mature", 9,
        "2026-08-15T00:00:00.000Z", "2026-08-10T00:00:00.000Z");
      insertWord.run("middle", "middle", "middle", 5,
        "2026-08-15T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertWord.run("young", "young", "young", 1,
        "2026-08-02T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertWord.run("unknown", "unknown", "unknown", 9,
        "2026-08-15T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
      insertWord.run("new", "new", "new", 0, null, null);
      const insertEvent = database.prepare(`
        INSERT INTO review_events (id, user_id, word_id, correct, mode, created_at)
        VALUES (?, 'user-1', ?, 1, ?, ?)
      `);
      for (const wordId of ["mature", "middle", "young"]) {
        insertEvent.run(`${wordId}-scheduled`, wordId, "scheduled", "2026-08-01T00:00:00.000Z");
      }
      insertEvent.run("mature-free", "mature", "free", "2026-08-10T00:00:00.000Z");

      database.exec(fs.readFileSync(`${migrationsDirectory}/008_scheduled_review_intervals.sql`, "utf8"));
      const rows = database.prepare(`
        SELECT id, next_review_at, scheduled_interval_hours, version
        FROM words ORDER BY id
      `).all();
      expect(rows).toEqual([
        { id: "mature", next_review_at: "2026-08-29T00:00:00.000Z", scheduled_interval_hours: null, version: 1 },
        { id: "middle", next_review_at: "2026-08-22T00:00:00.000Z", scheduled_interval_hours: null, version: 1 },
        { id: "new", next_review_at: null, scheduled_interval_hours: null, version: 1 },
        { id: "unknown", next_review_at: "2026-08-15T00:00:00.000Z", scheduled_interval_hours: null, version: 1 },
        { id: "young", next_review_at: "2026-08-02T00:00:00.000Z", scheduled_interval_hours: null, version: 1 },
      ]);
      expect(database.prepare("SELECT COUNT(*) AS count FROM review_events").get())
        .toEqual({ count: 4 });
    } finally {
      database.close();
    }
  });

  it("replaces legacy WikDict settings with Google and permits Yandex", () => {
    const database = new Database(":memory:");
    try {
      database.exec(fs.readFileSync(`${migrationsDirectory}/001_initial.sql`, "utf8"));
      database.exec(fs.readFileSync(`${migrationsDirectory}/002_theme_preference.sql`, "utf8"));
      database.exec(`
        INSERT INTO users (id, telegram_user_id, created_at, updated_at)
        VALUES ('user-1', '1001', '2026-09-01', '2026-09-01');
        INSERT INTO user_settings (user_id, learning_language, known_language, updated_at)
        VALUES ('user-1', 'en', 'ru', '2026-09-01');
      `);
      database.exec(fs.readFileSync(`${migrationsDirectory}/009_translation_method.sql`, "utf8"));
      expect(database.prepare("SELECT translation_method FROM user_settings WHERE user_id = 'user-1'").get())
        .toEqual({ translation_method: "wikdict" });
      database.exec(fs.readFileSync(`${migrationsDirectory}/010_translation_providers.sql`, "utf8"));
      expect(database.prepare("SELECT translation_method FROM user_settings WHERE user_id = 'user-1'").get())
        .toEqual({ translation_method: "google" });
      database.prepare("UPDATE user_settings SET translation_method = 'yandex' WHERE user_id = 'user-1'").run();
      expect(database.prepare("SELECT translation_method FROM user_settings WHERE user_id = 'user-1'").get())
        .toEqual({ translation_method: "yandex" });
      database.exec(fs.readFileSync(`${migrationsDirectory}/011_translation_max_meanings.sql`, "utf8"));
      expect(database.prepare("SELECT translation_max_meanings FROM user_settings WHERE user_id = 'user-1'").get())
        .toEqual({ translation_max_meanings: 3 });
      database.prepare("UPDATE user_settings SET translation_max_meanings = 8 WHERE user_id = 'user-1'").run();
      expect(database.prepare("SELECT translation_max_meanings FROM user_settings WHERE user_id = 'user-1'").get())
        .toEqual({ translation_max_meanings: 8 });
      expect(() => database.prepare("UPDATE user_settings SET translation_max_meanings = 9 WHERE user_id = 'user-1'").run())
        .toThrow();
    } finally {
      database.close();
    }
  });
});
