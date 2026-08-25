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

  const isEmptyProgress = report !== null
    && report.vocabulary.totalWords === 0
    && report.activity.every((day) => day.answers === 0);

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
          {isEmptyProgress ? (
            <EmptyProgress onAddWord={onAddWord} />
          ) : (
            <>
              <StreakCard report={report} onAddWord={onAddWord} onLearn={onLearn} />
              <ActivityCard activity={report.activity} />
              <CollectionCard report={report} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyProgress({ onAddWord }: { onAddWord(): void }) {
  return (
    <section className="progress-card progress-empty-state">
      <h2>Add your first word</h2>
      <p>Your progress will appear here after you begin reviewing.</p>
      <button className="primary-button" type="button" onClick={onAddWord}>Add word</button>
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
          <p className="streak-value">
            <strong>{formatNumber(current)}</strong>
            <span>{current === 1 ? "day" : "days"}</span>
          </p>
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
  const activeDays = activity.filter((day) => day.answers > 0).length;
  const summary = formatUnit(activeDays, "active day", "active days");

  return (
    <section className="progress-card activity-card" aria-labelledby="activity-title">
      <header className="progress-card-heading">
        <div>
          <p className="progress-eyebrow">Last 30 days</p>
          <h2 id="activity-title">Review activity</h2>
        </div>
        <p id="activity-summary">{summary}</p>
      </header>
      <ActivityChart activity={activity} label={summary} />
    </section>
  );
}

function ActivityChart({ activity, label }: { activity: UserStatisticsDay[]; label: string }) {
  const observedMaximum = Math.max(1, ...activity.map((day) => day.answers));
  const tickStep = Math.max(1, Math.ceil(observedMaximum / 2));
  const maximum = tickStep * 2;
  const ticks = [maximum, tickStep, 0];
  const columns = { gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` };

  return (
    <figure className="progress-activity-chart" role="img" aria-label={`Daily review activity. ${label}.`}>
      <div className="progress-activity-y-axis" aria-hidden="true">
        {ticks.map((tick) => <span key={tick}>{tick}</span>)}
      </div>
      <div className="progress-activity-plot" aria-hidden="true">
        <div className="progress-grid-lines">
          {ticks.map((tick) => <span key={tick} />)}
        </div>
        <div className="progress-activity-bars" style={columns}>
          {activity.map((day) => (
            <span
              className="progress-activity-bar"
              key={day.date}
              style={{ height: `${(day.answers / maximum) * 100}%` }}
              title={`${formatLongDate(day.date)}: ${formatUnit(day.answers, "review")}`}
            />
          ))}
        </div>
      </div>
      <div className="progress-date-labels" style={columns} aria-hidden="true">
        {activity.map((day, index) => {
          const lastIndex = activity.length - 1;
          const isLastDay = index === lastIndex;
          const isWeeklyLabel = index % 7 === 0 && lastIndex - index > 2;
          if (!isLastDay && !isWeeklyLabel) return null;
          const edgeClass = index === 0 ? " edge-start" : isLastDay ? " edge-end" : "";
          return (
            <span className={`progress-date-label${edgeClass}`} key={day.date} style={{ gridColumn: index + 1 }}>
              {formatShortDate(day.date)}
            </span>
          );
        })}
      </div>
    </figure>
  );
}

function CollectionCard({ report }: { report: UserStatisticsResponse }) {
  const levelMaximum = Math.max(1, ...report.vocabulary.wordsByLevel);
  const levelDescription = report.vocabulary.wordsByLevel
    .map((count, level) => `Level ${level}: ${count}`)
    .join(", ");

  return (
    <section className="progress-card collection-card" aria-labelledby="collection-title">
      <header className="progress-card-heading">
        <div>
          <p className="progress-eyebrow">Your collection</p>
          <h2 id="collection-title">Word levels</h2>
        </div>
        <p>{formatUnit(report.vocabulary.totalWords, "word")}</p>
      </header>

      <div className="level-progress-chart" role="img" aria-label={levelDescription}>
        {report.vocabulary.wordsByLevel.map((count, level) => (
          <div className="level-progress-column" key={level}>
            <span className="level-progress-count" aria-hidden="true">
              {count > 0 ? formatNumber(count) : ""}
            </span>
            <span className="level-progress-bar-area" aria-hidden="true">
              <span className="level-progress-bar" style={{ height: `${(count / levelMaximum) * 100}%` }} />
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

function formatUnit(value: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}
