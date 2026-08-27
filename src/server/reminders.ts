import { randomUUID, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { pendingReminderMilestone } from "../domain/index.js";

export interface TelegramReminderSettings {
  enabled: boolean;
}

export interface ClaimedTelegramReminder {
  eventId: string;
  chatId: string;
  dueCardCount: number;
  milestoneDays: number;
}

export interface TelegramReminderResult {
  eventId: string;
  ok: boolean;
  errorCode: number | null;
}

interface ReminderCandidateRow {
  user_id: string;
  telegram_user_id: string;
  review_operation_id: string;
  last_studied_at: string;
  due_card_count: number;
  processed_through_days: number | null;
}

export class TelegramReminderRepository {
  constructor(private readonly database: Database.Database) {}

  settings(userId: string): TelegramReminderSettings {
    const row = this.database
      .prepare("SELECT enabled FROM telegram_reminder_settings WHERE user_id = ?")
      .get(userId) as { enabled: number } | undefined;
    return { enabled: row?.enabled === 1 };
  }

  updateSettings(
    userId: string,
    enabled: boolean,
    now = new Date(),
  ): TelegramReminderSettings {
    const timestamp = now.toISOString();
    this.database
      .prepare(`
        INSERT INTO telegram_reminder_settings (user_id, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `)
      .run(userId, enabled ? 1 : 0, timestamp, timestamp);
    return { enabled };
  }

  claimDue(limit = 20, now = new Date()): ClaimedTelegramReminder[] {
    return this.database.transaction(() => {
      const timestamp = now.toISOString();
      const candidates = this.database
        .prepare(`
          WITH ranked_reviews AS (
            SELECT
              review_operations.user_id,
              review_operations.id,
              review_operations.created_at,
              ROW_NUMBER() OVER (
                PARTITION BY review_operations.user_id
                ORDER BY review_operations.created_at DESC, review_operations.id DESC
              ) AS review_rank
            FROM review_operations
            JOIN telegram_reminder_settings
              ON telegram_reminder_settings.user_id = review_operations.user_id
             AND telegram_reminder_settings.enabled = 1
          ), due_counts AS (
            SELECT user_id, COUNT(*) AS due_card_count
            FROM words
            WHERE is_deleted = 0
              AND (next_review_at IS NULL OR next_review_at <= ?)
            GROUP BY user_id
          ), processed_events AS (
            SELECT
              user_id,
              review_operation_id,
              MAX(milestone_days) AS processed_through_days
            FROM telegram_reminder_events
            GROUP BY user_id, review_operation_id
          )
          SELECT
            ranked_reviews.user_id,
            users.telegram_user_id,
            ranked_reviews.id AS review_operation_id,
            ranked_reviews.created_at AS last_studied_at,
            COALESCE(due_counts.due_card_count, 0) AS due_card_count,
            processed_events.processed_through_days
          FROM ranked_reviews
          JOIN users ON users.id = ranked_reviews.user_id
          LEFT JOIN due_counts ON due_counts.user_id = ranked_reviews.user_id
          LEFT JOIN processed_events
            ON processed_events.user_id = ranked_reviews.user_id
           AND processed_events.review_operation_id = ranked_reviews.id
          WHERE ranked_reviews.review_rank = 1
          ORDER BY ranked_reviews.created_at ASC, ranked_reviews.user_id ASC
        `)
        .all(timestamp) as ReminderCandidateRow[];

      const claimed: ClaimedTelegramReminder[] = [];
      const insertEvent = this.database.prepare(`
        INSERT OR IGNORE INTO telegram_reminder_events (
          id, user_id, review_operation_id, milestone_days, due_card_count,
          status, telegram_error_code, created_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `);

      for (const candidate of candidates) {
        const milestone = pendingReminderMilestone(
          candidate.last_studied_at,
          candidate.processed_through_days,
          now,
        );
        if (milestone === null) continue;

        const shouldSend = candidate.due_card_count > 0 && claimed.length < limit;
        if (candidate.due_card_count > 0 && !shouldSend) continue;

        const eventId = randomUUID();
        const status = shouldSend ? "claimed" : "skipped_no_due";
        const result = insertEvent.run(
          eventId,
          candidate.user_id,
          candidate.review_operation_id,
          milestone,
          candidate.due_card_count,
          status,
          timestamp,
          shouldSend ? null : timestamp,
        );
        if (result.changes === 0 || !shouldSend) continue;

        claimed.push({
          eventId,
          chatId: candidate.telegram_user_id,
          dueCardCount: candidate.due_card_count,
          milestoneDays: milestone,
        });
      }

      return claimed;
    })();
  }

  complete(results: readonly TelegramReminderResult[], now = new Date()): void {
    this.database.transaction(() => {
      const timestamp = now.toISOString();
      const completeEvent = this.database.prepare(`
        UPDATE telegram_reminder_events
        SET status = ?, telegram_error_code = ?, completed_at = ?
        WHERE id = ? AND status = 'claimed'
      `);
      const disableUser = this.database.prepare(`
        UPDATE telegram_reminder_settings
        SET enabled = 0, updated_at = ?
        WHERE user_id = (
          SELECT user_id FROM telegram_reminder_events WHERE id = ?
        )
      `);

      for (const result of results) {
        const completed = completeEvent.run(
          result.ok ? "sent" : "failed",
          result.errorCode,
          timestamp,
          result.eventId,
        );
        if (completed.changes === 1 && !result.ok && result.errorCode === 403) {
          disableUser.run(timestamp, result.eventId);
        }
      }
    })();
  }
}

export function hasValidReminderAuthorization(
  received: string | string[] | undefined,
  expectedSecret: string | null,
): boolean {
  if (typeof received !== "string" || expectedSecret === null) return false;
  const prefix = "Bearer ";
  if (!received.startsWith(prefix)) return false;
  const receivedBytes = Buffer.from(received.slice(prefix.length));
  const expectedBytes = Buffer.from(expectedSecret);
  return receivedBytes.length === expectedBytes.length
    && timingSafeEqual(receivedBytes, expectedBytes);
}
