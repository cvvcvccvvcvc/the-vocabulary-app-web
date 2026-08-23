import { useState } from "react";
import { api } from "../lib/api.js";

interface AuthScreenProps {
  developmentLoginEnabled: boolean;
  telegramLaunch: boolean;
  error: string | null;
  onAuthenticated(): Promise<void>;
}

export function AuthScreen({
  developmentLoginEnabled,
  telegramLaunch,
  error,
  onAuthenticated,
}: AuthScreenProps) {
  const [working, setWorking] = useState(false);

  async function developmentLogin(): Promise<void> {
    setWorking(true);
    try {
      await api.developmentLogin();
      await onAuthenticated();
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">V</div>
        <p className="eyebrow">Your words, wherever you are</p>
        <h1>Vocabulary</h1>
        <p className="auth-copy">
          Save a word once, then review it on your phone, Mac, or inside Telegram.
        </p>

        {error !== null && <p className="notice notice-error">{error}</p>}
        {telegramLaunch && error === null ? (
          <p className="muted">Connecting your Telegram profile…</p>
        ) : (
          <a className="primary-button auth-button" href="/api/auth/telegram/start">
            Continue with Telegram
          </a>
        )}

        {developmentLoginEnabled && (
          <button
            className="text-button"
            type="button"
            disabled={working}
            onClick={() => void developmentLogin()}
          >
            {working ? "Opening…" : "Open local development profile"}
          </button>
        )}
      </section>
    </main>
  );
}
