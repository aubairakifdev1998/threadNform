"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminSelect } from "@/components/admin/admin-select";
import { adminApi, catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

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

export function AdminCategoriesPanel() {
  const [items, setItems] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cats, deps] = await Promise.all([
        catalogApi.listCategories(),
        catalogApi.listDepartments(),
      ]);
      setItems(cats as Category[]);
      setDepartments(deps as Department[]);
      if (!departmentId && deps[0]) setDepartmentId(deps[0].id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load categories",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setName("");
    setSlug("");
    setImageUrl("");
    setEditingId(null);
  }

  async function uploadImage(file: File) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", "site/categories");
      const result = await adminApi.uploadFile(token, body);
      const url = result.publicUrl || result.url || result.path;
      setImageUrl(url);
      toast.success("Image uploaded");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const token = tokenStore.getAccessToken();
    if (!token || !name.trim() || !slug.trim() || !departmentId) {
      toast.error("Name, slug, and department are required");
      return;
    }
    try {
      const body = {
        name: name.trim(),
        slug: slug.trim(),
        departmentId,
        imageUrl: imageUrl.trim() || null,
      };
      if (editingId) {
        await apiRequest(`/admin/categories/${editingId}`, {
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
      resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    }
  }

  async function remove(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await apiRequest(`/admin/categories/${id}`, {
        method: "DELETE",
        accessToken: token,
        cache: "no-store",
      });
      toast.success("Category deleted");
      if (editingId === id) resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  }

  function startEdit(item: Category) {
    setEditingId(item.id);
    setName(item.name);
    setSlug(item.slug);
    setDepartmentId(item.departmentId);
    setImageUrl(item.imageUrl ?? "");
  }

  const departmentName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Categories"
        description="Product types for the shop. Add a cover image for the homepage tiles."
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit category" : "New category"}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editingId) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-slug">Slug</Label>
            <Input
              id="category-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-department">Department</Label>
            <AdminSelect
              id="category-department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="" disabled>
                Select department
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-image-url">Cover image URL</Label>
            <Input
              id="category-image-url"
              placeholder="https://… or upload below"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-image-file">Upload cover image</Label>
            <Input
              id="category-image-file"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="mt-2 aspect-[4/3] max-h-40 w-full rounded-md border object-cover"
              />
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            type="button"
            onClick={() => void save()}
            disabled={uploading}
          >
            {editingId ? "Update" : "Create"}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      {loading ? (
        <ListBlockShimmer />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-10 w-14 rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.slug}
                    </TableCell>
                    <TableCell>{departmentName(item.departmentId)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(item)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => void remove(item.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
