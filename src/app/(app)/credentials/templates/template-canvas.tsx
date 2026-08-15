"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge, Button, Field, Input } from "@/components/ui";
import { SearchableSelect } from "@/components/select-search";
import { BINDINGS, type TemplateElement, type TemplateLayout } from "@/lib/templates";

import { deleteElementAction, updateElementAction } from "./actions";

const SAMPLE: Record<string, string> = Object.fromEntries(
  BINDINGS.flatMap((group) => group.items.map((item) => [item.path, item.example])),
);

/**
 * The template canvas.
 *
 * The preview is rendered at the real aspect ratio with every element placed
 * by percentage, so what appears here is what prints. Sample values stand in
 * for bindings — a page of `{{student.fullName}}` tells you nothing about
 * whether the name will fit.
 */
export function TemplateCanvas({
  templateId,
  layout,
  orientation,
  readOnly,
}: {
  templateId: string;
  layout: TemplateLayout;
  orientation: string;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const element = layout.elements.find((entry) => entry.id === selected) ?? null;

  // A4 is 1:1.414. The canvas is sized by aspect ratio so the preview cannot
  // drift from the printed proportions.
  const aspect = orientation === "LANDSCAPE" ? "1.414 / 1" : "1 / 1.414";

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="overflow-auto">
        <div
          className="relative mx-auto w-full max-w-2xl shadow-lg ring-1 ring-[var(--border)]"
          style={{
            aspectRatio: aspect,
            // Container query units let the elements scale with the preview
            // instead of the viewport, so the proportions hold at any width.
            containerType: "inline-size",
            background: layout.backgroundUrl
              ? `url('${encodeURI(layout.backgroundUrl)}') center/contain no-repeat, ${layout.backgroundColour ?? "#ffffff"}`
              : (layout.backgroundColour ?? "#ffffff"),
          }}
        >
          {layout.elements.map((entry) => (
            <ElementPreview
              key={entry.id}
              element={entry}
              selected={entry.id === selected}
              onSelect={readOnly ? undefined : () => setSelected(entry.id)}
            />
          ))}

          {layout.elements.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Nothing placed yet
            </p>
          ) : null}
        </div>
      </div>

      {!readOnly ? (
        <div className="space-y-3">
          {element ? (
            <form
              action={updateElementAction}
              className="card space-y-3 p-4"
              key={element.id}
            >
              <input type="hidden" name="id" value={templateId} />
              <input type="hidden" name="elementId" value={element.id} />

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Selected element</p>
                <Badge tone="neutral">{element.type}</Badge>
              </div>

              {element.type === "field" ? (
                <Field label="Data field" htmlFor="value">
                  <SearchableSelect
                    id="value"
                    name="value"
                    clearable={false}
                    defaultValue={element.value}
                    options={BINDINGS.flatMap((group) =>
                      group.items.map((item) => ({
                        value: item.path,
                        label: item.label,
                        description: item.example || item.path,
                        group: group.group,
                      })),
                    )}
                  />
                </Field>
              ) : (
                <Field label="Text" htmlFor="value">
                  <Input id="value" name="value" defaultValue={element.value} />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Field label="X %" htmlFor="x">
                  <Input id="x" name="x" type="number" step="0.5" defaultValue={element.x} />
                </Field>
                <Field label="Y %" htmlFor="y">
                  <Input id="y" name="y" type="number" step="0.5" defaultValue={element.y} />
                </Field>
                <Field label="Width %" htmlFor="width">
                  <Input
                    id="width"
                    name="width"
                    type="number"
                    step="0.5"
                    defaultValue={element.width}
                  />
                </Field>
                <Field label="Height %" htmlFor="height">
                  <Input
                    id="height"
                    name="height"
                    type="number"
                    step="0.1"
                    defaultValue={element.height}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Font size" htmlFor="fontSize">
                  <Input
                    id="fontSize"
                    name="fontSize"
                    type="number"
                    min="6"
                    max="72"
                    defaultValue={element.fontSize}
                  />
                </Field>
                <Field label="Colour" htmlFor="colour">
                  <Input id="colour" name="colour" defaultValue={element.colour} />
                </Field>
              </div>

              <Field label="Align" htmlFor="align">
                <SearchableSelect
                  id="align"
                  name="align"
                  clearable={false}
                  defaultValue={element.align}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Centre" },
                    { value: "right", label: "Right" },
                  ]}
                />
              </Field>

              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="bold"
                    defaultChecked={element.fontWeight === "bold"}
                    className="size-4 rounded border-[var(--border-strong)] accent-[var(--primary)]"
                  />
                  Bold
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="italic"
                    defaultChecked={element.italic}
                    className="size-4 rounded border-[var(--border-strong)] accent-[var(--primary)]"
                  />
                  Italic
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" className="flex-1">
                  Apply
                </Button>
              </div>
            </form>
          ) : (
            <div className="card p-4 text-sm text-[var(--text-muted)]">
              Select an element on the page to edit it.
            </div>
          )}

          {element ? (
            <form action={deleteElementAction}>
              <input type="hidden" name="id" value={templateId} />
              <input type="hidden" name="elementId" value={element.id} />
              <Button type="submit" variant="ghost" size="sm" className="w-full">
                <Trash2 className="size-3.5" />
                Remove element
              </Button>
            </form>
          ) : null}

          <div className="card p-4">
            <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
              Elements on this page
            </p>
            <ul className="space-y-1">
              {layout.elements.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(entry.id)}
                    className={`w-full truncate rounded px-2 py-1 text-left text-xs transition-colors ${
                      entry.id === selected
                        ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "hover:bg-[var(--bg-subtle)]"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-[var(--text-subtle)]">
                      {entry.type}
                    </span>{" "}
                    {entry.value || "(empty)"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ElementPreview({
  element,
  selected,
  onSelect,
}: {
  element: TemplateElement;
  selected: boolean;
  onSelect?: () => void;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    // Font size is stored in points and previewed relative to the page width,
    // so scaling the preview does not change the relative type size.
    fontSize: `${element.fontSize * 0.14}cqw`,
    fontWeight: element.fontWeight,
    fontStyle: element.italic ? "italic" : "normal",
    textAlign: element.align,
    color: element.colour,
    letterSpacing: element.letterSpacing ? `${element.letterSpacing}px` : undefined,
    outline: selected ? "2px solid var(--primary)" : undefined,
    cursor: onSelect ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    justifyContent:
      element.align === "center"
        ? "center"
        : element.align === "right"
          ? "flex-end"
          : "flex-start",
    overflow: "hidden",
  };

  const label =
    element.type === "field" ? (SAMPLE[element.value] ?? element.value) : element.value;

  if (element.type === "line") {
    return (
      <div
        onClick={onSelect}
        style={{ ...style, background: element.colour, minHeight: 1 }}
      />
    );
  }

  if (element.type === "box") {
    return (
      <div
        onClick={onSelect}
        style={{ ...style, border: `1px solid ${element.colour}` }}
      />
    );
  }

  if (element.type === "qr") {
    return (
      <div
        onClick={onSelect}
        style={{
          ...style,
          background:
            "repeating-conic-gradient(#0f172a 0% 25%, #ffffff 0% 50%) 0 0/33% 33%",
          border: "1px solid #0f172a",
        }}
        title="Verification QR code"
      />
    );
  }

  if (element.type === "image") {
    return (
      <div
        onClick={onSelect}
        style={{
          ...style,
          background: "#f1f5f9",
          border: "1px dashed #cbd5e1",
          fontSize: "1.4cqw",
          color: "#94a3b8",
          justifyContent: "center",
        }}
      >
        image
      </div>
    );
  }

  return (
    <div onClick={onSelect} style={style}>
      <span className="w-full truncate">{label}</span>
    </div>
  );
}
