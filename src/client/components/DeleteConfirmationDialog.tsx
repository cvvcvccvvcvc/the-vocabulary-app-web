import { useEffect, useRef } from "react";

interface DeleteConfirmationDialogProps {
  onCancel(): void;
  onConfirm(): void;
}

export function DeleteConfirmationDialog({
  onCancel,
  onConfirm,
}: DeleteConfirmationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    cancelButton.current?.focus({ preventScroll: true });
    return () => {
      if (typeof element.close === "function") element.close();
      else element.removeAttribute("open");
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="delete-confirmation"
      aria-labelledby="delete-confirmation-title"
      aria-describedby="delete-confirmation-message"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="delete-confirmation-surface">
        <div className="delete-confirmation-copy">
          <h2 id="delete-confirmation-title">Delete card?</h2>
          <p id="delete-confirmation-message">
            It will be removed from Words and future reviews.
          </p>
        </div>
        <div className="delete-confirmation-actions">
          <button ref={cancelButton} type="button" onClick={onCancel}>Cancel</button>
          <button className="destructive" type="button" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </dialog>
  );
}
