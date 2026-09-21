"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { authApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import {
  createBrowserSupabase,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase/browser";

function parseHashTokens(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error_description") || params.get("error"),
  };
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Finishing your Thread N Form sign-in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      try {
        const url = new URL(window.location.href);
        const hash = parseHashTokens(window.location.hash);
        const code = url.searchParams.get("code");
        const errorDescription =
          hash.error ||
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (hash.accessToken && hash.refreshToken) {
          tokenStore.setSession(hash.accessToken, hash.refreshToken);
          if (hasSupabaseBrowserConfig()) {
            const supabase = createBrowserSupabase();
            await supabase.auth.setSession({
              access_token: hash.accessToken,
              refresh_token: hash.refreshToken,
            });
          }
          if (cancelled) return;
          const confirmed =
            hash.type === "signup" || hash.type === "email_change";
          const isRecovery = hash.type === "recovery";
          toast.success(
            isRecovery
              ? "Choose a new password"
              : confirmed
                ? "Email confirmed — welcome to Thread N Form"
                : "Signed in successfully",
          );
          window.history.replaceState({}, "", "/auth/callback");
          router.replace(isRecovery ? "/reset-password" : "/account");
          return;
        }

        if (code) {
          try {
            const session = await authApi.exchangeOAuthCode(code);
            if (cancelled) return;
            tokenStore.setSession(session.accessToken, session.refreshToken);
            toast.success("Signed in with Google");
            router.replace("/account");
            return;
          } catch {
            // Fall through to browser Supabase exchange (PKCE verifier).
          }
        }

        if (!hasSupabaseBrowserConfig()) {
          throw new Error(
            "Auth callback is missing configuration. Please sign in again.",
          );
        }

        const supabase = createBrowserSupabase();
        if (code) {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);
          if (error || !data.session) {
            throw error ?? new Error("No session returned");
          }
          tokenStore.setSession(
            data.session.access_token,
            data.session.refresh_token,
          );
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
            throw error ?? new Error("No session found");
          }
          tokenStore.setSession(
            data.session.access_token,
            data.session.refresh_token,
          );
        }

        if (cancelled) return;
        toast.success("Signed in successfully");
        router.replace("/account");
      } catch (error) {
        if (cancelled) return;
        const text =
          error instanceof Error
            ? error.message
            : "Unable to complete confirmation";
        setMessage(text);
        setFailed(true);
        toast.error(text);
      }
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="brand-wordmark text-2xl">Thread N Form</p>
      {!failed ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">{message}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center bg-foreground px-5 text-sm text-background"
            >
              Back to sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center border border-border px-5 text-sm"
            >
              Create account
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
