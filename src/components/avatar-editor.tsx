"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, ZoomIn, ZoomOut } from "lucide-react";

import { Alert, Avatar, Button } from "@/components/ui";
import { Modal } from "@/components/modal";

/**
 * A profile picture, chosen and cropped the way people expect.
 *
 * Pick a file and it opens in a round window: drag to move it, scroll or drag
 * the slider to zoom, and what is inside the circle is what gets saved. That
 * is the pattern everyone already knows from their phone, and it matters here
 * for a plain reason: a photograph taken in portrait and uploaded whole shows
 * as a face in the middle of a tall rectangle, cropped to its centre by the
 * browser. People end up with a picture of their chin.
 *
 * The crop happens in the browser and only the result is sent. A 4MB photograph
 * from a phone becomes about 60KB, which matters on a Ghanaian mobile
 * connection and means the school is not storing a full-resolution portrait of
 * every member of staff to display it at 32 pixels.
 */

/** What the school stores. Large enough for a printed ID card, no larger. */
const OUTPUT = 512;

/** The round window the picture is dragged behind. */
const VIEW = 288;

type Placement = { scale: number; x: number; y: number };

export function AvatarEditor({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  /** The current address, or empty. The form field is kept in sync with it. */
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Choose an image.");
      return;
    }

    // Read locally rather than uploading first. Nothing reaches the school's
    // storage until the person has decided what the picture looks like.
    const reader = new FileReader();
    reader.onload = () => setSource(String(reader.result));
    reader.onerror = () => setError("That file could not be opened.");
    reader.readAsDataURL(file);
  }

  async function save(blob: Blob) {
    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", new File([blob], "profile.jpg", { type: "image/jpeg" }));
      body.append("purpose", "avatar");

      const response = await fetch("/api/upload", { method: "POST", body });
      const payload = (await response.json()) as {
        ok?: boolean;
        file?: { url?: string };
        error?: string;
      };

      if (!response.ok || !payload.file?.url) {
        setError(payload.error ?? "The picture could not be saved.");
        return;
      }

      onChange(payload.file.url);
      setSource(null);
    } catch {
      setError("The picture could not be saved. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name={name} value={value} />

      <span className="relative">
        <Avatar name="" src={value || null} size={72} />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          disabled={disabled || busy}
          aria-label="Change your profile picture"
          className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border-2 border-[var(--bg-elevated)] bg-[var(--primary)] text-white shadow-sm transition-transform hover:scale-105 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
        </button>
      </span>

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => picker.current?.click()}
            disabled={disabled || busy}
          >
            <Camera className="size-3.5" />
            {value ? "Change picture" : "Add a picture"}
          </Button>

          {value ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange("")}
              disabled={disabled || busy}
            >
              <Trash2 className="size-3.5" />
              Remove
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          A head and shoulders photograph works best. It appears on registers,
          on your ID card and beside anything you record.
        </p>

        {error ? (
          <p className="text-xs font-medium text-[var(--danger)]">{error}</p>
        ) : null}
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // Cleared so choosing the same file twice still opens the editor.
          event.target.value = "";
        }}
      />

      <Modal
        open={source !== null}
        onClose={() => setSource(null)}
        title="Position your picture"
      >
        {source ? (
          <CropStage source={source} busy={busy} onCancel={() => setSource(null)} onDone={save} />
        ) : null}
      </Modal>
    </div>
  );
}

// -----------------------------------------------------------------------------

/**
 * The round window, and the picture behind it.
 *
 * The picture is positioned rather than cut: scale and offset are held in
 * state, applied to a plain img with a transform, and only turned into pixels
 * when somebody presses Save. Dragging is therefore free, which is what makes
 * it feel like the phone apps rather than like a form.
 */
