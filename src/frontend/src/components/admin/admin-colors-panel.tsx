"use client";

import { Palette } from "lucide-react";
import { EntityCrudPanel } from "@/components/admin/entity-crud-panel";
import { MetaChip } from "@/components/ui/status-badge";

type ColorRow = { id: string; name: string; hex: string | null };

export function AdminColorsPanel() {
  return (
    <EntityCrudPanel<ColorRow>
      title="Colours"
      description="Colours used when creating product variants. The name becomes part of each SKU."
      caption="Colours"
      entityLabel="colour"
      queryKey={["admin", "taxonomy", "colors"]}
      listPath="/colors"
      adminPath="/admin/colors"
      emptyIcon={Palette}
      emptyDescription="Add the colourways you stock before creating variable products — variants are built from sizes and colours."
      labelOf={(row) => row.name}
      toValues={(row) => ({ name: row.name, hex: row.hex ?? "#000000" })}
      fields={[
        {
          name: "name",
          label: "Name",
          placeholder: "Navy",
          required: true,
          hint: "Shown to customers on the product page.",
        },
        {
          name: "hex",
          label: "Swatch",
          type: "color",
          compact: true,
          hint: "Used for the colour dot in shop filters.",
        },
      ]}
      columns={[
        {
          accessorKey: "name",
          header: "Colour",
          meta: { primary: true, label: "Colour" },
          cell: ({ row }) => (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: row.original.hex ?? "transparent" }}
              />
              <span className="font-medium">{row.original.name}</span>
            </span>
          ),
        },
        {
          accessorKey: "hex",
          header: "Hex",
          cell: ({ row }) =>
            row.original.hex ? (
              <MetaChip className="text-numeric uppercase">
                {row.original.hex}
              </MetaChip>
            ) : (
              <span className="text-sm text-muted-foreground">Not set</span>
            ),
        },
      ]}
    />
  );
}
