import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import {
  isScheduledReviewCandidate,
  type LanguageSettings,
  type ReviewMode,
  type ReviewSession,
  type ReviewSessionCard,
  type VocabularyWord,
} from "../../domain/index.js";
import type { ReviewTransitionRequest } from "../../shared/contracts.js";
import { api, ApiError } from "../lib/api.js";
import type { ReviewTransitionTracker } from "../lib/identifier.js";
import { languageName } from "../lib/languages.js";
import { resolvePointerGestureAxis, type PointerGestureAxis } from "../lib/pointerGesture.js";
import { setTelegramVerticalSwipesEnabled, telegramImpact, telegramNotification } from "../lib/telegram.js";
import { HelpPopover, useDismissiblePopover, type HelpPopoverItem } from "./HelpPopover.js";
import { Icon } from "./Icons.js";

interface LearnScreenProps {
  words: VocabularyWord[];
  settings: LanguageSettings;
  session: ReviewSession;
  reviewTransitions: ReviewTransitionTracker;
  onSessionChanged(): void;
  onUpdated(word: VocabularyWord): void;
}

type SwipePhase = "idle" | "dragging" | "returning" | "exiting" | "focusing";

interface SwipeSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  axis: PointerGestureAxis;
  thresholdDirection: -1 | 0 | 1;
}

interface ReviewCardSnapshot {
  card: ReviewSessionCard;
  word: VocabularyWord;
}

const SWIPE_AXIS_LOCK_DISTANCE = 8;
const SWIPE_AXIS_DOMINANCE_RATIO = 1.2;
const SWIPE_DISTANCE_RATIO = 0.27;
const SWIPE_MIN_FAST_DISTANCE = 36;
const SWIPE_VELOCITY_THRESHOLD = 0.65;

const REVIEW_HELP_ITEMS = {
  scheduled: [
    { marker: "↻", tone: "accent", title: "Due words first", detail: "Scheduled Review serves words when their learning interval is due." },
    { marker: "↑", tone: "success", title: "Answers change the level", detail: "Correct moves up; wrong moves down to a shorter interval." },
    { marker: "→", tone: "neutral", title: "Then Free Review", detail: "Free Review begins when no scheduled words remain." },
  ],
  free: [
    { marker: "↝", tone: "accent", title: "All saved words", detail: "Free Review starts after the scheduled queue is empty." },
    { marker: "↑", tone: "neutral", title: "Weaker words first", detail: "Lower-level, older, and recently missed words appear more often." },
    { marker: "—", tone: "neutral", title: "Practice only", detail: "Levels and next-review dates do not change; recent cards are held back." },
  ],
} as const satisfies Record<ReviewMode, readonly HelpPopoverItem[]>;

interface SpeakerButtonProps {
  className?: string;
  onSpeak(): void;
}

function SpeakerButton({ className = "", onSpeak }: SpeakerButtonProps) {
  return (
    <button
      className={`speaker-button ${className}`.trim()}
      type="button"
      aria-label="Pronounce learning word"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSpeak();
      }}
    >
      <Icon name="speaker" />
    </button>
  );
}

interface CardQuestionProps {
  direction: ReviewSessionCard["direction"];
  word: VocabularyWord;
  settings: LanguageSettings;
}

function CardQuestion({ direction, word, settings }: CardQuestionProps) {
  if (direction === "learning-to-known") {
    return (
      <span className="card-question" lang={settings.learningLanguage}>
        {word.learningText}
      </span>
    );
  }

  const className = word.meanings.length > 1
    ? "card-question known-question multiple"
    : "card-question known-question";

  return (
    <span className={className} lang={settings.knownLanguage}>
      {word.meanings.map((meaning, index) => (
        <span className="card-question-meaning" key={`${meaning}-${index}`}>
          {meaning}
        </span>
      ))}
    </span>
  );
}

