"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  AdminListPagination,
  paginateItems,
} from "@/components/admin/admin-list-pagination";
import { HeroSpotlight } from "@/components/aceternity/spotlight-hero";
import { adminApi, siteAdminApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";
import type { SiteBillboard } from "@/types/api";

const PAGE_SIZE = 8;

const emptyForm = {
  title: "New Collection",
  subtitle: "Formed in thread. Worn with intent.",
  seasonLabel: "Summer edit",
  ctaLabel: "Go to shop",
  ctaHref: "/shop",
  secondaryCtaLabel: "View catalogue",
  secondaryCtaHref: "/shop",
  mediaType: "NONE" as SiteBillboard["mediaType"],
  mediaUrl: "",
  posterUrl: "",
  isActive: true,
};

export default function AdminBillboardPage() {
  const [items, setItems] = useState<SiteBillboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await siteAdminApi.listBillboards(token);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function uploadMedia(file: File, field: "mediaUrl" | "posterUrl") {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "site/billboards");
      const result = await adminApi.uploadFile(token, body);
      const url = result.publicUrl || result.url || result.path;
      setForm((prev) => ({
        ...prev,
        [field]: url,
        mediaType:
          field === "mediaUrl"
            ? file.type.startsWith("video/")
              ? "VIDEO"
              : "IMAGE"
            : prev.mediaType,
      }));
      toast.success("Media uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      await siteAdminApi.upsertBillboard(token, {
        id: editingId ?? undefined,
        title: form.title,
        subtitle: form.subtitle || null,
        seasonLabel: form.seasonLabel || null,
        ctaLabel: form.ctaLabel,
        ctaHref: form.ctaHref,
        secondaryCtaLabel: form.secondaryCtaLabel || null,
        secondaryCtaHref: form.secondaryCtaHref || null,
        mediaType: form.mediaType,
        mediaUrl: form.mediaUrl || null,
        posterUrl: form.posterUrl || null,
        isActive: form.isActive,
      });
      toast.success(editingId ? "Billboard updated" : "Billboard saved");
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function editItem(item: SiteBillboard) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      subtitle: item.subtitle ?? "",
      seasonLabel: item.seasonLabel ?? "",
      ctaLabel: item.ctaLabel,
      ctaHref: item.ctaHref,
      secondaryCtaLabel: item.secondaryCtaLabel ?? "",
      secondaryCtaHref: item.secondaryCtaHref ?? "",
      mediaType: item.mediaType,
      mediaUrl: item.mediaUrl ?? "",
      posterUrl: item.posterUrl ?? "",
      isActive: item.isActive,
    });
  }

  const paged = paginateItems(items, page, PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <AdminPageHeader
        title="Billboard"
        description="Control the landing-page hero image or video and CTA copy. Preview matches the storefront hero."
      />

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Storefront preview</h2>
            <p className="text-sm text-muted-foreground">
              Live preview of how this billboard will appear on the homepage.
            </p>
          </div>
          <Badge variant="outline">Desktop frame</Badge>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
          <div className="max-h-[520px] overflow-hidden">
            <div className="origin-top scale-[0.72] sm:scale-[0.85] lg:scale-100">
              <HeroSpotlight
                title={form.title || "New Collection"}
                subtitle={
                  form.subtitle || "Formed in thread. Worn with intent."
                }
                seasonLabel={form.seasonLabel || "Summer edit"}
                primaryLabel={form.ctaLabel || "Go to shop"}
                primaryHref={form.ctaHref || "/shop"}
                secondaryLabel={form.secondaryCtaLabel || undefined}
                secondaryHref={form.secondaryCtaHref || undefined}
                mediaType={form.mediaType}
                mediaUrl={form.mediaUrl || null}
                posterUrl={form.posterUrl || null}
              />
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingId ? "Edit billboard" : "New billboard"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Season label">
            <Input
              value={form.seasonLabel}
              onChange={(e) =>
                setForm({ ...form, seasonLabel: e.target.value })
              }
            />
          </Field>
          <Field label="Subtitle" className="sm:col-span-2">
            <Textarea
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </Field>
          <Field label="Primary CTA label">
            <Input
              value={form.ctaLabel}
              onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
            />
          </Field>
          <Field label="Primary CTA link">
            <Input
              value={form.ctaHref}
              onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
            />
          </Field>
          <Field label="Secondary CTA label">
            <Input
              value={form.secondaryCtaLabel}
              onChange={(e) =>
                setForm({ ...form, secondaryCtaLabel: e.target.value })
              }
            />
          </Field>
          <Field label="Secondary CTA link">
            <Input
              value={form.secondaryCtaHref}
              onChange={(e) =>
                setForm({ ...form, secondaryCtaHref: e.target.value })
              }
            />
          </Field>
          <Field label="Media type">
            <Select
              value={form.mediaType}
              onValueChange={(value) => {
                if (
                  value === "NONE" ||
                  value === "IMAGE" ||
                  value === "VIDEO"
                ) {
                  setForm({ ...form, mediaType: value });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                <SelectItem value="IMAGE">Image</SelectItem>
                <SelectItem value="VIDEO">Video</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Set active on save">
            <div className="flex h-9 items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isActive: checked })
                }
              />
              <span className="text-sm">Active billboard</span>
            </div>
          </Field>
        </CardContent>

        <CardContent className="grid gap-4 border-t sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Media URL (image or video)</Label>
            <Input
              placeholder="https://… or upload below"
              value={form.mediaUrl}
              onChange={(e) => {
                const mediaUrl = e.target.value;
                const looksVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);
                setForm((prev) => ({
                  ...prev,
                  mediaUrl,
                  mediaType:
                    mediaUrl.trim() === ""
                      ? "NONE"
                      : looksVideo
                        ? "VIDEO"
                        : prev.mediaType === "NONE"
                          ? "IMAGE"
                          : prev.mediaType,
                }));
              }}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Poster URL (optional, for video)</Label>
            <Input
              placeholder="https://…"
              value={form.posterUrl}
              onChange={(e) =>
                setForm({ ...form, posterUrl: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Or upload hero media</Label>
            <Input
              type="file"
              accept="image/*,video/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMedia(file, "mediaUrl");
              }}
            />
            {form.mediaUrl ? (
              <div className="overflow-hidden rounded-md border bg-muted/30">
                {form.mediaType === "VIDEO" ? (
                  <video
                    src={form.mediaUrl}
                    className="aspect-video max-h-40 w-full object-cover"
                    muted
                    playsInline
                    controls
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.mediaUrl}
                    alt=""
                    className="aspect-video max-h-40 w-full object-cover"
                  />
                )}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Or upload video poster</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMedia(file, "posterUrl");
              }}
            />
            {form.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.posterUrl}
                alt=""
                className="aspect-video max-h-40 w-full rounded-md border object-cover"
              />
            ) : null}
          </div>
        </CardContent>

        <CardFooter className="gap-2">
          <Button onClick={() => void onSave()} disabled={saving || uploading}>
            {saving
              ? "Saving…"
              : editingId
                ? "Update billboard"
                : "Save billboard"}
          </Button>
          {editingId ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Existing billboards</h2>
        {loading ? (
          <ListBlockShimmer rows={3} />
        ) : !items.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No billboards yet.
            </CardContent>
          </Card>
        ) : (
          <>
            {paged.items.map((item) => (
              <Card key={item.id}>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {item.mediaUrl ? (
                      <div className="h-16 w-28 shrink-0 overflow-hidden rounded border bg-muted">
                        {item.mediaType === "VIDEO" ? (
                          <video
                            src={item.mediaUrl}
                            poster={item.posterUrl ?? undefined}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.mediaUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.isActive ? <Badge>Active</Badge> : null}
                        <Badge variant="outline">{item.mediaType}</Badge>
                      </div>
                      {item.subtitle ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {item.subtitle}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editItem(item)}
                    >
                      Edit
                    </Button>
                    {!item.isActive ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const token = tokenStore.getAccessToken();
                          if (!token) return;
                          await siteAdminApi.activateBillboard(token, item.id);
                          toast.success("Activated");
                          await load();
                        }}
                      >
                        Activate
                      </Button>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const token = tokenStore.getAccessToken();
                        if (!token) return;
                        await siteAdminApi.deleteBillboard(token, item.id);
                        toast.success("Deleted");
                        await load();
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
            <AdminListPagination
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
