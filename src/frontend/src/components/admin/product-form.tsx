"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminSelect } from "@/components/admin/admin-select";
import { Badge } from "@/components/ui/badge";
import { MediaUploader } from "@/components/admin/media-uploader";
import { adminApi, catalogApi } from "@/lib/api";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { poundsToPence } from "@/lib/money";
import {
  productFormSchema,
  type ProductFormValues,
} from "@/lib/validations";

type Option = {
  id: string;
  name?: string;
  label?: string;
  code?: string;
  hex?: string | null;
  departmentId?: string;
};

export function ProductForm({
  onSuccess,
}: {
  onSuccess?: (productId?: string) => void;
}) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema) as never,
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      productType: "VARIABLE",
      basePricePounds: undefined,
      initialStock: 10,
      sizeValueIds: [],
      colorIds: [],
      categoryId: "",
    },
  });

  const [categories, setCategories] = useState<Option[]>([]);
  const [sizes, setSizes] = useState<Option[]>([]);
  const [colors, setColors] = useState<Option[]>([]);
  const productType = form.watch("productType");
  const categoryId = form.watch("categoryId");
  const sizeValueIds = form.watch("sizeValueIds") ?? [];
  const colorIds = form.watch("colorIds") ?? [];

  useEffect(() => {
    void (async () => {
      try {
        const [cats, sizeList, colorList] = await Promise.all([
          catalogApi.listCategories(),
          apiRequest<Option[]>("/sizes", { cache: "no-store" }),
          apiRequest<Option[]>("/colors", { cache: "no-store" }),
        ]);
        setCategories(cats as Option[]);
        setSizes(sizeList);
        setColors(colorList);
      } catch {
        // Form still usable; create will surface API errors.
      }
    })();
  }, []);

  function toggleId(
    field: "sizeValueIds" | "colorIds",
    id: string,
    checked: boolean,
  ) {
    const current = form.getValues(field) ?? [];
    form.setValue(
      field,
      checked ? [...current, id] : current.filter((x) => x !== id),
    );
  }

  async function onSubmit(values: ProductFormValues) {
    const accessToken = tokenStore.getAccessToken();
    if (!accessToken) {
      toast.error("Admin authentication required");
      return;
    }

    const isVariable = values.productType === "VARIABLE";
    if (isVariable && !(values.sizeValueIds?.length || values.colorIds?.length)) {
      toast.error("Select at least one size or color for a variable product");
      return;
    }

    try {
      const product = await adminApi.createProduct(accessToken, {
        name: values.name,
        slug: values.slug,
        description: values.description,
        productType: values.productType,
        categoryId: values.categoryId || undefined,
        departmentId: values.categoryId
          ? categories.find((c) => c.id === values.categoryId)?.departmentId
          : undefined,
        basePricePence:
          values.basePricePounds !== undefined
            ? poundsToPence(values.basePricePounds)
            : undefined,
        sizeValueIds: isVariable ? values.sizeValueIds : undefined,
        colorIds: isVariable ? values.colorIds : undefined,
        initialStock: values.initialStock ?? 0,
        sku: isVariable ? undefined : values.sku || undefined,
      });
      toast.success(
        isVariable
          ? "Product created with size/color SKUs and stock"
          : "Product created",
      );
      onSuccess?.(
        product && typeof product === "object" && "id" in product
          ? String((product as { id: string }).id)
          : undefined,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not create product",
      );
    }
  }

  const variantPreview =
    productType === "VARIABLE"
      ? (() => {
          const s = sizeValueIds.length;
          const c = colorIds.length;
          if (s > 0 && c > 0) return s * c;
          return Math.max(s, c);
        })()
      : 1;

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Product details</CardTitle>
            <CardDescription>
              Category, type, price, and stock come from admin configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                {...form.register("name")}
                onBlur={(event) => {
                  form.register("name").onBlur(event);
                  if (!form.getValues("slug") && event.target.value) {
                    form.setValue(
                      "slug",
                      event.target.value
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
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" {...form.register("slug")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={4}
                {...form.register("description")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-type">Product type</Label>
                <AdminSelect
                  id="product-type"
                  value={productType}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "SIMPLE" || value === "VARIABLE") {
                      form.setValue("productType", value);
                    }
                  }}
                >
                  <option value="VARIABLE">Variable (sizes / colors)</option>
                  <option value="SIMPLE">Simple (one SKU)</option>
                </AdminSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-category">Category</Label>
                <AdminSelect
                  id="product-category"
                  value={categoryId || ""}
                  onChange={(e) => form.setValue("categoryId", e.target.value)}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </AdminSelect>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="basePricePounds">Price (£)</Label>
                <Input
                  id="basePricePounds"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("basePricePounds", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialStock">Initial stock (each SKU)</Label>
                <Input
                  id="initialStock"
                  type="number"
                  min="0"
                  step="1"
                  {...form.register("initialStock", { valueAsNumber: true })}
                />
              </div>
            </div>

            {productType === "SIMPLE" ? (
              <div className="space-y-2">
                <Label htmlFor="sku">SKU (optional)</Label>
                <Input
                  id="sku"
                  {...form.register("sku")}
                  placeholder="Auto from slug"
                />
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    SKUs like{" "}
                    <span className="font-mono text-foreground">SLUG-M-NAVY</span>{" "}
                    and stock are created automatically.
                  </p>
                  <Badge variant="secondary">
                    {variantPreview} variant{variantPreview === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label>Sizes</Label>
                  <div className="flex flex-wrap gap-3">
                    {sizes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Add sizes under Catalogue → Sizes first.
                      </p>
                    ) : (
                      sizes.map((s) => {
                        const checked = sizeValueIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                toggleId("sizeValueIds", s.id, next === true)
                              }
                            />
                            {s.label || s.code}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Colors</Label>
                  <div className="flex flex-wrap gap-3">
                    {colors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Add colors under Catalogue → Colors first.
                      </p>
                    ) : (
                      colors.map((c) => {
                        const checked = colorIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) =>
                                toggleId("colorIds", c.id, next === true)
                              }
                            />
                            <span
                              className="size-3 rounded-full border border-border"
                              style={{ backgroundColor: c.hex || "#ccc" }}
                            />
                            {c.name}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
            <CardDescription>Upload product imagery.</CardDescription>
          </CardHeader>
          <CardContent>
            <MediaUploader />
          </CardContent>
        </Card>
      </div>

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Saving…" : "Create product"}
      </Button>
    </form>
  );
}
