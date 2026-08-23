import { useCallback, useEffect, useRef, useState } from "react";
import {
  FreeReviewPicker,
  SystemRandomSource,
  isScheduledReviewCandidate,
  resolveReviewDirection,
  scheduledReviewQueue,
  type LanguageSettings,
  type ReviewDirection,
  type ReviewMode,
  type VocabularyWord,
} from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { createOperationId } from "../lib/identifier.js";
import { languageName } from "../lib/languages.js";
import { telegramImpact, telegramNotification } from "../lib/telegram.js";
import { Icon } from "./Icons.js";

interface PresentedCard {
  wordId: string;
  direction: ReviewDirection;
  mode: ReviewMode;
}

interface LearnScreenProps {
  words: VocabularyWord[];
  settings: LanguageSettings;
  onUpdated(word: VocabularyWord): void;
}

export function LearnScreen({ words, settings, onUpdated }: LearnScreenProps) {
  const random = useRef(new SystemRandomSource());
  const freePicker = useRef(new FreeReviewPicker());
  const scheduledIds = useRef<string[]>([]);
  const selecting = useRef(false);
  const [card, setCard] = useState<PresentedCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentWord = words.find((word) => word.id === card?.wordId) ?? null;

  const chooseNext = useCallback(async (latestWords: VocabularyWord[]) => {
    if (selecting.current || latestWords.length === 0) return;
    selecting.current = true;
    setError(null);

    try {
      const now = new Date();
      const dueIds = new Set(
        latestWords.filter((word) => isScheduledReviewCandidate(word, now)).map((word) => word.id),
      );
      scheduledIds.current = scheduledIds.current.filter((id) => dueIds.has(id));

      let selected: VocabularyWord | null;
      let mode: ReviewMode;
      if (dueIds.size > 0) {
        mode = "scheduled";
        if (scheduledIds.current.length === 0) {
          scheduledIds.current = scheduledReviewQueue(latestWords, now, random.current).map((word) => word.id);
        }
        const selectedId = scheduledIds.current.shift();
        selected = latestWords.find((word) => word.id === selectedId) ?? null;
      } else {
        mode = "free";
        selected = freePicker.current.next(latestWords, now, random.current);
      }

      if (selected === null) return;
      const direction = resolveReviewDirection(selected.lastDirection, random.current);
      const shown = await api.markShown(selected.id, direction);
      onUpdated(shown);
      setCard({ wordId: shown.id, direction, mode });
      setRevealed(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the next card");
    } finally {
      selecting.current = false;
    }
  }, [onUpdated]);

  useEffect(() => {
    if (card === null && words.length > 0) {
      void chooseNext(words);
    }
  }, [card, chooseNext, words]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space" && currentWord !== null) {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && event.key === "ArrowLeft") {
        void answer(false);
      } else if (revealed && event.key === "ArrowRight") {
        void answer(true);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  async function answer(correct: boolean): Promise<void> {
    if (card === null || currentWord === null || working) return;
    setWorking(true);
    setError(null);
    try {
      const updated = await api.answerWord(currentWord.id, correct, card.mode, createOperationId());
      const latestWords = words.map((word) => (word.id === updated.id ? updated : word));
      onUpdated(updated);
      setCard(null);
      setRevealed(false);
      telegramNotification(correct ? "success" : "warning");
      await chooseNext(latestWords);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the answer");
    } finally {
      setWorking(false);
    }
  }

  function speak(): void {
    if (currentWord === null || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentWord.learningText);
    utterance.lang = settings.learningLanguage;
    window.speechSynthesis.speak(utterance);
    telegramImpact();
  }

  if (words.length === 0) {
    return (
      <section className="screen learn-screen centered-screen">
        <div className="empty-state">
          <div className="brand-mark small">V</div>
          <h1>No words yet</h1>
          <p>Add your first word, then come back here to review it.</p>
        </div>
      </section>
    );
  }

  if (currentWord === null || card === null) {
    return (
      <section className="screen learn-screen centered-screen">
        <div className="loading-ring" aria-label="Loading next card" />
        {error !== null && <p className="notice notice-error">{error}</p>}
      </section>
    );
  }

  const question = card.direction === "learning-to-known" ? currentWord.learningText : currentWord.meanings.join(" · ");
  const answerText = card.direction === "learning-to-known" ? currentWord.meanings : [currentWord.learningText];
  const questionIsLearning = card.direction === "learning-to-known";
  const questionLanguage = languageName(questionIsLearning ? settings.learningLanguage : settings.knownLanguage);
  const answerLanguage = languageName(questionIsLearning ? settings.knownLanguage : settings.learningLanguage);
  const scheduledDueCount = words.filter((word) => isScheduledReviewCandidate(word, new Date())).length;

  return (
    <section className="screen learn-screen">
      <header className="review-mode-header">
        <span className={card.mode === "scheduled" ? "review-mode-badge scheduled" : "review-mode-badge"}>
          <span aria-hidden="true" />
          {card.mode === "scheduled" ? "Scheduled Review" : "Free Review"}
        </span>
        {card.mode === "scheduled" && <small>{scheduledDueCount} left</small>}
      </header>

      <div className="review-stage">
        <div className="review-card-shell">
          <button
            className={revealed ? "review-card revealed" : "review-card"}
            type="button"
            onClick={() => {
              setRevealed(true);
              telegramImpact();
            }}
          >
            {revealed ? (
              <span className="card-reveal">
                <span className="card-reveal-side">
                  <span className="card-side-label">{questionLanguage}</span>
                  <span className={questionIsLearning ? "card-side-value learning" : "card-side-value known"}>
                    {question}
                  </span>
                </span>
                <span className="card-reveal-divider" aria-hidden="true" />
                <span className="card-reveal-side">
                  <span className="card-side-label">{answerLanguage}</span>
                  <span className="card-side-values">
                    {answerText.map((meaning, index) => (
                      <strong
                        className={questionIsLearning ? "card-side-value known" : "card-side-value learning"}
                        key={`${meaning}-${index}`}
                      >
                        {meaning}
                      </strong>
                    ))}
                  </span>
                  {currentWord.comment !== "" && <small className="card-reveal-comment">“{currentWord.comment}”</small>}
                </span>
              </span>
            ) : (
              <span className={questionIsLearning ? "card-question" : "card-question known-question"}>
                {question}
              </span>
            )}
          </button>
          {((!revealed && questionIsLearning) || revealed) && (
            <button
              className={revealed
                ? `speaker-button review-card-speaker revealed ${questionIsLearning ? "learning-first" : "learning-second"}`
                : "speaker-button review-card-speaker"}
              type="button"
              aria-label="Pronounce learning word"
              onClick={speak}
            >
              <Icon name="speaker" />
            </button>
          )}
          {!revealed && (
            <p className="reveal-hint">
              <kbd>Space</kbd>
              <span className="desktop-hint"> or tap card to reveal</span>
              <span className="mobile-reveal-hint">Tap card to reveal</span>
            </p>
          )}

          {revealed && (
            <div className="answer-actions">
              <button className="wrong-button" type="button" disabled={working} onClick={() => void answer(false)}>
                Wrong
              </button>
              <button className="correct-button" type="button" disabled={working} onClick={() => void answer(true)}>
                Correct
              </button>
            </div>
          )}
        </div>
        {error !== null && <p className="notice notice-error">{error}</p>}
      </div>
    </section>
  );
}
