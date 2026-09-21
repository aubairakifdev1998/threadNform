"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  addressesApi,
  authApi,
  customersApi,
  ordersApi,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { tokenStore } from "@/lib/auth/session";
import { formatGbp } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AccountShimmer } from "@/components/ui/page-shimmers";
import type {
  CustomerAddress,
  CustomerProfile,
  OrderSummary,
  User,
} from "@/types/api";

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

export function AccountPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);

  const load = useCallback(async () => {
    const token = tokenStore.getAccessToken();
    if (!token) {
      setUser(null);
      setProfile(null);
      setOrders([]);
      setAddresses([]);
      setLoading(false);
      return;
    }

    try {
      const me = await authApi.me(token);
      setUser(me);

      const [profileResult, ordersResult, addressesResult] =
        await Promise.allSettled([
          customersApi.getProfile(token),
          ordersApi.list(token),
          addressesApi.list(token),
        ]);

      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        setFullName(profileResult.value.fullName ?? me.fullName ?? "");
        setPhone(profileResult.value.phone ?? "");
      } else {
        setFullName(me.fullName ?? "");
        setPhone("");
      }

      setOrders(
        ordersResult.status === "fulfilled"
          ? (ordersResult.value.items ?? [])
          : [],
      );
      setAddresses(
        addressesResult.status === "fulfilled"
          ? (addressesResult.value ?? [])
          : [],
      );
    } catch (error) {
      tokenStore.clearSession();
      setUser(null);
      setProfile(null);
      setOrders([]);
      setAddresses([]);
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Session expired — please sign in again");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function signOut() {
    const token = tokenStore.getAccessToken();
    try {
      if (token) await authApi.signOut(token);
    } catch {
      // Clear local session even if API sign-out fails.
    }
    tokenStore.clearSession();
    setUser(null);
    setOrders([]);
    toast.success("Signed out");
    router.refresh();
  }

  async function saveProfile() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    setSavingProfile(true);
    try {
      const updated = await customersApi.updateProfile(token, {
        fullName: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      setProfile(updated);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to save profile",
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    const token = tokenStore.getAccessToken();
    if (!token) return;
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(token, password);
      setPassword("");
      setConfirmPassword("");
      toast.success("Password updated");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to update password",
      );
    } finally {
      setSavingPassword(false);
    }
  }

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
        country: "GB",
        phone: addressForm.phone.trim() || undefined,
        isDefaultShipping: addressForm.isDefaultShipping,
      };
      if (editingAddressId) {
        await addressesApi.update(token, editingAddressId, body);
        toast.success("Address updated");
      } else {
        await addressesApi.create(token, body);
        toast.success("Address saved");
      }
      setAddressForm(emptyAddress);
      setEditingAddressId(null);
      const list = await addressesApi.list(token);
      setAddresses(list ?? []);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to save address",
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
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to remove address",
      );
    }
  }

  function startEditAddress(address: CustomerAddress) {
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
  }

  if (loading) {
    return <AccountShimmer />;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-semibold">Account</h1>
        <p className="mt-3 text-muted-foreground">
          Manage orders, delivery addresses, and password after signing in.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className={cn(buttonVariants())}>
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(user.isAdmin || user.adminRole);

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">Account</h1>
          <p className="mt-2 text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {profile?.fullName || user.fullName || user.email}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <Link
              href="/admin"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Admin
            </Link>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>

      <section className="space-y-4 border border-border p-5">
        <h2 className="font-display text-xl font-semibold">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Name and phone used for delivery and order updates.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44…"
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void saveProfile()}
          disabled={savingProfile}
        >
          {savingProfile ? "Saving…" : "Save profile"}
        </Button>
      </section>

      <section className="space-y-4 border border-border p-5">
        <h2 className="font-display text-xl font-semibold">Delivery addresses</h2>
        <p className="text-sm text-muted-foreground">
          UK delivery addresses for checkout. Mark one as default shipping.
        </p>

        {addresses.length === 0 ? (
          <p className="bg-secondary/30 px-4 py-4 text-sm text-muted-foreground">
            No saved addresses yet.
          </p>
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
                    {address.county ? `, ${address.county}` : ""}{" "}
                    {address.postcode}
                    {address.phone ? (
                      <>
                        <br />
                        {address.phone}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => startEditAddress(address)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeAddress(address.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <h3 className="sm:col-span-2 text-sm font-medium">
            {editingAddressId ? "Edit address" : "Add address"}
          </h3>
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
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Orders & tracking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open an order for payment status, delivery progress, and tracking.
            </p>
          </div>
          <Link
            href="/shop"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Continue shopping
          </Link>
        </div>

        {orders.length === 0 ? (
          <p className="border border-border bg-secondary/30 px-4 py-6 text-sm text-muted-foreground">
            No orders yet. When you place an order, it will show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.orderNumber}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-secondary/40"
                >
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "}
                      {order.status}
                      {order.paymentStatus ? ` · ${order.paymentStatus}` : ""}
                      {order.trackingNumber
                        ? ` · Track ${order.trackingNumber}`
                        : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium">
                    {formatGbp(order.grandTotalPence ?? order.totalPence)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 border border-border p-5">
        <h2 className="font-display text-xl font-semibold">Password</h2>
        <p className="text-sm text-muted-foreground">
          Change your password while signed in, or use{" "}
          <Link href="/forgot-password" className="underline underline-offset-4">
            forgot password
          </Link>{" "}
          if you need an email reset.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => void savePassword()}
          disabled={savingPassword}
        >
          {savingPassword ? "Updating…" : "Update password"}
        </Button>
      </section>
    </div>
  );
}