function CropStage({
  source,
  busy,
  onCancel,
  onDone,
}: {
  source: string;
  busy: boolean;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const image = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [place, setPlace] = useState<Placement>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  /**
   * The smallest scale that still fills the circle.
   *
   * Everything is measured against this rather than against the pixel size, so
   * a 400px photograph and a 4000px one both open filling the window and both
   * zoom the same way.
   */
  const cover = natural
    ? Math.max(VIEW / natural.width, VIEW / natural.height)
    : 1;

  const clamp = useCallback(
    (next: Placement): Placement => {
      if (!natural) return next;

      const scale = Math.min(Math.max(next.scale, 1), 4);
      const width = natural.width * cover * scale;
      const height = natural.height * cover * scale;

      // Never let the edge of the picture inside the circle: there is no
      // sensible thing to show in the gap, and every phone app does the same.
      const limitX = Math.max(0, (width - VIEW) / 2);
      const limitY = Math.max(0, (height - VIEW) / 2);

      return {
        scale,
        x: Math.min(Math.max(next.x, -limitX), limitX),
        y: Math.min(Math.max(next.y, -limitY), limitY),
      };
    },
    [cover, natural],
  );

  useEffect(() => {
    setPlace((current) => clamp(current));
  }, [clamp]);

  function onPointerDown(event: React.PointerEvent) {
    if (busy) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = {
      x: place.x,
      y: place.y,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current) return;
    setPlace((current) =>
      clamp({
        ...current,
        x: drag.current!.x + (event.clientX - drag.current!.startX),
        y: drag.current!.y + (event.clientY - drag.current!.startY),
      }),
    );
  }

  function onPointerUp(event: React.PointerEvent) {
    drag.current = null;
    try {
      (event.target as Element).releasePointerCapture(event.pointerId);
    } catch {
      // The pointer was already released; nothing to undo.
    }
  }

  function render() {
    const element = image.current;
    if (!element || !natural) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) return;

    // The window is VIEW wide and the output is OUTPUT wide, so everything
    // measured on screen is multiplied by this to land in the saved picture.
    const ratio = OUTPUT / VIEW;
    const width = natural.width * cover * place.scale * ratio;
    const height = natural.height * cover * place.scale * ratio;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT, OUTPUT);
    context.drawImage(
      element,
      OUTPUT / 2 - width / 2 + place.x * ratio,
      OUTPUT / 2 - height / 2 + place.y * ratio,
      width,
      height,
    );

    // JPEG rather than PNG: a photograph, and the difference is a 60KB file
    // against a 400KB one for the same thing.
    canvas.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.88);
  }

  return (
    <div className="space-y-4">
      <div
        className="relative mx-auto touch-none overflow-hidden rounded-full bg-[var(--bg-subtle)] select-none"
        style={{ width: VIEW, height: VIEW, cursor: busy ? "default" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(event) =>
          setPlace((current) =>
            clamp({ ...current, scale: current.scale - event.deltaY * 0.0015 }),
          )
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={image}
          src={source}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const element = event.currentTarget;
            setNatural({
              width: element.naturalWidth,
              height: element.naturalHeight,
            });
          }}
          className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center"
          style={{
            width: natural ? natural.width * cover : undefined,
            height: natural ? natural.height * cover : undefined,
            transform: `translate(-50%, -50%) translate(${place.x}px, ${place.y}px) scale(${place.scale})`,
          }}
        />

        {/* The ring sits above the picture so the edge of the circle stays
            visible while the picture is being dragged under it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70 ring-inset"
        />
      </div>

      <div className="flex items-center gap-3">
        <ZoomOut className="size-4 shrink-0 text-[var(--text-subtle)]" />
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={place.scale}
          aria-label="Zoom"
          disabled={busy}
          onChange={(event) =>
            setPlace((current) => clamp({ ...current, scale: Number(event.target.value) }))
          }
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--primary)]"
        />
        <ZoomIn className="size-4 shrink-0 text-[var(--text-subtle)]" />
      </div>

      <p className="text-center text-xs text-[var(--text-muted)]">
        Drag the picture to move it. Scroll or use the slider to zoom.
      </p>

      <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={render} disabled={busy || !natural}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {busy ? "Saving…" : "Save picture"}
        </Button>
      </div>
    </div>
  );
}
