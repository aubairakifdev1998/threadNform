"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { tokenStore } from "@/lib/auth/session";

function captureRecoverySession() {
  if (typeof window === "undefined") return;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    tokenStore.setSession(accessToken, refreshToken);
    window.history.replaceState({}, "", "/reset-password");
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    captureRecoverySession();
    setReady(Boolean(tokenStore.getAccessToken()));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) {
      toast.error("Open the reset link from your email, then try again");
      return;
    }

    setSaving(true);
    try {
      await authApi.changePassword(token, password);
      toast.success("Password updated — you can sign in");
      router.push("/login");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Unable to update password",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Use the link from your email so we can verify your account, then set a
          new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            Waiting for a valid reset session. Open the link from your email, or{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              request a new one
            </Link>
            .
          </p>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Update password"}
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
