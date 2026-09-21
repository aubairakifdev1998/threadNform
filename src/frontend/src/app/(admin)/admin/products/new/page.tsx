import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = {
  title: "New product",
};

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Premium catalogue editor with media upload via the storage API.
        </p>
      </div>
      <ProductForm />
    </div>
  );
}
