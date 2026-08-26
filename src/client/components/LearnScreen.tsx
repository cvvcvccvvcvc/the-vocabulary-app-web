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
import { AnswerOperationTracker } from "../lib/identifier.js";
import { languageName } from "../lib/languages.js";
import { setTelegramVerticalSwipesEnabled, telegramImpact, telegramNotification } from "../lib/telegram.js";
import { HelpPopover, useDismissiblePopover, type HelpPopoverItem } from "./HelpPopover.js";
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

type SwipeAxis = "horizontal" | "vertical" | null;
type SwipePhase = "idle" | "dragging" | "returning" | "exiting";

interface SwipeSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  axis: SwipeAxis;
  thresholdDirection: -1 | 0 | 1;
}

const SWIPE_AXIS_LOCK_DISTANCE = 8;
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

export function LearnScreen({ words, settings, onUpdated }: LearnScreenProps) {
  const random = useRef(new SystemRandomSource());
  const freePicker = useRef(new FreeReviewPicker());
  const answerOperations = useRef(new AnswerOperationTracker());
  const scheduledIds = useRef<string[]>([]);
  const selecting = useRef(false);
  const [card, setCard] = useState<PresentedCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const swipeSession = useRef<SwipeSession | null>(null);
  const [dragX, setDragX] = useState(0);
  const [swipeThreshold, setSwipeThreshold] = useState(90);
  const [swipePhase, setSwipePhase] = useState<SwipePhase>("idle");
  const [pendingAnswer, setPendingAnswer] = useState<boolean | null>(null);
  const [modeHelpOpen, setModeHelpOpen] = useState(false);
  const modeHelp = useDismissiblePopover<HTMLElement>(modeHelpOpen, setModeHelpOpen);
  const currentWord = words.find((word) => word.id === card?.wordId) ?? null;

  useEffect(() => {
    setTelegramVerticalSwipesEnabled(false);
    return () => setTelegramVerticalSwipesEnabled(true);
  }, []);

  const resetSwipe = useCallback(() => {
    swipeSession.current = null;
    setDragX(0);
    setSwipePhase("idle");
    setPendingAnswer(null);
  }, []);

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
      resetSwipe();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the next card");
    } finally {
      selecting.current = false;
    }
  }, [onUpdated, resetSwipe]);

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
      } else if (revealed && swipePhase === "idle" && event.key === "ArrowLeft") {
        void answer(false);
      } else if (revealed && swipePhase === "idle" && event.key === "ArrowRight") {
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
    const operationId = answerOperations.current.begin(currentWord.id, correct, card.mode);
    try {
      const updated = await api.answerWord(currentWord.id, correct, card.mode, operationId);
      const latestWords = words.map((word) => (word.id === updated.id ? updated : word));
      answerOperations.current.complete();
      onUpdated(updated);
      setCard(null);
      setRevealed(false);
      resetSwipe();
      telegramNotification(correct ? "success" : "warning");
      await chooseNext(latestWords);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the answer");
      resetSwipe();
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

  function handleSwipeStart(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!event.isPrimary || event.button !== 0 || !revealed || working || swipePhase !== "idle") return;
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
    setSwipePhase("dragging");
  }

  function handleSwipeMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const session = swipeSession.current;
    if (session === null || session.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (session.axis === null) {
      if (Math.hypot(deltaX, deltaY) < SWIPE_AXIS_LOCK_DISTANCE) return;
      session.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
      if (session.axis === "vertical") {
        swipeSession.current = null;
        setSwipePhase("idle");
        return;
      }
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

  function finishSwipe(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false): void {
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
      setSwipePhase(Math.abs(deltaX) > 1 ? "returning" : "idle");
      return;
    }

    const correct = deltaX > 0;
    setPendingAnswer(correct);
    setSwipePhase("exiting");
    setDragX((correct ? 1 : -1) * (window.innerWidth + event.currentTarget.offsetWidth));
  }

  function handleSwipeTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>): void {
    if (event.propertyName !== "transform") return;
    if (swipePhase === "returning") {
      setSwipePhase("idle");
    } else if (swipePhase === "exiting" && pendingAnswer !== null) {
      const correct = pendingAnswer;
      setPendingAnswer(null);
      void answer(correct);
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

  if (currentWord === null || card === null) {
    return (
      <section className="screen learn-screen centered-screen">
        <div className="review-load-state">
          {error === null ? (
            <div className="loading-ring" aria-label="Loading next card" />
          ) : (
            <>
              <p className="notice notice-error">{error}</p>
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

  const question = card.direction === "learning-to-known" ? currentWord.learningText : currentWord.meanings.join(" · ");
  const answerText = card.direction === "learning-to-known" ? currentWord.meanings : [currentWord.learningText];
  const questionIsLearning = card.direction === "learning-to-known";
  const questionLanguage = languageName(questionIsLearning ? settings.learningLanguage : settings.knownLanguage);
  const answerLanguage = languageName(questionIsLearning ? settings.knownLanguage : settings.learningLanguage);
  const scheduledDueCount = words.filter((word) => isScheduledReviewCandidate(word, new Date())).length;
  const swipeDirection = dragX > 0 ? "swiping-right" : dragX < 0 ? "swiping-left" : "";
  const swipeProgress = Math.min(Math.abs(dragX) / swipeThreshold, 1);
  const swipeRotation = Math.max(-7, Math.min(7, dragX / 24));
  const swipeStyle: CSSProperties & { "--swipe-progress": number } = {
    "--swipe-progress": swipeProgress,
    transform: `translate3d(${dragX}px, 0, 0) rotate(${swipeRotation}deg)`,
  };

  return (
    <section className="screen learn-screen">
      <header
        ref={modeHelp}
        className="review-mode-header"
      >
        <button
          className={card.mode === "scheduled" ? "review-mode-badge scheduled" : "review-mode-badge"}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={modeHelpOpen}
          aria-controls="review-mode-help"
          onClick={() => setModeHelpOpen((open) => !open)}
        >
          <span aria-hidden="true" />
          {card.mode === "scheduled" ? "Scheduled Review" : "Free Review"}
        </button>
        {card.mode === "scheduled" && <small>{scheduledDueCount} left</small>}
        {modeHelpOpen && (
          <HelpPopover
            id="review-mode-help"
            label={`${card.mode === "scheduled" ? "Scheduled" : "Free"} Review details`}
            items={REVIEW_HELP_ITEMS[card.mode]}
            className="review-mode-help"
          />
        )}
      </header>

      <div className="review-stage">
        <div className="review-card-shell">
          <div
            className={`review-card-drag-layer ${swipePhase} ${swipeDirection}`}
            style={swipeStyle}
            onTransitionEnd={handleSwipeTransitionEnd}
          >
            <button
              className={revealed ? "review-card revealed" : "review-card"}
              type="button"
              draggable={false}
              onClick={() => {
                if (revealed) return;
                setRevealed(true);
                telegramImpact();
              }}
              onPointerDown={handleSwipeStart}
              onPointerMove={handleSwipeMove}
              onPointerUp={(event) => finishSwipe(event)}
              onPointerCancel={(event) => finishSwipe(event, true)}
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
            {revealed && (
              <>
                <span className="swipe-feedback wrong" aria-hidden="true">Wrong</span>
                <span className="swipe-feedback correct" aria-hidden="true">Correct</span>
              </>
            )}
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
          </div>
          {!revealed ? (
            <p className="reveal-hint">
              <kbd>Space</kbd>
              <span className="desktop-hint"> or tap card to reveal</span>
              <span className="mobile-reveal-hint">Tap card to reveal</span>
            </p>
          ) : (
            <p className="swipe-hint">
              <span className="desktop-swipe-hint">Drag card or use ← →</span>
              <span className="mobile-swipe-hint">Swipe left or right</span>
            </p>
          )}
        </div>
        {error !== null && <p className="notice notice-error">{error}</p>}
      </div>
    </section>
  );
}
