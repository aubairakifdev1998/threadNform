"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderTree, ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminSelect } from "@/components/admin/admin-select";
import { adminApi, catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { requireAccessToken } from "@/lib/query/admin";

type Category = {
  id: string;
  name: string;
  slug: string;
  departmentId: string;
  imageUrl?: string | null;
};

type Department = {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const taxonomyKey = ["admin", "taxonomy", "categories"] as const;

export function AdminCategoriesPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const query = useQuery({
    queryKey: taxonomyKey,
    queryFn: async () => {
      const [categories, departments] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listDepartments(),
      ]);
      return {
        categories: categories as Category[],
        departments: departments as Department[],
      };
    },
  });

  const items = query.data?.categories ?? [];
  const departments = query.data?.departments ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/admin/categories/${id}`, {
        method: "DELETE",
        accessToken: requireAccessToken(),
        cache: "no-store",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taxonomyKey }),
  });

  async function remove(item: Category) {
    if (
      !window.confirm(
        `Delete “${item.name}”? Products in this category will need re-filing.`,
      )
    ) {
      return;
    }
    try {
      await removeMutation.mutateAsync(item.id);
      toast.success("Category deleted");
      if (editing?.id === item.id) setEditing(null);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Delete failed",
      );
    }
  }

  function openForm(item: Category | null) {
    setEditing(item);
    setFormOpen(true);
  }

  const departmentName = (id: string) =>
    departments.find((department) => department.id === id)?.name ?? "—";

  const columns = useMemo<ColumnDef<Category, unknown>[]>(
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
              className="h-10 w-14 rounded-md border border-border object-cover"
            />
          ) : (
            <span
              className="flex h-10 w-14 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
              title="No cover image"
            >
              <ImageOff className="size-4" aria-hidden />
              <span className="sr-only">No cover image</span>
            </span>
          ),
      },
      {
        accessorKey: "name",
        header: "Category",
        meta: { primary: true, label: "Category" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.slug}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "departmentId",
        header: "Department",
        cell: ({ row }) => (
          <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium">
            {departmentName(row.original.departmentId)}
          </span>
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
                label: "Edit category",
                icon: <Pencil aria-hidden />,
                onSelect: () => openForm(row.original),
              },
              {
                label: "Delete category",
                icon: <Trash2 aria-hidden />,
                destructive: true,
                separated: true,
                onSelect: () => void remove(row.original),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [departments],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Categories"
        description="Product types nested under a department (e.g. Kids Tracksuits under Kids — not Women). Cover images feed the homepage “Shop by category” strip only; departments have their own section."
        actions={
          <Button type="button" onClick={() => openForm(null)}>
            <Plus aria-hidden />
            New category
          </Button>
        }
      />

      <p className="text-sm text-muted-foreground">
        Departments (Women, Men, …) are managed under{" "}
        <Link
          href="/admin/departments"
          className="underline underline-offset-4"
        >
          Catalogue → Departments
        </Link>
        . Categories nest under those departments.
      </p>

      <DataTable
        caption="Categories"
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          icon: FolderTree,
          title: "No categories yet",
          description:
            "Categories sit under a department and power the homepage category strip. Create one after departments exist.",
          action: (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus aria-hidden />
              New category
            </Button>
          ),
        }}
      />

      <CategoryFormSheet
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        departments={departments}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: taxonomyKey });
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  departments,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  departments: Department[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [departmentId, setDepartmentId] = useState(category?.departmentId ?? "");
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Default to the first department so the field is never silently empty.
  useEffect(() => {
    if (!departmentId && departments[0]) setDepartmentId(departments[0].id);
  }, [departmentId, departments]);

  async function uploadImage(file: File) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "site/categories");
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
    if (!name.trim()) nextErrors.name = "Give the category a name.";
    if (!slug.trim()) nextErrors.slug = "A URL slug is required.";
    else if (!/^[a-z0-9-]+$/.test(slug.trim()))
      nextErrors.slug = "Use lowercase letters, numbers and hyphens only.";
    if (!departmentId) nextErrors.departmentId = "Choose a department.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const token = requireAccessToken();
      const body = {
        name: name.trim(),
        slug: slug.trim(),
        departmentId,
        imageUrl: imageUrl.trim() || null,
      };
      if (category) {
        await apiRequest(`/admin/categories/${category.id}`, {
          method: "PATCH",
          body,
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Category updated");
      } else {
        await apiRequest("/admin/categories", {
          method: "POST",
          body,
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Category created");
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
            {category ? "Edit category" : "New category"}
          </SheetTitle>
          <SheetDescription>
            Pick the parent department first. Categories only appear under that
            department in shop filters and the homepage “Shop by category”
            strip — they are never mixed with department tiles.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="category-department">Department</Label>
              <AdminSelect
                id="category-department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                aria-invalid={Boolean(errors.departmentId)}
              >
                <option value="" disabled>
                  Choose department…
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </AdminSelect>
              {errors.departmentId ? (
                <p className="text-xs text-destructive">{errors.departmentId}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Example: “Kids Tracksuits” belongs under Kids, not Women.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "category-name-error" : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!category) setSlug(slugify(event.target.value));
                }}
              />
              {errors.name ? (
                <p id="category-name-error" className="text-xs text-destructive">
                  {errors.name}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-slug">URL slug</Label>
              <Input
                id="category-slug"
                value={slug}
                aria-invalid={Boolean(errors.slug)}
                aria-describedby={errors.slug ? "category-slug-error" : "category-slug-hint"}
                onChange={(event) => setSlug(event.target.value)}
              />
              {errors.slug ? (
                <p id="category-slug-error" className="text-xs text-destructive">
                  {errors.slug}
                </p>
              ) : (
                <p id="category-slug-hint" className="text-xs text-muted-foreground">
                  Appears in the address bar: /shop?category={slug || "…"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-image-url">Cover image URL</Label>
              <Input
                id="category-image-url"
                placeholder="https://… or upload below"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-image-file">Upload cover image</Label>
              <Input
                id="category-image-file"
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file);
                }}
              />
              {uploading ? (
                <p className="text-xs text-muted-foreground" role="status">
                  Uploading…
                </p>
              ) : null}
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Selected cover image"
                  className="mt-1 aspect-[4/3] max-h-40 w-full rounded-md border border-border object-cover"
                />
              ) : null}
            </div>
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving
                ? "Saving…"
                : category
                  ? "Save changes"
                  : "Create category"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
