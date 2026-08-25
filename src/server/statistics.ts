import type Database from "better-sqlite3";
import { calculateCurrentStreak, previousDay } from "../domain/index.js";
import type { UserStatisticsDay, UserStatisticsResponse } from "../shared/contracts.js";

const activityDayCount = 28;
const activityLookbackMilliseconds = 30 * 86_400_000;

interface TimestampRow {
  created_at: string;
}

interface LevelRow {
  level: number;
  word_count: number;
  due_count: number;
}

export class StatisticsRepository {
  constructor(private readonly database: Database.Database) {}

  report(userId: string, timeZone: string, now = new Date()): UserStatisticsResponse {
    const formatter = localDayFormatter(timeZone);
    const today = formatLocalDay(now, formatter);
    const activity = this.activity(userId, formatter, today, now);
    const activeDays = this.activeDays(userId, formatter, today);
    const wordsByLevel = Array.from({ length: 10 }, () => 0);
    let totalWords = 0;
    let dueWords = 0;

    const levelRows = this.database
      .prepare(`
        SELECT
          level,
          COUNT(*) AS word_count,
          SUM(
            CASE
              WHEN last_reviewed_at IS NULL OR next_review_at IS NULL OR next_review_at <= ?
              THEN 1 ELSE 0
            END
          ) AS due_count
        FROM words
        WHERE user_id = ? AND is_deleted = 0
        GROUP BY level
        ORDER BY level
      `)
      .all(now.toISOString(), userId) as LevelRow[];

    for (const row of levelRows) {
      wordsByLevel[row.level] = row.word_count;
      totalWords += row.word_count;
      dueWords += row.due_count;
    }

    return {
      generatedAt: now.toISOString(),
      timeZone,
      streak: calculateCurrentStreak(activeDays, today),
      activity,
      vocabulary: { totalWords, dueWords, wordsByLevel },
    };
  }

  private activity(
    userId: string,
    formatter: Intl.DateTimeFormat,
    today: string,
    now: Date,
  ): UserStatisticsDay[] {
    const days = daysEnding(today, activityDayCount);
    const activity = new Map(days.map((date) => [date, { date, answers: 0, wordsAdded: 0 }]));
    const earliestTimestamp = new Date(now.getTime() - activityLookbackMilliseconds).toISOString();

    const reviewRows = this.database
      .prepare(`
        SELECT created_at
        FROM review_operations
        WHERE user_id = ? AND created_at >= ?
        ORDER BY created_at
      `)
      .all(userId, earliestTimestamp) as TimestampRow[];
    for (const row of reviewRows) {
      const day = activity.get(formatLocalDay(new Date(row.created_at), formatter));
      if (day !== undefined) day.answers += 1;
    }

    const wordRows = this.database
      .prepare(`
        SELECT created_at
        FROM words
        WHERE user_id = ? AND created_at >= ?
        ORDER BY created_at
      `)
      .all(userId, earliestTimestamp) as TimestampRow[];
    for (const row of wordRows) {
      const day = activity.get(formatLocalDay(new Date(row.created_at), formatter));
      if (day !== undefined) day.wordsAdded += 1;
    }

    return days.map((date) => activity.get(date) ?? { date, answers: 0, wordsAdded: 0 });
  }

  private activeDays(
    userId: string,
    formatter: Intl.DateTimeFormat,
    today: string,
  ): string[] {
    const rows = this.database
      .prepare(`
        SELECT created_at
        FROM review_operations
        WHERE user_id = ?
        ORDER BY created_at DESC
      `)
      .iterate(userId) as Iterable<TimestampRow>;
    const yesterday = previousDay(today);
    const days: string[] = [];
    let latestDay: string | null = null;
    let expectedDay: string | null = null;

    for (const row of rows) {
      const day = formatLocalDay(new Date(row.created_at), formatter);
      if (latestDay === null) {
        if (day !== today && day !== yesterday) break;
        latestDay = day;
        expectedDay = previousDay(day);
        days.push(day);
        continue;
      }
      if (day === latestDay) continue;
      if (day !== expectedDay) break;
      latestDay = day;
      expectedDay = previousDay(day);
      days.push(day);
    }

    return days;
  }
}

function localDayFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    calendar: "iso8601",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatLocalDay(value: Date, formatter: Intl.DateTimeFormat): string {
  const parts = new Map(
    formatter
      .formatToParts(value)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

function daysEnding(end: string, count: number): string[] {
  const days = [end];
  while (days.length < count) {
    days.unshift(previousDay(days[0] ?? end));
  }
  return days;
}
