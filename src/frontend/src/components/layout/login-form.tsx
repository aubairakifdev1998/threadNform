"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { useAuth } from "@/components/auth/auth-provider";
import { signInSchema, type SignInValues } from "@/lib/validations";
import { ApiError } from "@/lib/api/client";
import {
  createBrowserSupabase,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [googlePending, setGooglePending] = useState(false);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    try {
      const session = await authApi.signIn(values);
      tokenStore.setSession(session.accessToken, session.refreshToken);
      await refresh();
      toast.success("Welcome back");

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      try {
        const me = await authApi.me(session.accessToken);
        if (me.isAdmin && (!next || next.startsWith("/admin"))) {
          router.push(next && next.startsWith("/") ? next : "/admin/dashboard");
        } else if (next && next.startsWith("/")) {
          router.push(next);
        } else {
          router.push("/account");
        }
      } catch {
        router.push(next && next.startsWith("/") ? next : "/account");
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to sign in",
      );
    }
  }

  async function signInWithGoogle() {
    setGooglePending(true);
    try {
      if (!hasSupabaseBrowserConfig()) {
        toast.error(
          "Google sign-in is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
        );
        return;
      }
      const supabase = createBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) {
        toast.error(error.message);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start Google sign-in",
      );
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={googlePending}
        onClick={() => void signInWithGoogle()}
      >
        {googlePending ? "Redirecting…" : "Continue with Google"}
      </Button>

      <div className="relative py-1 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span className="bg-card px-3 relative z-10">or</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>

      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <a
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {form.formState.errors.password ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.password.message}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Signing in…
            </span>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </div>
  );
}
