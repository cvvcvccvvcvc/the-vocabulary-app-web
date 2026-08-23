import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

export interface HelpPopoverItem {
  marker: string;
  tone: "accent" | "success" | "danger" | "neutral";
  title: string;
  detail: string;
}

interface HelpPopoverProps {
  id: string;
  label: string;
  items: readonly HelpPopoverItem[];
  className?: string;
}

export function HelpPopover({ id, label, items, className = "" }: HelpPopoverProps) {
  return (
    <div id={id} className={`help-popover ${className}`.trim()} role="dialog" aria-label={label}>
      {items.map((item) => (
        <div className="help-popover-row" key={item.title}>
          <span className={`help-popover-marker ${item.tone}`} aria-hidden="true">{item.marker}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function useDismissiblePopover<T extends HTMLElement>(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
): RefObject<T | null> {
  const container = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen]);

  return container;
}
