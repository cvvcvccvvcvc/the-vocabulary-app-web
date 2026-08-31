import type { SVGProps } from "react";

export type IconName =
  | "add"
  | "addCircle"
  | "alphabetical"
  | "back"
  | "book"
  | "clock"
  | "delete"
  | "edit"
  | "flame"
  | "grip"
  | "learn"
  | "level"
  | "list"
  | "moon"
  | "progress"
  | "search"
  | "settings"
  | "sidebar"
  | "sort"
  | "speaker"
  | "sun";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, React.ReactNode> = {
    add: <><path d="M12 5v14M5 12h14" /></>,
    addCircle: <><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><path d="M12 7.5v9M7.5 12h9" stroke="var(--background)" /></>,
    alphabetical: <><path d="M3 18 7 6l4 12M4.5 14h5M14 6h7l-7 12h7" /></>,
    back: <><path d="m15 18-6-6 6-6" /></>,
    book: <><path d="M5 4.5h10a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Zm2 12h10M9 8h5m-5 3h5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
    delete: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" /></>,
    edit: <><path d="m4 20 4.2-1 10.6-10.6-3.2-3.2L5 15.8 4 20Zm10-13 3 3" /></>,
    flame: <><path d="M13.5 2.5c.7 3.2-.7 4.7-2.3 6.1-1.4 1.2-2.7 2.4-2.7 4.8 0 2 1.6 3.6 3.5 3.6s3.5-1.6 3.5-3.6c0-1.2-.5-2.2-1.3-3.2 2.7 1.2 4.3 3.4 4.3 6 0 3.2-2.8 5.8-6.5 5.8s-6.5-2.6-6.5-5.8c0-4.2 3.2-6.7 8-13.7Z" /></>,
    grip: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" strokeWidth="3" />,
    learn: <><path d="M5 7.5h14v12H5zM7 4.5h10M8 2.5h8" /></>,
    level: <><path d="M5 19V14m7 5V9m7 10V4M3 19h18" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></>,
    moon: <><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></>,
    progress: <><path d="m4 18 5-5 3 3 8-9" /><path d="M15 7h5v5" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    sort: <><path d="M8 5v14m0-14L5 8m3-3 3 3m5 11V5m0 14-3-3m3 3 3-3" /></>,
    speaker: <><path d="M5 10v4h3l4 3V7l-4 3H5Zm10-1a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
