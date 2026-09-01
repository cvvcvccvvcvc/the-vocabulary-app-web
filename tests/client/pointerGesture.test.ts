import { describe, expect, it, vi } from "vitest";
import {
  resolvePointerGestureAxis,
  trackPointerGesture,
} from "../../src/client/lib/pointerGesture.js";

function pointer(type: string, pointerId = 1, clientY = 0): Event {
  return Object.assign(new Event(type), { pointerId, clientY });
}

describe("pointer gesture lifetime", () => {
  it("finishes from the shared event target even when release is outside the source", () => {
    const windowTarget = new EventTarget();
    const handlers = { move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    trackPointerGesture(windowTarget, 1, handlers);
    const released = pointer("pointerup", 1, 600);
    windowTarget.dispatchEvent(pointer("pointermove", 1, 400));
    windowTarget.dispatchEvent(released);
    expect(handlers.move).toHaveBeenCalledOnce();
    expect(handlers.end).toHaveBeenCalledExactlyOnceWith(released);
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  it("delivers the final coordinates even when move and release occur before another frame", () => {
    const target = new EventTarget();
    const positions: number[] = [];
    trackPointerGesture(target, 1, {
      move: (event) => positions.push(event.clientY),
      end: (event) => positions.push(event.clientY),
      cancel: vi.fn(),
    });
    target.dispatchEvent(pointer("pointermove", 1, 100));
    target.dispatchEvent(pointer("pointerup", 1, 300));
    expect(positions).toEqual([100, 300]);
  });

  it("ignores other pointers and unregisters before calling the end handler", () => {
    const target = new EventTarget();
    const handlers = {
      move: vi.fn(),
      end: vi.fn(() => target.dispatchEvent(pointer("pointerup"))),
      cancel: vi.fn(),
    };
    trackPointerGesture(target, 1, handlers);
    target.dispatchEvent(pointer("pointermove", 2));
    target.dispatchEvent(pointer("pointerup", 2));
    target.dispatchEvent(pointer("pointercancel", 2));
    target.dispatchEvent(pointer("pointerup"));
    target.dispatchEvent(pointer("pointermove"));
    target.dispatchEvent(pointer("pointercancel"));
    expect(handlers.end).toHaveBeenCalledOnce();
    expect(handlers.move).not.toHaveBeenCalled();
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  it("cancels only once and never commits a cancelled gesture", () => {
    const target = new EventTarget();
    const handlers = { move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    trackPointerGesture(target, 1, handlers);
    target.dispatchEvent(pointer("pointercancel"));
    target.dispatchEvent(pointer("pointercancel"));
    target.dispatchEvent(pointer("pointerup"));
    expect(handlers.cancel).toHaveBeenCalledOnce();
    expect(handlers.end).not.toHaveBeenCalled();
  });

  it("can be disposed for Escape, blur, or unmount without affecting a subsequent gesture", () => {
    const target = new EventTarget();
    const first = { move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    const stop = trackPointerGesture(target, 1, first);
    stop();
    stop();
    const second = { move: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    trackPointerGesture(target, 1, second);
    target.dispatchEvent(pointer("pointerup"));
    expect(first.end).not.toHaveBeenCalled();
    expect(second.end).toHaveBeenCalledOnce();
  });
});

describe("pointer gesture axis", () => {
  it("waits until the gesture passes the lock distance", () => {
    expect(resolvePointerGestureAxis(5, 5, 8, 1.2)).toBeNull();
  });

  it("locks clear horizontal and vertical intent independently of scrollability", () => {
    expect(resolvePointerGestureAxis(20, 5, 8, 1.2)).toBe("horizontal");
    expect(resolvePointerGestureAxis(5, -20, 8, 1.2)).toBe("vertical");
  });

  it("keeps an ambiguous diagonal gesture unlocked", () => {
    expect(resolvePointerGestureAxis(20, 18, 8, 1.2)).toBeNull();
    expect(resolvePointerGestureAxis(-18, -20, 8, 1.2)).toBeNull();
  });
});
