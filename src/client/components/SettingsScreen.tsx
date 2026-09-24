import { useEffect, useId, useRef, useState } from "react";
import type { LanguageSettings, ThemePreference, TranslationMethod } from "../../domain/index.js";
import type {
  TelegramReminderSettings,
  UserProfile,
} from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";
import { languages } from "../lib/languages.js";
import { requestTelegramWriteAccess } from "../lib/telegram.js";
import { useDismissiblePopover } from "./HelpPopover.js";
import { Icon } from "./Icons.js";
import { SupportLink } from "./SupportLink.js";

function SettingsInfo({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const container = useDismissiblePopover<HTMLSpanElement>(open, setOpen);

  return (
    <span className="settings-info" ref={container}>
      <button
        className="settings-info-button"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && <span className="settings-info-popover" id={id} role="tooltip">{text}</span>}
    </span>
  );
}

interface SettingsScreenProps {
  settings: LanguageSettings;
  telegramReminders: TelegramReminderSettings;
  telegramRemindersAvailable: boolean;
  telegramLaunch: boolean;
  user: UserProfile;
  onBack(): void;
  onUpdated(settings: LanguageSettings): void;
  onTelegramRemindersUpdated(settings: TelegramReminderSettings): void;
  onLogout(): Promise<void>;
}

export function SettingsScreen({
  settings,
  telegramReminders,
  telegramRemindersAvailable,
  telegramLaunch,
  user,
  onBack,
  onUpdated,
  onTelegramRemindersUpdated,
  onLogout,
}: SettingsScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [savingReminders, setSavingReminders] = useState(false);
  const savingRef = useRef(false);
  const onUpdatedRef = useRef(onUpdated);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => { onUpdatedRef.current = onUpdated; }, [onUpdated]);

  useEffect(() => {
    let active = true;
    let requestId = 0;

    async function refresh(): Promise<void> {
      if (savingRef.current) return;
      const currentRequest = ++requestId;
      setRefreshing(true);
      try {
        const latest = await api.settings();
        if (active && currentRequest === requestId && !savingRef.current) {
          onUpdatedRef.current(latest);
          setMessage(null);
        }
      } catch {
        if (active && currentRequest === requestId) setMessage("Could not refresh settings");
      } finally {
        if (active && currentRequest === requestId) setRefreshing(false);
      }
    }

    function refreshWhenVisible(): void {
      if (document.visibilityState === "visible") void refresh();
    }

    void refresh();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  async function save(next: LanguageSettings, patch: Partial<LanguageSettings>): Promise<void> {
    setDraft(next);
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.patchSettings(patch);
      onUpdated(updated);
    } catch (error) {
      setDraft(settings);
      setMessage(error instanceof ApiError ? error.message : "Could not save settings");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function changeLanguage(field: "learningLanguage" | "knownLanguage", value: string): void {
    const otherField = field === "learningLanguage" ? "knownLanguage" : "learningLanguage";
    const next = { ...draft, [field]: value };
    if (next[field] === next[otherField]) {
      next[otherField] = draft[field];
    }
    void save(next, {
      learningLanguage: next.learningLanguage,
      knownLanguage: next.knownLanguage,
    });
  }

  function changeTheme(theme: ThemePreference): void {
    if (theme === draft.theme) return;
    void save({ ...draft, theme }, { theme });
  }

  function changeTranslationMethod(translationMethod: TranslationMethod): void {
    if (translationMethod === draft.translationMethod) return;
    void save({ ...draft, translationMethod }, { translationMethod });
  }

  function changeTranslationMaxMeanings(translationMaxMeanings: number): void {
    if (translationMaxMeanings === draft.translationMaxMeanings) return;
    void save({ ...draft, translationMaxMeanings }, { translationMaxMeanings });
  }

  async function changeTelegramReminders(): Promise<void> {
    const enabled = !telegramReminders.enabled;
    setMessage(null);
    if (enabled && !telegramLaunch) {
      setMessage("Open The Vocabulary App in Telegram to enable reminders.");
      return;
    }

    setSavingReminders(true);
    try {
      if (enabled && !(await requestTelegramWriteAccess())) {
        setMessage("Telegram did not grant permission to send reminders.");
        return;
      }
      onTelegramRemindersUpdated(await api.updateTelegramReminders(enabled));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update reminders");
    } finally {
      setSavingReminders(false);
    }
  }

  return (
    <section className="screen settings-screen">
      <header className="mobile-screen-header settings-mobile-header">
        <button className="mobile-header-button" type="button" aria-label="Back" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h1>Settings</h1>
        <SupportLink />
      </header>
      <div className="settings-stack">
        <section className="settings-card">
          <header>
            <div className="settings-heading">
              <h2>Languages</h2>
              <SettingsInfo label="About languages" text="Controls card labels and speaker voice." />
            </div>
          </header>
          <label className="settings-select">
            <span>I’m learning</span>
            <select
              value={draft.learningLanguage}
              disabled={saving || refreshing}
              onChange={(event) => changeLanguage("learningLanguage", event.target.value)}
            >
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="settings-select">
            <span>I know</span>
            <select
              value={draft.knownLanguage}
              disabled={saving || refreshing}
              onChange={(event) => changeLanguage("knownLanguage", event.target.value)}
            >
              {languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
        </section>

        <section className="settings-card">
          <header>
            <div className="settings-heading">
              <h2>Translation</h2>
              <SettingsInfo label="About maximum meanings" text="Maximum added per tap; the translator may return fewer." />
            </div>
          </header>
          <label className="settings-select">
            <span>Method</span>
            <select
              value={draft.translationMethod}
              disabled={saving || refreshing}
              onChange={(event) => changeTranslationMethod(event.target.value as TranslationMethod)}
            >
              <option value="google">Google</option>
              <option value="yandex">Yandex</option>
            </select>
          </label>
          <label className="settings-select">
            <span>Max meanings</span>
            <select
              value={draft.translationMaxMeanings}
              disabled={saving || refreshing}
              onChange={(event) => changeTranslationMaxMeanings(Number(event.target.value))}
            >
              {Array.from({ length: 8 }, (_, index) => (
                <option key={index + 1} value={index + 1}>{index + 1}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="settings-card appearance-card">
          <header>
            <h2>Themes</h2>
          </header>
          <div className="theme-picker" aria-label="Themes">
            {([
              ["system", "System", "settings"],
              ["light", "Light", "sun"],
              ["dark", "Dark", "moon"],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                className={draft.theme === value ? "theme-option active" : "theme-option"}
                type="button"
                disabled={saving || refreshing}
                aria-pressed={draft.theme === value}
                onClick={() => changeTheme(value)}
              >
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {telegramRemindersAvailable && (
          <section className="settings-card reminder-card">
            <div className="reminder-setting">
              <span className="reminder-copy">
                <strong>Telegram reminders</strong>
                <small>Get a message when cards are ready for Scheduled Review.</small>
              </span>
              <button
                className="settings-switch"
                type="button"
                role="switch"
                aria-checked={telegramReminders.enabled}
                aria-label="Telegram reminders"
                disabled={savingReminders}
                onClick={() => void changeTelegramReminders()}
              >
                <span />
              </button>
            </div>
          </section>
        )}

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
