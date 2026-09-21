"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

type Entity = { id: string; name: string; slug: string };

export function AdminTaxonomyPanel({
  title,
  description,
  listPath,
  createPath,
  extraFields,
}: {
  title: string;
  description: string;
  /** Public GET list path e.g. /brands */
  listPath: "/brands" | "/collections" | "/categories" | "/departments";
  /** Admin POST path e.g. /admin/brands */
  createPath: string;
  extraFields?: "department";
}) {
  const [items, setItems] = useState<Entity[]>([]);
  const [departments, setDepartments] = useState<Entity[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (listPath === "/brands") {
        setItems((await catalogApi.listBrands()) as Entity[]);
      } else if (listPath === "/collections") {
        setItems((await catalogApi.listCollections()) as Entity[]);
      } else if (listPath === "/categories") {
        setItems((await catalogApi.listCategories()) as Entity[]);
      } else {
        setItems((await catalogApi.listDepartments()) as Entity[]);
      }
      if (extraFields === "department") {
        setDepartments((await catalogApi.listDepartments()) as Entity[]);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : `Failed to load ${title}`,
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [listPath]);

  async function create() {
    const token = tokenStore.getAccessToken();
    if (!token || !name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        slug: slug.trim(),
      };
      if (extraFields === "department") {
        if (!departmentId) {
          toast.error("Select a department");
          return;
        }
        body.departmentId = departmentId;
      }
      await apiRequest(createPath, {
        method: "POST",
        body,
        accessToken: token,
        cache: "no-store",
      });
      toast.success(`${title.slice(0, -1)} created`);
      setName("");
      setSlug("");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Create failed",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid max-w-xl gap-3 border border-border p-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) {
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        {extraFields === "department" ? (
          <div className="space-y-2">
            <Label>Department</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="button" onClick={() => void create()}>
          Create
        </Button>
      </div>

      {loading ? (
        <ListBlockShimmer />
      ) : (
        <ul className="divide-y divide-border border border-border">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              None yet.
            </li>
          ) : (
            items.map((item) => (
              <li key={item.id} className="px-4 py-3 text-sm">
                <span className="font-medium">{item.name}</span>
                <span className="ml-2 text-muted-foreground">{item.slug}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

