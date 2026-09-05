import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { VocabularyWord } from "../../domain/index.js";
import {
  resolvePointerGestureAxis,
  trackPointerGesture,
  type PointerGestureAxis,
} from "../lib/pointerGesture.js";
import {
  settleSwipeAction,
  swipeActionOffset,
  swipeActionPresentation,
} from "../lib/swipeAction.js";
import { Icon } from "./Icons.js";

const DELETE_REVEALED_OFFSET = 124;
const DEEP_SETTLE_MS = 180;
const CLICK_SUPPRESSION_MS = 400;
const SWIPE_AXIS_LOCK_DISTANCE = 8;
const SWIPE_AXIS_DOMINANCE_RATIO = 1.2;

interface SwipeSession {
  pointerId: number;
  target: HTMLButtonElement;
  startX: number;
  startY: number;
  startOffset: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  axis: PointerGestureAxis;
  cleanup(): void;
}

interface SwipeableWordRowProps {
  word: VocabularyWord;
  selected: boolean;
  revealed: boolean;
  deleting: boolean;
  removing: boolean;
  onSetRevealed(revealed: boolean): void;
  onOpen(): void;
  onDelete(returnFocusTo: HTMLButtonElement | null): Promise<boolean>;
}

export function SwipeableWordRow({
  word,
  selected,
  revealed,
  deleting,
  removing,
  onSetRevealed,
  onOpen,
  onDelete,
}: SwipeableWordRowProps) {
  const rowButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const swipeSession = useRef<SwipeSession | null>(null);
  const returnTimer = useRef<number | null>(null);
  const suppressClickUntil = useRef(Number.NEGATIVE_INFINITY);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const offset = dragOffset ?? (revealed ? -DELETE_REVEALED_OFFSET : 0);
  const action = swipeActionPresentation(offset);
  const deleteActionId = `word-delete-${word.id}`;

  useEffect(() => () => {
    const session = swipeSession.current;
    session?.cleanup();
    if (session?.target.hasPointerCapture(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
    if (returnTimer.current !== null) window.clearTimeout(returnTimer.current);
  }, []);

  useEffect(() => {
    if (!revealed && document.activeElement === deleteButton.current) {
      rowButton.current?.focus();
    }
  }, [revealed]);

  function releasePointer(session: SwipeSession): void {
    if (session.target.hasPointerCapture(session.pointerId)) {
      session.target.releasePointerCapture(session.pointerId);
    }
  }

  function stopVerticalGesture(session: SwipeSession): void {
    session.cleanup();
    releasePointer(session);
    swipeSession.current = null;
    setDragOffset(null);
    setDragging(false);
  }

  function updateGesture(session: SwipeSession, event: PointerEvent): number {
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;

    if (session.axis === null) {
      session.axis = resolvePointerGestureAxis(
        deltaX,
        deltaY,
        SWIPE_AXIS_LOCK_DISTANCE,
        SWIPE_AXIS_DOMINANCE_RATIO,
      );
      if (session.axis === null) return session.startOffset;
      if (session.axis === "vertical") {
        stopVerticalGesture(session);
        return session.startOffset;
      }
      session.target.setPointerCapture(session.pointerId);
      setDragging(true);
    }

    event.preventDefault();
    const now = performance.now();
    const elapsed = Math.max(now - session.lastAt, 1);
    session.velocityX = (event.clientX - session.lastX) / elapsed;
    session.lastX = event.clientX;
    session.lastAt = now;
    const nextOffset = swipeActionOffset(
      session.startOffset,
      deltaX,
      session.target.getBoundingClientRect().width,
    );
    setDragOffset(nextOffset);
    return nextOffset;
  }

  async function finishGesture(event: PointerEvent): Promise<void> {
    const session = swipeSession.current;
    if (session === null || session.pointerId !== event.pointerId) return;

    const finalOffset = updateGesture(session, event);
    if (swipeSession.current !== session) return;
    releasePointer(session);
    swipeSession.current = null;
    setDragging(false);

    if (session.axis !== "horizontal") {
      setDragOffset(null);
      return;
    }
    suppressClickUntil.current = performance.now() + CLICK_SUPPRESSION_MS;
    const rowWidth = session.target.getBoundingClientRect().width;
    const settlement = settleSwipeAction(
      finalOffset,
      session.velocityX,
      rowWidth,
      DELETE_REVEALED_OFFSET,
    );

    if (settlement === "confirm") {
      setConfirming(true);
      setDragOffset(-rowWidth);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, DEEP_SETTLE_MS));
      }
      const deleted = await onDelete(rowButton.current);
      if (!deleted) {
        onSetRevealed(false);
        setDragOffset(0);
        returnTimer.current = window.setTimeout(() => {
          returnTimer.current = null;
          setDragOffset(null);
          setConfirming(false);
        }, DEEP_SETTLE_MS);
      }
      return;
    }

    setDragOffset(null);
    onSetRevealed(settlement === "revealed");
  }

  function cancelGesture(): void {
    const session = swipeSession.current;
    if (session === null) return;
    releasePointer(session);
    swipeSession.current = null;
    setDragOffset(null);
    setDragging(false);
  }

  function startGesture(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (
      !event.isPrimary
      || event.button !== 0
      || deleting
      || removing
      || confirming
      || swipeSession.current !== null
    ) return;

    if (!revealed) onSetRevealed(false);
    const now = performance.now();
    const session: SwipeSession = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: revealed ? -DELETE_REVEALED_OFFSET : 0,
      lastX: event.clientX,
      lastAt: now,
      velocityX: 0,
      axis: null,
      cleanup: () => undefined,
    };
    session.cleanup = trackPointerGesture(window, event.pointerId, {
      move: (pointerEvent) => {
        if (swipeSession.current === session) updateGesture(session, pointerEvent);
      },
      end: finishGesture,
      cancel: cancelGesture,
    });
    swipeSession.current = session;
  }

  function handleRowClick(): void {
    if (deleting || removing || confirming || performance.now() < suppressClickUntil.current) return;
    if (revealed) {
      onSetRevealed(false);
      return;
    }
    onOpen();
  }

  const shellClassName = [
    "word-row-shell",
    revealed ? "revealed" : "",
    confirming ? "confirming" : "",
    removing ? "removing" : "",
  ].filter(Boolean).join(" ");
  const rowClassName = [
    "word-row",
    selected ? "selected" : "",
    dragging ? "dragging" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClassName}>
      <button
        ref={rowButton}
        className={rowClassName}
        type="button"
        aria-controls={deleteActionId}
        aria-expanded={revealed || confirming}
        aria-disabled={deleting || removing || confirming}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onClick={handleRowClick}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onSetRevealed(true);
          } else if ((event.key === "ArrowRight" || event.key === "Escape") && revealed) {
            event.preventDefault();
            onSetRevealed(false);
          }
        }}
        onPointerDown={startGesture}
      >
        <span className="word-row-copy">
          <strong>{word.learningText}</strong>
          <small>{word.meanings.join(", ")}</small>
        </span>
        <span className={word.level === 0 ? "level-badge zero" : "level-badge"}>{word.level}</span>
      </button>
      <button
        ref={deleteButton}
        id={deleteActionId}
        className="word-row-delete"
        type="button"
        aria-label={`Delete “${word.learningText}”`}
        aria-hidden={!revealed || confirming}
        tabIndex={revealed && !confirming ? 0 : -1}
        disabled={deleting || removing || confirming}
        style={{
          width: `${action.width}px`,
          opacity: action.progress,
          transform: `scale(${0.86 + action.progress * 0.14})`,
        }}
        onClick={() => {
          setConfirming(true);
          void onDelete(rowButton.current).then((deleted) => {
            if (!deleted) {
              setConfirming(false);
              onSetRevealed(false);
            }
          });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onSetRevealed(false);
          rowButton.current?.focus();
        }}
      >
        <Icon name="delete" />
        <span>Delete</span>
      </button>
    </div>
  );
}
