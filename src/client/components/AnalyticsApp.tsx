import { useEffect, useMemo, useState } from "react";
import type {
  AnalyticsResponse,
  AnalyticsUser,
} from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";

type ActivityRange = "days" | "weeks" | "months";
type SortKey =
  | "displayName"
  | "registeredAt"
  | "lastStudiedAt"
  | "activeCardCount"
  | "wordsAddedCount"
  | "answerCount";
type SortDirection = "ascending" | "descending";

interface ChartDatum {
  period: string;
  value: number;
}

interface MetricChartProps {
  data: ChartDatum[];
  label: string;
  color: string;
  kind?: "bar" | "line";
  periodKind?: ActivityRange;
}

const analyticsTimeZone = "Asia/Yekaterinburg";

export function AnalyticsApp() {
  const [report, setReport] = useState<AnalyticsResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "unavailable" | "error">("loading");

  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      document.documentElement.dataset.theme = colorScheme.matches ? "dark" : "light";
    };
    applyTheme();
    colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, []);

  useEffect(() => {
    let active = true;
    api.analytics()
      .then((result) => {
        if (!active) return;
        setReport(result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setStatus("signed-out");
        } else if (error instanceof ApiError && error.status === 404) {
          setStatus("unavailable");
        } else {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (status === "loading") {
    return <AnalyticsMessage><div className="loading-ring" aria-label="Loading analytics" /></AnalyticsMessage>;
  }

  if (status === "signed-out") {
    return (
      <AnalyticsMessage>
        <h1>Sign in first</h1>
        <p>Open Vocabulary and sign in with the owner Telegram account, then return to this page.</p>
        <a className="primary-button analytics-message-action" href="/">Open Vocabulary</a>
      </AnalyticsMessage>
    );
  }

  if (status === "unavailable") {
    return (
      <AnalyticsMessage>
        <h1>Page not found</h1>
        <p>This page is available only to the Vocabulary owner.</p>
        <a className="secondary-button analytics-message-action" href="/">Open Vocabulary</a>
      </AnalyticsMessage>
    );
  }

  if (status === "error" || report === null) {
    return (
      <AnalyticsMessage>
        <h1>Could not load analytics</h1>
        <p>Please refresh the page and try again.</p>
        <button className="primary-button analytics-message-action" type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </AnalyticsMessage>
    );
  }

  return <AnalyticsDashboard report={report} />;
}

function AnalyticsMessage({ children }: { children: React.ReactNode }) {
  return <main className="analytics-message"><section>{children}</section></main>;
}

function AnalyticsDashboard({ report }: { report: AnalyticsResponse }) {
  const [activityRange, setActivityRange] = useState<ActivityRange>("days");
  const [sortKey, setSortKey] = useState<SortKey>("activeCardCount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("descending");
  const activity = report.activity[activityRange];
  const sortedUsers = useMemo(
    () => sortUsers(report.users, sortKey, sortDirection),
    [report.users, sortDirection, sortKey],
  );

  function selectSort(nextKey: SortKey): void {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "displayName" ? "ascending" : "descending");
  }

  return (
    <main className="analytics-page">
      <header className="analytics-header">
        <div>
          <p className="analytics-eyebrow">Vocabulary</p>
          <h1>Analytics</h1>
          <p>Learning activity, registrations, and saved cards.</p>
        </div>
        <a className="secondary-button analytics-open-app" href="/">Open app</a>
      </header>

      <section className="analytics-summary" aria-label="Current summary">
        <SummaryCard label="Registered users" value={report.summary.totalUsers} />
        <SummaryCard label="Active today" value={report.summary.activeToday} />
        <SummaryCard label="Active this week" value={report.summary.activeThisWeek} incomplete />
        <SummaryCard label="Active this month" value={report.summary.activeThisMonth} incomplete />
        <SummaryCard label="Answers today" value={report.summary.answersToday} />
        <SummaryCard label="Words added today" value={report.summary.wordsAddedToday} />
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading">
          <div>
            <p className="analytics-eyebrow">Growth</p>
            <h2>Users since launch</h2>
          </div>
          <span>{report.registrations.length} days</span>
        </div>
        <div className="analytics-chart-grid">
          <ChartCard title="New users by day">
            <MetricChart
              label="New registered users by day"
              data={report.registrations.map((point) => ({ period: point.date, value: point.newUsers }))}
              color="var(--accent)"
            />
          </ChartCard>
          <ChartCard title="Total registered users">
            <MetricChart
              label="Total registered users by day"
              data={report.registrations.map((point) => ({ period: point.date, value: point.totalUsers }))}
              color="var(--analytics-purple)"
              kind="line"
            />
          </ChartCard>
        </div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading activity-heading">
          <div>
            <p className="analytics-eyebrow">Activity</p>
            <h2>Users who answered at least one card</h2>
          </div>
          <div className="analytics-segmented" aria-label="Activity period">
            {(["days", "weeks", "months"] as const).map((range) => (
              <button
                key={range}
                className={activityRange === range ? "active" : ""}
                type="button"
                aria-pressed={activityRange === range}
                onClick={() => setActivityRange(range)}
              >
                {range === "days" ? "DAU" : range === "weeks" ? "WAU" : "MAU"}
              </button>
            ))}
          </div>
        </div>
        <MetricChart
          label={`${activityRange} with active learners`}
          data={activity.map((point) => ({ period: point.periodStart, value: point.activeUsers }))}
          color="var(--analytics-green)"
          periodKind={activityRange}
        />
        {(activityRange === "weeks" || activityRange === "months") && (
          <p className="analytics-footnote">The current {activityRange === "weeks" ? "week" : "month"} is still in progress.</p>
        )}
      </section>

      <section className="analytics-panel">
        <div className="analytics-panel-heading">
          <div>
            <p className="analytics-eyebrow">Learning volume</p>
            <h2>Daily product activity</h2>
          </div>
        </div>
        <div className="analytics-chart-grid">
          <ChartCard title="Answers by day">
            <MetricChart
              label="Card answers by day"
              data={report.usage.map((point) => ({ period: point.date, value: point.answers }))}
              color="var(--analytics-orange)"
            />
          </ChartCard>
          <ChartCard title="Words added by day">
            <MetricChart
              label="Words added by day"
              data={report.usage.map((point) => ({ period: point.date, value: point.wordsAdded }))}
              color="var(--analytics-purple)"
            />
          </ChartCard>
        </div>
      </section>

      <section className="analytics-panel analytics-users-panel">
        <div className="analytics-panel-heading">
          <div>
            <p className="analytics-eyebrow">People</p>
            <h2>Users</h2>
          </div>
          <span>{report.users.length} total</span>
        </div>
        <div className="analytics-table-scroll">
          <table className="analytics-table">
            <thead>
              <tr>
                <SortableHeader label="User" sortKey="displayName" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} />
                <SortableHeader label="Registered" sortKey="registeredAt" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} />
                <SortableHeader label="Last studied" sortKey="lastStudiedAt" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} />
                <SortableHeader label="Active cards" sortKey="activeCardCount" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} numeric />
                <SortableHeader label="Words added" sortKey="wordsAddedCount" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} numeric />
                <SortableHeader label="Answers" sortKey="answerCount" currentKey={sortKey} direction={sortDirection} onSelect={selectSort} numeric />
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => <AnalyticsUserRow key={user.id} user={user} />)}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="analytics-footer">
        Times are grouped in Asia/Yekaterinburg. Updated {formatDateTime(report.generatedAt)}.
      </footer>
    </main>
  );
}

