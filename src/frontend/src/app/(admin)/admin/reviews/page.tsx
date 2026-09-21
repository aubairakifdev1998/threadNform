"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
import { adminApi, siteAdminApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";
import type { CustomerReview } from "@/types/api";

const PAGE_SIZE = 8;

const emptyForm = {
  customerName: "",
  rating: 5,
  title: "",
  body: "",
  imageUrl: "",
  location: "",
  isPublished: true,
  sortOrder: 0,
};

export default function AdminReviewsPage() {
  const [items, setItems] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await siteAdminApi.listReviews(token);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadImage(file: File) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "site/reviews");
      const result = await adminApi.uploadFile(token, body);
      setForm((prev) => ({
        ...prev,
        imageUrl: result.publicUrl || result.url || result.path,
      }));
      toast.success("Screenshot uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    if (!form.customerName.trim() || !form.body.trim()) {
      toast.error("Name and review body are required");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await siteAdminApi.updateReview(token, editingId, {
          customerName: form.customerName,
          rating: form.rating,
          title: form.title || null,
          body: form.body,
          imageUrl: form.imageUrl || null,
          location: form.location || null,
          isPublished: form.isPublished,
          sortOrder: form.sortOrder,
        });
        toast.success("Review updated");
      } else {
        await siteAdminApi.createReview(token, {
          customerName: form.customerName,
          rating: form.rating,
          title: form.title || null,
          body: form.body,
          imageUrl: form.imageUrl || null,
          location: form.location || null,
          isPublished: form.isPublished,
          sortOrder: form.sortOrder,
        });
        toast.success("Review added");
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const paged = paginateItems(items, page, PAGE_SIZE);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <AdminPageHeader
        title="Reviews"
        description="Add curated customer reviews and screenshots for the storefront."
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit review" : "New review"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Customer name</Label>
            <Input
              value={form.customerName}
              onChange={(e) =>
                setForm({ ...form, customerName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="London, UK"
            />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Rating</Label>
            <Select
              value={String(form.rating)}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setForm({ ...form, rating: Number(value) });
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} stars
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Review</Label>
            <Textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Screenshot / photo</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            {form.imageUrl ? (
              <div className="relative mt-2 h-28 w-40 overflow-hidden border border-border">
                <Image
                  src={form.imageUrl}
                  alt="Review media"
                  fill
                  className="object-cover"
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Publish</Label>
            <div className="flex h-9 items-center gap-2">
              <Switch
                checked={form.isPublished}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isPublished: checked })
                }
              />
              <span className="text-sm">Visible on storefront</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={() => void onSave()} disabled={busy}>
            {busy ? "Saving…" : editingId ? "Update review" : "Add review"}
          </Button>
          {editingId ? (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">All reviews</h2>
        {loading ? (
          <ListBlockShimmer rows={3} />
        ) : !items.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No reviews yet.
            </CardContent>
          </Card>
        ) : (
          <>
            {paged.items.map((item) => (
              <Card key={item.id}>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {item.customerName} · {"★".repeat(item.rating)}
                    </CardTitle>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.isPublished ? (
                        <Badge>Published</Badge>
                      ) : (
                        <Badge variant="outline">Hidden</Badge>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingId(item.id);
                        setForm({
                          customerName: item.customerName,
                          rating: item.rating,
                          title: item.title ?? "",
                          body: item.body,
                          imageUrl: item.imageUrl ?? "",
                          location: item.location ?? "",
                          isPublished: item.isPublished,
                          sortOrder: item.sortOrder,
                        });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const token = tokenStore.getAccessToken();
                        if (!token) return;
                        await siteAdminApi.deleteReview(token, item.id);
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
