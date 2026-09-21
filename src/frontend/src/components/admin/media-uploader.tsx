"use client";

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { toast } from "sonner";

export type MediaItem = {
  id: string;
  path: string;
  url?: string;
  name: string;
  progress: number;
  status: "uploading" | "ready" | "error";
  isPrimary?: boolean;
};

type MediaUploaderProps = {
  onChange?: (items: MediaItem[]) => void;
  className?: string;
};

export function MediaUploader({ onChange, className }: MediaUploaderProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sync = useCallback(
    (next: MediaItem[]) => {
      setItems(next);
      onChange?.(next);
    },
    [onChange],
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const accessToken = tokenStore.getAccessToken();
    if (!accessToken) {
      toast.error("Sign in required to upload media");
      return;
    }

    for (const file of list) {
      const id = crypto.randomUUID();
      const draft: MediaItem = {
        id,
        path: "",
        name: file.name,
        progress: 10,
        status: "uploading",
        isPrimary: items.length === 0,
      };
      sync([...items, draft]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const result = await adminApi.uploadFile(accessToken, formData);
        sync(
          [...items, draft].map((item) =>
            item.id === id
              ? {
                  ...item,
                  path: result.path,
                  url: result.publicUrl || result.url || undefined,
                  progress: 100,
                  status: "ready" as const,
                }
              : item,
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
        sync(
          [...items, draft].map((item) =>
            item.id === id ? { ...item, status: "error" as const } : item,
          ),
        );
      }
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            void uploadFiles(event.dataTransfer.files);
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition",
          dragging && "border-foreground bg-muted",
        )}
      >
        <ImagePlus className="mb-3 size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drag & drop product media</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Images or videos · uploaded via secure backend storage API
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files?.length) {
              void uploadFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => fileInputRef.current?.click()}
        >
          Browse files
        </Button>
      </div>

      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                <div className="mt-1">
                  {item.status === "uploading" ? (
                    <Badge variant="secondary">Uploading…</Badge>
                  ) : null}
                  {item.status === "ready" ? (
                    <Badge variant="outline">
                      {item.isPrimary ? "Primary · Ready" : "Ready"}
                    </Badge>
                  ) : null}
                  {item.status === "error" ? (
                    <Badge variant="destructive">Upload failed</Badge>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {item.status === "uploading" ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    sync(items.filter((entry) => entry.id !== item.id))
                  }
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
