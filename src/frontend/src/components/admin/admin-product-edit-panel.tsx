"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminSelect } from "@/components/admin/admin-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminApi, catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp, poundsToPence } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PageSpinner } from "@/components/ui/page-shimmers";

type ProductStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";

type VariantRow = {
  id: string;
  sku: string;
  status?: string;
  onHand: number;
  reserved: number;
  available: number;
  basePricePence?: number | null;
};

type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  productType?: string;
  status?: string;
  categoryId?: string | null;
  departmentId?: string | null;
  warehouseId?: string | null;
  totalOnHand?: number;
  totalAvailable?: number;
  variants: VariantRow[];
};

type CategoryOption = {
  id: string;
  name: string;
  departmentId: string;
  isActive?: boolean;
};

type SizeOption = { id: string; code?: string; label?: string; name?: string };
type ColorOption = { id: string; name: string };

const STATUSES: ProductStatus[] = [
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
];

function skuPart(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 12);
}

export function AdminProductEditPanel({ productId }: { productId: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProductStatus>("DRAFT");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sizes, setSizes] = useState<SizeOption[]>([]);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [sizeValueId, setSizeValueId] = useState("");
  const [colorId, setColorId] = useState("");
  const [sku, setSku] = useState("");
  const [skuManual, setSkuManual] = useState(false);
  const [pricePounds, setPricePounds] = useState("");
  const [initialStock, setInitialStock] = useState("10");
  const [stockDelta, setStockDelta] = useState("10");
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const [detail, cats, sizeList, colorList] = await Promise.all([
        adminApi.getProduct(token, productId),
        catalogApi.listCategories(),
        apiRequest<SizeOption[]>("/sizes", { cache: "no-store" }),
        apiRequest<ColorOption[]>("/colors", { cache: "no-store" }),
      ]);
      setProduct(detail);
      setName(detail.name);
      setSlug(detail.slug);
      setDescription(detail.description ?? "");
      setStatus((detail.status as ProductStatus) ?? "DRAFT");
      setCategoryId(detail.categoryId ?? "");
      setCategories(
        (cats as CategoryOption[]).filter((c) => c.isActive !== false),
      );
      setSizes(sizeList);
      setColors(colorList);
      if (detail.warehouseId) setWarehouseId(detail.warehouseId);
      else {
        const warehouses = await adminApi.listWarehouses(token);
        const wh = Array.isArray(warehouses)
          ? warehouses
          : ((warehouses as { items?: Array<{ id: string }> }).items ?? []);
        if (wh[0]) setWarehouseId((wh[0] as { id: string }).id);
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load product",
      );
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const suggestedSku = useMemo(() => {
    if (!product) return "";
    const parts = [product.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "-")];
    const size = sizes.find((s) => s.id === sizeValueId);
    const color = colors.find((c) => c.id === colorId);
    if (size) parts.push(skuPart(size.code || size.label || size.name || "SIZE"));
    if (color) parts.push(skuPart(color.name));
    if (!size && !color) parts.push("NEW");
    return parts.filter(Boolean).join("-");
  }, [product, sizes, colors, sizeValueId, colorId]);

  useEffect(() => {
    if (!skuManual) setSku(suggestedSku);
  }, [suggestedSku, skuManual]);

  async function saveDetails() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSaving(true);
    try {
      const selected = categories.find((c) => c.id === categoryId);
      await adminApi.updateProduct(token, productId, {
        name: name.trim(),
        slug: slug.trim(),
        description,
        status,
        categoryId: categoryId || null,
        departmentId: selected?.departmentId ?? null,
      });
      toast.success("Product updated");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Update failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setProductStatus(next: ProductStatus) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.updateProduct(token, productId, { status: next });
      setStatus(next);
      toast.success(`Status set to ${next}`);
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Status update failed",
      );
    }
  }

  async function removeProduct() {
    if (
      !window.confirm(
        "Archive this product and its variants? Linked inventory will be cleared.",
      )
    ) {
      return;
    }
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setDeleting(true);
    try {
      const result = await adminApi.deleteProduct(token, productId);
      toast.success(
        result.stockRowsRemoved > 0
          ? `Product archived · ${result.stockRowsRemoved} stock row(s) removed`
          : "Product archived",
      );
      router.push("/admin/products");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Delete failed",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function addVariant() {
    const token = tokenStore.getAccessToken();
    const nextSku = sku.trim().toUpperCase();
    if (!token || !nextSku) {
      toast.error("SKU is required");
      return;
    }
    setAddingVariant(true);
    try {
      await adminApi.createVariant(token, productId, {
        sku: nextSku,
        sizeValueId: sizeValueId || undefined,
        colorId: colorId || undefined,
        basePricePence: pricePounds
          ? poundsToPence(Number(pricePounds))
          : undefined,
        initialStock: Number(initialStock) || 0,
      });
      toast.success("Variant created and linked to inventory");
      setPricePounds("");
      setSizeValueId("");
      setColorId("");
      setSkuManual(false);
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Variant create failed",
      );
    } finally {
      setAddingVariant(false);
    }
  }

  async function restock(variantId: string) {
    const token = tokenStore.getAccessToken();
    if (!token || !warehouseId) {
      toast.error("Warehouse missing");
      return;
    }
    try {
      await adminApi.adjustInventory(token, {
        warehouseId,
        variantId,
        onHandDelta: Number(stockDelta) || 10,
        reason: "Admin restock from product",
      });
      toast.success("Stock updated");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Stock adjust failed",
      );
    }
  }

  async function archiveVariant(variantId: string) {
    if (!window.confirm("Archive this SKU and clear its sellable stock?")) {
      return;
    }
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await adminApi.deleteVariant(token, productId, variantId);
      toast.success("Variant archived");
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Variant delete failed",
      );
    }
  }

  if (loading) {
    return <PageSpinner label="Loading product…" />;
  }

  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Product not found.{" "}
        <Link href="/admin/products" className="underline">
          Back to products
        </Link>
      </p>
    );
  }

  const activeVariants = product.variants.filter((v) => v.status !== "ARCHIVED");
  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminPageHeader
        title={product.name}
        description={`${product.slug} · ${product.productType ?? "—"} · stock ${product.totalAvailable ?? 0} available`}
        actions={
          <>
            <Badge
              variant={product.status === "ACTIVE" ? "default" : "outline"}
            >
              {product.status ?? "—"}
            </Badge>
            <Link
              href="/admin/products"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              All products
            </Link>
            <Link
              href={`/admin/inventory?productId=${product.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Inventory
            </Link>
            {product.status !== "ACTIVE" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void setProductStatus("ACTIVE")}
              >
                Activate
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void setProductStatus("INACTIVE")}
              >
                Deactivate
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => void removeProduct()}
            >
              {deleting ? "Archiving…" : "Delete"}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Category drives storefront grouping. Stock lives on each SKU below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-category">Category</Label>
              <AdminSelect
                id="product-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </AdminSelect>
              {selectedCategory ? (
                <p className="text-xs text-muted-foreground">
                  Department syncs from this category automatically.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-status">Status</Label>
              <AdminSelect
                id="product-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </AdminSelect>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="button" disabled={saving} onClick={() => void saveDetails()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants & stock</CardTitle>
          <CardDescription>
            Each SKU maps to one inventory row per warehouse. Size/color combos
            cannot be duplicated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>On hand</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeVariants.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-20 text-center text-muted-foreground"
                  >
                    No active variants. Add a size/color SKU below to create
                    inventory.
                  </TableCell>
                </TableRow>
              ) : (
                activeVariants.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <p className="font-medium">{v.sku}</p>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {typeof v.basePricePence === "number"
                        ? formatGbp(v.basePricePence)
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{v.onHand}</TableCell>
                    <TableCell>
                      <Badge
                        variant={v.available <= 5 ? "destructive" : "secondary"}
                      >
                        {v.available}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{v.status ?? "ACTIVE"}</Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void restock(v.id)}
                      >
                        +Stock
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void archiveVariant(v.id)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Size</Label>
              <AdminSelect
                value={sizeValueId}
                onChange={(e) => {
                  setSizeValueId(e.target.value);
                  setSkuManual(false);
                }}
              >
                <option value="">None</option>
                {sizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || s.code || s.name || s.id}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <AdminSelect
                value={colorId}
                onChange={(e) => {
                  setColorId(e.target.value);
                  setSkuManual(false);
                }}
              >
                <option value="">None</option>
                {colors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input
                value={sku}
                onChange={(e) => {
                  setSkuManual(true);
                  setSku(e.target.value.toUpperCase());
                }}
              />
              <p className="text-xs text-muted-foreground">
                Auto-fills from size/color · must be unique
              </p>
            </div>
            <div className="space-y-2">
              <Label>Price (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={pricePounds}
                onChange={(e) => setPricePounds(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Initial stock</Label>
              <Input
                type="number"
                value={initialStock}
                onChange={(e) => setInitialStock(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Restock delta</Label>
              <Input
                type="number"
                value={stockDelta}
                onChange={(e) => setStockDelta(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={addingVariant}
            onClick={() => void addVariant()}
          >
            {addingVariant ? "Adding…" : "Add variant"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
