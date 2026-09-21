"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { PageSpinner } from "@/components/ui/page-shimmers";

/** Sends already-authenticated users away from login/register. */
export function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, loading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) return;
    router.replace(user?.isAdmin ? "/admin/dashboard" : "/account");
  }, [isLoggedIn, loading, router, user?.isAdmin]);

  if (loading || isLoggedIn) {
    return <PageSpinner label="Redirecting…" />;
  }

  return <>{children}</>;
}
