import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import { flushSync } from "react-dom";
import { hasMeaning, MAX_MEANINGS, type MeaningAction, type MeaningRow } from "../lib/meaningDraft.js";
import {
  calculateMeaningReorderLayout,
  type MeaningReorderItem,
  type MeaningReorderLayout,
  type MeaningReorderShift,
} from "../lib/meaningReorder.js";
import { setTelegramVerticalSwipesEnabled } from "../lib/telegram.js";
import { trackPointerGesture } from "../lib/pointerGesture.js";
import { Icon } from "./Icons.js";

const DRAG_START_DISTANCE = 6;
const AUTO_SCROLL_EDGE = 44;
const AUTO_SCROLL_MAX_SPEED = 600;
const DROP_SETTLE_DURATION = 160;

interface MeaningFieldsProps {
  label: string;
  rows: MeaningRow[];
  onAction: Dispatch<MeaningAction>;
  variant: "add" | "edit";
  disabled: boolean;
}

interface DragSession {
  id: number;
  pointerId: number;
  captureTarget: HTMLFieldSetElement;
  scroller: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  startScroll: number;
  geometry: MeaningReorderItem[];
  sourceIndex: number;
  targetIndex: number;
  lastFrameAt: number | null;
  started: boolean;
  cleanup: () => void;
}

interface DragPreview extends MeaningReorderLayout {
  id: number;
}

interface DropAnimation {
  id: number;
  offsets: MeaningReorderShift[];
  active: boolean;
}