function SummaryCard({ label, value, incomplete = false }: { label: string; value: number; incomplete?: boolean }) {
  return (
    <article className="analytics-summary-card">
      <strong>{formatNumber(value)}</strong>
      <span>{label}</span>
      {incomplete && <small>Current period</small>}
    </article>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="analytics-chart-card"><h3>{title}</h3>{children}</article>;
}

function MetricChart({ data, label, color, kind = "bar", periodKind = "days" }: MetricChartProps) {
  if (data.length === 0) {
    return <p className="analytics-empty">No data yet.</p>;
  }

  const width = Math.max(520, data.length * (kind === "bar" ? 22 : 16));
  const height = 238;
  const padding = { top: 16, right: 18, bottom: 40, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maximum = Math.max(1, ...data.map((point) => point.value));
  const tickValues = chartTicks(maximum);
  const step = innerWidth / data.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const lineCoordinates = data.map((point, index) => {
    const x = padding.left + step * index + step / 2;
    const y = padding.top + innerHeight - (point.value / maximum) * innerHeight;
    return { x, y };
  });
  const linePoints = lineCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className="analytics-chart-scroll">
      <svg className="analytics-chart" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <title>{label}</title>
        {tickValues.map((tick) => {
          const y = padding.top + innerHeight - (tick / maximum) * innerHeight;
          return (
            <g key={tick}>
              <line className="analytics-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="analytics-axis-text" x={padding.left - 9} y={y + 4} textAnchor="end">{formatNumber(tick)}</text>
            </g>
          );
        })}
        {kind === "bar" ? data.map((point, index) => {
          const barWidth = Math.max(4, step * 0.58);
          const barHeight = (point.value / maximum) * innerHeight;
          const x = padding.left + step * index + (step - barWidth) / 2;
          const y = padding.top + innerHeight - barHeight;
          return (
            <rect key={point.period} x={x} y={y} width={barWidth} height={barHeight} rx={Math.min(4, barWidth / 2)} fill={color}>
              <title>{`${formatPeriod(point.period, periodKind)}: ${formatNumber(point.value)}`}</title>
            </rect>
          );
        }) : (
          <>
            <polyline points={linePoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {data.map((point, index) => {
              const { x, y } = lineCoordinates[index] ?? { x: 0, y: 0 };
              return (
                <circle key={point.period} cx={x} cy={y} r="3.5" fill={color}>
                  <title>{`${formatPeriod(point.period, periodKind)}: ${formatNumber(point.value)}`}</title>
                </circle>
              );
            })}
          </>
        )}
        {data.map((point, index) => {
          if (index % labelEvery !== 0 && index !== data.length - 1) return null;
          const x = padding.left + step * index + step / 2;
          return (
            <text key={point.period} className="analytics-axis-text" x={x} y={height - 13} textAnchor="middle">
              {formatPeriod(point.period, periodKind)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentKey,
  direction,
  onSelect,
  numeric = false,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: SortDirection;
  onSelect(key: SortKey): void;
  numeric?: boolean;
}) {
  const active = currentKey === sortKey;
  return (
    <th className={numeric ? "numeric" : ""} aria-sort={active ? direction : "none"}>
      <button type="button" onClick={() => onSelect(sortKey)}>
        {label}<span aria-hidden="true">{active ? direction === "ascending" ? "↑" : "↓" : ""}</span>
      </button>
    </th>
  );
}

function AnalyticsUserRow({ user }: { user: AnalyticsUser }) {
  return (
    <tr>
      <td>
        <div className="analytics-user">
          <span className="analytics-avatar">
            {initials(user.displayName)}
            {user.photoUrl !== null && <img src={user.photoUrl} alt="" />}
          </span>
          <span>
            <strong>{user.displayName}</strong>
            <small>{user.username === null ? "No username" : `@${user.username}`}</small>
          </span>
        </div>
      </td>
      <td>{formatDate(user.registeredAt)}</td>
      <td>{user.lastStudiedAt === null ? "—" : formatDateTime(user.lastStudiedAt)}</td>
      <td className="numeric">{formatNumber(user.activeCardCount)}</td>
      <td className="numeric">{formatNumber(user.wordsAddedCount)}</td>
      <td className="numeric">{formatNumber(user.answerCount)}</td>
    </tr>
  );
}

function sortUsers(users: AnalyticsUser[], key: SortKey, direction: SortDirection): AnalyticsUser[] {
  const factor = direction === "ascending" ? 1 : -1;
  return [...users].sort((left, right) => {
    if (key === "displayName") {
      return factor * left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    }
    if (key === "registeredAt" || key === "lastStudiedAt") {
      return factor * ((left[key] ?? "").localeCompare(right[key] ?? ""));
    }
    return factor * (left[key] - right[key]);
  });
}

function chartTicks(maximum: number): number[] {
  return [...new Set([0, Math.ceil(maximum / 2), maximum])];
}

function formatPeriod(period: string, kind: ActivityRange): string {
  const date = new Date(`${period}T00:00:00.000Z`);
  if (kind === "months") {
    return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
  }
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: analyticsTimeZone,
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: analyticsTimeZone,
  }).format(new Date(value));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
