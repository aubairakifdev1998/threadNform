"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { AccountLoading, AccountPageHeader } from "@/components/account/account-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/data-states";
import { addressesApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { fetchCurrentUser } from "@/lib/auth/current-user";
import { tokenStore } from "@/lib/auth/session";
import type { CustomerAddress, User } from "@/types/api";

const emptyAddress = {
  fullName: "",
  line1: "",
  line2: "",
  city: "",
  county: "",
  postcode: "",
  phone: "",
  isDefaultShipping: true,
};

export default function AccountAddressesPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [confirmingAddressId, setConfirmingAddressId] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const me = await fetchCurrentUser();
      const token = tokenStore.getAccessToken();
      if (!me || !token) {
        setUser(null);
        return;
      }
      setUser(me);
      setAddresses(await addressesApi.list(token));
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not load addresses",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function saveAddress() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSavingAddress(true);
    try {
      const body = {
        fullName: addressForm.fullName.trim(),
        line1: addressForm.line1.trim(),
        line2: addressForm.line2.trim() || undefined,
        city: addressForm.city.trim(),
        county: addressForm.county.trim() || undefined,
        postcode: addressForm.postcode.trim(),
        phone: addressForm.phone.trim() || undefined,
        isDefaultShipping: addressForm.isDefaultShipping,
        country: "GB",
      };
      if (editingAddressId) {
        await addressesApi.update(token, editingAddressId, body);
      } else {
        await addressesApi.create(token, body);
      }
      toast.success(editingAddressId ? "Address updated" : "Address saved");
      setEditingAddressId(null);
      setAddressForm(emptyAddress);
      setAddresses(await addressesApi.list(token));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save address",
      );
    } finally {
      setSavingAddress(false);
    }
  }

  async function removeAddress(id: string) {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    try {
      await addressesApi.remove(token, id);
      toast.success("Address removed");
      setConfirmingAddressId(null);
      setAddresses(await addressesApi.list(token));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not remove address",
      );
    }
  }

  if (loading) return <AccountLoading />;

  return (
    <div className="space-y-8">
      <AccountPageHeader
        title="Addresses"
        description="UK delivery addresses for checkout. Mark one as default shipping."
        user={user}
      />

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add a UK delivery address to speed up checkout."
          className="border border-dashed border-border py-8"
        />
      ) : (
        <ul className="divide-y divide-border border border-border">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {address.fullName}
                  {address.isDefaultShipping ? (
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ""}
                  <br />
                  {address.city}
                  {address.county ? `, ${address.county}` : ""} {address.postcode}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingAddressId(address.id);
                    setAddressForm({
                      fullName: address.fullName,
                      line1: address.line1,
                      line2: address.line2 ?? "",
                      city: address.city,
                      county: address.county ?? "",
                      postcode: address.postcode,
                      phone: address.phone ?? "",
                      isDefaultShipping: address.isDefaultShipping,
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    confirmingAddressId === address.id ? "destructive" : "ghost"
                  }
                  onClick={() => {
                    if (confirmingAddressId === address.id) {
                      void removeAddress(address.id);
                    } else {
                      setConfirmingAddressId(address.id);
                    }
                  }}
                >
                  {confirmingAddressId === address.id
                    ? "Confirm remove"
                    : "Remove"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 border border-border p-5 sm:grid-cols-2">
        <h2 className="font-display text-lg font-semibold tracking-tight sm:col-span-2">
          {editingAddressId ? "Edit address" : "Add address"}
        </h2>
        {(
          [
            ["fullName", "Full name"],
            ["line1", "Address line 1"],
            ["line2", "Address line 2"],
            ["city", "City"],
            ["county", "County"],
            ["postcode", "Postcode"],
            ["phone", "Phone"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`addr-${key}`}>{label}</Label>
            <Input
              id={`addr-${key}`}
              value={addressForm[key]}
              onChange={(e) =>
                setAddressForm((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </div>
        ))}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch
            checked={addressForm.isDefaultShipping}
            onCheckedChange={(checked) =>
              setAddressForm((prev) => ({
                ...prev,
                isDefaultShipping: checked,
              }))
            }
          />
          <Label>Default shipping address</Label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="button"
            onClick={() => void saveAddress()}
            disabled={savingAddress}
          >
            {savingAddress
              ? "Saving…"
              : editingAddressId
                ? "Update address"
                : "Save address"}
          </Button>
          {editingAddressId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingAddressId(null);
                setAddressForm(emptyAddress);
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
