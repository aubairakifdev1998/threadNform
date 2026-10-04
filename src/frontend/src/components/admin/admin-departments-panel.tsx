"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { ImageOff, Layers, Pencil, Plus } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { adminApi, catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { requireAccessToken } from "@/lib/query/admin";
import { StatusBadge } from "@/components/ui/status-badge";

type Department = {
  id: string;
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
  imageUrl?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const departmentsKey = ["admin", "taxonomy", "departments"] as const;

export function AdminDepartmentsPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Department | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const query = useQuery({
    queryKey: departmentsKey,
    queryFn: async () => (await catalogApi.listDepartments()) as Department[],
  });

  const items = query.data ?? [];

  function openForm(item: Department | null) {
    setEditing(item);
    setFormOpen(true);
  }

  const columns = useMemo<ColumnDef<Department, unknown>[]>(
    () => [
      {
        id: "image",
        header: "",
        enableSorting: false,
        meta: { hideOnCard: true, className: "w-16" },
        cell: ({ row }) =>
          row.original.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.original.imageUrl}
              alt=""
              className="h-10 w-14 border border-border object-cover"
            />
          ) : (
            <span
              className="flex h-10 w-14 items-center justify-center border border-dashed border-border text-muted-foreground"
              title="No cover image"
            >
              <ImageOff className="size-4" aria-hidden />
            </span>
          ),
      },
      {
        accessorKey: "name",
        header: "Department",
        meta: { primary: true, label: "Department" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              /category/{row.original.slug}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Storefront",
        cell: ({ row }) => (
          <StatusBadge
            tone={row.original.isActive === false ? "neutral" : "success"}
          >
            {row.original.isActive === false ? "Hidden" : "Live"}
          </StatusBadge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-12" },
        cell: ({ row }) => (
          <RowActions
            label={row.original.name}
            actions={[
              {
                label: "Edit department",
                icon: <Pencil aria-hidden />,
                onSelect: () => openForm(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Departments"
        description="Top-level shop groups shown in the header and “Shop by department” on the homepage. Create Women, Men, Kids — or anything else. Cover images are optional."
        actions={
          <Button type="button" onClick={() => openForm(null)}>
            <Plus aria-hidden />
            New department
          </Button>
        }
      />

      <DataTable
        caption="Departments"
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          icon: Layers,
          title: "No departments yet",
          description:
            "Add at least one department so the storefront nav and homepage tiles have something to show.",
          action: (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus aria-hidden />
              New department
            </Button>
          ),
        }}
      />

      <DepartmentFormSheet
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        department={editing}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: departmentsKey });
          void queryClient.invalidateQueries({
            queryKey: ["admin", "taxonomy", "categories"],
          });
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function DepartmentFormSheet({
  open,
  onOpenChange,
  department,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(department?.name ?? "");
  const [slug, setSlug] = useState(department?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(
    String(department?.sortOrder ?? 0),
  );
  const [isActive, setIsActive] = useState(department?.isActive !== false);
  const [imageUrl, setImageUrl] = useState(department?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!department && name && !slug) setSlug(slugify(name));
  }, [name, slug, department]);

  async function uploadImage(file: File) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "site/departments");
      const result = await adminApi.uploadFile(token, body);
      setImageUrl(result.publicUrl || result.url || result.path);
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Give the department a name.";
    if (!slug.trim()) nextErrors.slug = "A URL slug is required.";
    else if (!/^[a-z0-9-]+$/.test(slug.trim()))
      nextErrors.slug = "Use lowercase letters, numbers and hyphens only.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const token = requireAccessToken();
      const body = {
        name: name.trim(),
        slug: slug.trim(),
        sortOrder: Number.parseInt(sortOrder, 10) || 0,
        imageUrl: imageUrl.trim() || null,
        isActive,
      };
      if (department) {
        await apiRequest(`/admin/departments/${department.id}`, {
          method: "PATCH",
          body,
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Department updated — storefront will pick this up");
      } else {
        await apiRequest("/admin/departments", {
          method: "POST",
          body,
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Department created — it now appears on the storefront");
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {department ? "Edit department" : "New department"}
          </SheetTitle>
          <SheetDescription>
            Active departments appear in the header nav and homepage “Shop by
            department” tiles. Hide one to remove it from the storefront without
            deleting data.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="dept-name">Name</Label>
              <Input
                id="dept-name"
                value={name}
                aria-invalid={Boolean(errors.name)}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  if (!department) setSlug(slugify(value));
                }}
              />
              {errors.name ? (
                <p className="text-xs text-destructive">{errors.name}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-slug">Slug</Label>
              <Input
                id="dept-slug"
                value={slug}
                aria-invalid={Boolean(errors.slug)}
                onChange={(event) => setSlug(event.target.value)}
              />
              {errors.slug ? (
                <p className="text-xs text-destructive">{errors.slug}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Storefront link: /category/{slug || "…"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-sort">Sort order</Label>
              <Input
                id="dept-sort"
                type="number"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Show on storefront</Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-image-url">Cover image URL</Label>
              <Input
                id="dept-image-url"
                placeholder="https://… or upload below"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dept-image-file">Upload cover image</Label>
              <Input
                id="dept-image-file"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
            </div>
          </div>

          <SheetFooter className="mt-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving ? "Saving…" : department ? "Save changes" : "Create"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
