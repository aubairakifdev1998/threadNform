"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DataTable } from "@/components/admin/data-table";
import { RowActions } from "@/components/admin/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest, ApiError } from "@/lib/api/client";
import { requireAccessToken } from "@/lib/query/admin";

/**
 * Shared screen for the small reference lists (sizes, colours and anything
 * similar): a table of records plus a side-panel form. Written once so these
 * lists can't drift apart in spacing, empty states or delete confirmation.
 */

export type CrudField = {
  name: string;
  label: string;
  type?: "text" | "color";
  placeholder?: string;
  required?: boolean;
  hint?: string;
  /** Narrow fields sit two-up on wider screens. */
  compact?: boolean;
};

type Values = Record<string, string>;

export function EntityCrudPanel<TRow extends { id: string }>({
  title,
  description,
  caption,
  entityLabel,
  queryKey,
  listPath,
  adminPath,
  fields,
  columns,
  toValues,
  labelOf,
  emptyIcon,
  emptyDescription,
}: {
  title: string;
  description: string;
  /** Screen-reader name for the table. */
  caption: string;
  /** Singular, lowercase: "size", "colour". Used in buttons and confirmations. */
  entityLabel: string;
  queryKey: readonly unknown[];
  /** Public read endpoint. */
  listPath: string;
  /** Admin write endpoint, without a trailing slash. */
  adminPath: string;
  fields: CrudField[];
  columns: ColumnDef<TRow, unknown>[];
  /** Maps a record onto form values when editing. */
  toValues: (row: TRow) => Values;
  /** Human name for a record, used in the delete confirmation. */
  labelOf: (row: TRow) => string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyDescription: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await apiRequest<TRow[]>(listPath, { cache: "no-store" });
      return Array.isArray(data) ? data : [];
    },
  });
  const items = query.data ?? [];

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`${adminPath}/${id}`, {
        method: "DELETE",
        accessToken: requireAccessToken(),
        cache: "no-store",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  async function remove(row: TRow) {
    if (!window.confirm(`Delete the ${entityLabel} “${labelOf(row)}”?`)) return;
    try {
      await removeMutation.mutateAsync(row.id);
      toast.success(`${title.replace(/s$/, "")} deleted`);
      if (editing?.id === row.id) setEditing(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    }
  }

  function openForm(row: TRow | null) {
    setEditing(row);
    setFormOpen(true);
  }

  const allColumns = useMemo<ColumnDef<TRow, unknown>[]>(
    () => [
      ...columns,
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { align: "right", cardFooter: true, className: "w-12" },
        cell: ({ row }) => (
          <RowActions
            label={labelOf(row.original)}
            actions={[
              {
                label: `Edit ${entityLabel}`,
                icon: <Pencil aria-hidden />,
                onSelect: () => openForm(row.original),
              },
              {
                label: `Delete ${entityLabel}`,
                icon: <Trash2 aria-hidden />,
                destructive: true,
                separated: true,
                onSelect: () => void remove(row.original),
              },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={title}
        description={description}
        actions={
          <Button type="button" onClick={() => openForm(null)}>
            <Plus aria-hidden />
            New {entityLabel}
          </Button>
        }
      />

      <DataTable
        caption={caption}
        columns={allColumns}
        data={items}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          icon: emptyIcon,
          title: `No ${caption.toLowerCase()} yet`,
          description: emptyDescription,
          action: (
            <Button size="sm" onClick={() => openForm(null)}>
              <Plus aria-hidden />
              New {entityLabel}
            </Button>
          ),
        }}
      />

      <EntityFormSheet
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        entityLabel={entityLabel}
        fields={fields}
        initial={editing ? toValues(editing) : {}}
        editingId={editing?.id ?? null}
        adminPath={adminPath}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey });
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function EntityFormSheet({
  open,
  onOpenChange,
  entityLabel,
  fields,
  initial,
  editingId,
  adminPath,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  fields: CrudField[];
  initial: Values;
  editingId: string | null;
  adminPath: string;
  onSaved: () => void;
}) {
  const defaults = useMemo(() => {
    const seed: Values = {};
    for (const field of fields) {
      seed[field.name] =
        initial[field.name] ?? (field.type === "color" ? "#000000" : "");
    }
    return seed;
  }, [fields, initial]);

  const [values, setValues] = useState<Values>(defaults);
  const [errors, setErrors] = useState<Values>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValues(defaults);
  }, [open, defaults]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: Values = {};
    for (const field of fields) {
      if (field.required && !values[field.name]?.trim()) {
        nextErrors[field.name] = `${field.label} is required.`;
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const body: Record<string, string | null> = {};
    for (const field of fields) {
      const value = values[field.name]?.trim() ?? "";
      body[field.name] = value === "" ? null : value;
    }

    setSaving(true);
    try {
      const token = requireAccessToken();
      await apiRequest(editingId ? `${adminPath}/${editingId}` : adminPath, {
        method: editingId ? "PATCH" : "POST",
        body,
        accessToken: token,
        cache: "no-store",
      });
      toast.success(editingId ? "Changes saved" : `${entityLabel} created`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {editingId ? `Edit ${entityLabel}` : `New ${entityLabel}`}
          </SheetTitle>
          <SheetDescription>
            Used when building product variants, so keep names short and
            recognisable.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-4 px-4 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `crud-${field.name}`;
              const error = errors[field.name];
              return (
                <div
                  key={field.name}
                  className={field.compact ? "space-y-2" : "space-y-2 sm:col-span-2"}
                >
                  <Label htmlFor={id}>{field.label}</Label>
                  <Input
                    id={id}
                    type={field.type === "color" ? "color" : "text"}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ""}
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? `${id}-error` : field.hint ? `${id}-hint` : undefined
                    }
                    className={
                      field.type === "color" ? "h-9 w-20 p-1" : undefined
                    }
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.name]: event.target.value,
                      }))
                    }
                  />
                  {error ? (
                    <p id={`${id}-error`} className="text-xs text-destructive">
                      {error}
                    </p>
                  ) : field.hint ? (
                    <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <SheetFooter className="flex-row justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : `Create ${entityLabel}`}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
