"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";

type Attribute = { id: string; name: string; code?: string };
type Option = { id: string; value: string; label?: string };

export function AdminAttributesPanel() {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [options, setOptions] = useState<Option[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [optionValue, setOptionValue] = useState("");

  async function loadAttributes() {
    try {
      const data = await apiRequest<Attribute[]>("/attributes", {
        cache: "no-store",
      });
      setAttributes(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Failed to load attributes",
      );
    }
  }

  async function loadOptions(id: string) {
    try {
      const data = await apiRequest<Option[]>(`/attributes/${id}/options`, {
        cache: "no-store",
      });
      setOptions(Array.isArray(data) ? data : []);
    } catch {
      setOptions([]);
    }
  }

  useEffect(() => {
    void loadAttributes();
  }, []);

  useEffect(() => {
    if (selected) void loadOptions(selected);
  }, [selected]);

  async function createAttribute() {
    const token = tokenStore.getAccessToken();
    if (!token || !name.trim()) return;
    try {
      await apiRequest("/admin/attributes", {
        method: "POST",
        accessToken: token,
        body: {
          name: name.trim(),
          code:
            code.trim() ||
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, ""),
        },
        cache: "no-store",
      });
      toast.success("Attribute created");
      setName("");
      setCode("");
      await loadAttributes();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Create failed",
      );
    }
  }

  async function createOption() {
    const token = tokenStore.getAccessToken();
    if (!token || !selected || !optionValue.trim()) return;
    try {
      await apiRequest(`/admin/attributes/${selected}/options`, {
        method: "POST",
        accessToken: token,
        body: { value: optionValue.trim(), label: optionValue.trim() },
        cache: "no-store",
      });
      toast.success("Option added");
      setOptionValue("");
      await loadOptions(selected);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Option create failed",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attributes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Colour, fabric, and other filterable attributes.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 border border-border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
            New attribute
          </h2>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <Button type="button" onClick={() => void createAttribute()}>
            Create attribute
          </Button>
          <ul className="divide-y divide-border border border-border">
            {attributes.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    selected === a.id ? "bg-secondary" : ""
                  }`}
                  onClick={() => setSelected(a.id)}
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4 border border-border p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
            Options
          </h2>
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Select an attribute to manage options.
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Option value"
                  value={optionValue}
                  onChange={(e) => setOptionValue(e.target.value)}
                />
                <Button type="button" onClick={() => void createOption()}>
                  Add
                </Button>
              </div>
              <ul className="divide-y divide-border border border-border text-sm">
                {options.map((o) => (
                  <li key={o.id} className="px-3 py-2">
                    {o.label ?? o.value}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
