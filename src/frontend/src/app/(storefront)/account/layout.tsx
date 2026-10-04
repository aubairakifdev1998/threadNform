"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AccountNav } from "@/components/account/account-nav";
import {
  AccountLoading,
  AccountSignedOut,
} from "@/components/account/account-gate";
import { Section } from "@/components/layout/section";
import { Button, buttonVariants } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { fetchCurrentUser } from "@/lib/auth/current-user";
import { tokenStore } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import type { User } from "@/types/api";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await fetchCurrentUser();
      setUser(me);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function signOut() {
    const token = tokenStore.getAccessToken();
    try {
      if (token) await authApi.signOut(token);
    } catch {
      // clear local anyway
    }
    tokenStore.clearSession();
    setUser(null);
    toast.success("Signed out");
    router.push("/");
    router.refresh();
  }

  if (loading) return <AccountLoading />;
  if (!user) return <AccountSignedOut />;

  const isAdmin = Boolean(user.isAdmin || user.adminRole);

  return (
    <div className="surface-editorial min-h-full">
      <Section width="wide" space="loose">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="brand-wordmark text-2xl text-primary sm:text-3xl">
              Thread N Form
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Your account</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <Link
                href="/admin/dashboard"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Admin
              </Link>
            ) : null}
            <Link
              href="/shop"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Store
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <AccountNav />
          <div className="min-w-0">{children}</div>
        </div>
      </Section>
    </div>
  );
}
