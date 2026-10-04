"use client";

import { Ruler } from "lucide-react";
import { EntityCrudPanel } from "@/components/admin/entity-crud-panel";
import { MetaChip } from "@/components/ui/status-badge";

type SizeRow = {
  id: string;
  code: string;
  label: string;
  sizeSystemId: string;
};

export function AdminSizesPanel() {
  return (
    <EntityCrudPanel<SizeRow>
      title="Sizes"
      description="Sizes used when creating product variants. The code becomes part of each SKU."
      caption="Sizes"
      entityLabel="size"
      queryKey={["admin", "taxonomy", "sizes"]}
      listPath="/sizes"
      adminPath="/admin/sizes"
      emptyIcon={Ruler}
      emptyDescription="Add the sizes you stock before creating variable products — variants are built from sizes and colours."
      labelOf={(row) => row.label}
      toValues={(row) => ({ code: row.code, label: row.label })}
      fields={[
        {
          name: "label",
          label: "Label",
          placeholder: "Medium",
          required: true,
          hint: "Shown to customers on the product page.",
        },
        {
          name: "code",
          label: "Code",
          placeholder: "M",
          required: true,
          compact: true,
          hint: "Used in the SKU.",
        },
      ]}
      columns={[
        {
          accessorKey: "label",
          header: "Label",
          meta: { primary: true, label: "Label" },
          cell: ({ row }) => (
            <span className="font-medium">{row.original.label}</span>
          ),
        },
        {
          accessorKey: "code",
          header: "Code",
          cell: ({ row }) => (
            <MetaChip className="text-numeric">{row.original.code}</MetaChip>
          ),
        },
      ]}
    />
  );
}
