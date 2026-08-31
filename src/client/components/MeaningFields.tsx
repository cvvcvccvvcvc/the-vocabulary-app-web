import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import { hasMeaning, MAX_MEANINGS, type MeaningAction, type MeaningRow } from "../lib/meaningDraft.js";
import { setTelegramVerticalSwipesEnabled } from "../lib/telegram.js";
import { Icon } from "./Icons.js";

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
  maxScroll: number;
  started: boolean;
}

interface DragPreview {
  id: number;
  beforeId: number | null;
  offset: number;
  inside: boolean;
}

function findScrollContainer(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function scrollBounds(scroller: HTMLElement): { top: number; bottom: number } {
  if (scroller === document.scrollingElement) return { top: 0, bottom: window.innerHeight };
  const bounds = scroller.getBoundingClientRect();
  return { top: Math.max(0, bounds.top), bottom: Math.min(window.innerHeight, bounds.bottom) };
}

export function MeaningFields({ label, rows, onAction, variant, disabled }: MeaningFieldsProps) {
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const rowElements = useRef(new Map<number, HTMLDivElement>());
  const composing = useRef<number | null>(null);
  const drag = useRef<DragSession | null>(null);
  const animation = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
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
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      stopDrag();
      setMenuId(null);
    }
  }, [disabled]);

  useEffect(() => {
    if (menuId !== null) {
      rowElements.current.get(menuId)?.querySelector<HTMLButtonElement>(".meaning-move-menu button:not(:disabled)")?.focus();
    }
  }, [menuId]);

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
    setMenuId(null);
    setAnnouncement(`Meaning ${index + 1} removed`);
  }

  function moveRow(id: number, beforeId: number | null): void {
    const others = filled.filter((row) => row.id !== id);
    const position = beforeId === null ? others.length : others.findIndex((row) => row.id === beforeId);
    onAction({ type: "move", id, beforeId });
    setMenuId(null);
    rowElements.current.get(id)?.querySelector<HTMLButtonElement>(".meaning-reorder")?.focus({ preventScroll: true });
    setAnnouncement(`Meaning moved to position ${position + 1} of ${filled.length}`);
  }

  function stopDrag(): void {
    const session = drag.current;
    drag.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    if (session?.captureTarget.hasPointerCapture(session.pointerId)) session.captureTarget.releasePointerCapture(session.pointerId);
    if (session?.started) suppressClick.current = true;
    setPreview(null);
  }

  function dragPreview(session: DragSession): DragPreview {
    const bounds = fieldset.current!.getBoundingClientRect();
    const container = session.scroller;
    const viewport = scrollBounds(container);
    const beforeId = filled.find((row) => {
      if (row.id === session.id) return false;
      const rect = rowElements.current.get(row.id)!.getBoundingClientRect();
      return session.y < rect.top + rect.height / 2;
    })?.id ?? null;
    return {
      id: session.id,
      beforeId,
      offset: session.y - session.startY + container.scrollTop - session.startScroll,
      inside: session.x >= bounds.left && session.x <= bounds.right
        && session.y >= Math.max(bounds.top, viewport.top, 0)
        && session.y <= Math.min(bounds.bottom, viewport.bottom, window.innerHeight),
    };
  }

  function animateDrag(): void {
    const session = drag.current;
    if (session === null || !session.started) return;
    const container = session.scroller;
    const { top, bottom } = scrollBounds(container);
    const scroll = session.y < top + 36 ? -Math.min(10, (top + 36 - session.y) / 3)
      : session.y > bottom - 36 ? Math.min(10, (session.y - bottom + 36) / 3) : 0;
    container.scrollTop = Math.max(0, Math.min(session.maxScroll, container.scrollTop + scroll));
    const next = dragPreview(session);
    setPreview((current) => current?.beforeId === next.beforeId && current.offset === next.offset && current.inside === next.inside ? current : next);
    animation.current = requestAnimationFrame(animateDrag);
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: number): void {
    if (!canReorder || !event.isPrimary || event.button !== 0 || composing.current !== null) return;
    if (fieldset.current === null) return;
    const container = findScrollContainer(fieldset.current);
    stopDrag();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    suppressClick.current = false;
    drag.current = {
      id, pointerId: event.pointerId, captureTarget: fieldset.current, scroller: container,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
      startScroll: container.scrollTop, maxScroll: container.scrollHeight - container.clientHeight, started: false,
    };
  }

  function updateDrag(event: ReactPointerEvent<HTMLFieldSetElement>): void {
    const session = drag.current;
    if (session === null || session.pointerId !== event.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    if (!session.started && Math.hypot(session.x - session.startX, session.y - session.startY) >= 6) {
      session.started = true;
      // The list stays in place while the dragged handle is translated.
      session.captureTarget.setPointerCapture(session.pointerId);
      setMenuId(null);
      animateDrag();
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLFieldSetElement>): void {
    const session = drag.current;
    if (session === null || session.pointerId !== event.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    const target = session.started ? dragPreview(session) : null;
    stopDrag();
    if (target?.inside) moveRow(session.id, target.beforeId);
  }

  return (
    <fieldset
      ref={fieldset}
      className={`meaning-fields meaning-fields-${variant}`}
      disabled={disabled}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={() => stopDrag()}
      onLostPointerCapture={(event) => { if (event.target === event.currentTarget) stopDrag(); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onAction({ type: "settle", activeId: null });
          setMenuId(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuId !== null) {
          rowElements.current.get(menuId)?.querySelector<HTMLButtonElement>(".meaning-reorder")?.focus();
          setMenuId(null);
        }
      }}
    >
      <legend>{label}</legend>
      <div className="meaning-rows">
        {rows.map((row, index) => {
          const populated = hasMeaning(row);
          const position = filled.findIndex((item) => item.id === row.id);
          const dragging = preview?.id === row.id;
          const before = preview?.inside && (preview.beforeId === row.id || (preview.beforeId === null && !populated));
          return (
            <div
              key={row.id}
              ref={(element) => { if (element === null) rowElements.current.delete(row.id); else rowElements.current.set(row.id, element); }}
              className={`meaning-row${dragging ? " dragging" : ""}${before ? " drop-before" : ""}`}
              style={dragging ? { transform: `translateY(${preview.offset}px)` } : undefined}
            >
              <div className="meaning-control-slot">
                {populated && filled.length > 1 && (
                  <button
                    className="meaning-control meaning-reorder"
                    type="button"
                    aria-label={`Reorder meaning ${index + 1}`}
                    aria-expanded={menuId === row.id}
                    onPointerDown={(event) => startDrag(event, row.id)}
                    onClick={(event) => {
                      if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; }
                      suppressClick.current = false;
                      setMenuId((current) => current === row.id ? null : row.id);
                    }}
                  >
                    <Icon name="grip" />
                  </button>
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
                  setMenuId(null);
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
              {menuId === row.id && populated && filled.length > 1 && (
                <div className="meaning-move-menu" role="group" aria-label={`Move meaning ${index + 1}`}>
                  <button type="button" disabled={position === 0} onClick={() => moveRow(row.id, filled[position - 1]!.id)}>Move up</button>
                  <button type="button" disabled={position === filled.length - 1} onClick={() => moveRow(row.id, filled[position + 2]?.id ?? null)}>Move down</button>
                </div>
              )}
            </div>
          );
        })}
        {preview?.inside && preview.beforeId === null && filled.length === rows.length && <span className="meaning-drop-end" aria-hidden="true" />}
      </div>
      {filled.length === MAX_MEANINGS && <p className="meaning-limit">8 of 8 meanings</p>}
      <span className="meaning-announcement" role="status" aria-live="polite">{announcement}</span>
    </fieldset>
  );
}
