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
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

type SizeRow = {
  id: string;
  code: string;
  label: string;
  sizeSystemId: string;
};

export function AdminSizesPanel() {
  const [items, setItems] = useState<SizeRow[]>([]);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<SizeRow[]>("/sizes", { cache: "no-store" });
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load sizes",
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setCode("");
    setLabel("");
    setEditingId(null);
  }

  async function save() {
    const token = tokenStore.getAccessToken();
    if (!token || !code.trim() || !label.trim()) {
      toast.error("Code and label are required");
      return;
    }
    try {
      if (editingId) {
        await apiRequest(`/admin/sizes/${editingId}`, {
          method: "PATCH",
          body: { code: code.trim(), label: label.trim() },
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Size updated");
      } else {
        await apiRequest("/admin/sizes", {
          method: "POST",
          body: { code: code.trim(), label: label.trim() },
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Size created");
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
      await apiRequest(`/admin/sizes/${id}`, {
        method: "DELETE",
        accessToken: token,
        cache: "no-store",
      });
      toast.success("Size deleted");
      if (editingId === id) resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sizes"
        description="Sizes used when creating product variants (SKU includes size code)."
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit size" : "New size"}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="size-code">Code</Label>
            <Input
              id="size-code"
              placeholder="M"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="size-label">Label</Label>
            <Input
              id="size-label"
              placeholder="Medium"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button type="button" onClick={() => void save()}>
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
                  <TableHead>Label</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No sizes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.label}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.code}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() => {
                            setEditingId(item.id);
                            setCode(item.code);
                            setLabel(item.label);
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          onClick={() => void remove(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
