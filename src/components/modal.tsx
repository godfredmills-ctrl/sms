"use client";

import { useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * A modal on the native <dialog> element.
 *
 * The platform already does the hard parts — focus trapping, Escape, the
 * top-layer, inert background — so this wraps rather than reimplements.
 * Clicking the backdrop closes it: the dialog itself is the click target when
 * the click lands outside the panel, because the panel stops propagation.
 *
 * Forms live inside these, so closing does not unmount children until the
 * close animation would be over — state in a half-filled form survives an
 * accidental backdrop click only if the caller keeps `open`; by default a
 * close is a close, which is the less surprising behaviour.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** For big forms — admission runs to several cards. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The dialog can close itself (Escape); the caller's state has to follow.
  const handleClose = useCallback(() => onClose(), [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={(event) => {
        // Only the backdrop: clicks inside the panel never reach here.
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-0 text-[var(--text)] shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm`}
    >
      <div onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-subtle)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[75dvh] overflow-y-auto p-5">{children}</div>
      </div>
    </dialog>
  );
}
