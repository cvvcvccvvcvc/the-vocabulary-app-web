import { useEffect, useMemo, useState } from "react";
import type { UserStatisticsDay, UserStatisticsResponse } from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";
import { Icon } from "./Icons.js";

interface ProgressScreenProps {
  onAddWord(): void;
  onLearn(): void;
  onOpenSettings(): void;
}

export function ProgressScreen({ onAddWord, onLearn, onOpenSettings }: ProgressScreenProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [report, setReport] = useState<UserStatisticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  useEffect(() => {
    let active = true;
    setReport(null);
    setError(null);
    api.statistics(timeZone)
      .then((statistics) => {
        if (active) setReport(statistics);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof ApiError ? requestError.message : "Could not load progress");
      });
    return () => {
      active = false;
    };
  }, [reloadKey, timeZone]);

  return (
    <section className="screen progress-screen">
      <header className="mobile-screen-header progress-mobile-header">
        <h1>Progress</h1>
        <button className="mobile-header-button" type="button" aria-label="Settings" onClick={onOpenSettings}>
          <Icon name="settings" />
        </button>
      </header>

      {report === null && error === null && (
        <div className="progress-message" aria-label="Loading progress">
          <div className="loading-ring" />
        </div>
      )}

      {error !== null && (
        <div className="progress-message">
          <h1>Could not load progress</h1>
          <p>{error}</p>
          <button className="primary-button progress-retry" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Try again
          </button>
        </div>
      )}

      {report !== null && (
        <div className="progress-stack">
          <StreakCard report={report} onAddWord={onAddWord} onLearn={onLearn} />
          <ActivityCard activity={report.activity} />
          <CollectionCard report={report} />
        </div>
      )}
    </section>
  );
}

function StreakCard({
  report,
  onAddWord,
  onLearn,
}: {
  report: UserStatisticsResponse;
  onAddWord(): void;
  onLearn(): void;
}) {
  const { current, studiedToday } = report.streak;
  const hasWords = report.vocabulary.totalWords > 0;
  const status = current > 0
    ? "Review one card today to keep it going."
    : hasWords
      ? "Review one card today to start a streak."
      : "Add your first word, then begin reviewing.";

  return (
    <section className="progress-card streak-card" aria-labelledby="streak-title">
      <div className="streak-summary">
        <span className="streak-icon" aria-hidden="true"><Icon name="flame" /></span>
        <div>
          <p className="progress-eyebrow" id="streak-title">Current streak</p>
          <p className="streak-value"><strong>{formatNumber(current)}</strong><span>day streak</span></p>
          {!studiedToday && <p className="streak-status">{status}</p>}
        </div>
      </div>

      <WeekActivity days={report.activity.slice(-7)} />

      {!studiedToday && (
        <button className="primary-button streak-action" type="button" onClick={hasWords ? onLearn : onAddWord}>
          {hasWords ? "Learn now" : "Add your first word"}
        </button>
      )}
    </section>
  );
}

function WeekActivity({ days }: { days: UserStatisticsDay[] }) {
  return (
    <ol className="streak-week" aria-label="Last seven days">
      {days.map((day, index) => {
        const active = day.answers > 0;
        const today = index === days.length - 1;
        return (
          <li key={day.date} className={today ? "today" : ""} aria-label={`${formatLongDate(day.date)}: ${day.answers} answers`}>
            <span>{formatWeekday(day.date)}</span>
            <span className={active ? "streak-day active" : "streak-day"} aria-hidden="true">
              {active ? "✓" : ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ActivityCard({ activity }: { activity: UserStatisticsDay[] }) {
  const answers = activity.reduce((sum, day) => sum + day.answers, 0);
  const activeDays = activity.filter((day) => day.answers > 0).length;
  const summary = `${formatNumber(answers)} reviews · ${formatNumber(activeDays)} active days`;

  return (
    <section className="progress-card activity-card" aria-labelledby="activity-title">
      <header className="progress-card-heading">
        <div>
          <p className="progress-eyebrow">Past month</p>
          <h2 id="activity-title">Activity</h2>
        </div>
        <p id="activity-summary">{summary}</p>
      </header>
      <ActivityChart activity={activity} label={summary} />
    </section>
  );
}

function ActivityChart({ activity, label }: { activity: UserStatisticsDay[]; label: string }) {
  const width = 680;
  const height = 190;
  const padding = { top: 14, right: 8, bottom: 30, left: 30 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...activity.map((day) => day.answers));
  const ticks = Array.from(new Set([0, Math.ceil(maximum / 2), maximum]));
  const step = innerWidth / activity.length;

  return (
    <svg className="progress-activity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily review activity. ${label}.`}>
      {ticks.map((tick) => {
        const y = padding.top + innerHeight - (tick / maximum) * innerHeight;
        return (
          <g key={tick}>
            <line className="progress-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="progress-axis-text" x={padding.left - 7} y={y + 4} textAnchor="end">{tick}</text>
          </g>
        );
      })}
      {activity.map((day, index) => {
        const barWidth = Math.max(5, step * 0.58);
        const barHeight = (day.answers / maximum) * innerHeight;
        const x = padding.left + step * index + (step - barWidth) / 2;
        const y = padding.top + innerHeight - barHeight;
        return (
          <rect
            key={day.date}
            className="progress-activity-bar"
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={Math.min(4, barWidth / 2)}
          >
            <title>{`${formatLongDate(day.date)}: ${day.answers} reviews`}</title>
          </rect>
        );
      })}
      {activity.map((day, index) => {
        const lastIndex = activity.length - 1;
        const isLastDay = index === lastIndex;
        const isWeeklyLabel = index % 7 === 0 && lastIndex - index > 2;
        if (!isLastDay && !isWeeklyLabel) return null;
        const x = padding.left + step * index + step / 2;
        return (
          <text key={day.date} className="progress-axis-text" x={x} y={height - 9} textAnchor="middle">
            {formatShortDate(day.date)}
          </text>
        );
      })}
    </svg>
  );
}

function CollectionCard({ report }: { report: UserStatisticsResponse }) {
  const levelMaximum = Math.max(1, ...report.vocabulary.wordsByLevel);
  const levelDescription = report.vocabulary.wordsByLevel
    .map((count, level) => `Level ${level}: ${count}`)
    .join(", ");

  return (
    <section className="progress-card collection-card" aria-labelledby="collection-title">
      <header className="collection-heading">
        <h2 className="progress-eyebrow" id="collection-title">Your collection</h2>
        <p className="collection-total">
          <strong>{formatNumber(report.vocabulary.totalWords)}</strong>
          <span>words</span>
        </p>
      </header>

      <div className="level-progress-heading">
        <span>Levels</span>
      </div>
      <div className="level-progress-chart" role="img" aria-label={levelDescription}>
        {report.vocabulary.wordsByLevel.map((count, level) => (
          <div className="level-progress-column" key={level}>
            <span className="level-progress-track" aria-hidden="true">
              <span style={{ height: count === 0 ? 0 : `${Math.max(8, (count / levelMaximum) * 100)}%` }} />
            </span>
            <small>{level}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function parseDay(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

function formatWeekday(day: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "narrow", timeZone: "UTC" }).format(parseDay(day));
}

function formatShortDate(day: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(parseDay(day));
}

function formatLongDate(day: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", timeZone: "UTC" }).format(parseDay(day));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
