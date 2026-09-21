"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminGateShimmer } from "@/components/ui/page-shimmers";
import { authApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState("Checking admin access…");

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const token = tokenStore.getAccessToken();
      if (!token) {
        if (!cancelled) {
          setMessage("Sign in with an admin account to continue.");
          setAllowed(false);
          setReady(true);
          router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
        }
        return;
      }

      try {
        const me = await authApi.me(token);
        if (cancelled) return;
        if (!me.isAdmin) {
          setMessage("This account is not an admin. Contact the store owner.");
          setAllowed(false);
          setReady(true);
          return;
        }
        setAllowed(true);
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        tokenStore.clearSession();
        setAllowed(false);
        setReady(true);
        setMessage(
          error instanceof ApiError
            ? error.message
            : "Unable to verify admin session",
        );
        router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) {
    return <AdminGateShimmer />;
  }

  if (!allowed) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="brand-wordmark text-2xl">Thread N Form</p>
        <h1 className="text-xl font-semibold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <a
          href="/login"
          className="inline-flex h-10 items-center justify-center bg-foreground px-5 text-sm text-background"
        >
          Sign in
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
