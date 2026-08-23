import type { ReactNode } from "react";
import type { UserProfile } from "../../shared/contracts.js";

export type Section = "learn" | "add" | "words" | "settings";

const sections: Array<{ id: Section; label: string; shortLabel: string }> = [
  { id: "learn", label: "Learn", shortLabel: "Learn" },
  { id: "add", label: "Add Word", shortLabel: "Add" },
  { id: "words", label: "Words", shortLabel: "Words" },
  { id: "settings", label: "Settings", shortLabel: "Settings" },
];

interface ShellProps {
  activeSection: Section;
  user: UserProfile;
  children: ReactNode;
  onSectionChange(section: Section): void;
}

export function Shell({ activeSection, user, children, onSectionChange }: ShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">V</span>
          <span>Vocabulary</span>
        </div>
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {sections.map((section) => (
            <button
              key={section.id}
              className={section.id === activeSection ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSectionChange(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="profile-chip">
          <span className="profile-avatar">
            {user.photoUrl ? <img src={user.photoUrl} alt="" /> : user.displayName.slice(0, 1)}
          </span>
          <span className="profile-name">{user.displayName}</span>
        </div>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-navigation" aria-label="Main navigation">
        {sections.map((section) => (
          <button
            key={section.id}
            className={section.id === activeSection ? "bottom-nav-item active" : "bottom-nav-item"}
            type="button"
            onClick={() => onSectionChange(section.id)}
          >
            {section.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  );
}

