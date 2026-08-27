import type Database from "better-sqlite3";
import type {
  AnalyticsActivityPeriod,
  AnalyticsResponse,
  AnalyticsUsageDay,
  AnalyticsUser,
} from "../shared/contracts.js";

const analyticsTimeZone = "Asia/Yekaterinburg" as const;
const yekaterinburgOffsetHours = 5;
const sqliteLocalTimeModifier = "+5 hours";

interface CountRow {
  period: string;
  count: number;
}

interface UsageRow {
  date: string;
  answers: number;
  words_added: number;
}

interface AnalyticsUserRow {
  id: string;
  display_name: string;
  username: string | null;
  photo_url: string | null;
  created_at: string;
  last_studied_at: string | null;
  active_card_count: number;
  words_added_count: number;
  answer_count: number;
}

export class AnalyticsRepository {
  constructor(private readonly database: Database.Database) {}

  canAccess(userId: string, ownerTelegramUserId: string): boolean {
    return this.database
      .prepare("SELECT 1 FROM users WHERE id = ? AND telegram_user_id = ?")
      .get(userId, ownerTelegramUserId) !== undefined;
  }

  report(now = new Date()): AnalyticsResponse {
    const today = localDay(now);
    const firstDay = this.database
      .prepare(`
        SELECT MIN(date(created_at, '${sqliteLocalTimeModifier}')) AS first_day
        FROM users
      `)
      .get() as { first_day: string | null };
    const startDay = firstDay.first_day;

    const registrationCounts = this.counts(`
      SELECT date(created_at, '${sqliteLocalTimeModifier}') AS period, COUNT(*) AS count
      FROM users
      GROUP BY period
      ORDER BY period
    `);
    let totalUsers = 0;
    const registrations = startDay === null
      ? []
      : daysBetween(startDay, today).map((date) => {
          const newUsers = registrationCounts.get(date) ?? 0;
          totalUsers += newUsers;
          return { date, newUsers, totalUsers };
        });

    const days = this.activityPeriods(
      `date(created_at, '${sqliteLocalTimeModifier}')`,
      startDay === null ? [] : daysBetween(startDay, today),
    );
    const weeks = this.activityPeriods(
      `date(
        created_at,
        '${sqliteLocalTimeModifier}',
        printf('-%d days',
          (CAST(strftime('%w', created_at, '${sqliteLocalTimeModifier}') AS INTEGER) + 6) % 7
        )
      )`,
      startDay === null ? [] : weeksBetween(startOfWeek(startDay), startOfWeek(today)),
    );
    const months = this.activityPeriods(
      `substr(date(created_at, '${sqliteLocalTimeModifier}'), 1, 7) || '-01'`,
      startDay === null ? [] : monthsBetween(startOfMonth(startDay), startOfMonth(today)),
    );

    const usageRows = this.database
      .prepare(`
        WITH answer_counts AS (
          SELECT date(created_at, '${sqliteLocalTimeModifier}') AS date, COUNT(*) AS answers
          FROM review_events
          GROUP BY date
        ), word_counts AS (
          SELECT date(created_at, '${sqliteLocalTimeModifier}') AS date, COUNT(*) AS words_added
          FROM words
          GROUP BY date
        )
        SELECT
          COALESCE(answer_counts.date, word_counts.date) AS date,
          COALESCE(answer_counts.answers, 0) AS answers,
          COALESCE(word_counts.words_added, 0) AS words_added
        FROM answer_counts
        FULL OUTER JOIN word_counts ON word_counts.date = answer_counts.date
        ORDER BY date
      `)
      .all() as UsageRow[];
    const usageByDate = new Map(usageRows.map((row) => [row.date, row]));
    const usage: AnalyticsUsageDay[] = startDay === null
      ? []
      : daysBetween(startDay, today).map((date) => {
          const row = usageByDate.get(date);
          return {
            date,
            answers: row?.answers ?? 0,
            wordsAdded: row?.words_added ?? 0,
          };
        });

    const users = this.users();
    const todayUsage = usage.at(-1);

    return {
      generatedAt: now.toISOString(),
      timeZone: analyticsTimeZone,
      summary: {
        totalUsers,
        activeToday: days.at(-1)?.activeUsers ?? 0,
        activeThisWeek: weeks.at(-1)?.activeUsers ?? 0,
        activeThisMonth: months.at(-1)?.activeUsers ?? 0,
        answersToday: todayUsage?.answers ?? 0,
        wordsAddedToday: todayUsage?.wordsAdded ?? 0,
      },
      registrations,
      activity: { days, weeks, months },
      usage,
      users,
    };
  }

  private counts(sql: string): Map<string, number> {
    const rows = this.database.prepare(sql).all() as CountRow[];
    return new Map(rows.map((row) => [row.period, row.count]));
  }

  private activityPeriods(expression: string, periods: string[]): AnalyticsActivityPeriod[] {
    const counts = this.counts(`
      SELECT ${expression} AS period, COUNT(DISTINCT user_id) AS count
      FROM review_events
      GROUP BY period
      ORDER BY period
    `);
    return periods.map((periodStart) => ({
      periodStart,
      activeUsers: counts.get(periodStart) ?? 0,
    }));
  }

  private users(): AnalyticsUser[] {
    const rows = this.database
      .prepare(`
        WITH word_stats AS (
          SELECT
            user_id,
            SUM(CASE WHEN is_deleted = 0 THEN 1 ELSE 0 END) AS active_card_count,
            COUNT(*) AS words_added_count
          FROM words
          GROUP BY user_id
        ), answer_stats AS (
          SELECT
            user_id,
            MAX(created_at) AS last_studied_at,
            COUNT(*) AS answer_count
          FROM review_events
          GROUP BY user_id
        )
        SELECT
          users.id,
          users.display_name,
          users.username,
          users.photo_url,
          users.created_at,
          answer_stats.last_studied_at,
          COALESCE(word_stats.active_card_count, 0) AS active_card_count,
          COALESCE(word_stats.words_added_count, 0) AS words_added_count,
          COALESCE(answer_stats.answer_count, 0) AS answer_count
        FROM users
        LEFT JOIN word_stats ON word_stats.user_id = users.id
        LEFT JOIN answer_stats ON answer_stats.user_id = users.id
        ORDER BY active_card_count DESC, users.display_name COLLATE NOCASE
      `)
      .all() as AnalyticsUserRow[];

    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      username: row.username,
      photoUrl: row.photo_url,
      registeredAt: row.created_at,
      lastStudiedAt: row.last_studied_at,
      activeCardCount: row.active_card_count,
      wordsAddedCount: row.words_added_count,
      answerCount: row.answer_count,
    }));
  }
}

function localDay(now: Date): string {
  return new Date(now.getTime() + yekaterinburgOffsetHours * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function startOfWeek(day: string): string {
  const date = parseDay(day);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return formatDay(date);
}

function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function daysBetween(start: string, end: string): string[] {
  return periodsBetween(start, end, (date) => date.setUTCDate(date.getUTCDate() + 1));
}

function weeksBetween(start: string, end: string): string[] {
  return periodsBetween(start, end, (date) => date.setUTCDate(date.getUTCDate() + 7));
}

function monthsBetween(start: string, end: string): string[] {
  return periodsBetween(start, end, (date) => date.setUTCMonth(date.getUTCMonth() + 1));
}

function periodsBetween(
  start: string,
  end: string,
  advance: (date: Date) => void,
): string[] {
  const periods: string[] = [];
  const cursor = parseDay(start);
  while (formatDay(cursor) <= end) {
    periods.push(formatDay(cursor));
    advance(cursor);
  }
  return periods;
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
