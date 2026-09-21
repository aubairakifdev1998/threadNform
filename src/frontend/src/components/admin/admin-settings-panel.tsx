"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { PageSpinner } from "@/components/ui/page-shimmers";

type SettingRow = {
  key: string;
  value: Record<string, unknown>;
  description?: string | null;
};

const SECTION_META: Record<
  string,
  { title: string; description: string }
> = {
  storefront: {
    title: "Storefront",
    description: "Brand, support contacts, currency, and maintenance mode.",
  },
  checkout: {
    title: "Checkout",
    description: "Guest checkout, phone requirement, and order notes.",
  },
  inventory: {
    title: "Inventory",
    description:
      "Cart stock holds, oversell rules, and low-stock threshold.",
  },
  payments: {
    title: "Payments",
    description: "Bank transfer rules and customer instructions.",
  },
  notifications: {
    title: "Notifications",
    description: "Order emails and admin alert destinations.",
  },
  security: {
    title: "Security",
    description: "Registration and session controls.",
  },
};

function isBool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function AdminSettingsPanel() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setLoading(true);
    try {
      const list = await adminApi.listSettings(token);
      setRows(list);
      const next: Record<string, Record<string, unknown>> = {};
      for (const row of list) next[row.key] = { ...row.value };
      setDrafts(next);
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Failed to load settings — run migration 009_platform_admin.sql",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setField(key: string, field: string, value: unknown) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [field]: value },
    }));
  }

  async function save(key: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSavingKey(key);
    try {
      await adminApi.updateSetting(token, key, drafts[key] ?? {});
      toast.success(`${key} settings saved`);
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Save failed",
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return <PageSpinner label="Loading platform settings…" />;
  }

  const ordered = [...rows].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Platform settings"
        description="Live controls for storefront, checkout, inventory, payments, and security."
      />

      {ordered.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 pt-4 text-sm text-muted-foreground">
            <p>No settings found.</p>
            <p>
              Apply{" "}
              <code className="text-foreground">
                supabase/migrations/009_platform_admin.sql
              </code>{" "}
              in Supabase, then refresh.
            </p>
          </CardContent>
        </Card>
      ) : (
        ordered.map((row) => {
          const meta = SECTION_META[row.key] ?? {
            title: row.key,
            description: row.description ?? "Platform configuration group",
          };
          const draft = drafts[row.key] ?? {};
          return (
            <Card key={row.key}>
              <CardHeader>
                <CardTitle>{meta.title}</CardTitle>
                <CardDescription>{meta.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {Object.entries(draft).map(([field, value]) => {
                  const id = `${row.key}-${field}`;
                  if (isBool(value)) {
                    return (
                      <div
                        key={field}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 sm:col-span-2"
                      >
                        <Label htmlFor={id} className="capitalize">
                          {field.replace(/([A-Z])/g, " $1")}
                        </Label>
                        <Switch
                          id={id}
                          checked={value}
                          onCheckedChange={(checked) =>
                            setField(row.key, field, Boolean(checked))
                          }
                        />
                      </div>
                    );
                  }
                  if (isNumber(value) || field.toLowerCase().includes("pence") || field.toLowerCase().includes("threshold") || field.toLowerCase().includes("hours") || field.toLowerCase().includes("minutes")) {
                    return (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={id} className="capitalize">
                          {field.replace(/([A-Z])/g, " $1")}
                        </Label>
                        <Input
                          id={id}
                          type="number"
                          value={Number(value ?? 0)}
                          onChange={(e) =>
                            setField(row.key, field, Number(e.target.value))
                          }
                        />
                      </div>
                    );
                  }
                  const long =
                    typeof value === "string" &&
                    (value.length > 80 || field.toLowerCase().includes("instruction"));
                  if (long) {
                    return (
                      <div key={field} className="space-y-2 sm:col-span-2">
                        <Label htmlFor={id} className="capitalize">
                          {field.replace(/([A-Z])/g, " $1")}
                        </Label>
                        <Textarea
                          id={id}
                          rows={3}
                          value={String(value ?? "")}
                          onChange={(e) =>
                            setField(row.key, field, e.target.value)
                          }
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={id} className="capitalize">
                        {field.replace(/([A-Z])/g, " $1")}
                      </Label>
                      <Input
                        id={id}
                        value={String(value ?? "")}
                        onChange={(e) =>
                          setField(row.key, field, e.target.value)
                        }
                      />
                    </div>
                  );
                })}
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  disabled={savingKey === row.key}
                  onClick={() => void save(row.key)}
                >
                  {savingKey === row.key ? "Saving…" : `Save ${meta.title}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })
      )}
    </div>
  );
}
