"use client";

import { useState } from "react";
import { Copy, RotateCcw, RotateCw, Save, X } from "lucide-react";

import { SearchableSelect } from "@/components/select-search";
import { Badge, Button, Field, Input } from "@/components/ui";
import {
  FILTER_PRESETS,
  cssFilterFor,
  type Transforms,
} from "@/lib/image-transforms";

import { resetTransformsAction, updateTransformsAction } from "./actions";

/**
 * The image editor.
 *
 * The preview applies the same adjustments through CSS filters that the server
 * applies through sharp, so what you see before saving is what the page will
 * serve. Crop is previewed by insetting the frame rather than by re-encoding,
 * which keeps the editor instant on a slow connection.
 */
export function ImageEditor({
  media,
  onClose,
}: {
  media: {
    id: string;
    url: string;
    fileName: string;
    altText: string | null;
    transforms: Transforms;
  };
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Transforms>(media.transforms);

  const crop = draft.crop ?? { x: 0, y: 0, width: 100, height: 100 };

  function set<K extends keyof Transforms>(key: K, value: Transforms[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setCrop(patch: Partial<NonNullable<Transforms["crop"]>>) {
    setDraft((current) => ({
      ...current,
      crop: { ...(current.crop ?? { x: 0, y: 0, width: 100, height: 100 }), ...patch },
    }));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="card relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{media.fileName}</p>
            <p className="text-xs text-[var(--text-subtle)]">
              Edits are stored as instructions, not baked into the file: you can
              always come back and change them.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_300px]">
          {/* Preview */}
          <div className="flex items-center justify-center rounded-xl bg-[var(--bg-inset)] p-4">
            <div className="relative max-h-[55vh] overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.url}
                alt={media.altText ?? ""}
                className="max-h-[55vh] object-contain transition-[filter,transform] duration-150"
                style={{
                  filter: cssFilterFor(draft),
                  transform: [
                    draft.rotate ? `rotate(${draft.rotate}deg)` : "",
                    draft.flipH ? "scaleX(-1)" : "",
                    draft.flipV ? "scaleY(-1)" : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                  clipPath:
                    crop.width < 100 || crop.height < 100
                      ? `inset(${crop.y}% ${100 - crop.x - crop.width}% ${100 - crop.y - crop.height}% ${crop.x}%)`
                      : undefined,
                }}
              />
            </div>
          </div>

          {/* Controls */}
          <form action={updateTransformsAction} className="space-y-4">
            <input type="hidden" name="id" value={media.id} />
            <input type="hidden" name="rotate" value={draft.rotate ?? 0} />
            <input type="hidden" name="cropX" value={crop.x} />
            <input type="hidden" name="cropY" value={crop.y} />
            <input type="hidden" name="cropWidth" value={crop.width} />
            <input type="hidden" name="cropHeight" value={crop.height} />
            {draft.flipH ? <input type="hidden" name="flipH" value="on" /> : null}
            {draft.flipV ? <input type="hidden" name="flipV" value="on" /> : null}
            {draft.grayscale ? <input type="hidden" name="grayscale" value="on" /> : null}
            {draft.sepia ? <input type="hidden" name="sepia" value="on" /> : null}
            {draft.sharpen ? <input type="hidden" name="sharpen" value="on" /> : null}

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                Looks
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        brightness: 100,
                        saturation: 100,
                        contrast: 0,
                        grayscale: false,
                        sepia: false,
                        sharpen: false,
                        ...preset.transforms,
                      }))
                    }
                    className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs transition-colors hover:border-[var(--primary)] hover:bg-[var(--bg-subtle)]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("rotate", ((draft.rotate ?? 0) - 90 + 360) % 360)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("rotate", ((draft.rotate ?? 0) + 90) % 360)}
              >
                <RotateCw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant={draft.flipH ? "primary" : "outline"}
                size="sm"
                onClick={() => set("flipH", !draft.flipH)}
              >
                Flip H
              </Button>
              <Button
                type="button"
                variant={draft.flipV ? "primary" : "outline"}
                size="sm"
                onClick={() => set("flipV", !draft.flipV)}
              >
                Flip V
              </Button>
            </div>

            <Slider
              label="Brightness"
              name="brightness"
              min={40}
              max={180}
              value={draft.brightness ?? 100}
              suffix="%"
              onChange={(value) => set("brightness", value)}
            />
            <Slider
              label="Saturation"
              name="saturation"
              min={0}
              max={200}
              value={draft.saturation ?? 100}
              suffix="%"
              onChange={(value) => set("saturation", value)}
            />
            <Slider
              label="Contrast"
              name="contrast"
              min={-50}
              max={50}
              value={draft.contrast ?? 0}
              onChange={(value) => set("contrast", value)}
            />
            <Slider
              label="Blur"
              name="blur"
              min={0}
              max={20}
              value={draft.blur ?? 0}
              suffix="px"
              onChange={(value) => set("blur", value)}
            />

            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                Crop
                <span className="ml-1.5 text-[var(--text-subtle)]">
                  {crop.width.toFixed(0)}% × {crop.height.toFixed(0)}%
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Slider
                  label="From left"
                  min={0}
                  max={80}
                  value={crop.x}
                  suffix="%"
                  onChange={(value) => setCrop({ x: value })}
                  compact
                />
                <Slider
                  label="From top"
                  min={0}
                  max={80}
                  value={crop.y}
                  suffix="%"
                  onChange={(value) => setCrop({ y: value })}
                  compact
                />
                <Slider
                  label="Width"
                  min={10}
                  max={100}
                  value={crop.width}
                  suffix="%"
                  onChange={(value) => setCrop({ width: value })}
                  compact
                />
                <Slider
                  label="Height"
                  min={10}
                  max={100}
                  value={crop.height}
                  suffix="%"
                  onChange={(value) => setCrop({ height: value })}
                  compact
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Max width (px)" htmlFor="width">
                <Input
                  id="width"
                  name="width"
                  type="number"
                  min="0"
                  defaultValue={draft.width ?? ""}
                  placeholder="auto"
                />
              </Field>
              <Field label="Max height (px)" htmlFor="height">
                <Input
                  id="height"
                  name="height"
                  type="number"
                  min="0"
                  defaultValue={draft.height ?? ""}
                  placeholder="auto"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Format" htmlFor="format">
                <SearchableSelect
                  id="format"
                  name="format"
                  clearable={false}
                  defaultValue={draft.format ?? "webp"}
                  options={[
                    { value: "webp", label: "WebP (smallest)" },
                    { value: "jpeg", label: "JPEG" },
                    { value: "png", label: "PNG (lossless)" },
                  ]}
                />
              </Field>
              <Field label="Quality" htmlFor="quality">
                <Input
                  id="quality"
                  name="quality"
                  type="number"
                  min="40"
                  max="100"
                  defaultValue={draft.quality ?? 82}
                />
              </Field>
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1">
                <Save className="size-3.5" />
                Save edits
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `${window.location.origin}/api/media/${media.id}`,
                  )
                }
              >
                <Copy className="size-3.5" />
                Copy image URL
              </Button>
            </div>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3">
          <Badge tone="neutral">
            Served from /api/media/{media.id.slice(0, 6)}…
          </Badge>
          <form action={resetTransformsAction}>
            <input type="hidden" name="id" value={media.id} />
            <Button type="submit" variant="ghost" size="sm">
              Reset to original
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  name,
  min,
  max,
  value,
  suffix,
  onChange,
  compact,
}: {
  label: string;
  name?: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between gap-2">
        <label className={compact ? "text-[10px]" : "text-xs"}>{label}</label>
        <span className="numeric text-[10px] text-[var(--text-subtle)]">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}
