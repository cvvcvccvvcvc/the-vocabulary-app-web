import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icons.js";

export type PrimarySection = "learn" | "add" | "words" | "progress";
export type Section = PrimarySection | "settings";

const sections: Array<{ id: PrimarySection; label: string; shortLabel: string; icon: IconName; mobileIcon: IconName }> = [
  { id: "learn", label: "Learn", shortLabel: "Learn", icon: "learn", mobileIcon: "learn" },
  { id: "add", label: "Add Word", shortLabel: "Add", icon: "add", mobileIcon: "addCircle" },
  { id: "words", label: "Words", shortLabel: "Words", icon: "list", mobileIcon: "book" },
  { id: "progress", label: "Progress", shortLabel: "Progress", icon: "progress", mobileIcon: "progress" },
];

interface ShellProps {
  activeSection: Section;
  activeNavigationSection: PrimarySection;
  theme: "light" | "dark";
  children: ReactNode;
  onSectionChange(section: PrimarySection): void;
  onSettingsOpen(): void;
  onThemeToggle(): void;
}

export function Shell({
  activeSection,
  activeNavigationSection,
  theme,
  children,
  onSectionChange,
  onSettingsOpen,
  onThemeToggle,
}: ShellProps) {
  const title = activeSection === "settings"
    ? "Settings"
    : sections.find((section) => section.id === activeSection)?.label ?? "Vocabulary";

  return (
    <div className="app-shell">
      <header className="desktop-titlebar">
        <div className="traffic-lights" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="titlebar-controls">
          <span className="titlebar-icon"><Icon name="sidebar" /></span>
          <button
            className={activeSection === "settings" ? "titlebar-icon active" : "titlebar-icon"}
            type="button"
            aria-label="Settings"
            onClick={onSettingsOpen}
          >
            <Icon name="settings" />
          </button>
        </div>
        <strong>{title}</strong>
        <button className="appearance-toggle" type="button" aria-label="Toggle appearance" onClick={onThemeToggle}>
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </header>

      <aside className="sidebar">
        <nav className="sidebar-navigation" aria-label="Main navigation">
          {sections.map((section) => (
            <button
              key={section.id}
              className={section.id === activeNavigationSection ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSectionChange(section.id)}
            >
              <Icon name={section.icon} />
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">{children}</main>

      <nav className="bottom-navigation" aria-label="Main navigation">
        {sections.map((section) => (
          <button
            key={section.id}
            className={section.id === activeNavigationSection ? "bottom-nav-item active" : "bottom-nav-item"}
            type="button"
            onClick={() => onSectionChange(section.id)}
          >
            <span className="bottom-nav-selection">
              <Icon name={section.mobileIcon} />
              <span>{section.shortLabel}</span>
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
