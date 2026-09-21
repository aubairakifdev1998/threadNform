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
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { ListBlockShimmer } from "@/components/ui/page-shimmers";

type ColorRow = { id: string; name: string; hex: string | null };

export function AdminColorsPanel() {
  const [items, setItems] = useState<ColorRow[]>([]);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<ColorRow[]>("/colors", { cache: "no-store" });
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load colors",
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
    setName("");
    setHex("#000000");
    setEditingId(null);
  }

  async function save() {
    const token = tokenStore.getAccessToken();
    if (!token || !name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (editingId) {
        await apiRequest(`/admin/colors/${editingId}`, {
          method: "PATCH",
          body: { name: name.trim(), hex: hex || null },
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Color updated");
      } else {
        await apiRequest("/admin/colors", {
          method: "POST",
          body: { name: name.trim(), hex: hex || null },
          accessToken: token,
          cache: "no-store",
        });
        toast.success("Color created");
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
      await apiRequest(`/admin/colors/${id}`, {
        method: "DELETE",
        accessToken: token,
        cache: "no-store",
      });
      toast.success("Color deleted");
      if (editingId === id) resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Colors"
        description="Colors used when creating product variants (SKU includes color name)."
      />

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit color" : "New color"}</CardTitle>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="color-name">Name</Label>
            <Input
              id="color-name"
              placeholder="Navy"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color-hex">Swatch</Label>
            <Input
              id="color-hex"
              type="color"
              className="h-9 w-16 p-1"
              value={hex || "#000000"}
              onChange={(e) => setHex(e.target.value)}
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
                  <TableHead>Color</TableHead>
                  <TableHead>Hex</TableHead>
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
                      No colors yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="size-4 rounded-full border border-border"
                            style={{ backgroundColor: item.hex || "#ccc" }}
                          />
                          <span className="font-medium">{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.hex ? (
                          <Badge variant="outline">{item.hex}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() => {
                            setEditingId(item.id);
                            setName(item.name);
                            setHex(item.hex || "#000000");
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
