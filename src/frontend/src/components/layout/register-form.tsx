"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authApi } from "@/lib/api";
import { tokenStore } from "@/lib/auth/session";
import { signUpSchema, type SignUpValues } from "@/lib/validations";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/components/auth/auth-provider";

export function RegisterForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignUpValues) {
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;
      const result = await authApi.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        emailRedirectTo: redirectTo,
      });

      if (result.status === "confirmation_required") {
        setPendingEmail(result.email);
        return;
      }

      tokenStore.setSession(
        result.session.accessToken,
        result.session.refreshToken,
      );
      await refresh();
      toast.success("Welcome to Thread N Form");
      router.push("/account");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to register",
      );
    }
  }

  if (pendingEmail) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-secondary">
            <Mail className="size-6 text-foreground" aria-hidden />
          </div>
          <CardTitle className="font-display text-2xl">Check your email</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            We sent a confirmation link from{" "}
            <span className="font-medium text-foreground">Thread N Form</span>{" "}
            to{" "}
            <span className="font-medium text-foreground">{pendingEmail}</span>.
            Open it to activate your account, then sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
            <p>Didn’t get it? Check spam, or wait a minute and try again.</p>
            <p>The link expires after a short time for your security.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex h-10 items-center justify-center bg-foreground px-6 text-sm font-medium text-background"
            >
              Go to sign in
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingEmail(null)}
            >
              Use a different email
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Join Thread N Form for faster checkout and order tracking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.fullName.message}
              </p>
            ) : null}
          </div>
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
            {form.formState.errors.password ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.confirmPassword.message}
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
                Creating account…
              </span>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="ml-1 text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
