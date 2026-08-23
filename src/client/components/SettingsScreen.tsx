import { useState } from "react";
import type { LanguageSettings } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";

const languages = [
  ["en", "English"],
  ["ru", "Russian"],
  ["de", "German"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["zh", "Chinese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
] as const;

interface SettingsScreenProps {
  settings: LanguageSettings;
  onUpdated(settings: LanguageSettings): void;
  onLogout(): Promise<void>;
}

export function SettingsScreen({ settings, onUpdated, onLogout }: SettingsScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateSettings(draft);
      onUpdated(updated);
      setMessage("Settings saved");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen settings-screen">
      <header className="screen-header compact-header">
        <p className="eyebrow">Your learning setup</p>
        <h1>Settings</h1>
      </header>

      <div className="settings-card">
        <div className="language-grid">
          <label className="field-label">
            I’m learning
            <select value={draft.learningLanguage} onChange={(event) => setDraft((current) => ({ ...current, learningLanguage: event.target.value }))}>
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="field-label">
            I know
            <select value={draft.knownLanguage} onChange={(event) => setDraft((current) => ({ ...current, knownLanguage: event.target.value }))}>
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
        </div>

        {draft.learningLanguage === draft.knownLanguage && (
          <p className="notice notice-error">Choose two different languages.</p>
        )}
        {message !== null && <p className={message === "Settings saved" ? "notice notice-success" : "notice notice-error"}>{message}</p>}
        <button className="primary-button" type="button" disabled={saving || draft.learningLanguage === draft.knownLanguage} onClick={() => void save()}>
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>

      <div className="account-card">
        <div>
          <h2>Account</h2>
          <p className="muted">Your vocabulary is stored in your server profile.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void onLogout()}>
          Sign out
        </button>
      </div>
    </section>
  );
}

