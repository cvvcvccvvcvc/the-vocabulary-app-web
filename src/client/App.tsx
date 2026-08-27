import { useCallback, useEffect, useState } from "react";
import {
  ReviewSession,
  SystemRandomSource,
  type LanguageSettings,
  type VocabularyWord,
} from "../domain/index.js";
import type {
  AppConfiguration,
  TelegramReminderSettings,
  UserProfile,
} from "../shared/contracts.js";
import { AddWordScreen } from "./components/AddWordScreen.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { LearnScreen } from "./components/LearnScreen.js";
import { ProgressScreen } from "./components/ProgressScreen.js";
import { SettingsScreen } from "./components/SettingsScreen.js";
import { Shell, type PrimarySection, type Section } from "./components/Shell.js";
import { WordsScreen } from "./components/WordsScreen.js";
import { api, ApiError } from "./lib/api.js";
import { ReviewTransitionTracker } from "./lib/identifier.js";
import { sectionFromSearch } from "./lib/section.js";
import { initializeTelegram, setTelegramAppearance } from "./lib/telegram.js";

interface ApplicationData {
  user: UserProfile;
  words: VocabularyWord[];
  settings: LanguageSettings;
  telegramReminders: TelegramReminderSettings;
}

export function App() {
  const [configuration, setConfiguration] = useState<AppConfiguration>({
    developmentLoginEnabled: false,
    telegramRemindersAvailable: false,
  });
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [section, setSection] = useState<Section>(() => sectionFromSearch(window.location.search));
  const [returnSection, setReturnSection] = useState<PrimarySection>(() => sectionFromSearch(window.location.search));
  const [wordToOpen, setWordToOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reviewSession] = useState(
    () => new ReviewSession(new SystemRandomSource(), () => new Date()),
  );
  const [reviewTransitions] = useState(() => new ReviewTransitionTracker());
  const [, setReviewSessionRevision] = useState(0);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [telegramLaunch] = useState(() => initializeTelegram()?.initData ?? "");
  const notifyReviewSessionChanged = useCallback((): void => {
    setReviewSessionRevision((revision) => revision + 1);
  }, []);

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
    reviewSession.reset();
    reviewTransitions.reset();
    setApplication(bootstrap);
    setAuthError(null);
  }, [reviewSession, reviewTransitions]);

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
        setAuthError(error instanceof ApiError ? error.message : "Could not open The Vocabulary App");
      } finally {
        setLoading(false);
      }
    }
    void start();
  }, [loadApplication, telegramLaunch]);

  const storeWord = useCallback((updated: VocabularyWord): void => {
    setApplication((current) =>
      current === null
        ? current
        : {
            ...current,
            words: current.words.some((word) => word.id === updated.id)
              ? current.words.map((word) => (word.id === updated.id ? updated : word))
              : [...current.words, updated],
          },
    );
  }, []);

  const removeWord = useCallback((wordId: string): void => {
    reviewSession.removeWord(wordId);
    notifyReviewSessionChanged();
    setApplication((current) =>
      current === null
        ? current
        : { ...current, words: current.words.filter((word) => word.id !== wordId) },
    );
  }, [notifyReviewSessionChanged, reviewSession]);

  const selectSection = useCallback((nextSection: PrimarySection): void => {
    setWordToOpen(null);
    setReturnSection(nextSection);
    setSection(nextSection);
  }, []);

  const openSettings = useCallback((): void => {
    if (section !== "settings") setReturnSection(section);
    setSection("settings");
  }, [section]);

  const viewWord = useCallback((wordId: string): void => {
    setWordToOpen(wordId);
    setSection("words");
  }, []);

  if (loading) {
    return (
      <main className="auth-screen">
        <div className="loading-ring" aria-label="Loading The Vocabulary App" />
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
          onAvailable={storeWord}
          onViewWord={viewWord}
        />
      );
      break;
    case "words":
      content = (
        <WordsScreen
          words={application.words}
          settings={application.settings}
          initialSelectedId={wordToOpen}
          onUpdated={storeWord}
          onDeleted={removeWord}
        />
      );
      break;
    case "settings":
      content = (
        <SettingsScreen
          settings={application.settings}
          telegramReminders={application.telegramReminders}
          telegramRemindersAvailable={configuration.telegramRemindersAvailable}
          telegramLaunch={telegramLaunch !== ""}
          user={application.user}
          onBack={() => setSection(returnSection)}
          onUpdated={(settings) =>
            setApplication((current) => (current === null ? current : { ...current, settings }))
          }
          onTelegramRemindersUpdated={(telegramReminders) =>
            setApplication((current) =>
              current === null ? current : { ...current, telegramReminders }
            )
          }
          onLogout={async () => {
            await api.logout();
            reviewSession.reset();
            reviewTransitions.reset();
            setApplication(null);
          }}
        />
      );
      break;
    case "progress":
      content = (
        <ProgressScreen
          onAddWord={() => selectSection("add")}
          onLearn={() => selectSection("learn")}
          onOpenSettings={openSettings}
        />
      );
      break;
    case "learn":
    default:
      content = (
        <LearnScreen
          words={application.words}
          settings={application.settings}
          session={reviewSession}
          reviewTransitions={reviewTransitions}
          onSessionChanged={notifyReviewSessionChanged}
          onUpdated={storeWord}
        />
      );
  }

  return (
    <Shell
      activeSection={section}
      activeNavigationSection={section === "settings" ? returnSection : section}
      theme={resolvedTheme}
      onSectionChange={selectSection}
      onSettingsOpen={openSettings}
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