function findScrollContainer(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollBounds(scroller: HTMLElement): { top: number; bottom: number } {
  const visibleTop = window.visualViewport?.offsetTop ?? 0;
  const visibleBottom = visibleTop + (window.visualViewport?.height ?? window.innerHeight);
  if (scroller === document.scrollingElement) return { top: visibleTop, bottom: visibleBottom };
  const bounds = scroller.getBoundingClientRect();
  return { top: Math.max(visibleTop, bounds.top), bottom: Math.min(visibleBottom, bounds.bottom) };
}

export function MeaningFields({ label, rows, onAction, variant, disabled }: MeaningFieldsProps) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const rowElements = useRef(new Map<number, HTMLDivElement>());
  const composing = useRef<number | null>(null);
  const drag = useRef<DragSession | null>(null);
  const animation = useRef<number | null>(null);
  const dropFrame = useRef<number | null>(null);
  const dropTimer = useRef<number | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [drop, setDrop] = useState<DropAnimation | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const filled = rows.filter(hasMeaning);
  const canReorder = filled.length > 1 && !disabled;

  useEffect(() => {
    if (!canReorder) return;
    setTelegramVerticalSwipesEnabled(false);
    return () => setTelegramVerticalSwipesEnabled(true);
  }, [canReorder]);

  useEffect(() => {
    function cancel() { stopDrag(); }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") stopDrag();
    }
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
      stopDrag();
      clearDropAnimation();
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      stopDrag();
      clearDropAnimation();
    }
  }, [disabled]);

  function activeInputId(): number | null {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && fieldset.current?.contains(active)
      ? Number(active.dataset.meaningId)
      : null;
  }

  function removeRow(id: number): void {
    const index = rows.findIndex((row) => row.id === id);
    const element = rowElements.current.get(id);
    if (element?.contains(document.activeElement)) {
      const next = rows[index + 1] ?? rows[index - 1];
      if (next !== undefined) rowElements.current.get(next.id)?.querySelector("input")?.focus({ preventScroll: true });
    }
    onAction({ type: "remove", id, activeId: activeInputId() });
    setAnnouncement(`Meaning ${index + 1} removed`);
  }

  function moveRow(id: number, beforeId: number | null): void {
    const others = filled.filter((row) => row.id !== id);
    const position = beforeId === null ? others.length : others.findIndex((row) => row.id === beforeId);
    onAction({ type: "move", id, beforeId });
    setAnnouncement(`Meaning moved to position ${position + 1} of ${filled.length}`);
  }

  function detachDrag(session: DragSession | null): void {
    if (drag.current !== session) return;
    drag.current = null;
    session?.cleanup();
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
  }

  function stopDrag(): void {
    const session = drag.current;
    detachDrag(session);
    if (session?.captureTarget.hasPointerCapture(session.pointerId)) session.captureTarget.releasePointerCapture(session.pointerId);
    setPreview(null);
  }

  function clearDropAnimation(): void {
    if (dropFrame.current !== null) cancelAnimationFrame(dropFrame.current);
    if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    dropFrame.current = null;
    dropTimer.current = null;
    setDrop(null);
  }

  function dragPreview(session: DragSession): DragPreview {
    const container = session.scroller;
    const offset = session.y - session.startY + container.scrollTop - session.startScroll;
    const source = session.geometry[session.sourceIndex]!;
    const layout = calculateMeaningReorderLayout(
      session.geometry,
      session.id,
      source.top + source.height / 2 + offset,
      session.targetIndex,
    );
    session.targetIndex = layout.targetIndex;
    return {
      id: session.id,
      ...layout,
    };
  }

  function animateDrag(frameAt: number): void {
    const session = drag.current;
    if (session === null || !session.started) return;
    const container = session.scroller;
    const { top, bottom } = scrollBounds(container);
    const elapsed = session.lastFrameAt === null ? 0 : Math.min(frameAt - session.lastFrameAt, 32);
    session.lastFrameAt = frameAt;
    const velocity = session.y < top + AUTO_SCROLL_EDGE
      ? -AUTO_SCROLL_MAX_SPEED * Math.min(1, (top + AUTO_SCROLL_EDGE - session.y) / AUTO_SCROLL_EDGE)
      : session.y > bottom - AUTO_SCROLL_EDGE
        ? AUTO_SCROLL_MAX_SPEED * Math.min(1, (session.y - bottom + AUTO_SCROLL_EDGE) / AUTO_SCROLL_EDGE)
        : 0;
    const first = session.geometry[0]!;
    const last = session.geometry[session.geometry.length - 1]!;
    const hiddenAbove = Math.max(0, top - (first.top - container.scrollTop));
    const hiddenBelow = Math.max(0, last.top + last.height - container.scrollTop - bottom);
    const scrollStep = Math.max(-hiddenAbove, Math.min(hiddenBelow, velocity * elapsed / 1000));
    const maxScroll = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.max(0, Math.min(maxScroll, container.scrollTop + scrollStep));
    const next = dragPreview(session);
    setPreview((current) => current?.targetIndex === next.targetIndex
      && current.offset === next.offset ? current : next);
    animation.current = requestAnimationFrame(animateDrag);
  }

  function startDrag(event: ReactPointerEvent<HTMLSpanElement>, id: number): void {
    if (!canReorder || !event.isPrimary || event.button !== 0 || composing.current !== null) return;
    if (fieldset.current === null) return;
    const container = findScrollContainer(fieldset.current);
    stopDrag();
    clearDropAnimation();
    event.preventDefault();
    drag.current = {
      id, pointerId: event.pointerId, captureTarget: fieldset.current, scroller: container,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      startScroll: container.scrollTop, geometry: [], sourceIndex: -1, targetIndex: -1,
      lastFrameAt: null, started: false,
      cleanup: trackPointerGesture(window, event.pointerId, {
        move: updateDrag,
        end: finishDrag,
        cancel: stopDrag,
      }),
    };
  }

  function updateDrag(event: PointerEvent): void {
    const session = drag.current;
    if (session === null || session.pointerId !== event.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    if (!session.started
      && Math.hypot(session.x - session.startX, session.y - session.startY) >= DRAG_START_DISTANCE) {
      session.geometry = filled.map((row) => {
        const rect = rowElements.current.get(row.id)!.getBoundingClientRect();
        return { id: row.id, top: rect.top + session.scroller.scrollTop, height: rect.height };
      });
      session.sourceIndex = session.geometry.findIndex((item) => item.id === session.id);
      if (session.sourceIndex < 0) { stopDrag(); return; }
      session.targetIndex = session.sourceIndex;
      session.started = true;
      session.captureTarget.setPointerCapture(session.pointerId);
      setPreview(dragPreview(session));
      animation.current = requestAnimationFrame(animateDrag);
    }
  }

  function finishDrag(event: PointerEvent): void {
    const session = drag.current;
    if (session === null || session.pointerId !== event.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    const target = session.started ? dragPreview(session) : null;
    detachDrag(session);
    if (target === null) {
      setPreview(null);
      return;
    }

    const beforeTops = new Map(filled.map((row) => [
      row.id,
      rowElements.current.get(row.id)!.getBoundingClientRect().top,
    ]));

    // Flush the final pointer position even if it arrived before the next animation frame.
    // FLIP preserves the actual painted positions, including partially shifted neighbors.
    flushSync(() => {
      setPreview(null);
      if (target.targetIndex !== session.sourceIndex) {
        moveRow(session.id, target.beforeId);
      }
    });

    const offsets = filled.flatMap((row) => {
      const element = rowElements.current.get(row.id);
      const beforeTop = beforeTops.get(row.id);
      if (element === undefined || beforeTop === undefined) return [];
      const offset = beforeTop - element.getBoundingClientRect().top;
      return Math.abs(offset) < 0.5 ? [] : [{ id: row.id, offset }];
    });

    if (offsets.length > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      flushSync(() => setDrop({ id: session.id, offsets, active: false }));
      rowElements.current.get(offsets[0]!.id)?.getBoundingClientRect();
      dropFrame.current = requestAnimationFrame(() => {
        dropFrame.current = null;
        setDrop((current) => current === null ? null : {
          ...current,
          active: true,
          offsets: current.offsets.map((item) => ({ ...item, offset: 0 })),
        });
        dropTimer.current = window.setTimeout(() => {
          dropTimer.current = null;
          setDrop(null);
        }, DROP_SETTLE_DURATION + 80);
      });
    }

    if (session.captureTarget.hasPointerCapture(session.pointerId)) {
      session.captureTarget.releasePointerCapture(session.pointerId);
    }
  }

  return (
    <fieldset
      ref={fieldset}
      className={`meaning-fields meaning-fields-${variant}${preview === null ? "" : " reordering"}`}
      disabled={disabled}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget && drag.current?.pointerId === event.pointerId) stopDrag();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onAction({ type: "settle", activeId: null });
        }
      }}
    >
      <legend>{label}</legend>
      <div className="meaning-rows">
        {rows.map((row, index) => {
          const populated = hasMeaning(row);
          const dragging = preview?.id === row.id;
          const shift = preview?.shifts.find((item) => item.id === row.id)?.offset ?? 0;
          const dropOffset = drop?.offsets.find((item) => item.id === row.id)?.offset;
          const dropping = dropOffset !== undefined;
          return (
            <div
              key={row.id}
              ref={(element) => { if (element === null) rowElements.current.delete(row.id); else rowElements.current.set(row.id, element); }}
              className={`meaning-row${dragging ? " dragging" : ""}${dropping ? " drop-settling" : ""}${drop?.id === row.id ? " drop-lifted" : ""}${dropping && drop?.active === true ? " drop-settling-active" : ""}`}
              style={preview !== null
                ? { transform: `translateY(${dragging ? preview.offset : shift}px)` }
                : dropping ? { transform: `translateY(${dropOffset}px)` } : undefined}
              onTransitionEnd={(event) => {
                if (dropping && drop?.active && event.propertyName === "transform" && event.target === event.currentTarget) {
                  clearDropAnimation();
                }
              }}
            >
              <div className="meaning-control-slot">
                {populated && filled.length > 1 && (
                  <span
                    className="meaning-control meaning-reorder"
                    aria-hidden="true"
                    onPointerDown={(event) => startDrag(event, row.id)}
                  >
                    <Icon name="grip" />
                  </span>
                )}
              </div>
              <input
                data-meaning-id={row.id}
                aria-label={`Meaning ${index + 1}`}
                aria-description={!populated && filled.length > 0 ? "Optional additional meaning" : undefined}
                maxLength={600}
                placeholder={filled.length === 0 ? "Meaning" : "Another meaning"}
                value={row.text}
                onFocus={() => {
                  onAction({ type: "settle", activeId: row.id });
                }}
                onChange={(event) => onAction({ type: "change", id: row.id, text: event.target.value, composing: composing.current === row.id })}
                onCompositionStart={() => { composing.current = row.id; }}
                onCompositionEnd={(event) => {
                  composing.current = null;
                  onAction({ type: "change", id: row.id, text: event.currentTarget.value });
                }}
              />
              <div className="meaning-control-slot">
                {populated && (
                  <button
                    className="meaning-control meaning-remove"
                    type="button"
                    aria-label={`Remove meaning ${index + 1}`}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => removeRow(row.id)}
                  >−</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {filled.length === MAX_MEANINGS && <p className="meaning-limit">8 of 8 meanings</p>}
      <span className="meaning-announcement" role="status" aria-live="polite">{announcement}</span>
    </fieldset>
  );
}
