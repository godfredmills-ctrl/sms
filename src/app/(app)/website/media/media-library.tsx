"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, Pencil, Trash2, Upload } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
} from "@/components/ui";
import { cssFilterFor, type Transforms } from "@/lib/image-transforms";

import {
  deleteMediaAction,
  updateMediaMetaAction,
  uploadMediaAction,
  type MediaState,
} from "./actions";
import { ImageEditor } from "./image-editor";

export type MediaItem = {
  id: string;
  fileId: string;
  fileName: string;
  sizeLabel: string;
  altText: string | null;
  caption: string | null;
  folder: string;
  tags: string[];
  transforms: Transforms;
  edited: boolean;
};

export function MediaLibrary({
  siteId,
  items,
}: {
  siteId: string;
  items: MediaItem[];
}) {
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [state, action] = useActionState<MediaState, FormData>(uploadMediaAction, {});
  const [fileName, setFileName] = useState<string | null>(null);

  const folders = [...new Set(items.map((item) => item.folder))].sort();

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ImagePlus className="size-5" />}
                title="No images yet"
                description="Upload one on the right — crops, filters and resizing all happen here rather than in a separate tool."
              />
            </Card>
          ) : null}

          {folders.map((folder) => (
            <Card key={folder}>
              <CardHeader
                title={folder}
                action={
                  <Badge tone="neutral">
                    {items.filter((item) => item.folder === folder).length}
                  </Badge>
                }
              />
              <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items
                  .filter((item) => item.folder === folder)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="group overflow-hidden rounded-xl border border-[var(--border)]"
                    >
                      <div className="relative aspect-4/3 bg-[var(--bg-inset)]">
                        {/* Rendered through /api/media so the saved edits show
                            here exactly as they will on the public page. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/media/${item.id}`}
                          alt={item.altText ?? ""}
                          className="size-full object-cover"
                          style={{ filter: cssFilterFor({}) }}
                        />
                        {item.edited ? (
                          <span className="absolute top-2 left-2">
                            <Badge tone="violet">Edited</Badge>
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 bg-white/90"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <form action={deleteMediaAction}>
                            <input type="hidden" name="id" value={item.id} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="bg-white/90"
                              title="Remove from library"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </form>
                        </div>
                      </div>

                      <form action={updateMediaMetaAction} className="space-y-2 p-2.5">
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="folder" value={item.folder} />
                        <p className="truncate text-xs font-medium">{item.fileName}</p>
                        <p className="text-[10px] text-[var(--text-subtle)]">
                          {item.sizeLabel}
                        </p>
                        <Input
                          name="altText"
                          defaultValue={item.altText ?? ""}
                          placeholder="Alt text — describe the image"
                          aria-label="Alt text"
                          className="h-8 text-xs"
                        />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                        >
                          Save
                        </Button>
                      </form>
                    </div>
                  ))}
              </CardBody>
            </Card>
          ))}
        </div>

        <div>
          <Card>
            <CardHeader
              title="Add an image"
              description="Stored once; every crop and filter is applied on the way out."
            />
            <form action={action}>
              <CardBody className="space-y-3">
                <input type="hidden" name="siteId" value={siteId} />

                {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
                {state.ok ? <Alert tone="success">{state.message}</Alert> : null}

                <label
                  htmlFor="file"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border-strong)] px-4 py-8 text-center transition-colors hover:bg-[var(--bg-subtle)]"
                >
                  <Upload className="size-6 text-[var(--text-subtle)]" />
                  <span className="text-sm font-medium">
                    {fileName ?? "Choose an image"}
                  </span>
                  <span className="text-xs text-[var(--text-subtle)]">
                    JPEG, PNG or WebP
                  </span>
                  <input
                    id="file"
                    name="file"
                    type="file"
                    accept="image/*"
                    required
                    className="sr-only"
                    onChange={(event) =>
                      setFileName(event.target.files?.[0]?.name ?? null)
                    }
                  />
                </label>

                <Field label="Folder" htmlFor="folder">
                  <Input
                    id="folder"
                    name="folder"
                    defaultValue="uncategorised"
                    list="media-folders"
                  />
                  <datalist id="media-folders">
                    {folders.map((folder) => (
                      <option key={folder} value={folder} />
                    ))}
                  </datalist>
                </Field>

                <Field
                  label="Alt text"
                  htmlFor="altText"
                  hint="What the image shows, for screen readers and search engines."
                >
                  <Input id="altText" name="altText" />
                </Field>

                <UploadButton />
              </CardBody>
            </form>
          </Card>

          <Card className="mt-4">
            <CardBody className="text-xs text-[var(--text-muted)]">
              <p className="mb-1.5 font-medium text-[var(--text)]">
                Edits are never baked in
              </p>
              <p>
                Crops, filters and resizes are stored as instructions against the
                original file and applied when the image is served. A crop made badly
                today can be widened next year, because the original bytes were never
                overwritten.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {editing ? (
        <ImageEditor
          media={{
            id: editing.id,
            url: `/api/files/${editing.fileId}`,
            fileName: editing.fileName,
            altText: editing.altText,
            transforms: editing.transforms,
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      <ImagePlus className="size-4" />
      {pending ? "Uploading…" : "Add to library"}
    </Button>
  );
}
