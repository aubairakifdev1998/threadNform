import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ProductForm } from "@/components/admin/product-form";

export const metadata: Metadata = {
  title: "New product",
};

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminPageHeader
        title="New product"
        description="Create the listing first. You'll land on the editor to add SKUs, stock, and imagery."
      />
      <ProductForm />
    </div>
  );
}
