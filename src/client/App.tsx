import { useCallback, useEffect, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../domain/index.js";
import type { AppConfiguration, UserProfile } from "../shared/contracts.js";
import { AddWordScreen } from "./components/AddWordScreen.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { LearnScreen } from "./components/LearnScreen.js";
import { SettingsScreen } from "./components/SettingsScreen.js";
import { Shell, type Section } from "./components/Shell.js";
import { WordsScreen } from "./components/WordsScreen.js";
import { api, ApiError } from "./lib/api.js";
import { sectionFromSearch } from "./lib/section.js";
import { initializeTelegram, setTelegramAppearance } from "./lib/telegram.js";

interface ApplicationData {
  user: UserProfile;
  words: VocabularyWord[];
  settings: LanguageSettings;
}

export function App() {
  const [configuration, setConfiguration] = useState<AppConfiguration>({
    developmentLoginEnabled: false,
  });
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [section, setSection] = useState<Section>(() => sectionFromSearch(window.location.search));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [telegramLaunch] = useState(() => initializeTelegram()?.initData ?? "");

  useEffect(() => {
    const preference = application?.settings.theme ?? "system";
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = (): void => {
      const nextTheme = preference === "system" ? (colorScheme.matches ? "dark" : "light") : preference;
      document.documentElement.dataset.theme = nextTheme;
      setResolvedTheme(nextTheme);
      setTelegramAppearance(nextTheme);
    };

    applyTheme();
    colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, [application?.settings.theme]);

  const loadApplication = useCallback(async (): Promise<void> => {
    const bootstrap = await api.bootstrap();
    setApplication(bootstrap);
    setAuthError(null);
  }, []);

  useEffect(() => {
    async function start(): Promise<void> {
      try {
        const config = await api.configuration();
        setConfiguration(config);

        try {
          await api.session();
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          if (telegramLaunch !== "") {
            await api.telegramMiniAppLogin(telegramLaunch);
          } else {
            setLoading(false);
            return;
          }
        }

        await loadApplication();
      } catch (error) {
        setAuthError(error instanceof ApiError ? error.message : "Could not open Vocabulary");
      } finally {
        setLoading(false);
      }
    }
    void start();
  }, [loadApplication, telegramLaunch]);

  const updateWord = useCallback((updated: VocabularyWord): void => {
    setApplication((current) =>
      current === null
        ? current
        : {
            ...current,
            words: current.words.map((word) => (word.id === updated.id ? updated : word)),
          },
    );
  }, []);

  if (loading) {
    return (
      <main className="auth-screen">
        <div className="loading-ring" aria-label="Loading Vocabulary" />
      </main>
    );
  }

  if (application === null) {
    return (
      <AuthScreen
        developmentLoginEnabled={configuration.developmentLoginEnabled}
        telegramLaunch={telegramLaunch !== ""}
        error={authError}
        onAuthenticated={loadApplication}
      />
    );
  }

  let content;
  switch (section) {
    case "add":
      content = (
        <AddWordScreen
          settings={application.settings}
          onCreated={(word) =>
            setApplication((current) =>
              current === null ? current : { ...current, words: [...current.words, word] },
            )
          }
          onViewWords={() => setSection("words")}
        />
      );
      break;
    case "words":
      content = (
        <WordsScreen
          words={application.words}
          settings={application.settings}
          onUpdated={updateWord}
          onDeleted={(wordId) =>
            setApplication((current) =>
              current === null
                ? current
                : { ...current, words: current.words.filter((word) => word.id !== wordId) },
            )
          }
        />
      );
      break;
    case "settings":
      content = (
        <SettingsScreen
          settings={application.settings}
          user={application.user}
          onUpdated={(settings) =>
            setApplication((current) => (current === null ? current : { ...current, settings }))
          }
          onLogout={async () => {
            await api.logout();
            setApplication(null);
          }}
        />
      );
      break;
    case "learn":
    default:
      content = (
        <LearnScreen
          words={application.words}
          settings={application.settings}
          onUpdated={updateWord}
        />
      );
  }

  return (
    <Shell
      activeSection={section}
      theme={resolvedTheme}
      onSectionChange={setSection}
      onThemeToggle={() => {
        const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
        void api.updateSettings({ ...application.settings, theme: nextTheme }).then((settings) => {
          setApplication((current) => (current === null ? current : { ...current, settings }));
        }).catch(() => undefined);
      }}
    >
      {content}
    </Shell>
  );
}
