import { useEffect, useState } from "react";
import type { LanguageSettings, ThemePreference } from "../../domain/index.js";
import type { UserProfile } from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";
import { languages } from "../lib/languages.js";
import { Icon } from "./Icons.js";

interface SettingsScreenProps {
  settings: LanguageSettings;
  user: UserProfile;
  onUpdated(settings: LanguageSettings): void;
  onLogout(): Promise<void>;
}

export function SettingsScreen({ settings, user, onUpdated, onLogout }: SettingsScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  async function save(next: LanguageSettings): Promise<void> {
    setDraft(next);
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateSettings(next);
      onUpdated(updated);
    } catch (error) {
      setDraft(settings);
      setMessage(error instanceof ApiError ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  function changeLanguage(field: "learningLanguage" | "knownLanguage", value: string): void {
    const otherField = field === "learningLanguage" ? "knownLanguage" : "learningLanguage";
    const next = { ...draft, [field]: value };
    if (next[field] === next[otherField]) {
      next[otherField] = draft[field];
    }
    void save(next);
  }

  function changeTheme(theme: ThemePreference): void {
    if (theme === draft.theme) return;
    void save({ ...draft, theme });
  }

  return (
    <section className="screen settings-screen">
      <h1 className="mobile-screen-title">Settings</h1>

      <div className="settings-stack">
        <section className="settings-card">
          <header>
            <h2>Languages</h2>
            <p>Controls card labels and speaker voice.</p>
          </header>
          <label className="settings-select">
            <span>I’m learning</span>
            <select
              value={draft.learningLanguage}
              disabled={saving}
              onChange={(event) => changeLanguage("learningLanguage", event.target.value)}
            >
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="settings-select">
            <span>I know</span>
            <select
              value={draft.knownLanguage}
              disabled={saving}
              onChange={(event) => changeLanguage("knownLanguage", event.target.value)}
            >
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
        </section>

        <section className="settings-card appearance-card">
          <header>
            <h2>Appearance</h2>
            <p>Choose how Vocabulary looks on every device.</p>
          </header>
          <div className="theme-picker" aria-label="Appearance">
            {([
              ["system", "System", "settings"],
              ["light", "Light", "sun"],
              ["dark", "Dark", "moon"],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                className={draft.theme === value ? "theme-option active" : "theme-option"}
                type="button"
                disabled={saving}
                aria-pressed={draft.theme === value}
                onClick={() => changeTheme(value)}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card account-card">
          <div className="account-person">
            <span className="profile-avatar">
              {user.photoUrl ? <img src={user.photoUrl} alt="" /> : user.displayName.slice(0, 1)}
            </span>
            <span>
              <strong>{user.displayName}</strong>
              <small>{user.username === null ? "Telegram account" : `@${user.username}`}</small>
            </span>
          </div>
          <button className="secondary-button" type="button" onClick={() => void onLogout()}>
            Sign out
          </button>
        </section>

        {saving && <p className="settings-status">Saving…</p>}
        {message !== null && <p className="notice notice-error">{message}</p>}
      </div>
    </section>
  );
}