interface ReviewCardProps {
  card: ReviewSessionCard;
  word: VocabularyWord;
  settings: LanguageSettings;
  revealed: boolean;
  onReveal?: (() => void) | undefined;
  onSpeak(): void;
  onPointerDown?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
  onPointerMove?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
  onPointerUp?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
  onPointerCancel?: ((event: ReactPointerEvent<HTMLDivElement>) => void) | undefined;
}

function ReviewCard({
  card,
  word,
  settings,
  revealed,
  onReveal,
  onSpeak,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: ReviewCardProps) {
  const questionIsLearning = card.direction === "learning-to-known";
  const learningLanguage = languageName(settings.learningLanguage);
  const knownLanguage = languageName(settings.knownLanguage);
  const multipleMeanings = word.meanings.length > 1;

  return (
    <div
      className={revealed ? "review-card revealed" : "review-card"}
      draggable={false}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {revealed ? (
        <div className="card-reveal">
          <div className="card-reveal-side">
            <span className="card-side-label">{learningLanguage}</span>
            <div className="card-learning-row">
              <span className="card-side-value learning" lang={settings.learningLanguage}>
                {word.learningText}
              </span>
              <SpeakerButton onSpeak={onSpeak} />
            </div>
          </div>
          <span className="card-reveal-divider" aria-hidden="true" />
          <div className="card-reveal-side">
            <span className="card-side-label">{knownLanguage}</span>
            <ol
              className={multipleMeanings ? "card-meaning-list" : "card-meaning-list single"}
              aria-label={`${knownLanguage} meanings`}
              role="list"
            >
              {word.meanings.map((meaning, index) => (
                <li key={`${meaning}-${index}`} role="listitem">
                  {multipleMeanings && (
                    <span className="card-meaning-number" aria-hidden="true">{index + 1}</span>
                  )}
                  <span className="card-meaning-text" lang={settings.knownLanguage}>{meaning}</span>
                </li>
              ))}
            </ol>
          </div>
          {word.comment !== "" && <p className="card-reveal-comment">{word.comment}</p>}
        </div>
      ) : (
        <div
          className={questionIsLearning
            ? "review-card-question-layout learning-question-layout"
            : "review-card-question-layout"}
        >
          <button
            className="review-card-reveal"
            type="button"
            aria-label={questionIsLearning ? word.learningText : word.meanings.join(", ")}
            lang={questionIsLearning ? settings.learningLanguage : settings.knownLanguage}
            onClick={onReveal}
          >
            <CardQuestion direction={card.direction} word={word} settings={settings} />
          </button>
          {questionIsLearning && <SpeakerButton className="review-card-speaker" onSpeak={onSpeak} />}
        </div>
      )}
    </div>
  );
}

interface ReviewCardPreviewProps {
  snapshot: ReviewCardSnapshot | null;
  settings: LanguageSettings;
}

function ReviewCardPreview({ snapshot, settings }: ReviewCardPreviewProps) {
  return (
    <div className="review-card-preview-layer" aria-hidden="true">
      <div className="review-card review-card-preview">
        {snapshot === null ? (
          <span className="review-card-preview-placeholder" />
        ) : (
          <CardQuestion direction={snapshot.card.direction} word={snapshot.word} settings={settings} />
        )}
      </div>
    </div>
  );
}

export function LearnScreen({
  words,
  settings,
  session,
  reviewTransitions,
  onSessionChanged,
  onUpdated,
}: LearnScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const swipeSession = useRef<SwipeSession | null>(null);
  const [dragX, setDragX] = useState(0);
  const [swipeThreshold, setSwipeThreshold] = useState(90);
  const [swipePhase, setSwipePhase] = useState<SwipePhase>("idle");
  const [outgoingCard, setOutgoingCard] = useState<ReviewCardSnapshot | null>(null);
  const [modeHelpOpen, setModeHelpOpen] = useState(false);
  const modeHelp = useDismissiblePopover<HTMLElement>(modeHelpOpen, setModeHelpOpen);
  const { card, revealed, phase } = session.snapshot;
  const canAnswer = phase === "ready";
  const currentWord = words.find((word) => word.id === card?.wordId) ?? null;

  useEffect(() => {
    document.documentElement.classList.add("review-scroll-locked");
    setTelegramVerticalSwipesEnabled(false);
    return () => {
      document.documentElement.classList.remove("review-scroll-locked");
      setTelegramVerticalSwipesEnabled(true);
    };
  }, []);

  useEffect(() => {
    if (swipePhase !== "focusing") return;
    const frame = window.requestAnimationFrame(() => setSwipePhase("idle"));
    return () => window.cancelAnimationFrame(frame);
  }, [swipePhase]);

  const resetSwipe = useCallback(() => {
    swipeSession.current = null;
    setDragX(0);
    setSwipePhase("idle");
    setOutgoingCard(null);
  }, []);

  const chooseNext = useCallback(async (latestWords: VocabularyWord[]) => {
    const selected = session.beginPresentation(latestWords);
    if (selected === null) return;

    setError(null);
    onSessionChanged();

    try {
      const shown = await api.markShown(selected.wordId, selected.direction);
      if (session.presentationReady(selected.wordId)) {
        onUpdated(shown);
        resetSwipe();
      }
    } catch (caught) {
      session.presentationFailed(selected.wordId);
      setError(caught instanceof ApiError ? caught.message : "Could not load the next card");
    } finally {
      onSessionChanged();
    }
  }, [onSessionChanged, onUpdated, resetSwipe, session]);

  useEffect(() => {
    const changed = session.reconcile(words);
    if (changed) {
      onSessionChanged();
    }

    if (session.snapshot.phase === "idle" && words.length > 0) {
      void chooseNext(words);
    }
  }, [chooseNext, onSessionChanged, session, words]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space" && currentWord !== null && swipePhase === "idle") {
        event.preventDefault();
        if (session.reveal()) {
          onSessionChanged();
        }
      } else if (revealed && swipePhase === "idle" && event.key === "ArrowLeft") {
        startAnswer(false, window.innerWidth + 620);
      } else if (revealed && swipePhase === "idle" && event.key === "ArrowRight") {
        startAnswer(true, window.innerWidth + 620);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  async function saveTransition(input: ReviewTransitionRequest): Promise<void> {
    try {
      const response = await api.reviewTransition(input);
      if (!reviewTransitions.complete(input.operationId)) return;
      if (!session.transitionReady(input.shown.wordId)) return;

      if (response.answeredWord.id !== response.shownWord.id) {
        onUpdated(response.answeredWord);
      }
      onUpdated(response.shownWord);
      onSessionChanged();
      telegramNotification(input.answer.correct ? "success" : "warning");
    } catch (caught) {
      if (!reviewTransitions.isCurrent(input.operationId)) return;
      session.transitionFailed(input.shown.wordId);
      setError(caught instanceof ApiError ? caught.message : "Could not save the answer");
      onSessionChanged();
    }
  }

  function startAnswer(correct: boolean, exitDistance: number): void {
    if (
      card === null
      || currentWord === null
      || reviewTransitions.pending !== null
    ) return;

    const transition = session.beginTransition(words, currentWord.id, correct);
    if (transition === null) {
      setDragX(0);
      setSwipePhase(Math.abs(dragX) > 1 ? "returning" : "idle");
      return;
    }

    const operation = reviewTransitions.begin(transition);
    if (operation === null) return;

    setOutgoingCard({ card: { ...card }, word: currentWord });
    setSwipePhase("exiting");
    setDragX((correct ? 1 : -1) * exitDistance);
    onSessionChanged();
    setError(null);
    void saveTransition(operation);
  }

  async function retryTransition(): Promise<void> {
    const operation = reviewTransitions.pending;
    if (operation === null || !session.retryTransition(operation.shown.wordId)) return;

    setError(null);
    onSessionChanged();
    await saveTransition(operation);
  }

  function speak(word: VocabularyWord): void {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.learningText);
    utterance.lang = settings.learningLanguage;
    window.speechSynthesis.speak(utterance);
    telegramImpact();
  }

  function handleSwipeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (
      !event.isPrimary
      || event.button !== 0
      || !revealed
      || !canAnswer
      || swipePhase !== "idle"
      || swipeSession.current !== null
    ) return;
    const now = performance.now();
    swipeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: now,
      velocityX: 0,
      axis: null,
      thresholdDirection: 0,
    };
    setSwipeThreshold(event.currentTarget.getBoundingClientRect().width * SWIPE_DISTANCE_RATIO);
  }

  function handleSwipeMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const session = swipeSession.current;
    if (session === null || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (session.axis === null) {
      session.axis = resolvePointerGestureAxis(
        deltaX,
        deltaY,
        SWIPE_AXIS_LOCK_DISTANCE,
        SWIPE_AXIS_DOMINANCE_RATIO,
      );
      if (session.axis === null) return;
      if (session.axis === "vertical") {
        swipeSession.current = null;
        return;
      }
      setSwipePhase("dragging");
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(now - session.lastAt, 1);
    session.velocityX = (event.clientX - session.lastX) / elapsed;
    session.lastX = event.clientX;
    session.lastAt = now;
    setDragX(deltaX);

    const threshold = event.currentTarget.getBoundingClientRect().width * SWIPE_DISTANCE_RATIO;
    const direction = Math.abs(deltaX) >= threshold ? (deltaX > 0 ? 1 : -1) : 0;
    if (direction !== 0 && direction !== session.thresholdDirection) {
      telegramImpact("medium");
      session.thresholdDirection = direction;
    } else if (Math.abs(deltaX) < threshold * 0.7) {
      session.thresholdDirection = 0;
    }
  }

  function finishSwipe(event: ReactPointerEvent<HTMLDivElement>, cancelled = false): void {
    const session = swipeSession.current;
    if (session === null || session.pointerId !== event.pointerId) return;
    swipeSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - session.startX;
    const threshold = event.currentTarget.getBoundingClientRect().width * SWIPE_DISTANCE_RATIO;
    const recentVelocity = performance.now() - session.lastAt <= 120 ? session.velocityX : 0;
    const fastEnough = Math.abs(deltaX) >= SWIPE_MIN_FAST_DISTANCE
      && Math.abs(recentVelocity) >= SWIPE_VELOCITY_THRESHOLD;
    const accepted = !cancelled
      && session.axis === "horizontal"
      && (Math.abs(deltaX) >= threshold || fastEnough);

    if (!accepted) {
      setDragX(0);
      setSwipePhase(session.axis === "horizontal" && Math.abs(deltaX) > 1 ? "returning" : "idle");
      return;
    }

    const correct = deltaX > 0;
    startAnswer(correct, window.innerWidth + event.currentTarget.offsetWidth);
  }

  function handleSwipeTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (swipePhase === "returning") {
      setSwipePhase("idle");
    } else if (swipePhase === "exiting" && outgoingCard !== null) {
      setOutgoingCard(null);
      setDragX(0);
      setSwipePhase("focusing");
    }
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

  if (currentWord === null || card === null || phase === "marking-shown" || phase === "show-failed") {
    return (
      <section className="screen learn-screen centered-screen">
        <div className="review-load-state">
          {phase !== "show-failed" ? (
            <div className="loading-ring" aria-label="Loading next card" />
          ) : (
            <>
              <p className="notice notice-error">{error ?? "Could not load the next card"}</p>
              <button
                className="primary-button review-retry"
                type="button"
                onClick={() => void chooseNext(words)}
              >
                Try again
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  const displayedCard = outgoingCard ?? { card, word: currentWord };
  const incomingCard = outgoingCard === null ? null : { card, word: currentWord };
  const scheduledDueCount = words.filter((word) => isScheduledReviewCandidate(word, new Date())).length;
  const swipeDirection = dragX > 0 ? "swiping-right" : dragX < 0 ? "swiping-left" : "";
  const swipeProgress = Math.min(Math.abs(dragX) / swipeThreshold, 1);
  const swipeRotation = Math.max(-7, Math.min(7, dragX / 24));
  const stackStyle: CSSProperties & {
    "--swipe-progress": number;
    "--stack-scale": number;
    "--stack-offset": string;
    "--rear-scale": number;
    "--rear-offset": string;
  } = {
    "--swipe-progress": swipeProgress,
    "--stack-scale": 0.985 + swipeProgress * 0.015,
    "--stack-offset": `${6 * (1 - swipeProgress)}px`,
    "--rear-scale": 0.97 + swipeProgress * 0.015,
    "--rear-offset": `${12 - swipeProgress * 6}px`,
  };
  const swipeStyle: CSSProperties = {
    transform: `translate3d(${dragX}px, 0, 0) rotate(${swipeRotation}deg)`,
  };

  return (
    <section className="screen learn-screen">
      <header
        ref={modeHelp}
        className="review-mode-header"
      >
        <button
          className={displayedCard.card.mode === "scheduled" ? "review-mode-badge scheduled" : "review-mode-badge"}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={modeHelpOpen}
          aria-controls="review-mode-help"
          onClick={() => setModeHelpOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          {displayedCard.card.mode === "scheduled" ? "Scheduled Review" : "Free Review"}
        </button>
        {displayedCard.card.mode === "scheduled" && <small>{scheduledDueCount} left</small>}
        {modeHelpOpen && (
          <HelpPopover
            id="review-mode-help"
            label={`${displayedCard.card.mode === "scheduled" ? "Scheduled" : "Free"} Review details`}
            items={REVIEW_HELP_ITEMS[displayedCard.card.mode]}
            className="review-mode-help"
          />
        )}
      </header>

      <div className="review-stage">
        <div className={`review-card-shell ${swipePhase}`} style={stackStyle}>
          <ReviewCardPreview snapshot={incomingCard} settings={settings} />
          <div
            className={`review-card-drag-layer ${swipePhase} ${swipeDirection}`}
            style={swipeStyle}
            onTransitionEnd={handleSwipeTransitionEnd}
          >
            <ReviewCard
              key={`${displayedCard.card.wordId}:${displayedCard.card.direction}:${displayedCard.card.mode}`}
              card={displayedCard.card}
              word={displayedCard.word}
              settings={settings}
              revealed={outgoingCard === null ? revealed : true}
              onReveal={outgoingCard === null ? () => {
                if (session.reveal()) {
                  onSessionChanged();
                  telegramImpact();
                }
              } : undefined}
              onSpeak={() => speak(displayedCard.word)}
              onPointerDown={outgoingCard === null ? handleSwipeStart : undefined}
              onPointerMove={outgoingCard === null ? handleSwipeMove : undefined}
              onPointerUp={outgoingCard === null ? (event) => finishSwipe(event) : undefined}
              onPointerCancel={outgoingCard === null ? (event) => finishSwipe(event, true) : undefined}
            />
          </div>
          {outgoingCard !== null || swipePhase === "focusing" ? null : phase === "transition-failed" ? (
            <div className="review-transition-failure">
              <p className="notice notice-error">{error ?? "Could not save the answer"}</p>
              <button
                className="primary-button review-retry"
                type="button"
                onClick={() => void retryTransition()}
              >
                Try again
              </button>
            </div>
          ) : !revealed ? (
            <p className="reveal-hint">
              <kbd>Space</kbd>
              <span className="desktop-hint"> or tap card to reveal</span>
              <span className="mobile-reveal-hint">Tap card to reveal</span>
            </p>
          ) : canAnswer ? (
            <p className="swipe-hint">
              <span className="desktop-swipe-hint">Drag card or use ← →</span>
              <span className="mobile-swipe-hint">Swipe left or right</span>
            </p>
          ) : (
            <p className="swipe-hint">
              {phase === "saving-transition"
                ? "Saving the previous answer…"
                : "Retry the previous answer to continue"}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
