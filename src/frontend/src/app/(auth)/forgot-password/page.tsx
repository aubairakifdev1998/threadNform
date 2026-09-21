"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await authApi.forgotPassword({
        email: email.trim(),
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      setSent(true);
      toast.success("Check your email for a reset link");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to send reset email",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>
          Enter your account email and we&apos;ll send a secure reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong>{email}</strong>, a reset link is
            on its way. You can close this page.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              {sending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href="/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
